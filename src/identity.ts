import type { Memento, SecretStorage } from 'vscode';

import { registerInstallation } from './api/adClient';

const INSTALLATION_ID_KEY = 'latency.installationId';
const INSTALLATION_TOKEN_KEY = 'latency.installationToken';
const INSTALLATION_API_KEY = 'latency.installationApiBaseUrl';

export type InstallationIdentity = {
  installationId: string;
  token: string;
};

export async function getOrCreateInstallationIdentity(
  apiBaseUrl: string,
  globalState: Memento,
  secrets: SecretStorage,
  register: typeof registerInstallation = registerInstallation,
): Promise<InstallationIdentity> {
  const installationId = globalState.get<string>(INSTALLATION_ID_KEY);
  const installationApiBaseUrl = globalState.get<string>(INSTALLATION_API_KEY);
  const token = await secrets.get(INSTALLATION_TOKEN_KEY);

  if (installationId && token && installationApiBaseUrl === apiBaseUrl) {
    return { installationId, token };
  }

  const registration = await register(apiBaseUrl);
  await Promise.all([
    globalState.update(INSTALLATION_ID_KEY, registration.installationId),
    globalState.update(INSTALLATION_API_KEY, apiBaseUrl),
    secrets.store(INSTALLATION_TOKEN_KEY, registration.token),
  ]);
  return registration;
}
