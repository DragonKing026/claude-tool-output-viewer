import type { ModelResult } from './modelMap';

interface ModelOps {
  runModel(content: string): Promise<ModelResult[]>;
  dispose(): void;
}

const IDLE_MS = 5 * 60 * 1000;

let ops: ModelOps | undefined;
let loadFailed = false;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Runs the VS Code language detection model. The package (TensorFlow.js + weights) is loaded
 * lazily on first use and released after a few idle minutes.
 */
export async function runModel(sample: string): Promise<ModelResult[] | undefined> {
  if (loadFailed) return undefined;
  try {
    if (!ops) {
      // plain require (not import()): loaded lazily, and avoids esbuild's ESM interop wrapper
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@vscode/vscode-languagedetection') as typeof import('@vscode/vscode-languagedetection');
      ops = new mod.ModelOperations() as unknown as ModelOps;
    }
    const results = await ops.runModel(sample);
    scheduleIdleDispose();
    return results;
  } catch (e) {
    loadFailed = true;
    ops = undefined;
    throw e;
  }
}

function scheduleIdleDispose(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(disposeModel, IDLE_MS);
  idleTimer.unref?.();
}

export function disposeModel(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = undefined;
  try {
    ops?.dispose();
  } finally {
    ops = undefined;
  }
}
