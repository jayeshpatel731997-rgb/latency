import * as vscode from "vscode";
import { claudeAdapter } from "./adapters/claudeAdapter";
import { fetchAd, reportClick, reportImpression } from "./api/adClient";
import { injectOverlay } from "./overlay/overlay";

export function activate(context: vscode.ExtensionContext): void {
  console.log("Latency extension activated");
  console.log(
    "Looking for Claude...",
    vscode.extensions.all
      .filter((e) => e.id.toLowerCase().includes("claude"))
      .map((e) => e.id),
  );

  claudeAdapter.activate(context);

  const waitStartDisposable = claudeAdapter.onWaitStart(async (panel) => {
    const userId = context.globalState.get<string>("userId") ?? "anonymous";
    const ad = await fetchAd(userId);

    if (ad === null) {
      return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, 800));

    const impressionId = Date.now().toString();
    injectOverlay(
      panel,
      ad,
      () => {
        void reportImpression(impressionId, ad.id, userId, 3000);
      },
      () => {
        void reportClick(impressionId, userId);
      },
    );
  });

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.text = "$(zap) Latency: ₹0.00";
  statusBarItem.tooltip = "Latency earnings — click to view dashboard";
  statusBarItem.command = "latency.openDashboard";
  statusBarItem.show();

  const dashboardCommand = vscode.commands.registerCommand(
    "latency.openDashboard",
    () => vscode.window.showInformationMessage("Dashboard coming soon"),
  );

  context.subscriptions.push(
    waitStartDisposable,
    statusBarItem,
    dashboardCommand,
  );
}

export function deactivate(): void {}
