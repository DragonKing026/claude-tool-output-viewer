# Claude Code Tool Output Viewer (unofficial)

> **Unofficial.** Not affiliated with, endorsed by, or sponsored by Anthropic. Claude is a trademark of Anthropic.

When you click **OUT** next to a tool call in the Claude Code extension for VS Code, the result opens as a
read-only plain text document named like `Bash tool output (k3j9x2)`. A single long JSON line, a Markdown
report, a diff, a build log with ANSI colors: all of it is shown as unhighlighted text on one long line.

This extension makes those documents readable:

- **Detects the content type** and switches the document language: JSON, JSON Lines, diff, XML/HTML,
  Markdown, YAML by fast rules; anything else by the machine learning model that VS Code itself uses
  for "Auto Detect Language" (loaded lazily).
- **`Claude Tool Output` language** for everything else (typical command output): highlights `Exit code N`,
  errors and warnings, paths, URLs, quoted strings, numbers, dates, durations, sizes, `time` / `zsh` timing
  lines, the `Shell cwd was reset to ...` notice, and embeds JSON highlighting for lines that start with `{` or `[`.
- **Word wrap** for these editors, whatever language was detected.
- **ANSI colors**: SGR colors (16, 256, truecolor), bold, italic, underline, strike-through, dim and inverse
  are shown as editor decorations; the escape sequences themselves are hidden.
- **Format Output**: opens a read-only copy next to the original with JSON expanded and ANSI removed. A
  `Format JSON` CodeLens appears above every line that is a JSON object or array.

The original document is never modified (it belongs to the Claude Code extension and is read-only).

## How it works

1. A document is treated as tool output when its URI scheme is listed in `claudeToolOutputViewer.schemes`
   (default `_claude_vscode_fs_readonly`) **or** its file name matches `claudeToolOutputViewer.namePattern`
   (default `tool output \([a-z0-9]{1,8}\)$`, case-insensitive).
2. Only documents still in `plaintext` are touched, once per document; a language you pick manually is respected.
3. **Rules** (pure functions, unit tested) run first, in this order: whole text is JSON (object or array) ->
   every non-empty line is JSON (JSON Lines, falls back to JSON when the `jsonl` language is not available) ->
   Markdown with fenced code -> diff (`diff --git`, `---`/`+++`, `@@ -n,m +n,m @@`) -> XML/HTML -> YAML -> Markdown.
   `Exit code N` and `Shell cwd was reset to ...` lines are ignored by the rules (except for JSON, where
   mixed text stays "mixed"). Rules are conservative: command logs (`Exit code`, `real 0m1.2s`, `Total: 5`,
   `error: ...`, `# comments`) must not turn into YAML or Markdown, and there are tests for that.
4. If no rule matches and the text (without ANSI, exit code and cwd lines) has at least
   `modelMinLength` characters (default 100), the model `@vscode/vscode-languagedetection` classifies the first
   10 000 characters. The guesslang ids are mapped to VS Code language ids and the same confidence
   corrections as in VS Code are applied (for example `md`, `sql`, `ini` need much higher confidence). Below
   `modelConfidence` (default 0.5) the result is discarded.
5. Otherwise the document gets the `Claude Tool Output` language.

The **Claude Tool Output: Show Detection Log** command shows what was decided for each document and why.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `claudeToolOutputViewer.enabled` | `true` | Master switch. |
| `claudeToolOutputViewer.schemes` | `["_claude_vscode_fs_readonly"]` | URI schemes of tool output documents. |
| `claudeToolOutputViewer.namePattern` | `tool output \([a-z0-9]{1,8}\)$` | Case-insensitive regex for the file name; empty disables. |
| `claudeToolOutputViewer.useModel` | `true` | Use the language detection model when no rule matches. |
| `claudeToolOutputViewer.modelMinLength` | `100` | Minimum text length before the model is consulted. |
| `claudeToolOutputViewer.modelConfidence` | `0.5` | Minimum (adjusted) confidence to accept the model's answer. |
| `claudeToolOutputViewer.wordWrap` | `true` | Turn word wrap on for tool output editors that would not wrap. |
| `claudeToolOutputViewer.ansi` | `hide` | `hide`: colors + hidden escapes; `dim`: colors + dimmed escapes; `off`. |
| `claudeToolOutputViewer.codeLens` | `true` | Show the `Format JSON` CodeLens. |

