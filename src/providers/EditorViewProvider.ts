import * as vscode from 'vscode';

type WebviewMessage =
    | { command: 'textChanged'; data: string; revision?: number }
    | { command: 'load' }
    | { command: 'response'; data: string; requestId?: number; revision?: number };

/**
 * Webview 编辑器 Provider - 用于输入/输出编辑
 */
export class EditorViewProvider implements vscode.WebviewViewProvider {
    private webviewView?: vscode.WebviewView;
    private pendingText?: string;
    private currentText = '';
    private revision = 0;
    private isReady = false;
    private nextRequestId = 1;
    private messageListener?: vscode.Disposable;
    private pendingRequests = new Map<number, (text: string) => void>();

    private _onDidChange = new vscode.EventEmitter<string>();
    private _onLoad = new vscode.EventEmitter<void>();

    readonly onDidChange = this._onDidChange.event;
    readonly onLoad = this._onLoad.event;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly readOnly: boolean = false
    ) { }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this.messageListener?.dispose();
        this.webviewView = webviewView;
        this.isReady = false;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
        };

        webviewView.webview.html = this.getHtml(webviewView.webview);

        this.messageListener = webviewView.webview.onDidReceiveMessage((e: WebviewMessage) => {
            switch (e.command) {
                case 'textChanged':
                    this.currentText = e.data;
                    if (typeof e.revision === 'number') {
                        this.revision = Math.max(this.revision, e.revision);
                    }
                    this._onDidChange.fire(e.data);
                    break;
                case 'load':
                    this.isReady = true;
                    this._onLoad.fire();
                    if (this.pendingText !== undefined || this.currentText !== '') {
                        const webviewViewRef = this.webviewView;
                        if (!webviewViewRef) {
                            break;
                        }
                        webviewViewRef.webview.postMessage({
                            command: 'setText',
                            data: this.pendingText ?? this.currentText,
                            revision: this.revision
                        });
                        this.pendingText = undefined;
                    }
                    break;
                case 'response':
                    this.currentText = e.data;
                    if (typeof e.revision === 'number') {
                        this.revision = Math.max(this.revision, e.revision);
                    }
                    if (typeof e.requestId === 'number') {
                        const resolve = this.pendingRequests.get(e.requestId);
                        if (resolve) {
                            this.pendingRequests.delete(e.requestId);
                            resolve(e.data);
                        }
                    }
                    break;
            }
        });
    }

    setText(text: string): void {
        const requiresSync = !this.webviewView || !this.isReady || this.pendingText !== undefined;
        if (this.currentText === text && !requiresSync) {
            return;
        }

        this.currentText = text;
        this.revision += 1;

        if (!this.webviewView || !this.isReady) {
            this.pendingText = text;
            return;
        }

        this.webviewView.webview.postMessage({
            command: 'setText',
            data: text,
            revision: this.revision
        });
    }

    async getText(): Promise<string> {
        if (!this.webviewView || !this.isReady) {
            return this.pendingText ?? this.currentText;
        }

        return new Promise(resolve => {
            const requestId = this.nextRequestId++;
            this.pendingRequests.set(requestId, resolve);
            this.webviewView!.webview.postMessage({ command: 'getText', requestId });
        });
    }

    reveal(): void {
        this.webviewView?.show(true);
    }

    updateTheme(): void {
        this.webviewView?.webview.postMessage({ command: 'themeChanged' });
    }

    private getHtml(webview: vscode.Webview): string {
        const loaderUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'monaco', 'loader.js')
        );
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.js')
        );
        const monacoBaseUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'monaco')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media', 'editor.css')
        );

        return `
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <script src="${loaderUri}"></script>
                <link href="${styleUri}" rel="stylesheet">
            </head>
            <body>
                <div id="editor"></div>
                <script>
                    const MonacoBaseUri = "${monacoBaseUri}";
                    const InitialReadOnly = ${JSON.stringify(this.readOnly)};
                </script>
                <script src="${scriptUri}"></script>
            </body>
        </html>`;
    }

    dispose(): void {
        this.messageListener?.dispose();
        for (const resolve of this.pendingRequests.values()) {
            resolve(this.currentText);
        }
        this.pendingRequests.clear();
        this._onDidChange.dispose();
        this._onLoad.dispose();
    }
}
