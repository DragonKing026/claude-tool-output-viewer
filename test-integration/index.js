// Runs inside the VS Code extension host (see `npm run test:integration`).
// It emulates the Claude Code read-only file system provider and checks the detected languages.
const vscode = require('vscode');
const assert = require('node:assert/strict');

const SCHEME = '_claude_vscode_fs_readonly';
const files = new Map();
const emitter = new vscode.EventEmitter();
const fs = {
  onDidChangeFile: emitter.event,
  watch: () => new vscode.Disposable(() => {}),
  stat: (uri) => {
    const data = files.get(uri.path);
    if (!data) throw vscode.FileSystemError.FileNotFound(uri);
    return { type: vscode.FileType.File, ctime: 0, mtime: 0, size: data.length };
  },
  readDirectory: () => [],
  createDirectory: () => {},
  readFile: (uri) => {
    const data = files.get(uri.path);
    if (!data) throw vscode.FileSystemError.FileNotFound(uri);
    return data;
  },
  writeFile: () => {},
  delete: () => {},
  rename: () => {},
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openAs(name, text) {
  const path = `/temp/readonly/${name}`;
  files.set(path, Buffer.from(text, 'utf8'));
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.from({ scheme: SCHEME, path }));
  await vscode.window.showTextDocument(doc, { preview: true });
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    const current = vscode.workspace.textDocuments.find((d) => d.uri.path === path);
    if (current && current.languageId !== 'plaintext') return current;
  }
  return vscode.workspace.textDocuments.find((d) => d.uri.path === path);
}

const cases = [
  ['json', 'Bash tool output (aaa111)', '{"a":1,"b":[1,2,3]}', 'json'],
  ['diff', 'Bash tool output (aaa112)', 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b\n', 'diff'],
  ['markdown', 'Read tool output (aaa113)', '# Title\n\n## Part\n\n- one\n- two\n- three\n', 'markdown'],
  ['yaml', 'Read tool output (aaa114)', '---\nname: x\nversion: 1\nscripts:\n  build: tsc\n', 'yaml'],
  ['log', 'Bash tool output (aaa115)', 'Exit code 1\nerror: boom\nreal\t0m1.2s\nShell cwd was reset to /tmp', 'claude-tool-output'],
  ['ansi json', 'Bash tool output (aaa116)', '\x1b[32m{"ok":true}\x1b[0m', 'json'],
  [
    'model typescript',
    'Read tool output (aaa117)',
    'import { readFile } from "fs/promises";\n\ninterface Options {\n  path: string;\n  encoding?: BufferEncoding;\n}\n\nexport async function load(options: Options): Promise<string> {\n  const data = await readFile(options.path, options.encoding ?? "utf8");\n  return data.toString();\n}\n',
    'typescript',
  ],
];

exports.run = async function run() {
  vscode.workspace.registerFileSystemProvider(SCHEME, fs, { isReadonly: true, isCaseSensitive: true });
  const ext = vscode.extensions.getExtension('dragonking026.claude-tool-output-viewer');
  assert.ok(ext, 'extension is present');
  await ext.activate();

  const langs = await vscode.languages.getLanguages();
  assert.ok(langs.includes('claude-tool-output'), 'own language registered');

  for (const [label, name, text, expected] of cases) {
    const doc = await openAs(name, text);
    assert.equal(doc.languageId, expected, `${label}: got ${doc.languageId}`);
    console.log(`ok  ${label} -> ${doc.languageId}`);
  }

  // word wrap + format command do not throw
  const active = vscode.window.activeTextEditor;
  assert.ok(active);
  await vscode.commands.executeCommand('claudeToolOutputViewer.format');
  await sleep(500);
  const formatted = vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === 'claude-tool-output-formatted');
  assert.ok(formatted, 'formatted document is visible');
  console.log(`ok  format -> ${formatted.document.languageId}, ${formatted.document.lineCount} lines`);
  await sleep(500);
};
