import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from './app';
import type { AppConfig } from './config';
import type { Database } from './db';
import type { Logger } from './logger';

const config: AppConfig = {
  appEnvironment: 'test',
  host: '127.0.0.1',
  port: 3001,
  allowedOrigins: ['https://portal.example.com'],
  supabaseUrl: 'https://project.supabase.co',
  supabasePublishableKey: 'publishable',
  supabaseSecretKey: 'secret',
  stagingInitialWalletPaise: 0,
};

function dependencies() {
  const database = {
    ready: vi.fn().mockResolvedValue(undefined),
    createInstallation: vi.fn().mockResolvedValue(undefined),
    findInstallationId: vi.fn().mockResolvedValue('11111111-1111-4111-8111-111111111111'),
    getWinningAd: vi.fn().mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      text: 'Test ad',
      url: 'https://example.com',
      advertiserId: '33333333-3333-4333-8333-333333333333',
      cpmInr: 50,
    }),
    logImpression: vi.fn().mockResolvedValue(undefined),
    logClick: vi.fn().mockResolvedValue(undefined),
    getUserBalance: vi.fn().mockResolvedValue(25),
    getAdvertiserDashboard: vi.fn().mockResolvedValue({ advertiser: { email: 'owner@example.com', walletPaise: 100 }, ads: [] }),
    createAd: vi.fn().mockResolvedValue({ id: 'ad', text: 'Ad', url: 'https://example.com', cpmInr: 50, active: true, impressions: 0, clicks: 0 }),
  };
  const logger: Logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const verifyAccessToken = vi.fn().mockResolvedValue({
    id: '44444444-4444-4444-8444-444444444444',
    email: 'owner@example.com',
  });
  return { database, logger, verifyAccessToken };
}

describe('Latency API', () => {
  let deps: ReturnType<typeof dependencies>;

  beforeEach(() => {
    deps = dependencies();
  });

  it('exposes liveness and readiness checks', async () => {
    const app = createApp(config, deps as never);
    await request(app).get('/api/health').expect(200);
    await request(app).get('/api/ready').expect(200, { status: 'ready' });
  });

  it('registers an installation without returning its token hash', async () => {
    const response = await request(createApp(config, deps as never))
      .post('/api/installations')
      .expect(201);
    expect(response.body.installationId).toBeTypeOf('string');
    expect(response.body.token).toBeTypeOf('string');
    expect(response.body.tokenHash).toBeUndefined();
    expect(deps.database.createInstallation).toHaveBeenCalledOnce();
  });

  it('requires installation authentication for extension routes', async () => {
    await request(createApp(config, deps as never)).get('/api/ad').expect(401);
  });

  it('derives impression ownership from the installation token', async () => {
    const app = createApp(config, deps as never);
    await request(app)
      .post('/api/impression')
      .set('Authorization', 'Bearer installation-token')
      .send({
        impressionId: '55555555-5555-4555-8555-555555555555',
        adId: '22222222-2222-4222-8222-222222222222',
        durationMs: 3000,
        installationId: 'attacker-controlled',
      })
      .expect(200, { ok: true });
    expect(deps.database.logImpression).toHaveBeenCalledWith(
      expect.objectContaining({
        installationId: '11111111-1111-4111-8111-111111111111',
      }),
    );
  });

  it('serves an ad and records its impression, click, and wallet lookup', async () => {
    const app = createApp(config, deps as never);
    const authorization = { Authorization: 'Bearer installation-token' };
    const impressionId = '55555555-5555-4555-8555-555555555555';

    const adResponse = await request(app)
      .get('/api/ad')
      .set(authorization)
      .expect(200);
    expect(adResponse.body).toEqual(expect.objectContaining({ text: 'Test ad' }));
    await request(app)
      .post('/api/impression')
      .set(authorization)
      .send({
        impressionId,
        adId: '22222222-2222-4222-8222-222222222222',
        durationMs: 3000,
      })
      .expect(200, { ok: true });
    await request(app)
      .post('/api/click')
      .set(authorization)
      .send({ impressionId })
      .expect(200, { ok: true });
    await request(app)
      .get('/api/wallet')
      .set(authorization)
      .expect(200, { balancePaise: 25 });

    expect(deps.database.logClick).toHaveBeenCalledWith(
      impressionId,
      '11111111-1111-4111-8111-111111111111',
    );
    expect(deps.database.getUserBalance).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
    );
  });

  it('requires a verified Supabase session for advertiser routes', async () => {
    deps.verifyAccessToken.mockResolvedValueOnce(null);
    await request(createApp(config, deps as never))
      .get('/api/advertiser/dashboard')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });

  it('rejects unsafe ad URLs and removed billing routes', async () => {
    const app = createApp(config, deps as never);
    await request(app)
      .post('/api/advertiser/ads')
      .set('Authorization', 'Bearer valid')
      .send({ text: 'Bad ad', url: 'javascript:alert(1)', cpmInr: 50 })
      .expect(400);
    await request(app)
      .post('/api/advertiser/fund/order')
      .set('Authorization', 'Bearer valid')
      .expect(404);
  });

  it('blocks browser origins outside the allowlist', async () => {
    await request(createApp(config, deps as never))
      .get('/api/health')
      .set('Origin', 'https://evil.example.com')
      .expect(403, { error: 'origin_not_allowed' });
  });
});
