// utils/eventsub-auto.js
const axios = require("axios");

const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_USERNAME,
  TWITCH_BROADCASTER_ID,
  EVENTSUB_SECRET,
  PUBLIC_BASE_URL,
} = process.env;

function reqEnv(name, value) {
  if (!value) throw new Error(`Missing env: ${name}`);
}

async function getAppToken() {
  reqEnv("TWITCH_CLIENT_ID", TWITCH_CLIENT_ID);
  reqEnv("TWITCH_CLIENT_SECRET", TWITCH_CLIENT_SECRET);

  const res = await axios.post("https://id.twitch.tv/oauth2/token", null, {
    params: {
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    },
    timeout: 15000,
  });
  return res.data.access_token;
}

async function getBroadcasterId(token) {
  if (TWITCH_BROADCASTER_ID) return TWITCH_BROADCASTER_ID;

  reqEnv("TWITCH_USERNAME", TWITCH_USERNAME);

  const res = await axios.get("https://api.twitch.tv/helix/users", {
    params: { login: TWITCH_USERNAME },
    headers: {
      "Client-ID": TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
    timeout: 15000,
  });

  const user = res.data?.data?.[0];
  if (!user?.id) throw new Error(`Could not resolve broadcaster id for ${TWITCH_USERNAME}`);
  return user.id;
}

function callbackUrl() {
  reqEnv("PUBLIC_BASE_URL", PUBLIC_BASE_URL);
  return `${PUBLIC_BASE_URL.replace(/\/$/, "")}/twitch/eventsub`;
}

async function listSubs(token) {
  const res = await axios.get("https://api.twitch.tv/helix/eventsub/subscriptions", {
    headers: {
      "Client-ID": TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
    timeout: 15000,
  });
  return res.data?.data || [];
}

async function createSub(token, body) {
  reqEnv("EVENTSUB_SECRET", EVENTSUB_SECRET);

  const res = await axios.post("https://api.twitch.tv/helix/eventsub/subscriptions", body, {
    headers: {
      "Client-ID": TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    timeout: 15000,
    validateStatus: (s) => s >= 200 && s < 500,
  });

  if (res.status !== 202) {
    throw new Error(`Create sub failed ${body.type}: ${res.status} ${JSON.stringify(res.data)}`);
  }
}

function hasSub(existing, { type, version, broadcasterId, cb }) {
  return existing.some(
    (s) =>
      s.type === type &&
      s.version === version &&
      (s.condition?.broadcaster_user_id === broadcasterId ||
        s.condition?.broadcaster_user_id === String(broadcasterId)) &&
      s.transport?.callback === cb
  );
}

async function ensureEventSubSubscriptions() {
  const token = await getAppToken();
  const broadcasterId = await getBroadcasterId(token);
  const cb = callbackUrl();

  const existing = await listSubs(token);

  const desired = [
    { type: "stream.online", version: "1" },
    { type: "stream.offline", version: "1" },
  ];

  let created = 0;

  for (const d of desired) {
    if (hasSub(existing, { ...d, broadcasterId, cb })) continue;

    await createSub(token, {
      type: d.type,
      version: d.version,
      condition: { broadcaster_user_id: String(broadcasterId) },
      transport: {
        method: "webhook",
        callback: cb,
        secret: EVENTSUB_SECRET,
      },
    });

    created++;
  }

  return { broadcasterId, callback: cb, created, existing: existing.length };
}

module.exports = { ensureEventSubSubscriptions };
