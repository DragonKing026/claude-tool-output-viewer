// Measures the memory cost of the language detection model in a plain Node process.
// Usage: node --expose-gc scripts/measure-model.mjs
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mb = (n) => (n / 1024 / 1024).toFixed(1);
const snap = () => {
  globalThis.gc?.();
  const m = process.memoryUsage();
  return { rss: m.rss, heapUsed: m.heapUsed, external: m.external, arrayBuffers: m.arrayBuffers };
};
const row = (label, s) =>
  console.log(`${label.padEnd(34)} rss ${mb(s.rss).padStart(7)} MB  heapUsed ${mb(s.heapUsed).padStart(7)} MB  external ${mb(s.external).padStart(6)} MB`);

const samples = [
  'function add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2));\n',
  'import os\nfor f in os.listdir("."):\n    print(f)\n',
  'SELECT id, name FROM users WHERE active = 1 ORDER BY name;\n',
  '#!/bin/bash\nset -e\nfor f in *.txt; do echo "$f"; done\n',
  '.a { color: red; }\n.b > .c { margin: 0 auto; }\n',
  'package main\nimport "fmt"\nfunc main() { fmt.Println("hi") }\n',
  '<?php\nfunction f($x) { return $x * 2; }\necho f(2);\n',
  'fn main() {\n    println!("{}", 1 + 2);\n}\n',
  'public class A { public static void main(String[] a) { System.out.println(1); } }\n',
  '{"a": 1, "b": [1, 2, 3], "c": {"d": "e"}}\n',
];

const before = snap();
row('before loading the package', before);

const t0 = performance.now();
const { ModelOperations } = require('@vscode/vscode-languagedetection');
const ops = new ModelOperations();
const afterRequire = snap();
row('after require (no model yet)', afterRequire);

await ops.runModel(samples[0]); // first call loads model + weights
const t1 = performance.now();
const afterLoad = snap();
row('after first classification', afterLoad);
console.log(`first classification (model load): ${(t1 - t0).toFixed(0)} ms`);

const t2 = performance.now();
for (let i = 0; i < 10; i++) await ops.runModel(samples[i % samples.length]);
const t3 = performance.now();
const after10 = snap();
row('after 10 more classifications', after10);
console.log(`10 classifications: ${(t3 - t2).toFixed(0)} ms (${((t3 - t2) / 10).toFixed(1)} ms each)`);

ops.dispose?.();
const afterDispose = snap();
row('after dispose()', afterDispose);

console.log(`\nDelta rss (after 10 classifications - before): ${mb(after10.rss - before.rss)} MB`);
console.log(`Delta heapUsed (same): ${mb(after10.heapUsed - before.heapUsed)} MB`);
