/**
 * Rule-based content type detection for tool output text. Pure: no dependency on `vscode`.
 *
 * Order matters: JSON -> JSON Lines -> Markdown with fenced code -> diff -> XML/HTML -> YAML -> Markdown.
 * The rules are deliberately conservative: typical command logs (exit codes, timings, `key: value`
 * summaries, `# comments`) must fall through so they can be handled by the model or the
 * `claude-tool-output` language.
 */
import { stripAnsi } from './ansi';

export type RuleKind = 'json' | 'jsonl' | 'diff' | 'xml' | 'html' | 'markdown' | 'yaml';

/** Do not run full JSON.parse on anything larger than this. */
const MAX_JSON_CHARS = 8_000_000;
const MAX_JSONL_LINES = 20_000;
const MD_THRESHOLD = 4;

const EXIT_CODE_LINE = /^Exit code -?\d+\s*$/;
const CWD_RESET_LINE = /^Shell cwd was reset to .*$/;

export function isPreambleLine(line: string): boolean {
  return EXIT_CODE_LINE.test(line) || CWD_RESET_LINE.test(line);
}

/** Removes leading/trailing "Exit code N" and "Shell cwd was reset to ..." lines (and blank lines around them). */
export function stripPreamble(lines: string[]): string[] {
  let a = 0;
  let b = lines.length;
  while (a < b && (lines[a]!.trim() === '' || isPreambleLine(lines[a]!))) a++;
  while (b > a && (lines[b - 1]!.trim() === '' || isPreambleLine(lines[b - 1]!))) b--;
  return lines.slice(a, b);
}

export function splitLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}

/** True when `s` (already trimmed) is a JSON object or array. */
export function isJsonContainer(s: string): boolean {
  if (s.length > MAX_JSON_CHARS) return false;
  const first = s[0];
  const last = s[s.length - 1];
  if (!((first === '{' && last === '}') || (first === '[' && last === ']'))) return false;
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

function isJsonLines(lines: string[]): boolean {
  const content = lines.map((l) => l.trim()).filter((l) => l !== '');
  if (content.length < 2 || content.length > MAX_JSONL_LINES) return false;
  return content.every((l) => isJsonContainer(l));
}

// ---------- diff ----------

function isDiff(lines: string[]): boolean {
  let hasHunk = false;
  let hasChange = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^diff --git \S+ \S+/.test(l)) return true;
    if (/^--- \S/.test(l) && /^\+\+\+ \S/.test(lines[i + 1] ?? '')) return true;
    if (/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(l)) hasHunk = true;
    else if (/^[+-](?![+-]{2} )/.test(l)) hasChange = true;
  }
  return hasHunk && hasChange;
}

// ---------- XML / HTML ----------

const HTML_TAGS = /<\/?(?:div|span|p|a|body|head|table|tr|td|ul|li|h[1-6]|script|style|meta|link|br|img|form|input)\b/i;

function detectMarkup(body: string): 'xml' | 'html' | undefined {
  const s = body.trimStart();
  if (/^<\?xml\b/i.test(s)) return 'xml';
  if (/^<!doctype\s+html/i.test(s) || /^<html[\s>]/i.test(s)) return 'html';
  if (/^<[A-Za-z][\w:.-]*(?:\s[^<>]*)?\/?>/.test(s) && s.trimEnd().endsWith('>')) {
    const tags = s.match(/<\/?[A-Za-z][\w:.-]*(?:\s[^<>]*)?\/?>/g) ?? [];
    const closes = tags.filter((t) => t.startsWith('</') || t.endsWith('/>')).length;
    if (tags.length >= 3 && closes >= 1) return HTML_TAGS.test(s) ? 'html' : 'xml';
  }
  return undefined;
}

// ---------- YAML ----------

