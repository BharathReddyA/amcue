const crypto = require('crypto');

const AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
const TOKEN_URL = 'https://api.x.com/2/oauth2/token';
const SCOPES = 'tweet.write tweet.read users.read media.write offline.access';

// ponytail: in-memory state store is fine for a single-instance deployment
// with a short-lived OAuth flow - a multi-instance production deployment
// would need a shared store (DB/Redis) instead.
const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generatePkce() {
  const verifier = base64UrlEncode(crypto.randomBytes(32));
  const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function createState(userId, projectId) {
  const state = base64UrlEncode(crypto.randomBytes(16));
  const { verifier, challenge } = generatePkce();
  pendingStates.set(state, { verifier, userId, projectId, createdAt: Date.now() });
  return { state, challenge };
}

function consumeState(state) {
  const entry = pendingStates.get(state);
  if (!entry) return null;
  pendingStates.delete(state);
  if (Date.now() - entry.createdAt > STATE_TTL_MS) return null;
  return entry;
}

// ponytail: short-lived, single-use ticket so the real session JWT never has
// to appear in a URL (browser history, server access logs) for the
// full-page OAuth redirect - same in-memory-Map pattern as pendingStates.
const pendingTickets = new Map();
const TICKET_TTL_MS = 60 * 1000;

function createTicket(userId) {
  const ticket = base64UrlEncode(crypto.randomBytes(16));
  pendingTickets.set(ticket, { userId, createdAt: Date.now() });
  return ticket;
}

function consumeTicket(ticket) {
  const entry = pendingTickets.get(ticket);
  if (!entry) return null;
  pendingTickets.delete(ticket);
  if (Date.now() - entry.createdAt > TICKET_TTL_MS) return null;
  return entry.userId;
}

function buildAuthorizeUrl(state, challenge) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.X_CLIENT_ID,
    redirect_uri: process.env.X_REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForTokens(code, verifier) {
  const basicAuth = Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString(
    'base64'
  );
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: process.env.X_CLIENT_ID,
      redirect_uri: process.env.X_REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) {
    throw new Error(`X token exchange failed with status ${res.status}`);
  }

  return res.json();
}

async function fetchXUsername(accessToken) {
  const res = await fetch('https://api.x.com/2/users/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`X user lookup failed with status ${res.status}`);
  }
  const data = await res.json();
  return data.data?.username || null;
}

module.exports = {
  createState,
  consumeState,
  createTicket,
  consumeTicket,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchXUsername,
};
