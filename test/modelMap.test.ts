import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjustConfidence, pickLanguage } from '../src/modelMap';

const all = (): boolean => true;

test('maps guesslang ids to VS Code language ids', () => {
  const r = pickLanguage([{ languageId: 'ts', confidence: 0.6 }], 0.5, all);
  assert.equal(r?.languageId, 'typescript');
  assert.equal(pickLanguage([{ languageId: 'sh', confidence: 0.6 }], 0.5, all)?.languageId, 'shellscript');
});

test('applies VS Code confidence corrections', () => {
  assert.equal(adjustConfidence({ languageId: 'js', confidence: 0.4 }).confidence, 0.45);
  assert.equal(adjustConfidence({ languageId: 'md', confidence: 0.7 }).confidence, 0.7 - 0.5);
  assert.equal(adjustConfidence({ languageId: 'py', confidence: 0.4 }).confidence, 0.45);
});

test('below threshold returns undefined', () => {
  assert.equal(pickLanguage([{ languageId: 'js', confidence: 0.3 }], 0.5, all), undefined);
  // a penalised language needs to be extra sure
  assert.equal(pickLanguage([{ languageId: 'md', confidence: 0.8 }], 0.5, all), undefined);
});

test('skips languages unknown to the editor, then falls to the next candidate', () => {
  const exists = (id: string): boolean => id === 'python';
  const r = pickLanguage([{ languageId: 'csv', confidence: 0.9 }, { languageId: 'py', confidence: 0.8 }], 0.5, exists);
  assert.equal(r?.languageId, 'python');
});

test('prefers the first existing alternative id', () => {
  const r = pickLanguage([{ languageId: 'mm', confidence: 0.9 }], 0.5, (id) => id === 'objective-c');
  assert.equal(r?.languageId, 'objective-c');
});

test('results are ordered by adjusted confidence', () => {
  const r = pickLanguage([{ languageId: 'sql', confidence: 0.95 }, { languageId: 'py', confidence: 0.6 }], 0.5, all);
  assert.equal(r?.languageId, 'python');
});
