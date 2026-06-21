import * as vscode from "vscode";

type OverlayMessage = {
  type: "click";
  url: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeScriptValue(value: string): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function injectOverlay(
  panel: vscode.WebviewPanel,
  ad: { text: string; url: string; id: string },
  onImpression: (id: string) => void,
  onClick: (id: string) => void,
): void {
  const nonce = `${Date.now()}${Math.random()
    .toString(36)
    .slice(2)}`;
  const escapedText = escapeHtml(ad.text);
  const scriptUrl = escapeScriptValue(ad.url);

  let visible = true;

  const messageDisposable = panel.webview.onDidReceiveMessage(
    async (message: OverlayMessage) => {
      if (
        !visible ||
        message.type !== "click" ||
        message.url !== ad.url
      ) {
        return;
      }

      onClick(ad.id);
    },
  );

  const impressionTimer = setTimeout(() => {
    if (visible) {
      onImpression(ad.id);
    }
  }, 3000);

  const removalTimer = setTimeout(() => {
    visible = false;
    messageDisposable.dispose();
  }, 5000);

  panel.onDidDispose(() => {
    visible = false;
    clearTimeout(impressionTimer);
    clearTimeout(removalTimer);
    messageDisposable.dispose();
  });

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
  >
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Latency</title>
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
    }

    body {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0D1B2A;
      color: #FFFFFF;
      font-family: sans-serif;
    }

    #ad {
      width: min(420px, calc(100vw - 48px));
      box-sizing: border-box;
      padding: 24px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.05);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
    }

    #sponsored {
      margin-bottom: 10px;
      color: #FFB300;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    #ad-text {
      display: block;
      width: 100%;
      padding: 0;
      border: 0;
      background: transparent;
      color: #FFFFFF;
      cursor: pointer;
      font: 16px/1.5 sans-serif;
      text-align: left;
    }

    #ad-text:hover {
      text-decoration: underline;
    }

    #countdown {
      margin-top: 14px;
      color: rgba(255, 255, 255, 0.6);
      font-size: 12px;
    }

    #latency-label {
      color: rgba(255, 255, 255, 0.25);
      font: 11px/1 sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      user-select: none;
    }
  </style>
</head>
<body>
  <main id="ad">
    <div id="sponsored">Sponsored</div>
    <button id="ad-text" type="button">${escapedText}</button>
    <div id="countdown">Closes in 5s</div>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const adUrl = ${scriptUrl};
    const adText = document.getElementById("ad-text");
    const countdown = document.getElementById("countdown");
    let seconds = 5;

    adText.addEventListener("click", () => {
      vscode.postMessage({ type: "click", url: adUrl });
    });

    const timer = setInterval(() => {
      seconds -= 1;

      if (seconds > 0) {
        countdown.textContent = "Closes in " + seconds + "s";
        return;
      }

      clearInterval(timer);
      document.body.innerHTML = '<span id="latency-label">LATENCY</span>';
    }, 1000);
  </script>
</body>
</html>`;
}
