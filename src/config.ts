import * as vscode from 'vscode';

export const SECTION = 'claudeToolOutputViewer';
export const OWN_LANGUAGE = 'claude-tool-output';
export const FORMATTED_SCHEME = 'claude-tool-output-formatted';

export type AnsiMode = 'off' | 'hide' | 'dim';

export interface Settings {
  enabled: boolean;
  schemes: string[];
  namePattern: RegExp | undefined;
  useModel: boolean;
  modelMinLength: number;
  modelConfidence: number;
  wordWrap: boolean;
  ansi: AnsiMode;
  codeLens: boolean;
}

let warnedPattern: string | undefined;

export function readSettings(onWarn?: (msg: string) => void): Settings {
  const c = vscode.workspace.getConfiguration(SECTION);
  const patternSource = c.get<string>('namePattern', '');
  let namePattern: RegExp | undefined;
  if (patternSource) {
    try {
      namePattern = new RegExp(patternSource, 'i');
    } catch (e) {
      if (warnedPattern !== patternSource) {
        warnedPattern = patternSource;
        onWarn?.(`Invalid ${SECTION}.namePattern: ${String(e)}`);
      }
    }
  }
  return {
    enabled: c.get<boolean>('enabled', true),
    schemes: c.get<string[]>('schemes', ['_claude_vscode_fs_readonly']),
    namePattern,
    useModel: c.get<boolean>('useModel', true),
    modelMinLength: Math.max(0, c.get<number>('modelMinLength', 100)),
    modelConfidence: c.get<number>('modelConfidence', 0.5),
    wordWrap: c.get<boolean>('wordWrap', true),
    ansi: c.get<AnsiMode>('ansi', 'hide'),
    codeLens: c.get<boolean>('codeLens', true),
  };
}

export function baseName(uri: vscode.Uri): string {
  const p = uri.path;
  return p.slice(p.lastIndexOf('/') + 1);
}

/** True when the document is a Claude Code tool output document (by scheme or by name). */
export function isToolOutput(doc: vscode.TextDocument, s: Settings): boolean {
  if (doc.uri.scheme === FORMATTED_SCHEME) return false;
  if (s.schemes.includes(doc.uri.scheme)) return true;
  return s.namePattern !== undefined && s.namePattern.test(baseName(doc.uri));
}
