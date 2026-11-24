import * as vscode from 'vscode';
import { findJsonLines, formatLine, formatOutput } from './format';
import { FORMATTED_SCHEME, OWN_LANGUAGE, baseName, isToolOutput, readSettings } from './config';

/** Read-only virtual documents holding the formatted copy of a tool output. */
export class FormattedContentProvider implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly contents = new Map<string, string>();
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }

  set(uri: vscode.Uri, text: string): void {
    this.contents.set(uri.toString(), text);
    this.emitter.fire(uri);
  }

  delete(uri: vscode.Uri): void {
    this.contents.delete(uri.toString());
  }

  dispose(): void {
    this.emitter.dispose();
    this.contents.clear();
  }
}

function formattedUri(source: vscode.Uri, suffix: string, ext: string): vscode.Uri {
  return vscode.Uri.from({
    scheme: FORMATTED_SCHEME,
    path: `/${baseName(source)} ${suffix}${ext}`,
    query: source.toString(),
  });
}

async function show(provider: FormattedContentProvider, uri: vscode.Uri, text: string, languageId: string): Promise<void> {
  provider.set(uri, text);
  let doc = await vscode.workspace.openTextDocument(uri);
  if (doc.languageId !== languageId) doc = await vscode.languages.setTextDocumentLanguage(doc, languageId);
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: true, preserveFocus: true });
}

export async function formatDocument(provider: FormattedContentProvider, doc: vscode.TextDocument): Promise<void> {
  const result = formatOutput(doc.getText());
  const isJson = result.kind === 'json';
  const uri = formattedUri(doc.uri, '(formatted)', isJson ? '.json' : '.txt');
  if (!isJson && result.expanded === 0) {
    void vscode.window.showInformationMessage('No JSON found in this output; showing a copy without ANSI codes.');
  }
  await show(provider, uri, result.text, isJson ? 'json' : OWN_LANGUAGE);
}

export async function formatSingleLine(provider: FormattedContentProvider, doc: vscode.TextDocument, line: number): Promise<void> {
  const text = formatLine(doc.getText(), line);
  if (text === undefined) {
    void vscode.window.showInformationMessage('This line is not a JSON object or array.');
    return;
  }
  await show(provider, formattedUri(doc.uri, `(line ${line + 1}, formatted)`, '.json'), text, 'json');
}

export class JsonLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;

  refresh(): void {
    this.emitter.fire();
  }

  provideCodeLenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    const s = readSettings();
    if (!s.enabled || !s.codeLens || !isToolOutput(doc, s)) return [];
    return findJsonLines(doc.getText()).map(
      (line) =>
        new vscode.CodeLens(new vscode.Range(line, 0, line, 0), {
          title: 'Format JSON',
          command: 'claudeToolOutputViewer.formatLine',
          arguments: [doc.uri.toString(), line],
        }),
    );
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
