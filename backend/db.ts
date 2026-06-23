import { createClient } from '@supabase/supabase-js';

import { AdvertiserUser } from './auth';
import { AppConfig } from './config';

export type WinningAd = {
  id: string;
  text: string;
  url: string;
  advertiserId: string;
  cpmInr: number;
};

export type AdvertiserAd = {
  id: string;
  text: string;
  url: string;
  cpmInr: number;
  active: boolean;
  impressions: number;
  clicks: number;
};

export type AdvertiserDashboard = {
  advertiser: { email: string; walletPaise: number };
  ads: AdvertiserAd[];
};

type AdRow = {
  id: string;
  text: string;
  url: string;
  advertiser_id: string;
  cpm_inr: number;
  advertisers:
    | { wallet_paise: number }
    | Array<{ wallet_paise: number }>
    | null;
};

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(config: AppConfig) {
  const supabase = createClient(
    config.supabaseUrl,
    config.supabaseSecretKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  async function ready(): Promise<void> {
    const { error } = await supabase
      .from('ads')
      .select('id', { count: 'exact', head: true });
    if (error) {
      throw error;
    }
  }

  async function createInstallation(
    installationId: string,
    tokenHash: string,
  ): Promise<void> {
    const { error } = await supabase.from('installations').insert({
      id: installationId,
      token_hash: tokenHash,
    });
    if (error) {
      throw error;
    }
  }

  async function findInstallationId(tokenHash: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('installations')
      .select('id')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    if (error) {
      throw error;
    }

    if (data) {
      void supabase
        .from('installations')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', data.id);
    }

    return data?.id ?? null;
  }

  async function getWinningAd(): Promise<WinningAd | null> {
    const { data, error } = await supabase
      .from('ads')
      .select(
        'id, text, url, advertiser_id, cpm_inr, advertisers!inner(wallet_paise)',
      )
      .eq('active', true)
      .gt('advertisers.wallet_paise', 0)
      .order('cpm_inr', { ascending: false });
    if (error) {
      throw error;
    }

    const winningAd = (data as AdRow[] | null)?.find((ad) => {
      const advertiser = Array.isArray(ad.advertisers)
        ? ad.advertisers[0]
        : ad.advertisers;
      const impressionCostPaise = Math.round((ad.cpm_inr * 100) / 1000);
      return advertiser !== null && advertiser.wallet_paise >= impressionCostPaise;
    });

    return winningAd
      ? {
          id: winningAd.id,
          text: winningAd.text,
          url: winningAd.url,
          advertiserId: winningAd.advertiser_id,
          cpmInr: winningAd.cpm_inr,
        }
      : null;
  }

  async function logImpression(data: {
    id: string;
    adId: string;
    installationId: string;
    durationMs: number;
  }): Promise<void> {
    const { error } = await supabase.rpc('record_ad_impression', {
      p_impression_id: data.id,
      p_ad_id: data.adId,
      p_user_id: data.installationId,
      p_duration_ms: data.durationMs,
    });
    if (error) {
      throw error;
    }
  }

  async function logClick(
    impressionId: string,
    installationId: string,
  ): Promise<void> {
    const { data, error } = await supabase
      .from('impressions')
      .update({ clicked: true })
      .eq('id', impressionId)
      .eq('user_id', installationId)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      throw error ?? new Error(`Impression ${impressionId} was not found`);
    }
  }

  async function getUserBalance(installationId: string): Promise<number> {
    const { data, error } = await supabase
      .from('users')
      .select('balance_paise')
      .eq('id', installationId)
      .maybeSingle();
    if (error) {
      throw error;
    }
    return data?.balance_paise ?? 0;
  }

  async function getOrCreateAdvertiser(user: AdvertiserUser) {
    const { error: legacyError } = await supabase
      .from('advertisers')
      .update({ user_id: user.id })
      .eq('email', user.email)
      .is('user_id', null);
    if (legacyError) {
      throw legacyError;
    }

    const { data: existing, error: existingError } = await supabase
      .from('advertisers')
      .select('id, email, wallet_paise')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existingError) {
      throw existingError;
    }
    if (existing) {
      return existing;
    }

    const { data, error } = await supabase
      .from('advertisers')
      .insert({
        user_id: user.id,
        email: user.email,
        wallet_paise: config.stagingInitialWalletPaise,
      })
      .select('id, email, wallet_paise')
      .single();
    if (error || !data) {
      throw error ?? new Error('Unable to load advertiser');
    }
    return data;
  }

  async function getAdvertiserDashboard(
    user: AdvertiserUser,
  ): Promise<AdvertiserDashboard> {
    const advertiser = await getOrCreateAdvertiser(user);
    const { data: ads, error } = await supabase
      .from('ads')
      .select('id, text, url, cpm_inr, active, impressions(id, clicked)')
      .eq('advertiser_id', advertiser.id)
      .order('created_at', { ascending: false });
    if (error) {
      throw error;
    }

    return {
      advertiser: {
        email: advertiser.email,
        walletPaise: advertiser.wallet_paise,
      },
      ads: (ads ?? []).map((ad) => {
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
      }),
    };
  }

  async function createAd(
    user: AdvertiserUser,
    input: { text: string; url: string; cpmInr: number },
  ): Promise<AdvertiserAd> {
    const advertiser = await getOrCreateAdvertiser(user);
    const { data, error } = await supabase
      .from('ads')
      .insert({
        advertiser_id: advertiser.id,
        text: input.text,
        url: input.url,
        cpm_inr: input.cpmInr,
      })
      .select('id, text, url, cpm_inr, active')
      .single();
    if (error || !data) {
      throw error ?? new Error('Unable to create ad');
    }
    return {
      id: data.id,
      text: data.text,
      url: data.url,
      cpmInr: data.cpm_inr,
      active: data.active,
      impressions: 0,
      clicks: 0,
    };
  }

  return {
    ready,
    createInstallation,
    findInstallationId,
    getWinningAd,
    logImpression,
    logClick,
    getUserBalance,
    getAdvertiserDashboard,
    createAd,
  };
}
