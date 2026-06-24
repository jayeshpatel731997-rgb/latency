import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import {
  AdvertiserUser,
  createInstallationCredentials,
  hashInstallationToken,
} from './auth';
import { AppConfig } from './config';
import { Database } from './db';
import { Logger } from './logger';

type AppDependencies = {
  database: Database;
  logger: Logger;
  verifyAccessToken(accessToken: string): Promise<AdvertiserUser | null>;
};

type AuthenticatedRequest = Request & {
  advertiserUser?: AdvertiserUser;
  installationId?: string;
};

function bearerToken(req: Request): string | null {
  const authorization = req.header('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }
  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function createApp(config: AppConfig, dependencies: AppDependencies) {
  const { database, logger, verifyAccessToken } = dependencies;
  const app = express();

  if (config.appEnvironment !== 'development' && config.appEnvironment !== 'test') {
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('origin_not_allowed'));
    },
  }));
  app.use(express.json({ limit: '16kb' }));
  app.use((req, res, next) => {
    const requestId = req.header('x-request-id')?.slice(0, 128) || randomUUID();
    res.setHeader('x-request-id', requestId);
    const startedAt = Date.now();
    res.on('finish', () => {
      logger.info('http_request', {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    });
    next();
  });

  const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const extensionLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  const advertiserLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });

  async function requireInstallation(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'installation_auth_required' });
      return;
    }

    try {
      const installationId = await database.findInstallationId(
        hashInstallationToken(token),
      );
      if (!installationId) {
        res.status(401).json({ error: 'invalid_installation_token' });
        return;
      }
      req.installationId = installationId;
      next();
    } catch (error) {
      next(error);
    }
  }

  async function requireAdvertiser(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({ error: 'authentication_required' });
      return;
    }

    try {
      const user = await verifyAccessToken(token);
      if (!user) {
        res.status(401).json({ error: 'invalid_access_token' });
        return;
      }
      req.advertiserUser = user;
      next();
    } catch (error) {
      next(error);
    }
  }

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok', timestamp: Date.now() });
  });

  app.get('/api/ready', async (_req, res) => {
    try {
      await database.ready();
      res.status(200).json({ status: 'ready' });
    } catch (error) {
      logger.error('readiness_failed', { error: String(error) });
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.post('/api/installations', registrationLimiter, async (_req, res, next) => {
    try {
      const credentials = createInstallationCredentials();
      await database.createInstallation(
        credentials.installationId,
        credentials.tokenHash,
      );
      res.status(201).json({
        installationId: credentials.installationId,
        token: credentials.token,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/advertiser', advertiserLimiter, requireAdvertiser);
  app.get('/api/advertiser/dashboard', async (req: AuthenticatedRequest, res, next) => {
    try {
      const dashboard = await database.getAdvertiserDashboard(
        req.advertiserUser!,
      );
      res.status(200).json(dashboard);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/advertiser/ads', async (req: AuthenticatedRequest, res, next) => {
    const { text, url, cpmInr } = req.body ?? {};
    if (
      typeof text !== 'string' ||
      text.trim().length === 0 ||
      text.length > 100 ||
      typeof url !== 'string' ||
      !URL.canParse(url) ||
      !['http:', 'https:'].includes(new URL(url).protocol) ||
      !Number.isInteger(cpmInr) ||
      cpmInr < 10 ||
      cpmInr > 100_000
    ) {
      res.status(400).json({ error: 'invalid_ad' });
      return;
    }

    try {
      const ad = await database.createAd(req.advertiserUser!, {
        text: text.trim(),
        url,
        cpmInr,
      });
      res.status(201).json(ad);
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/ad', extensionLimiter, requireInstallation);
  app.get('/api/ad', async (_req, res, next) => {
    try {
      const ad = await database.getWinningAd();
      if (!ad) {
        res.status(404).json({ error: 'no_ads_available' });
        return;
      }
      res.status(200).json(ad);
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/impression', extensionLimiter, requireInstallation);
  app.post('/api/impression', async (req: AuthenticatedRequest, res, next) => {
    const { impressionId, adId, durationMs } = req.body ?? {};
    if (
      typeof impressionId !== 'string' ||
      !isUuid(impressionId) ||
      typeof adId !== 'string' ||
      !isUuid(adId) ||
      !Number.isInteger(durationMs) ||
      durationMs < 3_000 ||
      durationMs > 60_000
    ) {
      res.status(400).json({ error: 'invalid_impression' });
      return;
    }

    try {
      await database.logImpression({
        id: impressionId,
        adId,
        installationId: req.installationId!,
        durationMs,
      });
      res.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/click', extensionLimiter, requireInstallation);
  app.post('/api/click', async (req: AuthenticatedRequest, res, next) => {
    const { impressionId } = req.body ?? {};
    if (typeof impressionId !== 'string' || !isUuid(impressionId)) {
      res.status(400).json({ error: 'invalid_click' });
      return;
    }

    try {
      await database.logClick(impressionId, req.installationId!);
      res.status(200).json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/wallet', extensionLimiter, requireInstallation);
  app.get('/api/wallet', async (req: AuthenticatedRequest, res, next) => {
    try {
      const balancePaise = await database.getUserBalance(req.installationId!);
      res.status(200).json({ balancePaise });
    } catch (error) {
      next(error);
    }
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof Error && error.message === 'origin_not_allowed') {
      res.status(403).json({ error: 'origin_not_allowed' });
      return;
    }
    logger.error('request_failed', { error: String(error) });
    res.status(500).json({ error: 'internal' });
  });

  return app;
}
