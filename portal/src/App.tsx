import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { Ad, createAd, getDashboard } from './api';
import { supabase } from './supabase';

type Notice = { kind: 'success' | 'error'; message: string } | null;
type AuthMode = 'sign-in' | 'sign-up' | 'reset';

function formatInr(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(paise / 100);
}

function AuthPanel({ recovery }: { recovery: boolean }) {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      if (recovery) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setNotice({ kind: 'success', message: 'Password updated successfully.' });
        return;
      }

      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setNotice({ kind: 'success', message: 'Check your email for a reset link.' });
      } else if (mode === 'sign-up') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setNotice({
          kind: 'success',
          message: 'Account created. Check your email if confirmation is enabled.',
        });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Authentication failed.',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-main">
      <section className="auth-card">
        <a className="brand" href="/">Latency</a>
        <p className="auth-eyebrow">Advertiser portal</p>
        <h1>
          {recovery
            ? 'Choose a new password'
            : mode === 'sign-up'
              ? 'Create your account'
              : mode === 'reset'
                ? 'Reset your password'
                : 'Welcome back'}
        </h1>
        <p className="auth-description">
          {recovery
            ? 'Use at least eight characters.'
            : 'Manage campaigns and review verified engagement.'}
        </p>

        {notice && <div className={`notice ${notice.kind}`}>{notice.message}</div>}

        <form onSubmit={submit}>
          {!recovery && (
            <>
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </>
          )}
          {mode !== 'reset' && (
            <>
              <label htmlFor="auth-password">
                {recovery ? 'New password' : 'Password'}
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={recovery ? 'new-password' : 'current-password'}
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </>
          )}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading
              ? 'Please wait…'
              : recovery
                ? 'Update password'
                : mode === 'sign-up'
                  ? 'Create account'
                  : mode === 'reset'
                    ? 'Send reset link'
                    : 'Sign in'}
          </button>
        </form>

        {!recovery && (
          <div className="auth-links">
            <button type="button" onClick={() => setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')}>
              {mode === 'sign-up' ? 'Already have an account?' : 'Create an account'}
            </button>
            <button type="button" onClick={() => setMode(mode === 'reset' ? 'sign-in' : 'reset')}>
              {mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

function Dashboard({ session }: { session: Session }) {
  const [walletPaise, setWalletPaise] = useState(0);
  const [ads, setAds] = useState<Ad[]>([]);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [cpmInr, setCpmInr] = useState(50);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const dashboard = await getDashboard(session.access_token);
      setWalletPaise(dashboard.advertiser.walletPaise);
      setAds(dashboard.ads);
      setNotice(null);
    } catch {
      setNotice({ kind: 'error', message: 'Could not load advertiser data.' });
    } finally {
      setLoading(false);
    }
  }, [session.access_token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleCreateAd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setNotice(null);
    try {
      const ad = await createAd(session.access_token, { text, url, cpmInr });
      setAds((current) => [ad, ...current]);
      setText('');
      setUrl('');
      setNotice({ kind: 'success', message: 'Ad created successfully.' });
    } catch {
      setNotice({ kind: 'error', message: 'Failed to create the ad.' });
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <a className="brand" href="/" aria-label="Latency home">Latency</a>
          <span className="portal-label">Advertiser portal</span>
        </div>
        <div className="account-control">
          <span>{session.user.email}</span>
          <button type="button" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>

      <main>
        {notice && (
          <div className={`notice ${notice.kind}`} role="status">
            <span>{notice.message}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
          </div>
        )}

        <section className="workspace">
          <aside className="wallet-panel">
            <div>
              <p className="section-label">Wallet balance</p>
              <p className="wallet-value">{loading ? 'Loading…' : formatInr(walletPaise)}</p>
            </div>
            <div className="staging-note">
              <strong>Billing disabled in staging</strong>
              <p>Payment funding will be added only after a provider and reconciliation flow are approved.</p>
            </div>
          </aside>

          <section className="form-panel">
            <h1>Create an ad</h1>
            <form onSubmit={handleCreateAd}>
              <label htmlFor="ad-text"><span>Ad text</span><span className="character-count">{text.length} / 100</span></label>
              <textarea id="ad-text" maxLength={100} required placeholder="Write a concise message for developers" value={text} onChange={(event) => setText(event.target.value)} />
              <label htmlFor="ad-url">Destination URL</label>
              <input id="ad-url" type="url" required placeholder="https://example.com" value={url} onChange={(event) => setUrl(event.target.value)} />
              <label htmlFor="cpm-bid">CPM bid</label>
              <div className="currency-field"><span>₹</span><input id="cpm-bid" type="number" min="10" max="100000" step="1" required value={cpmInr} onChange={(event) => setCpmInr(Number(event.target.value))} /></div>
              <p className="field-help">Your bid per 1,000 verified impressions</p>
              <div className="form-actions"><button className="primary-button" type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create ad'}</button></div>
            </form>
          </section>
        </section>

        <section className="ads-section">
          <div className="table-heading"><h2>My ads</h2><span>{ads.length} campaigns</span></div>
          <div className="table-scroll"><table><thead><tr><th>Ad</th><th>URL</th><th>CPM</th><th>Status</th><th className="numeric">Impressions</th><th className="numeric">Clicks</th></tr></thead><tbody>
            {!loading && ads.length === 0 ? <tr><td className="empty-state" colSpan={6}>No ads yet. Create your first campaign above.</td></tr> : ads.map((ad) => <tr key={ad.id}><td className="ad-copy">{ad.text}</td><td><a href={ad.url} target="_blank" rel="noreferrer">{ad.url}</a></td><td>{formatInr(ad.cpmInr * 100)}</td><td><span className={`ad-status ${ad.active ? 'live' : ''}`}><span />{ad.active ? 'Active' : 'Paused'}</span></td><td className="numeric">{ad.impressions.toLocaleString('en-IN')}</td><td className="numeric">{ad.clicks.toLocaleString('en-IN')}</td></tr>)}
          </tbody></table></div>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setRecovering(event === 'PASSWORD_RECOVERY');
      setAuthReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!authReady) {
    return <main className="auth-main"><p>Loading Latency…</p></main>;
  }
  if (!session || recovering) {
    return <AuthPanel recovery={recovering} />;
  }
  return <Dashboard session={session} />;
}
