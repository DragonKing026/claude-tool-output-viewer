import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatOutput, findJsonLines, formatLine } from '../src/format';

test('whole JSON is pretty printed', () => {
  const r = formatOutput('{"a":1,"b":[1,2]}');
  assert.equal(r.kind, 'json');
  assert.equal(r.text, '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ]\n}\n');
});

test('mixed text: only JSON lines are expanded, the rest is untouched', () => {
  const input = 'Exit code 1\nstart\n{"a":1}\nend\nShell cwd was reset to /tmp';
  const r = formatOutput(input);
  assert.equal(r.kind, 'mixed');
  assert.equal(r.expanded, 1);
  assert.equal(r.text, 'Exit code 1\nstart\n{\n  "a": 1\n}\nend\nShell cwd was reset to /tmp');
});

test('indentation of a JSON line is preserved', () => {
  const r = formatOutput('  [1]');
  // single JSON value after trimming -> whole-output JSON
  assert.equal(r.kind, 'json');
  const m = formatOutput('x\n  [1]\n');
  assert.equal(m.text, 'x\n  [\n    1\n  ]\n');
});

test('ANSI is stripped from the formatted copy', () => {
  const r = formatOutput('\x1b[31merr\x1b[0m\n{"a":1}');
  assert.equal(r.text, 'err\n{\n  "a": 1\n}');
});

test('invalid JSON lines are left alone', () => {
  const r = formatOutput('{"a":\nplain');
  assert.equal(r.expanded, 0);
  assert.equal(r.text, '{"a":\nplain');
});

test('findJsonLines returns zero-based line numbers of JSON lines only', () => {
  assert.deepEqual(findJsonLines('a\n{"x":1}\nb\n[1,2]\n{bad}\n'), [1, 3]);
});

test('formatLine formats one line', () => {
  assert.equal(formatLine('a\n{"x":1}', 1), '{\n  "x": 1\n}\n');
  assert.equal(formatLine('a\n{"x":1}', 0), undefined);
});
