# Changelog

## 0.1.0

- Detection of Claude Code tool output documents by URI scheme or file name pattern.
- Content type detection: rules (JSON, JSON Lines, diff, XML/HTML, Markdown, YAML), then the VS Code language detection model (lazy), then the `claude-tool-output` language.
- `claude-tool-output` language with a TextMate grammar (exit codes, errors, warnings, paths, URLs, durations, sizes, `time` output, embedded JSON lines).
- ANSI colors shown as editor decorations; escape sequences hidden or dimmed.
- Word wrap for tool output editors whose language does not wrap by default.
- "Format Output" command and per-line "Format JSON" CodeLens, shown in a read-only side-by-side document.
