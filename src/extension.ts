import { randomUUID } from 'node:crypto';
import * as vscode from 'vscode';

import { claudeAdapter } from './adapters/claudeAdapter';
import {
  fetchAd,
  fetchWalletBalance,
  normalizeApiBaseUrl,
  reportClick,
  reportImpression,
} from './api/adClient';
import { getOrCreateInstallationIdentity } from './identity';
import { injectOverlay } from './overlay/overlay';

const CONFIGURATION_SECTION = 'latency';

function configuration(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIGURATION_SECTION);
}

function apiBaseUrl(): string {
  return normalizeApiBaseUrl(
    configuration().get<string>('apiBaseUrl', 'http://localhost:3001'),
  );
}

export function activate(context: vscode.ExtensionContext): void {
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBarItem.command = 'latency.refreshWallet';
  statusBarItem.show();

  const isEnabled = () => configuration().get<boolean>('enabled', false);
  claudeAdapter.activate(context, isEnabled);

  let identityPromise: ReturnType<typeof getOrCreateInstallationIdentity> | undefined;
  function installationIdentity() {
    identityPromise ??= getOrCreateInstallationIdentity(
      apiBaseUrl(),
      context.globalState,
      context.secrets,
    ).catch((error) => {
      identityPromise = undefined;
      throw error;
    });
    return identityPromise;
  }

  async function refreshWallet(): Promise<void> {
    if (!isEnabled()) {
      statusBarItem.text = '$(zap) Latency: Off';
      statusBarItem.tooltip = 'Enable sponsored wait screens to start Latency';
      return;
    }

    statusBarItem.text = '$(sync~spin) Latency';
    try {
      const identity = await installationIdentity();
      const balancePaise = await fetchWalletBalance(apiBaseUrl(), identity.token);
      statusBarItem.text = `$(zap) Latency: ₹${(balancePaise / 100).toFixed(2)}`;
      statusBarItem.tooltip = 'Latency earnings. Click to refresh.';
    } catch (error) {
      console.error('Latency wallet refresh failed', error);
      statusBarItem.text = '$(warning) Latency';
      statusBarItem.tooltip = 'Latency API is unavailable. Click to retry.';
    }
  }

  const waitStartDisposable = claudeAdapter.onWaitStart(async (panel) => {
    if (!isEnabled()) {
      return;
    }

    try {
      const identity = await installationIdentity();
      const ad = await fetchAd(apiBaseUrl(), identity.token);
      if (!ad) {
        return;
      }

      const impressionId = randomUUID();
      let impressionPromise: Promise<void> | undefined;
      const ensureImpression = () => {
        impressionPromise ??= reportImpression(
          apiBaseUrl(),
          identity.token,
          impressionId,
          ad.id,
          3_000,
        );
        return impressionPromise;
      };

      injectOverlay(
        panel,
        ad,
        () => {
          void ensureImpression()
            .then(refreshWallet)
            .catch((error) => console.error('Latency impression failed', error));
        },
        () => {
          void ensureImpression()
            .then(() => reportClick(apiBaseUrl(), identity.token, impressionId))
            .then(refreshWallet)
            .catch((error) => console.error('Latency click failed', error));
        },
      );
    } catch (error) {
      console.error('Latency ad request failed', error);
    }
  });

  const enableCommand = vscode.commands.registerCommand(
    'latency.enable',
    async () => {
      await configuration().update('enabled', true, vscode.ConfigurationTarget.Global);
      await refreshWallet();
      void vscode.window.showInformationMessage(
        'Latency sponsored wait screens are enabled. You can disable them in Settings.',
      );
    },
  );
  const refreshCommand = vscode.commands.registerCommand(
    'latency.refreshWallet',
    refreshWallet,
  );
  const dashboardCommand = vscode.commands.registerCommand(
    'latency.openDashboard',
    async () => {
      const value = configuration().get<string>('dashboardUrl', '');
      if (!value || !URL.canParse(value)) {
        void vscode.window.showInformationMessage(
          'Set latency.dashboardUrl before opening the dashboard.',
        );
        return;
      }
      await vscode.env.openExternal(vscode.Uri.parse(value));
    },
  );
  const configurationDisposable = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration(CONFIGURATION_SECTION)) {
        identityPromise = undefined;
        void refreshWallet();
      }
    },
  );
  const walletTimer = setInterval(() => void refreshWallet(), 5 * 60 * 1000);

  context.subscriptions.push(
    waitStartDisposable,
    enableCommand,
    refreshCommand,
    dashboardCommand,
    configurationDisposable,
    statusBarItem,
    { dispose: () => clearInterval(walletTimer) },
  );

  void refreshWallet();
}

export function deactivate(): void {}
