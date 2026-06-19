const { getStore } = require('@netlify/blobs');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Use POST' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const wallets = Array.isArray(payload.wallets) ? payload.wallets : null;
  if (!wallets) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Expected { wallets: [{wallet, name}] }' }) };
  }

  const cleaned = wallets
    .filter((w) => w && typeof w.wallet === 'string' && /^0x[a-fA-F0-9]{40}$/.test(w.wallet))
    .map((w) => ({ wallet: w.wallet.toLowerCase(), name: (w.name || w.wallet.slice(0, 8)).toString().slice(0, 60) }));

  const store = getStore('sharpwatch');

  let existing = [];
  try {
    existing = (await store.get('tracked', { type: 'json' })) || [];
  } catch (e) {
    existing = [];
  }
  const existingByWallet = Object.fromEntries(existing.map((w) => [w.wallet, w]));

  const merged = cleaned.map((w) => ({
    wallet: w.wallet,
    name: w.name,
    lastSeenTs: existingByWallet[w.wallet]?.lastSeenTs ?? null,
    lastSeenTx: existingByWallet[w.wallet]?.lastSeenTx ?? null,
  }));

  await store.setJSON('tracked', merged);

  return {
    statusCode: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, tracked: merged.length }),
  };
};
