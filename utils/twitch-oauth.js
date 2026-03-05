// utils/twitch-oauth.js
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const DATA_DIR = process.env.DATA_DIR || "/app/data";
const FILE = path.join(DATA_DIR, "twitch_oauth.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadTokens() {
  ensureDir();
  if (!fs.existsSync(FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(tokens, null, 2), "utf8");
}

function getAuthUrl(state = "zunami-bot") {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const redirectUri = process.env.TWITCH_REDIRECT_URI;
  if (!clientId || !redirectUri) throw new Error("TWITCH_CLIENT_ID oder TWITCH_REDIRECT_URI fehlt");

  // Minimal für EventSub channel.moderate (Twitch ist hier streng)
  // Wenn Twitch mehr will, erweitern wir.
  const scopes = [
  "moderator:read:blocked_terms",
  "moderator:read:chat_settings",
  "moderator:read:unban_requests",
  "moderator:read:banned_users",
  "moderator:read:chat_messages",
  "moderator:read:warnings",
  "moderator:read:moderators",
  "moderator:read:vips",
];

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
  });

  return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
}

async function exchangeCode(code) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  const redirectUri = process.env.TWITCH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("TWITCH_CLIENT_ID/SECRET oder TWITCH_REDIRECT_URI fehlt");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const r = await axios.post(`https://id.twitch.tv/oauth2/token?${params.toString()}`);
  const now = Math.floor(Date.now() / 1000);

  const tokens = {
    access_token: r.data.access_token,
    refresh_token: r.data.refresh_token,
    expires_in: r.data.expires_in,
    obtained_at: now,
    scope: r.data.scope,
    token_type: r.data.token_type,
  };

  saveTokens(tokens);
  return tokens;
}

async function refreshTokens(refresh_token) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("TWITCH_CLIENT_ID/SECRET fehlt");

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const r = await axios.post(`https://id.twitch.tv/oauth2/token?${params.toString()}`);
  const now = Math.floor(Date.now() / 1000);

  const tokens = {
    access_token: r.data.access_token,
    refresh_token: r.data.refresh_token || refresh_token,
    expires_in: r.data.expires_in,
    obtained_at: now,
    scope: r.data.scope,
    token_type: r.data.token_type,
  };

  saveTokens(tokens);
  return tokens;
}

async function getValidAccessToken() {
  const t = loadTokens();
  if (!t) throw new Error("Twitch OAuth fehlt. Öffne /auth/twitch und authorisiere.");

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = (t.obtained_at || 0) + (t.expires_in || 0);

  // refresh 60s before expiry
  if (expiresAt - now <= 60) {
    return (await refreshTokens(t.refresh_token)).access_token;
  }

  return t.access_token;
}

async function twitchApiGet(path) {
  const token = await getValidAccessToken();
  const clientId = process.env.TWITCH_CLIENT_ID;

  const r = await axios.get(`https://api.twitch.tv/helix${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Client-Id": clientId,
    },
  });
  return r.data;
}

module.exports = {
  getAuthUrl,
  exchangeCode,
  getValidAccessToken,
  twitchApiGet,
  loadTokens,
};
