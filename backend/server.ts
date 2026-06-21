import 'dotenv/config';

import { createHmac, timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import Razorpay from 'razorpay';

import {
  getUserBalance,
  getWinningAd,
  logClick,
  logImpression,
  supabase,
} from './db';

const app = express();
const port = Number(process.env.PORT) || 3001;
const advertiserEmail =
  process.env.ADVERTISER_EMAIL ?? 'advertiser@example.com';
const advertiserPassword = process.env.ADVERTISER_PASSWORD;
const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const razorpay =
  razorpayKeyId && razorpayKeySecret
    ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
    : null;

app.use(cors());
app.use(express.json());

function requireAdvertiserPassword(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    !advertiserPassword ||
    req.header('x-advertiser-password') !== advertiserPassword
  ) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  next();
}

app.use('/api/advertiser', requireAdvertiserPassword);

app.get('/api/advertiser/dashboard', async (_req: Request, res: Response) => {
  try {
    const { data: advertiser, error: advertiserError } = await supabase
      .from('advertisers')
      .upsert(
        { email: advertiserEmail },
        { onConflict: 'email' },
      )
      .select('id, email, wallet_paise')
      .single();

    if (advertiserError || !advertiser) {
      throw advertiserError ?? new Error('Unable to load advertiser');
    }

    const { data: ads, error: adsError } = await supabase
      .from('ads')
      .select('id, text, url, cpm_inr, active, impressions(id, clicked)')
      .eq('advertiser_id', advertiser.id)
      .order('created_at', { ascending: false });

    if (adsError) {
      throw adsError;
    }

    const adRows = (ads ?? []).map((ad) => {
      const impressions = Array.isArray(ad.impressions) ? ad.impressions : [];

      return {
        id: ad.id,
        text: ad.text,
        url: ad.url,
        cpmInr: ad.cpm_inr,
        active: ad.active,
        impressions: impressions.length,
        clicks: impressions.filter((impression) => impression.clicked).length,
      };
    });

    res.status(200).json({
      advertiser: {
        email: advertiser.email,
        walletPaise: advertiser.wallet_paise,
      },
      ads: adRows,
    });
  } catch (error) {
    console.error('GET /api/advertiser/dashboard failed:', error);
    res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/advertiser/ads', async (req: Request, res: Response) => {
  try {
    const { text, url, cpmInr } = req.body;

    if (
      typeof text !== 'string' ||
      text.length === 0 ||
      text.length > 100 ||
      typeof url !== 'string' ||
      !URL.canParse(url) ||
      !Number.isInteger(cpmInr) ||
      cpmInr <= 0
    ) {
      res.status(400).json({ error: 'invalid_ad' });
      return;
    }

    const { data: advertiser, error: advertiserError } = await supabase
      .from('advertisers')
      .upsert(
        { email: advertiserEmail },
        { onConflict: 'email' },
      )
      .select('id')
      .single();

    if (advertiserError || !advertiser) {
      throw advertiserError ?? new Error('Unable to load advertiser');
    }

    const { data: ad, error: adError } = await supabase
      .from('ads')
      .insert({
        advertiser_id: advertiser.id,
        text,
        url,
        cpm_inr: cpmInr,
      })
      .select('id, text, url, cpm_inr, active')
      .single();

    if (adError || !ad) {
      throw adError ?? new Error('Unable to create ad');
    }

    res.status(201).json({
      id: ad.id,
      text: ad.text,
      url: ad.url,
      cpmInr: ad.cpm_inr,
      active: ad.active,
      impressions: 0,
      clicks: 0,
    });
  } catch (error) {
    console.error('POST /api/advertiser/ads failed:', error);
    res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/advertiser/fund/order', async (req: Request, res: Response) => {
  try {
    const amountInr = Number(req.body.amountInr);

    if (!Number.isFinite(amountInr) || amountInr < 500) {
      res.status(400).json({ error: 'minimum_amount_500' });
      return;
    }

    if (!razorpay || !razorpayKeyId) {
      res.status(503).json({ error: 'razorpay_not_configured' });
      return;
    }

    const amountPaise = Math.round(amountInr * 100);
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `latency_${Date.now()}`,
      notes: { advertiserEmail },
    });

    res.status(200).json({
      keyId: razorpayKeyId,
      orderId: order.id,
      amountPaise,
      currency: order.currency,
    });
  } catch (error) {
    console.error('POST /api/advertiser/fund/order failed:', error);
    res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/advertiser/fund/verify', async (req: Request, res: Response) => {
  try {
    const {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = req.body;

    if (
      !razorpay ||
      !razorpayKeySecret ||
      typeof razorpayOrderId !== 'string' ||
      typeof razorpayPaymentId !== 'string' ||
      typeof razorpaySignature !== 'string'
    ) {
      res.status(400).json({ error: 'invalid_payment' });
      return;
    }

    const expectedSignature = createHmac('sha256', razorpayKeySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');
    const supplied = Buffer.from(razorpaySignature, 'utf8');
    const expected = Buffer.from(expectedSignature, 'utf8');

    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      res.status(400).json({ error: 'invalid_signature' });
      return;
    }

    const [order, payment] = await Promise.all([
      razorpay.orders.fetch(razorpayOrderId),
      razorpay.payments.fetch(razorpayPaymentId),
    ]);
    const orderAmountPaise = Number(order.amount);
    const paymentAmountPaise = Number(payment.amount);

    if (
      payment.order_id !== razorpayOrderId ||
      payment.status !== 'captured' ||
      !Number.isInteger(orderAmountPaise) ||
      orderAmountPaise < 50000 ||
      paymentAmountPaise !== orderAmountPaise
    ) {
      res.status(400).json({ error: 'invalid_payment' });
      return;
    }

    const { data: walletPaise, error } = await supabase.rpc(
      'credit_advertiser_wallet',
      {
        p_email: advertiserEmail,
        p_amount_paise: orderAmountPaise,
        p_razorpay_order_id: razorpayOrderId,
        p_razorpay_payment_id: razorpayPaymentId,
      },
    );

    if (error) {
      throw error;
    }

    res.status(200).json({ ok: true, walletPaise });
  } catch (error) {
    console.error('POST /api/advertiser/fund/verify failed:', error);
    res.status(500).json({ error: 'internal' });
  }
});

app.get('/api/ad', async (_req: Request, res: Response) => {
  try {
    const ad = await getWinningAd();

    if (!ad) {
      res.status(404).json({ error: 'no_ads_available' });
      return;
    }

    res.status(200).json(ad);
  } catch (error) {
    console.error('GET /api/ad failed:', error);
    res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/impression', async (req: Request, res: Response) => {
  console.log('POST /api/impression body:', req.body);

  try {
    const { impressionId, adId, userId, durationMs } = req.body;

    if (
      typeof impressionId !== 'string' ||
      impressionId.length === 0 ||
      typeof adId !== 'string' ||
      adId.length === 0 ||
      typeof userId !== 'string' ||
      userId.length === 0 ||
      !Number.isInteger(durationMs) ||
      durationMs < 0
    ) {
      res.status(400).json({ error: 'invalid_impression' });
      return;
    }

    await logImpression({
      id: impressionId,
      adId,
      userId,
      durationMs,
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('POST /api/impression error:', error);
    res.status(500).json({ error: 'internal' });
  }
});

app.post('/api/click', async (req: Request, res: Response) => {
  try {
    const { impressionId, userId } = req.body;

    if (!impressionId || !userId) {
      res.status(400).json({ error: 'missing_fields' });
      return;
    }

    await logClick(impressionId, userId);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('POST /api/click failed:', error);
    res.status(500).json({ error: 'internal' });
  }
});

app.get('/api/wallet/:userId', async (req: Request, res: Response) => {
  try {
    const userIdParam = req.params.userId;
    const userId = Array.isArray(userIdParam) ? userIdParam[0] : userIdParam;
    const balancePaise = await getUserBalance(userId);

    res.status(200).json({
      userId,
      balancePaise,
      balanceFormatted: `₹${(balancePaise / 100).toFixed(2)}`,
    });
  } catch (error) {
    console.error('GET /api/wallet/:userId failed:', error);
    res.status(500).json({ error: 'internal' });
  }
});

app.get('/api/health', (_req: Request, res: Response) => {
  try {
    res.status(200).json({ status: 'ok', timestamp: Date.now() });
  } catch (error) {
    console.error('GET /api/health failed:', error);
    res.status(500).json({ error: 'internal' });
  }
});

app.listen(port, () => {
  console.log(`Latency backend running on port ${port}`);
});
