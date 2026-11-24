import * as vscode from 'vscode';
import { AnsiColor, AnsiResult, AnsiStyle, hasAnsi, parseAnsi, styleKey } from './ansi';
import type { AnsiMode } from './config';

const PALETTE = ['Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White'];
const MAX_STYLE_TYPES = 150;

function paletteTheme(index: number): vscode.ThemeColor {
  const name = PALETTE[index % 8]!;
  return new vscode.ThemeColor(`terminal.ansi${index >= 8 ? 'Bright' : ''}${name}`);
}

function cssColor(c: AnsiColor): string | vscode.ThemeColor {
  return c.type === 'palette' ? paletteTheme(c.index) : `rgb(${c.r},${c.g},${c.b})`;
}

function toRenderOptions(style: AnsiStyle): vscode.DecorationRenderOptions {
  let fg = style.fg ? cssColor(style.fg) : undefined;
  let bg = style.bg ? cssColor(style.bg) : undefined;
  if (style.inverse) {
    const nextFg = bg ?? new vscode.ThemeColor('editor.background');
    const nextBg = fg ?? new vscode.ThemeColor('editor.foreground');
    fg = nextFg;
    bg = nextBg;
  }
  const lines = [style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter(Boolean).join(' ');
  return {
    color: fg,
    backgroundColor: bg,
    fontWeight: style.bold ? 'bold' : undefined,
    fontStyle: style.italic ? 'italic' : undefined,
    textDecoration: lines || undefined,
    opacity: style.dim ? '0.6' : undefined,
  };
}

/** Shows ANSI SGR colors as editor decorations and hides (or dims) the escape sequences. */
export class AnsiDecorator implements vscode.Disposable {
  private readonly styleTypes = new Map<string, vscode.TextEditorDecorationType>();
  private hiddenType: vscode.TextEditorDecorationType | undefined;
  private dimType: vscode.TextEditorDecorationType | undefined;
  private readonly applied = new WeakMap<vscode.TextEditor, Set<vscode.TextEditorDecorationType>>();
  private readonly cache = new Map<string, { version: number; result: AnsiResult }>();

  private parsed(doc: vscode.TextDocument): AnsiResult {
    const key = doc.uri.toString();
    const hit = this.cache.get(key);
    if (hit && hit.version === doc.version) return hit.result;
    const text = doc.getText();
    const result = hasAnsi(text) ? parseAnsi(text) : { escapes: [], spans: [] };
    this.cache.set(key, { version: doc.version, result });
    return result;
  }

  forget(doc: vscode.TextDocument): void {
    this.cache.delete(doc.uri.toString());
  }

  private styleType(style: AnsiStyle): vscode.TextEditorDecorationType | undefined {
    const key = styleKey(style);
    let t = this.styleTypes.get(key);
    if (!t) {
      if (this.styleTypes.size >= MAX_STYLE_TYPES) return undefined;
      t = vscode.window.createTextEditorDecorationType(toRenderOptions(style));
      this.styleTypes.set(key, t);
    }
    return t;
  }

  private escapeType(mode: Exclude<AnsiMode, 'off'>): vscode.TextEditorDecorationType {
    if (mode === 'dim') {
      this.dimType ??= vscode.window.createTextEditorDecorationType({ opacity: '0.35' });
      return this.dimType;
    }
    // Collapses the sequence: `display: none` is injected through the textDecoration CSS value.
    this.hiddenType ??= vscode.window.createTextEditorDecorationType({
      textDecoration: 'none; display: none;',
      opacity: '0',
    });
    return this.hiddenType;
  }

  apply(editor: vscode.TextEditor, mode: AnsiMode): void {
    const doc = editor.document;
    const previous = this.applied.get(editor) ?? new Set<vscode.TextEditorDecorationType>();
    const next = new Set<vscode.TextEditorDecorationType>();
    const result = mode === 'off' ? { escapes: [], spans: [] } : this.parsed(doc);

    if (result.escapes.length > 0) {
      const t = this.escapeType(mode === 'dim' ? 'dim' : 'hide');
      editor.setDecorations(
        t,
        result.escapes.map(([a, b]) => new vscode.Range(doc.positionAt(a), doc.positionAt(b))),
      );
      next.add(t);
    }

    const byType = new Map<vscode.TextEditorDecorationType, vscode.Range[]>();
    for (const span of result.spans) {
      const t = this.styleType(span.style);
      if (!t) continue;
      let list = byType.get(t);
      if (!list) byType.set(t, (list = []));
      list.push(new vscode.Range(doc.positionAt(span.start), doc.positionAt(span.end)));
    }
    for (const [t, ranges] of byType) {
      editor.setDecorations(t, ranges);
      next.add(t);
    }

    for (const t of previous) if (!next.has(t)) editor.setDecorations(t, []);
    this.applied.set(editor, next);
  }

  dispose(): void {
    for (const t of this.styleTypes.values()) t.dispose();
    this.styleTypes.clear();
    this.hiddenType?.dispose();
    this.dimType?.dispose();
    this.cache.clear();
  }
}
