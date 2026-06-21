import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required');
}

if (!supabaseServiceRoleKey) {
  console.warn(
    'SUPABASE_SERVICE_ROLE_KEY is not set; RLS-protected backend writes will fail',
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey ?? supabaseAnonKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

export type WinningAd = {
  id: string;
  text: string;
  url: string;
  advertiserId: string;
  cpmInr: number;
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

export async function getWinningAd(): Promise<WinningAd | null> {
  try {
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

      return (
        advertiser !== null &&
        advertiser.wallet_paise > 0 &&
        advertiser.wallet_paise >= impressionCostPaise
      );
    });

    if (!winningAd) {
      return null;
    }

    return {
      id: winningAd.id,
      text: winningAd.text,
      url: winningAd.url,
      advertiserId: winningAd.advertiser_id,
      cpmInr: winningAd.cpm_inr,
    };
  } catch (error) {
    console.error('Failed to get winning ad:', error);
    return null;
  }
}

export async function logImpression(data: {
  id: string;
  adId: string;
  userId: string;
  durationMs: number;
}): Promise<void> {
  try {
    const { error } = await supabase.rpc('record_ad_impression', {
      p_impression_id: data.id,
      p_ad_id: data.adId,
      p_user_id: data.userId,
      p_duration_ms: data.durationMs,
    });

    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Failed to log impression:', error);
    throw error;
  }
}

export async function logClick(
  impressionId: string,
  userId: string,
): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('impressions')
      .update({ clicked: true })
      .eq('id', impressionId)
      .eq('user_id', userId)
      .select('id')
      .maybeSingle();

    if (error || !data) {
      throw error ?? new Error(`Impression ${impressionId} was not found`);
    }
  } catch (error) {
    console.error('Failed to log click:', error);
    throw error;
  }
}

export async function getUserBalance(userId: string): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('balance_paise')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data?.balance_paise ?? 0;
  } catch (error) {
    console.error('Failed to get user balance:', error);
    return 0;
  }
}