const LOG_LIKE: RegExp[] = [
  /\b\d{1,2}:\d{2}:\d{2}\b/, // clock time
  /^\s*(real|user|sys)\s/, // `time` output
  /^\s*(error|warn(ing)?|fatal|info|debug|trace)\b/i, // log levels
  /^\S+:\d+(?::\d+)?:/, // file:line:col: message
  /^\s*\[[A-Za-z ]+\]/, // [INFO] ...
  /^\s*\$ /, // shell prompt
];
const YAML_KEY = /^(\s*)(?:-\s+)?([A-Za-z0-9_.\/"'-]+):(?:\s+\S.*|\s*)$/;

function isYaml(lines: string[]): boolean {
  const content = lines.filter((l) => l.trim() !== '');
  if (content.length < 3) return false;
  const docStart = content[0]!.trim() === '---';
  let ok = 0;
  let keys = 0;
  let nested = false;
  let allLower = true;
  for (let i = 0; i < content.length; i++) {
    const l = content[i]!;
    if (LOG_LIKE.some((re) => re.test(l))) return false;
    const t = l.trim();
    const key = YAML_KEY.exec(l);
    if (t === '---' || t === '...' || t.startsWith('#')) ok++;
    else if (key) {
      ok++;
      keys++;
      if (!/^[a-z][a-z0-9_.-]*$/.test(key[2]!)) allLower = false;
      if (/:\s*$/.test(l)) {
        const next = content[i + 1];
        if (next !== undefined && (next.length - next.trimStart().length > (key[1]?.length ?? 0) || /^\s*-\s/.test(next))) nested = true;
      }
    } else if (/^\s*-\s+\S/.test(l) || /^\s*-\s*$/.test(l)) {
      ok++;
      nested = nested || /^\s+-/.test(l);
    } else if (/^\s{2,}\S/.test(l) && i > 0) ok++; // indented continuation
  }
  if (ok / content.length < 0.9) return false;
  if (docStart && keys >= 2) return true;
  if (keys >= 4 && nested) return true;
  return keys >= 6 && allLower;
}

// ---------- Markdown ----------

const FENCE = /^\s*(```|~~~)/;

export function markdownScore(lines: string[]): number {
  let headings = 0;
  let fences = 0;
  let bullets = 0;
  let numbered = 0;
  let tables = 0;
  let links = 0;
  let bold = 0;
  let code = 0;
  let quotes = 0;
  let logLines = 0;
  for (const l of lines) {
    if (/^#{1,6}\s+\S/.test(l)) headings++;
    if (FENCE.test(l)) fences++;
    if (/^\s*[-*+]\s+\S/.test(l)) bullets++;
    if (/^\s*\d+[.)]\s+\S/.test(l)) numbered++;
    if (/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(l)) tables++;
    if (/^>\s/.test(l)) quotes++;
    if (/\[[^\]\n]+\]\([^)\s]+\)/.test(l)) links++;
    if (/\*\*[^*\n]+\*\*/.test(l)) bold++;
    if (/`[^`\n]+`/.test(l)) code++;
    if (/\b\d{1,2}:\d{2}:\d{2}\b/.test(l) || /^\s*(real|user|sys)\s/.test(l)) logLines++;
  }
  let score = 0;
  score += headings === 0 ? 0 : 2 + Math.min(headings - 1, 2);
  score += Math.min(fences, 2) * 3;
  score += Math.min(bullets, 3);
  score += Math.min(numbered, 3);
  score += tables > 0 ? 3 : 0;
  score += Math.min(links, 2) * 2;
  score += Math.min(bold, 2);
  score += Math.min(code, 2);
  score += Math.min(quotes, 2);
  if (logLines > 0) score -= 3;
  return score;
}

// ---------- entry point ----------

export function classifyByRules(raw: string): RuleKind | undefined {
  const text = stripAnsi(raw);
  const trimmed = text.trim();
  if (trimmed === '') return undefined;

  if (isJsonContainer(trimmed)) return 'json';
  const allLines = splitLines(trimmed);
  if (isJsonLines(allLines)) return 'jsonl';

  const lines = stripPreamble(allLines);
  if (lines.length === 0) return undefined;
  const body = lines.join('\n');

  const md = markdownScore(lines);
  const hasFence = lines.some((l) => FENCE.test(l));
  if (hasFence && md >= MD_THRESHOLD) return 'markdown';
  if (isDiff(lines)) return 'diff';
  const markup = detectMarkup(body);
  if (markup) return markup;
  if (isYaml(lines)) return 'yaml';
  if (md >= MD_THRESHOLD) return 'markdown';
  return undefined;
}

/** Text sample for the ML model: no ANSI, no exit code / cwd lines, capped like VS Code does (10 000 chars). */
export function sampleForModel(raw: string, maxChars = 10_000): string {
  const lines = stripPreamble(splitLines(stripAnsi(raw)));
  return lines.join('\n').slice(0, maxChars);
}