The extension also sets `editor.wordWrap: "on"` for the `[claude-tool-output]` language.

## Model memory and cost

The model (TensorFlow.js, CPU backend, about 0.9 MB of weights) is loaded only when a rule did not match and
the text is long enough, and it is released after 5 idle minutes. Measured with `npm run measure`
(`node --expose-gc scripts/measure-model.mjs`, Node 22, Linux x64, three runs, stable within a few MB):

| Step | RSS | heapUsed |
| --- | --- | --- |
| Before loading the package | 51 MB | 3.1 MB |
| After `require` (no model yet) | 62 MB | 6.0 MB |
| After the first classification (model + weights loaded, about 120 ms) | 91 MB | 10.4 MB |
| After 10 more classifications (about 9 ms each) | 116 MB | 11.1 MB |

So the model costs roughly +64 MB RSS and +8 MB of JS heap in the extension host while it is loaded (most of
the RSS growth is the TensorFlow.js runtime and its allocator, not the weights). With the model disabled
(`useModel: false`) the extension itself uses almost nothing.

## Limitations

- **Depends on Claude Code internals.** The scheme `_claude_vscode_fs_readonly` and the
  `<name> (<random>)` file name are implementation details of the Claude Code extension and may change at any
  time. That is why both are settings. If detection stops working, look at the document's URI and adjust.
- **Word wrap is toggled, not set.** VS Code has no per-document word wrap API. When a tool output editor
  becomes active and the effective `editor.wordWrap` for its language is `off`, the extension runs
  `editor.action.toggleWordWrap` once for that document (VS Code keeps that override with the document, so it
  is not toggled back when the editor is shown again). It acts on the focused editor only: an editor that
  never gets focus is not wrapped. If you toggle wrap yourself afterwards, the extension will not fight you.
- **ANSI hiding is a rendering trick.** Escape sequences are hidden with a decoration (`display: none` via the
  decoration's CSS). The text is still there: search, copy and cursor movement see it. Use `ansi: dim` if you
  prefer them visible but faint, or `off`. Bare sequences without the ESC byte (`[1;31m`) are recognised only
  when the text has no real ESC and contains a bare reset (`[0m`).
- ANSI decorations use the theme's terminal palette (`terminal.ansi*` colors).
- The `Format Output` copy is a snapshot; it does not update. Only JSON objects/arrays that occupy a whole
  line are expanded.
- Language detection is a guess. Short or mixed text ends up as `Claude Tool Output`.

## Try it

The `examples/` folder has sample outputs whose names match the default `namePattern`, so they behave like
tool output documents when opened from disk:

| File | Expected result |
| --- | --- |
| `Bash tool output (ex0001)` | `Claude Tool Output` language, ANSI colors, embedded JSON line, time lines |
| `Bash tool output (ex0002)` | `json`, wrapped long line; use **Format Output** |
| `Read tool output (ex0003)` | `markdown` |
| `Bash tool output (ex0004)` | `diff` |
| `Read tool output (ex0005)` | `typescript` (by the model) |
| `Bash tool output (ex0006)` | `jsonl` (or `json`) |

## Development

```sh
npm ci
npm test            # unit tests (node --test via tsx): rules, ANSI, formatting, grammar, model mapping
npm run lint        # tsc --noEmit
npm run build       # esbuild -> dist/extension.js
npm run package     # lint + build + vsce package -> claude-tool-output-viewer-0.1.0.vsix
npm run measure     # memory measurement of the model
npm run test:integration   # starts an isolated VS Code (temporary profile) and checks the detected languages
```

`@vscode/vscode-languagedetection` is kept as an external runtime dependency: it loads its model files
relative to its own location, so the `.vsix` contains the package's `dist/lib` and `model` folders under
`node_modules`. Install the package with **Extensions: Install from VSIX...**.

## License

MIT. The language detection model and library are by Microsoft (MIT); see
[`@vscode/vscode-languagedetection`](https://github.com/microsoft/vscode-languagedetection).
