import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  Ad,
  createAd,
  createFundingOrder,
  getDashboard,
  verifyFunding,
} from './api';

type Notice = { kind: 'success' | 'error'; message: string } | null;

const DEFAULT_PASSWORD = import.meta.env.VITE_ADVERTISER_PASSWORD ?? '';

function formatInr(paise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(paise / 100);
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('razorpay_load_failed'));
    document.body.appendChild(script);
  });
}

export default function App() {
  const [password, setPassword] = useState(
    sessionStorage.getItem('latency-password') ?? DEFAULT_PASSWORD,
  );
  const [walletPaise, setWalletPaise] = useState(0);
  const [ads, setAds] = useState<Ad[]>([]);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [cpmInr, setCpmInr] = useState(50);
  const [fundAmount, setFundAmount] = useState(500);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [funding, setFunding] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const refresh = useCallback(async () => {
    if (!password) {
      setLoading(false);
      setNotice({ kind: 'error', message: 'Set the shared password to continue.' });
      return;
    }

    setLoading(true);
    try {
      const dashboard = await getDashboard(password);
      setWalletPaise(dashboard.advertiser.walletPaise);
      setAds(dashboard.ads);
      setNotice(null);
    } catch (error) {
      setNotice({
        kind: 'error',
        message:
          error instanceof Error && error.message === 'unauthorized'
            ? 'The shared password is incorrect.'
            : 'Could not load advertiser data.',
      });
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function changePassword() {
    const nextPassword = window.prompt('Shared advertiser password', password);
    if (nextPassword === null) {
      return;
    }

    sessionStorage.setItem('latency-password', nextPassword);
    setPassword(nextPassword);
  }

  async function handleCreateAd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setNotice(null);

    try {
      const ad = await createAd(password, { text, url, cpmInr });
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

  async function handleFundWallet() {
    if (fundAmount < 500) {
      setNotice({ kind: 'error', message: 'Minimum funding amount is ₹500.' });
      return;
    }

    setFunding(true);
    setNotice(null);

    try {
      await loadRazorpay();
      const order = await createFundingOrder(password, fundAmount);

      if (!window.Razorpay) {
        throw new Error('razorpay_unavailable');
      }

      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'Latency',
        description: 'Advertiser wallet funding',
        order_id: order.orderId,
        handler: async (payment) => {
          try {
            const result = await verifyFunding(
              password,
              payment,
            );
            setWalletPaise(result.walletPaise);
            setNotice({ kind: 'success', message: 'Wallet funded successfully.' });
          } catch {
            setNotice({
              kind: 'error',
              message: 'Payment verification failed.',
            });
          } finally {
            setFunding(false);
          }
        },
        modal: {
          ondismiss: () => setFunding(false),
        },
        theme: {
          color: '#155eef',
        },
      });

      checkout.open();
    } catch {
      setFunding(false);
      setNotice({
        kind: 'error',
        message: 'Could not start Razorpay checkout.',
      });
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-group">
          <a className="brand" href="/" aria-label="Latency home">
            Latency
          </a>
          <span className="portal-label">Advertiser portal</span>
        </div>
        <button className="password-control" type="button" onClick={changePassword}>
          <span className={password ? 'status-dot active' : 'status-dot'} />
          <span>{password ? 'Shared password active' : 'Set shared password'}</span>
          <strong>Change</strong>
        </button>
      </header>

      <main>
        {notice && (
          <div className={`notice ${notice.kind}`} role="status">
            <span>{notice.message}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        <section className="workspace">
          <aside className="wallet-panel">
            <div>
              <p className="section-label">Wallet balance</p>
              <p className="wallet-value">
                {loading ? 'Loading…' : formatInr(walletPaise)}
              </p>
            </div>

            <div className="fund-controls">
              <label htmlFor="fund-amount">Funding amount</label>
              <div className="currency-field">
                <span>₹</span>
                <input
                  id="fund-amount"
                  type="number"
                  min="500"
                  step="100"
                  value={fundAmount}
                  onChange={(event) => setFundAmount(Number(event.target.value))}
                />
              </div>
              <button
                className="primary-button"
                type="button"
                onClick={handleFundWallet}
                disabled={funding || !password}
              >
                {funding ? 'Opening checkout…' : 'Fund wallet'}
              </button>
              <p className="field-help">Minimum ₹500 · Secure checkout by Razorpay</p>
            </div>
          </aside>

          <section className="form-panel">
            <h1>Create an ad</h1>
            <form onSubmit={handleCreateAd}>
              <label htmlFor="ad-text">
                <span>Ad text</span>
                <span className="character-count">{text.length} / 100</span>
              </label>
              <textarea
                id="ad-text"
                maxLength={100}
                required
                placeholder="Write a concise message for developers"
                value={text}
                onChange={(event) => setText(event.target.value)}
              />

              <label htmlFor="ad-url">Destination URL</label>
              <input
                id="ad-url"
                type="url"
                required
                placeholder="https://example.com"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />

              <label htmlFor="cpm-bid">CPM bid</label>
              <div className="currency-field">
                <span>₹</span>
                <input
                  id="cpm-bid"
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={cpmInr}
                  onChange={(event) => setCpmInr(Number(event.target.value))}
                />
              </div>
              <p className="field-help">Your bid per 1,000 impressions</p>

              <div className="form-actions">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={creating || !password}
                >
                  {creating ? 'Creating…' : 'Create ad'}
                </button>
              </div>
            </form>
          </section>
        </section>

        <section className="ads-section">
          <div className="table-heading">
            <h2>My ads</h2>
            <span>{ads.length} campaigns</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>URL</th>
                  <th>CPM</th>
                  <th>Status</th>
                  <th className="numeric">Impressions</th>
                  <th className="numeric">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {!loading && ads.length === 0 ? (
                  <tr>
                    <td className="empty-state" colSpan={6}>
                      No ads yet. Create your first campaign above.
                    </td>
                  </tr>
                ) : (
                  ads.map((ad) => (
                    <tr key={ad.id}>
                      <td className="ad-copy">{ad.text}</td>
                      <td>
                        <a href={ad.url} target="_blank" rel="noreferrer">
                          {ad.url}
                        </a>
                      </td>
                      <td>{formatInr(ad.cpmInr * 100)}</td>
                      <td>
                        <span className={`ad-status ${ad.active ? 'live' : ''}`}>
                          <span />
                          {ad.active ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td className="numeric">
                        {ad.impressions.toLocaleString('en-IN')}
                      </td>
                      <td className="numeric">
                        {ad.clicks.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
