import * as vscode from "vscode";

type WaitStartHandler = (
  panel: vscode.WebviewPanel,
) => void | Thenable<void>;

type WebviewMessage = {
  type?: unknown;
  url?: unknown;
};

const waitStartEmitter = new vscode.EventEmitter<vscode.WebviewPanel>();
let overlayPanel: vscode.WebviewPanel | undefined;
let wasClaudeActive = false;
let lastFiredAt = 0;
const COOLDOWN_MS = 15_000;

function findClaudeTab(): boolean {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.label.toLowerCase().includes("claude")) {
        return true;
      }
      if (
        tab.input instanceof vscode.TabInputWebview &&
        tab.input.viewType.toLowerCase().includes("claude")
      ) {
        return true;
      }
    }
  }
  return false;
}

function getOrCreateOverlayPanel(): vscode.WebviewPanel {
  if (!overlayPanel) {
    overlayPanel = vscode.window.createWebviewPanel(
      "latency.overlay",
      "Latency",
      { viewColumn: vscode.ViewColumn.Two, preserveFocus: true },
      { enableScripts: true },
    );
    overlayPanel.webview.html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  html, body {
    margin: 0; padding: 0;
    width: 100%; height: 100%;
    background: #0D1B2A;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  #label {
    color: rgba(255,255,255,0.25);
    font: 11px/1 sans-serif;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    user-select: none;
  }
</style>
</head>
<body>
<span id="label">Latency</span>
</body></html>`;

    const messageDisposable = overlayPanel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        if (message.type !== "click" || typeof message.url !== "string") {
          return;
        }

        const url = vscode.Uri.parse(message.url);
        if (url.scheme !== "http" && url.scheme !== "https") {
          return;
        }

        await vscode.env.openExternal(url);
      },
    );

    overlayPanel.onDidDispose(() => {
      messageDisposable.dispose();
      overlayPanel = undefined;
    });
  }
  return overlayPanel;
}

export const claudeAdapter = {
  activate(context: vscode.ExtensionContext): void {
    console.log("=== claudeAdapter: all installed extensions ===");
    for (const ext of vscode.extensions.all) {
      console.log("extension:", ext.id);
    }
    console.log("===============================================");

    const poll = setInterval(() => {
      const isActive = findClaudeTab();

      if (isActive && !wasClaudeActive) {
        const now = Date.now();
        if (now - lastFiredAt >= COOLDOWN_MS) {
          lastFiredAt = now;
          const panel = getOrCreateOverlayPanel();
          console.log("waitStart fired");
          waitStartEmitter.fire(panel);
        }
      }

      wasClaudeActive = isActive;
    }, 500);

    context.subscriptions.push(
      waitStartEmitter,
      { dispose: () => clearInterval(poll) },
      { dispose: () => overlayPanel?.dispose() },
    );
  },

  onWaitStart(handler: WaitStartHandler): vscode.Disposable {
    return waitStartEmitter.event(handler);
  },
};
