import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/extension.js',
  // `vscode` is provided by the host. The language detection package is kept external: it loads
  // its model files relative to its own location, so it ships in the .vsix as a real package.
  external: ['vscode', '@vscode/vscode-languagedetection'],
  sourcemap: false,
  minify: !watch,
  logLevel: 'info',
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
