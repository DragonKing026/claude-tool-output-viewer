// Launches an isolated VS Code (temporary user data and extensions dirs) with the extension under development.
const { spawnSync } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const tmp = mkdtempSync(path.join(tmpdir(), 'ctov-'));
const root = path.resolve(__dirname, '..');
const res = spawnSync(
  process.env.VSCODE_BIN || '/usr/share/code/code',
  [
    '--extensionDevelopmentPath=' + root,
    '--extensionTestsPath=' + path.join(__dirname, 'index.js'),
    '--user-data-dir=' + path.join(tmp, 'user'),
    '--extensions-dir=' + path.join(tmp, 'ext'),
    '--disable-workspace-trust',
    '--skip-welcome',
    '--skip-release-notes',
    '--new-window',
    path.join(tmp),
  ],
  { stdio: 'inherit', timeout: 120000 },
);
process.exit(res.status ?? 1);
