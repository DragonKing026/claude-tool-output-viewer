/** Formatting of tool output: expands JSON, drops ANSI. Pure: no dependency on `vscode`. */
import { isJsonContainer, splitLines } from './classify';
import { stripAnsi } from './ansi';

export interface FormatResult {
  text: string;
  /** `json` when the whole output was one JSON value, otherwise `claude-tool-output`. */
  kind: 'json' | 'mixed';
  /** Number of JSON values that were expanded. */
  expanded: number;
}

export function prettyJson(s: string): string {
  return JSON.stringify(JSON.parse(s), null, 2);
}

/** Zero-based line numbers of lines that are, as a whole, a JSON object or array. */
export function findJsonLines(text: string, limit = 500): number[] {
  const out: number[] = [];
  const lines = splitLines(text);
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    const t = lines[i]!.trim();
    if (t.length >= 2 && isJsonContainer(t)) out.push(i);
  }
  return out;
}

export function formatOutput(raw: string): FormatResult {
  const text = stripAnsi(raw);
  const trimmed = text.trim();
  if (isJsonContainer(trimmed)) return { text: prettyJson(trimmed) + '\n', kind: 'json', expanded: 1 };

  let expanded = 0;
  const out = splitLines(text).map((line) => {
    const t = line.trim();
    if (t.length >= 2 && isJsonContainer(t)) {
      expanded++;
      const indent = line.slice(0, line.length - line.trimStart().length);
      return prettyJson(t)
        .split('\n')
        .map((l) => indent + l)
        .join('\n');
    }
    return line;
  });
  return { text: out.join('\n'), kind: 'mixed', expanded };
}

/** Formats a single line (used by the per-line CodeLens). */
export function formatLine(raw: string, line: number): string | undefined {
  const l = splitLines(stripAnsi(raw))[line]?.trim();
  if (l && l.length >= 2 && isJsonContainer(l)) return prettyJson(l) + '\n';
  return undefined;
}
