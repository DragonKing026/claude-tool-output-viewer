import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyByRules, sampleForModel } from '../src/classify';

const cases: Array<[string, string, ReturnType<typeof classifyByRules>]> = [
  // JSON
  ['json: one-line object', '{"a":1,"b":[1,2,3],"c":{"d":null}}', 'json'],
  ['json: pretty array with trailing newline', '[\n  {"id": 1},\n  {"id": 2}\n]\n', 'json'],
  ['json: with ANSI colors', '\x1b[32m{"ok":true}\x1b[0m', 'json'],
  ['json: truncated is not json', '{"a":1,"b":[1,2', undefined],
  ['json: bare number is not json', '42', undefined],
  // JSONL
  ['jsonl: two lines', '{"a":1}\n{"a":2}\n', 'jsonl'],
  ['jsonl: array lines', '[1,2]\n[3,4]\n[5]', 'jsonl'],
  ['jsonl: one bad line is not jsonl', '{"a":1}\n{"a":\n', undefined],
  // diff
  ['diff: git diff', 'diff --git a/x.ts b/x.ts\nindex 1..2 100644\n--- a/x.ts\n+++ b/x.ts\n@@ -1,2 +1,2 @@\n-a\n+b\n', 'diff'],
  ['diff: unified without git header', '--- old.txt\n+++ new.txt\n@@ -1 +1 @@\n-x\n+y', 'diff'],
  ['diff: hunk only with changes', '@@ -10,3 +10,4 @@ function f()\n ctx\n+added\n ctx', 'diff'],
  ['diff: bullets "- foo" and "@@" text are not diff', '- one\n- two\nwe use @@ here', undefined],
  ['diff: preceded by Exit code', 'Exit code 1\ndiff --git a/a b/a\n--- a/a\n+++ b/a\n@@ -1 +1 @@\n-1\n+2\nShell cwd was reset to /tmp', 'diff'],
  // XML / HTML
  ['xml: declaration', '<?xml version="1.0"?>\n<a><b/></a>', 'xml'],
  ['html: doctype', '<!DOCTYPE html>\n<html><body>hi</body></html>', 'html'],
  ['html: html tag', '<html lang="en">\n<head></head></html>', 'html'],
  ['xml: bare tree', '<root>\n  <item id="1"/>\n  <item id="2"></item>\n</root>', 'xml'],
  ['markup: angle brackets in a log are not xml', '<stdin>:1: error: oops\nmore text', undefined],
  // Markdown
  ['markdown: headings and list', '# Title\n\n## Section\n\n- one\n- two\n- three\n', 'markdown'],
  ['markdown: fenced code with a diff inside', 'Here is the change:\n\n```diff\n@@ -1 +1 @@\n-a\n+b\n```\n\n- ok\n', 'markdown'],
  ['markdown: table', '| a | b |\n|---|---|\n| 1 | 2 |\n\nSee [docs](https://example.com).', 'markdown'],
  ['markdown: shell comments alone are not markdown', '# install deps\nnpm ci\n# run tests\nnpm test\n', undefined],
  ['markdown: a dash list alone is not markdown', '- a\n- b\n- c\n', undefined],
  // YAML
  ['yaml: document with nesting', '---\nname: demo\nversion: 1.0.0\nscripts:\n  build: tsc\n  test: node --test\n', 'yaml'],
  ['yaml: compose-like', 'services:\n  web:\n    image: nginx\n    ports:\n      - "80:80"\n  db:\n    image: postgres\n', 'yaml'],
  ['yaml: summary with capitalised keys is a log', 'Total: 5\nPassed: 4\nFailed: 1\nSkipped: 0\n', undefined],
  ['yaml: log-level lines are not yaml', 'error: cannot find module\nwarning: deprecated\nnote: see docs\nhint: try again\n', undefined],
  ['yaml: git log header is not yaml', 'commit abc\nAuthor: A <a@b.c>\nDate: Mon Jan 1 10:00:00 2026\n\n    msg\n', undefined],
  // Typical logs
  [
    'bash: Exit code + cwd reset + json line + time',
    'Exit code 1\nrunning step: build\n{"status":"failed","code":2}\n\nreal\t0m1.234s\nuser\t0m0.500s\nsys\t0m0.100s\nShell cwd was reset to /tmp',
    undefined,
  ],
  ['bash: only Exit code and a message', 'Exit code 127\nzsh: command not found: foo', undefined],
  ['bash: zsh time format', 'ok\n0.50s user 0.10s system 55% cpu 1.092 total', undefined],
  ['log: timestamps with levels', '2026-01-01 10:00:00 INFO start\n2026-01-01 10:00:01 ERROR boom\n', undefined],
  ['log: key: value lines with clock times', 'start: 10:00:00\nend: 10:00:05\nstatus: ok\nname: x\n', undefined],
  ['empty', '   \n\n', undefined],
];

for (const [name, input, expected] of cases) {
  test(`classify - ${name}`, () => {
    assert.equal(classifyByRules(input), expected);
  });
}

test('sampleForModel removes preamble, ANSI and caps length', () => {
  const s = sampleForModel('Exit code 1\n\x1b[31mhello\x1b[0m\nShell cwd was reset to /x');
  assert.equal(s, 'hello');
  assert.equal(sampleForModel('x'.repeat(50_000)).length, 10_000);
});
