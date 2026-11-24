import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import * as vsctm from 'vscode-textmate';
import * as oniguruma from 'vscode-oniguruma';

const root = join(__dirname, '..');
const require_ = createRequire(__filename);

async function loadGrammar(): Promise<vsctm.IGrammar> {
  const wasm = readFileSync(join(dirname(require_.resolve('vscode-oniguruma')), 'onig.wasm'));
  await oniguruma.loadWASM(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) as ArrayBuffer);
  const registry = new vsctm.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (p: string[]) => new oniguruma.OnigScanner(p),
      createOnigString: (s: string) => new oniguruma.OnigString(s),
    }),
    loadGrammar: async (scope: string) => {
      if (scope !== 'source.claude-tool-output') return null;
      return vsctm.parseRawGrammar(readFileSync(join(root, 'syntaxes/claude-tool-output.tmLanguage.json'), 'utf8'), 'g.json');
    },
  });
  const g = await registry.loadGrammar('source.claude-tool-output');
  assert.ok(g, 'grammar loads');
  return g;
}

/** Returns the scopes (without the root scope) of the first token that covers `needle` in `line`. */
function scopesOf(g: vsctm.IGrammar, line: string, needle: string): string {
  const { tokens } = g.tokenizeLine(line, vsctm.INITIAL);
  const at = line.indexOf(needle);
  assert.ok(at >= 0, `needle ${needle} in line`);
  const tok = tokens.find((t) => t.startIndex <= at && at < t.endIndex);
  assert.ok(tok, 'token found');
  return tok.scopes.slice(1).join(' ');
}

const expectations: Array<[string, string, string, string]> = [
  ['Exit code 1', 'Exit code 1', 'Exit', 'invalid.illegal'],
  ['Exit code 0', 'Exit code 0', 'Exit', 'markup.inserted'],
  ['Shell cwd was reset to /tmp', 'Shell cwd was reset to /tmp', 'cwd', 'comment.line'],
  ['error word', 'build failed with Error 2', 'Error', 'invalid.illegal'],
  ['failed word', 'build failed with Error 2', 'failed', 'invalid.illegal'],
  ['Polish error word', 'BŁĄD: brak pliku', 'BŁĄD', 'invalid.illegal'],
  ['denied', 'permission denied', 'denied', 'invalid.illegal'],
  ['not found', 'foo: command not found', 'not found', 'invalid.illegal'],
  ['warning', 'warning: deprecated API', 'warning', 'markup.changed'],
  ['quoted string', 'say "hello world" now', '"hello', 'string.quoted.double'],
  ['url', 'see https://example.com/a?b=1 ok', 'https', 'markup.underline.link'],
  ['unix path', 'open /usr/local/bin/node now', '/usr', 'variable.other.path'],
  ['relative path', 'open ./src/index.ts:12:3 now', './src', 'variable.other.path'],
  ['number', 'count 1234 items', '1234', 'constant.numeric'],
  ['date', 'on 2026-11-24 10:00:00 done', '2026-11-24', 'constant.other.datetime'],
  ['clock time', 'at 10:00:05 done', '10:00:05', 'constant.other.datetime'],
  ['size', 'file 12.5 MB total', '12.5', 'constant.numeric.size'],
  ['duration', 'took 350ms overall', '350', 'constant.numeric.duration'],
  ['bash time label', 'real\t0m1.234s', 'real', 'keyword.other.time'],
  ['bash time value', 'real\t0m1.234s', '0m1', 'constant.numeric.time'],
  ['zsh time user', '0.50s user 0.10s system 55% cpu 1.092 total', 'user', 'keyword.other.time'],
  ['zsh time total', '0.50s user 0.10s system 55% cpu 1.092 total', 'total', 'keyword.other.time'],
];

for (const [name, line, needle, expected] of expectations) {
  test(`grammar - ${name}`, async () => {
    const g = await loadGrammar();
    assert.ok(scopesOf(g, line, needle).includes(expected), `${scopesOf(g, line, needle)} should include ${expected}`);
  });
}

test('grammar - plain words and contractions stay unscoped', async () => {
  const g = await loadGrammar();
  assert.equal(scopesOf(g, "don't stop and/or go", 'stop'), 'source.claude-tool-output'.replace('source.claude-tool-output', '').trim());
});
