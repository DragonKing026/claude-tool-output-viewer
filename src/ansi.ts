/**
 * Pure ANSI escape sequence scanner. It never touches the text: it only reports
 * where sequences are (so they can be hidden) and which ranges carry which SGR style.
 * No dependency on `vscode`.
 */

export type AnsiColor =
  | { type: 'palette'; index: number } // 0-15: terminal palette, resolved by the theme
  | { type: 'rgb'; r: number; g: number; b: number };

export interface AnsiStyle {
  fg?: AnsiColor;
  bg?: AnsiColor;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  inverse?: boolean;
}

export interface AnsiSpan {
  /** Offsets into the original text (UTF-16 code units), end exclusive. */
  start: number;
  end: number;
  style: AnsiStyle;
}

export interface AnsiResult {
  /** Ranges of escape sequences (all kinds), to be hidden. */
  escapes: Array<[number, number]>;
  /** Text ranges that carry a non-default style. */
  spans: AnsiSpan[];
}

const ESC = '\x1b';

const CSI_ALT = '(?:\\x1b\\[|\\x9b)([0-?]*)([ -/]*)([@-~])';
const OSC_ALT = '\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)';
const CHARSET_ALT = '\\x1b[()*+][0-9A-Za-z]';
const TWO_CHAR_ALT = '\\x1b[@-Z\\\\-_]';
const BARE_ALT = '\\[(\\d{1,3}(?:[;:]\\d{0,3})*)?m';

/**
 * Some pipelines drop the ESC byte and leave `[0m`, `[1;31m`, ... in the text. We only treat
 * these as SGR when the text has no real ESC at all and contains a bare reset (`[0m` / `[m`),
 * which ordinary text practically never does.
 */
export function hasBareSgr(text: string): boolean {
  return !text.includes(ESC) && /\[0?m/.test(text);
}

function buildRegex(bare: boolean): RegExp {
  const parts = [CSI_ALT, OSC_ALT, CHARSET_ALT, TWO_CHAR_ALT];
  if (bare) parts.push(BARE_ALT);
  return new RegExp(parts.join('|'), 'g');
}

export function hasAnsi(text: string): boolean {
  return text.includes(ESC) || text.includes('\x9b') || hasBareSgr(text);
}

export function stripAnsi(text: string): string {
  if (!hasAnsi(text)) return text;
  return text.replace(buildRegex(hasBareSgr(text)), '');
}

function color256(n: number): AnsiColor {
  if (n < 16) return { type: 'palette', index: n };
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return { type: 'rgb', r: v, g: v, b: v };
  }
  const c = n - 16;
  const level = (x: number): number => (x === 0 ? 0 : 55 + x * 40);
  return { type: 'rgb', r: level(Math.floor(c / 36)), g: level(Math.floor(c / 6) % 6), b: level(c % 6) };
}

const clamp = (n: number): number => Math.max(0, Math.min(255, n | 0));

/** Applies one SGR parameter string (e.g. `1;38;5;196`) to `style` in place. */
export function applySgr(style: AnsiStyle, params: string): void {
  const groups = params === '' ? ['0'] : params.split(';');
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i] ?? '';
    const sub = group.split(':');
    const code = sub[0] === '' ? 0 : Number(sub[0]);
    if (Number.isNaN(code)) continue;

    if (code === 38 || code === 48) {
      let color: AnsiColor | undefined;
      if (sub.length > 1) {
        // colon form: 38:5:n or 38:2:[cs:]r:g:b
        if (sub[1] === '5') color = color256(clamp(Number(sub[2])));
        else if (sub[1] === '2') {
          const o = sub.length >= 6 ? 3 : 2;
          color = { type: 'rgb', r: clamp(Number(sub[o])), g: clamp(Number(sub[o + 1])), b: clamp(Number(sub[o + 2])) };
        }
      } else {
        const mode = groups[i + 1];
        if (mode === '5') {
          color = color256(clamp(Number(groups[i + 2])));
          i += 2;
        } else if (mode === '2') {
          color = { type: 'rgb', r: clamp(Number(groups[i + 2])), g: clamp(Number(groups[i + 3])), b: clamp(Number(groups[i + 4])) };
          i += 4;
        }
      }
      if (color) {
        if (code === 38) style.fg = color;
        else style.bg = color;
      }
      continue;
    }

    if (code === 0) {
      for (const k of Object.keys(style) as Array<keyof AnsiStyle>) delete style[k];
    } else if (code === 1) style.bold = true;
    else if (code === 2) style.dim = true;
    else if (code === 3) style.italic = true;
    else if (code === 4 || code === 21) style.underline = true;
    else if (code === 7) style.inverse = true;
    else if (code === 9) style.strike = true;
    else if (code === 22) {
      delete style.bold;
      delete style.dim;
    } else if (code === 23) delete style.italic;
    else if (code === 24) delete style.underline;
    else if (code === 27) delete style.inverse;
    else if (code === 29) delete style.strike;
    else if (code >= 30 && code <= 37) style.fg = { type: 'palette', index: code - 30 };
    else if (code === 39) delete style.fg;
    else if (code >= 40 && code <= 47) style.bg = { type: 'palette', index: code - 40 };
    else if (code === 49) delete style.bg;
    else if (code >= 90 && code <= 97) style.fg = { type: 'palette', index: code - 90 + 8 };
    else if (code >= 100 && code <= 107) style.bg = { type: 'palette', index: code - 100 + 8 };
  }
}

function isDefault(style: AnsiStyle): boolean {
  return Object.keys(style).length === 0;
}

export function styleKey(style: AnsiStyle): string {
  const col = (c?: AnsiColor): string => (!c ? '' : c.type === 'palette' ? `p${c.index}` : `#${c.r},${c.g},${c.b}`);
  return [
    col(style.fg),
    col(style.bg),
    style.bold ? 'b' : '',
    style.dim ? 'd' : '',
    style.italic ? 'i' : '',
    style.underline ? 'u' : '',
    style.strike ? 's' : '',
    style.inverse ? 'v' : '',
  ].join('|');
}

export function parseAnsi(text: string): AnsiResult {
  const result: AnsiResult = { escapes: [], spans: [] };
  if (!hasAnsi(text)) return result;

  const re = buildRegex(hasBareSgr(text));
  const style: AnsiStyle = {};
  let pos = 0;

  const flush = (end: number): void => {
    if (end > pos && !isDefault(style)) result.spans.push({ start: pos, end, style: { ...style } });
  };

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    flush(start);
    result.escapes.push([start, end]);
    if (m[0].startsWith('[')) {
      applySgr(style, m[4] ?? ''); // bare form: `[1;31m`
    } else if (m[3] === 'm' && m[2] === '' && /^[0-9;:]*$/.test(m[1] ?? '')) {
      applySgr(style, m[1] ?? '');
    }
    pos = end;
  }
  flush(text.length);
  return result;
}
