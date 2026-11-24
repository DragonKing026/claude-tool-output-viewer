import * as vscode from 'vscode';
import { classifyByRules, sampleForModel, RuleKind } from './classify';
import { pickLanguage } from './modelMap';
import { runModel, disposeModel } from './model';
import { AnsiDecorator } from './decorations';
import { FormattedContentProvider, JsonLensProvider, formatDocument, formatSingleLine } from './formatView';
import { FORMATTED_SCHEME, OWN_LANGUAGE, SECTION, Settings, isToolOutput, readSettings } from './config';

const CONTEXT_KEY = 'claudeToolOutputViewer.isToolOutput';

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel('Claude Tool Output Viewer');
  const debug = !!process.env['CTOV_DEBUG'];
  const write = log.appendLine.bind(log);
  log.appendLine = (m: string): void => {
    write(m);
    if (debug) console.log(`[ctov] ${m}`);
  };
  const settings = (): Settings => readSettings((m) => log.appendLine(m));

  const decorator = new AnsiDecorator();
  const formatted = new FormattedContentProvider();
  const lenses = new JsonLensProvider();

  /** uri -> language id we assigned. Closing/reopening is also triggered by a language change, so entries are kept. */
  const assigned = new Map<string, string>();
  const inflight = new Set<string>();
  /** documents for which word wrap was toggled on by us (the override lives with the text model). */
  const wrapToggled = new Set<string>();

  const ruleToLanguage = (kind: RuleKind, available: Set<string>): string | undefined => {
    const id = kind === 'jsonl' ? (available.has('jsonl') ? 'jsonl' : 'json') : kind;
    return available.has(id) ? id : undefined;
  };

  async function decideLanguage(text: string, s: Settings): Promise<string> {
    const available = new Set(await vscode.languages.getLanguages());
    const kind = classifyByRules(text);
    if (kind) {
      const id = ruleToLanguage(kind, available);
      if (id) {
        log.appendLine(`rules: ${kind} -> ${id}`);
        return id;
      }
    }
    if (s.useModel) {
      const sample = sampleForModel(text);
      if (sample.length >= s.modelMinLength) {
        try {
          const results = await runModel(sample);
          const picked = results && pickLanguage(results, s.modelConfidence, (id) => available.has(id));
          if (picked) {
            log.appendLine(`model: ${picked.modelId} (${picked.confidence.toFixed(2)}) -> ${picked.languageId}`);
            return picked.languageId;
          }
          log.appendLine('model: no confident match');
        } catch (e) {
          log.appendLine(`model failed: ${String(e)}`);
        }
      }
    }
    return OWN_LANGUAGE;
  }

  async function processDocument(doc: vscode.TextDocument): Promise<void> {
    const s = settings();
    if (!s.enabled || doc.isClosed || !isToolOutput(doc, s)) return;
    const key = doc.uri.toString();
    if (inflight.has(key)) return;
    const done = assigned.get(key);
    // Already handled (this also swallows the re-open event caused by our own language change),
    // or the language was changed by someone else (user): leave it alone.
    if (done !== undefined && doc.languageId === done) return;
    if (doc.languageId !== 'plaintext') {
      if (done === undefined) assigned.set(key, doc.languageId);
      return;
    }
    inflight.add(key);
    try {
      const languageId = await decideLanguage(doc.getText(), s);
      assigned.set(key, languageId);
      if (!doc.isClosed && doc.languageId !== languageId) await vscode.languages.setTextDocumentLanguage(doc, languageId);
    } catch (e) {
      log.appendLine(`processing failed: ${String(e)}`);
    } finally {
      inflight.delete(key);
    }
    setTimeout(refreshVisible, 30);
  }

  function effectiveWordWrap(doc: vscode.TextDocument): string | undefined {
    return vscode.workspace.getConfiguration('editor', { uri: doc.uri, languageId: doc.languageId }).get<string>('wordWrap');
  }

  async function ensureWordWrap(editor: vscode.TextEditor): Promise<void> {
    const s = settings();
    const doc = editor.document;
    if (!s.enabled || !s.wordWrap || !isToolOutput(doc, s)) return;
    if (vscode.window.activeTextEditor !== editor) return; // the command acts on the focused editor
    const key = doc.uri.toString();
    if (wrapToggled.has(key) || effectiveWordWrap(doc) !== 'off') return;
    wrapToggled.add(key);
    await vscode.commands.executeCommand('editor.action.toggleWordWrap');
  }

  function refreshEditor(editor: vscode.TextEditor): void {
    const s = settings();
    const matches = s.enabled && isToolOutput(editor.document, s);
    decorator.apply(editor, matches ? s.ansi : 'off');
  }

  function refreshVisible(): void {
    for (const editor of vscode.window.visibleTextEditors) refreshEditor(editor);
    updateContext(vscode.window.activeTextEditor);
    if (vscode.window.activeTextEditor) void ensureWordWrap(vscode.window.activeTextEditor);
  }

  function updateContext(editor: vscode.TextEditor | undefined): void {
    const s = settings();
    const on = !!editor && s.enabled && isToolOutput(editor.document, s);
    void vscode.commands.executeCommand('setContext', CONTEXT_KEY, on);
  }

  const schemeSelector: vscode.DocumentSelector = [{ scheme: '*' }];

  context.subscriptions.push(
    log,
    decorator,
    formatted,
    lenses,
    vscode.workspace.registerTextDocumentContentProvider(FORMATTED_SCHEME, formatted),
    vscode.languages.registerCodeLensProvider(schemeSelector, lenses),

    vscode.workspace.onDidOpenTextDocument((doc) => {
      void processDocument(doc).then(() => setTimeout(refreshVisible, 30));
    }),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      decorator.forget(doc);
      if (doc.uri.scheme === FORMATTED_SCHEME) formatted.delete(doc.uri);
    }),
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      for (const e of editors) refreshEditor(e);
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      updateContext(editor);
      if (editor) void ensureWordWrap(editor);
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(SECTION)) return;
      lenses.refresh();
      for (const doc of vscode.workspace.textDocuments) void processDocument(doc);
      refreshVisible();
    }),

    vscode.commands.registerCommand('claudeToolOutputViewer.format', async (arg?: vscode.Uri) => {
      const doc = arg instanceof vscode.Uri ? await vscode.workspace.openTextDocument(arg) : vscode.window.activeTextEditor?.document;
      if (!doc) return;
      await formatDocument(formatted, doc);
    }),
    vscode.commands.registerCommand('claudeToolOutputViewer.formatLine', async (uri: string, line: number) => {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(uri));
      await formatSingleLine(formatted, doc, line);
    }),
    vscode.commands.registerCommand('claudeToolOutputViewer.showLog', () => log.show(true)),
  );

  for (const doc of vscode.workspace.textDocuments) void processDocument(doc);
  refreshVisible();
}

export function deactivate(): void {
  disposeModel();
}
