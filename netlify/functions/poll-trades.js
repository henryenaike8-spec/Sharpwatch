const { getStore } = require('@netlify/blobs');

const DATA_API = 'https://data-api.polymarket.com';
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.json();
}

function fmtNum(n) {
  if (n === undefined || n === null) return '0';
  const v = Math.abs(n);
  const s = v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'K' : v.toFixed(0);
  return (n < 0 ? '-' : '') + s;
}

async function sendTelegram(text) {
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — skipping send.');
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error('Telegram send failed:', res.status, body);
  }
}

exports.handler = async () => {
  const store = getStore({
    name: 'sharpwatch',
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_TOKEN,
  });

  let tracked = [];
  try {
    tracked = (await store.get('tracked', { type: 'json' })) || [];
  } catch (e) {
    console.log('No tracked wallets stored yet.');
    return { statusCode: 200, body: 'no wallets tracked' };
  }

  if (tracked.length === 0) {
    return { statusCode: 200, body: 'no wallets tracked' };
  }

  let changed = false;

  await Promise.all(tracked.map(async (t) => {
    try {
      const activity = await fetchJson(
        `${DATA_API}/activity?user=${t.wallet}&type=TRADE&limit=10&sortBy=TIMESTAMP&sortDirection=DESC`
      );
      if (!Array.isArray(activity) || activity.length === 0) return;

      const newest = activity[0];

      // First time ever seeing this wallet — set baseline, don't blast historical trades
      if (t.lastSeenTx === null) {
        t.lastSeenTs = newest.timestamp;
        t.lastSeenTx = newest.transactionHash;
        changed = true;
        return;
      }

      const fresh = activity.filter(
        (a) => a.timestamp > t.lastSeenTs && a.transactionHash !== t.lastSeenTx
      );

      if (fresh.length > 0) {
        t.lastSeenTs = newest.timestamp;
        t.lastSeenTx = newest.transactionHash;
        changed = true;

        for (const trade of fresh.reverse()) {
          const sideLabel = trade.side === 'BUY' ? '🟢 BUY' : '🔴 SELL';
          const msg =
            `<b>${escapeHtml(t.name)}</b> just traded\n` +
            `${sideLabel} ${escapeHtml(trade.outcome || '')} @ ${trade.price}\n` +
            `Size: $${fmtNum(trade.usdcSize)}\n` +
            `${escapeHtml(trade.title || '')}\n` +
            `https://polymarket.com/profile/${t.wallet}`;
          await sendTelegram(msg);
        }
      }
    } catch (e) {
      console.warn('Poll failed for', t.wallet, e.message);
    }
  }));

  if (changed) {
    await store.setJSON('tracked', tracked);
  }

  return { statusCode: 200, body: `checked ${tracked.length} wallets` };
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

exports.config = {
  schedule: '* * * * *', // every minute — Netlify's cron minimum granularity
};
