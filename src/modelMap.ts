/**
 * Mapping of the `@vscode/vscode-languagedetection` (guesslang) ids to VS Code language ids and
 * VS Code's confidence adjustments (see `languageDetectionWebWorker.ts` in microsoft/vscode).
 * Pure: availability of a language is injected by the caller.
 */

export interface ModelResult {
  languageId: string;
  confidence: number;
}

/** guesslang id -> candidate VS Code language ids (first one that exists wins). */
export const MODEL_TO_VSCODE: Readonly<Record<string, readonly string[]>> = {
  asm: ['asm'],
  bat: ['bat'],
  c: ['c'],
  cbl: ['cobol'],
  clj: ['clojure'],
  cmake: ['cmake'],
  coffee: ['coffeescript'],
  cpp: ['cpp'],
  cs: ['csharp'],
  css: ['css'],
  csv: ['csv'],
  dart: ['dart'],
  dm: [],
  dockerfile: ['dockerfile'],
  erl: ['erlang'],
  ex: ['elixir'],
  f90: ['fortran-modern', 'fortran'],
  go: ['go'],
  groovy: ['groovy'],
  hs: ['haskell'],
  html: ['html'],
  ini: ['ini'],
  java: ['java'],
  jl: ['julia'],
  js: ['javascript'],
  json: ['json'],
  kt: ['kotlin'],
  lisp: ['lisp'],
  lua: ['lua'],
  makefile: ['makefile'],
  matlab: ['matlab'],
  md: ['markdown'],
  ml: ['ocaml'],
  mm: ['objective-cpp', 'objective-c'],
  pas: ['pascal'],
  php: ['php'],
  pl: ['perl'],
  pm: ['perl'],
  prolog: ['prolog'],
  ps1: ['powershell'],
  py: ['python'],
  r: ['r'],
  rb: ['ruby'],
  rs: ['rust'],
  scala: ['scala'],
  sh: ['shellscript'],
  sql: ['sql'],
  swift: ['swift'],
  tex: ['latex'],
  toml: ['toml'],
  ts: ['typescript'],
  v: ['verilog', 'v'],
  vba: ['vb'],
  xml: ['xml'],
  yaml: ['yaml'],
};

/** Same corrections as VS Code: boost common languages, penalise "simple" ones that cause false positives. */
export function adjustConfidence(r: ModelResult): ModelResult {
  let c = r.confidence;
  switch (r.languageId) {
    case 'js':
    case 'html':
    case 'json':
    case 'ts':
    case 'css':
    case 'py':
    case 'xml':
    case 'php':
      c += 0.05;
      break;
    case 'cpp':
    case 'sh':
    case 'java':
    case 'cs':
    case 'c':
      c += 0.025;
      break;
    case 'bat':
    case 'ini':
    case 'makefile':
    case 'sql':
    case 'csv':
    case 'toml':
    case 'md':
    case 'dockerfile':
      c -= 0.5;
      break;
    default:
      break;
  }
  return { languageId: r.languageId, confidence: c };
}

/**
 * Picks the language to use. Returns undefined when nothing is confident enough (the caller then
 * falls back to `claude-tool-output`). Following VS Code, results whose language is unknown to
 * the editor are skipped.
 */
export function pickLanguage(
  results: readonly ModelResult[],
  threshold: number,
  exists: (languageId: string) => boolean,
): { languageId: string; confidence: number; modelId: string } | undefined {
  const adjusted = results
    .map(adjustConfidence)
    .map((r, i) => ({ r, i }))
    .sort((a, b) => b.r.confidence - a.r.confidence || a.i - b.i);
  for (const { r } of adjusted) {
    if (r.confidence < threshold) return undefined;
    const candidates = MODEL_TO_VSCODE[r.languageId] ?? [];
    const found = candidates.find(exists);
    if (found) return { languageId: found, confidence: r.confidence, modelId: r.languageId };
  }
  return undefined;
}
