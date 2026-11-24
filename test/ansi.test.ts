import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnsi, stripAnsi, hasAnsi } from '../src/ansi';

test('plain text has no ansi', () => {
  assert.equal(hasAnsi('hello [1m]'), false);
  assert.deepEqual(parseAnsi('hello'), { escapes: [], spans: [] });
});

test('basic SGR colors and reset', () => {
  const text = 'a\x1b[31mred\x1b[0mb';
  const r = parseAnsi(text);
  assert.deepEqual(r.escapes, [[1, 6], [9, 13]]);
  assert.equal(r.spans.length, 1);
  assert.equal(text.slice(r.spans[0]!.start, r.spans[0]!.end), 'red');
  assert.deepEqual(r.spans[0]!.style.fg, { type: 'palette', index: 1 });
  assert.equal(stripAnsi(text), 'aredb');
});

test('bold + bright + background combine and accumulate', () => {
  const text = '\x1b[1;92;44mX\x1b[22mY\x1b[0m';
  const r = parseAnsi(text);
  assert.equal(r.spans.length, 2);
  assert.deepEqual(r.spans[0]!.style, { bold: true, fg: { type: 'palette', index: 10 }, bg: { type: 'palette', index: 4 } });
  assert.deepEqual(r.spans[1]!.style, { fg: { type: 'palette', index: 10 }, bg: { type: 'palette', index: 4 } });
});

test('256 colors: palette, cube, gray', () => {
  const r = parseAnsi('\x1b[38;5;9mA\x1b[38;5;196mB\x1b[38;5;240mC');
  assert.deepEqual(r.spans.map((s) => s.style.fg), [
    { type: 'palette', index: 9 },
    { type: 'rgb', r: 255, g: 0, b: 0 },
    { type: 'rgb', r: 88, g: 88, b: 88 },
  ]);
});

test('truecolor foreground and background (semicolon and colon forms)', () => {
  const r = parseAnsi('\x1b[38;2;10;20;30;48;2;1;2;3mA\x1b[0m\x1b[38:2::9:8:7mB');
  assert.deepEqual(r.spans[0]!.style.fg, { type: 'rgb', r: 10, g: 20, b: 30 });
  assert.deepEqual(r.spans[0]!.style.bg, { type: 'rgb', r: 1, g: 2, b: 3 });
  assert.deepEqual(r.spans[1]!.style.fg, { type: 'rgb', r: 9, g: 8, b: 7 });
});

test('italic, underline, strike, inverse, dim and their resets', () => {
  const r = parseAnsi('\x1b[2;3;4;7;9mA\x1b[23;24;27;29;22mB');
  assert.deepEqual(r.spans[0]!.style, { dim: true, italic: true, underline: true, inverse: true, strike: true });
  assert.equal(r.spans.length, 1); // B has default style
});

test('empty parameter list means reset', () => {
  const r = parseAnsi('\x1b[31mA\x1b[mB');
  assert.equal(r.spans.length, 1);
});

test('non-SGR CSI, OSC and charset sequences are hidden but unstyled', () => {
  const text = 'a\x1b[2Kb\x1b[1;1Hc\x1b]0;title\x07d\x1b(Be';
  const r = parseAnsi(text);
  assert.equal(r.spans.length, 0);
  assert.equal(stripAnsi(text), 'abcde');
});

test('a styled run is cut at escape sequences, never includes them', () => {
  const text = '\x1b[31mab\x1b[2Kcd\x1b[0m';
  const r = parseAnsi(text);
  assert.deepEqual(r.spans.map((s) => text.slice(s.start, s.end)), ['ab', 'cd']);
});

test('bare SGR without ESC is recognised only when a bare reset is present', () => {
  const withReset = '[1;32mOK[0m done';
  const r = parseAnsi(withReset);
  assert.equal(stripAnsi(withReset), 'OK done');
  assert.equal(r.spans.length, 1);
  assert.deepEqual(r.spans[0]!.style, { bold: true, fg: { type: 'palette', index: 2 } });

  const noReset = 'array[1m] and [31m';
  assert.equal(stripAnsi(noReset), noReset);
  assert.deepEqual(parseAnsi(noReset).escapes, []);
});

test('real ESC disables bare detection', () => {
  const text = '\x1b[31mred\x1b[0m [0m';
  assert.equal(stripAnsi(text), 'red [0m');
});

test('offsets are valid for text with multibyte characters', () => {
  const text = 'zażółć \x1b[33mgęślą\x1b[0m jaźń';
  const r = parseAnsi(text);
  assert.equal(text.slice(r.spans[0]!.start, r.spans[0]!.end), 'gęślą');
});

test('incomplete sequence at the end does not throw', () => {
  assert.doesNotThrow(() => parseAnsi('abc\x1b[31'));
  assert.doesNotThrow(() => stripAnsi('abc\x1b'));
});
