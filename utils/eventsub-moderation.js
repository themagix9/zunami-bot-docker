// utils/eventsub-moderation.js
const axios = require("axios");

async function getAppToken() {
  const clientId = needEnv("TWITCH_CLIENT_ID");
  const clientSecret = needEnv("TWITCH_CLIENT_SECRET");

  const r = await axios.post("https://id.twitch.tv/oauth2/token", null, {
    params: {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
    },
  });

  return r.data.access_token;
}

function needEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} fehlt`);
  return v;
}

async function listSubs() {
  const token = await getAppToken();
  const clientId = needEnv("TWITCH_CLIENT_ID");

  const r = await axios.get("https://api.twitch.tv/helix/eventsub/subscriptions?first=100", {
    headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
  });

  return r.data.data || [];
}

async function createSub({ type, version = "1", condition, callback, secret }) {
  const token = await getAppToken();
  const clientId = needEnv("TWITCH_CLIENT_ID");

  const body = {
    type,
    version,
    condition,
    transport: {
      method: "webhook",
      callback,
      secret,
    },
  };

  const r = await axios.post("https://api.twitch.tv/helix/eventsub/subscriptions", body, {
    headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId, "Content-Type": "application/json" },
  });

  return r.status;
}

function hasSub(subs, type, conditionMatch) {
  return subs.some((s) => s.type === type && conditionMatch(s.condition) && (s.status === "enabled" || s.status === "webhook_callback_verification_pending"));
}

async function ensureModerationSubs() {
  const base = needEnv("PUBLIC_BASE_URL").replace(/\/+$/, "");
  const callback = `${base}/twitch/eventsub`;
  const secret = needEnv("EVENTSUB_SECRET");

  const broadcasterId = needEnv("TWITCH_BROADCASTER_ID");
  const moderatorId = needEnv("TWITCH_MODERATOR_USER_ID");

  const subs = await listSubs();

  let created = 0;
  let existing = 0;

  // stream.online
  if (
    hasSub(subs, "stream.online", (c) => c.broadcaster_user_id === broadcasterId)
  ) {
    existing++;
  } else {
    await createSub({
      type: "stream.online",
      condition: { broadcaster_user_id: broadcasterId },
      callback,
      secret,
    });
    created++;
  }

  // stream.offline
  if (
    hasSub(subs, "stream.offline", (c) => c.broadcaster_user_id === broadcasterId)
  ) {
    existing++;
  } else {
    await createSub({
      type: "stream.offline",
      condition: { broadcaster_user_id: broadcasterId },
      callback,
      secret,
    });
    created++;
  }

  // channel.moderate (Timeout/Ban/Delete etc)
  if (
    hasSub(
      subs,
      "channel.moderate",
      (c) => c.broadcaster_user_id === broadcasterId && c.moderator_user_id === moderatorId
    )
  ) {
    existing++;
  } else {
    await createSub({
      type: "channel.moderate",
      condition: { broadcaster_user_id: broadcasterId, moderator_user_id: moderatorId },
      callback,
      secret,
    });
    created++;
  }

  return { callback, broadcasterId, moderatorId, created, existing };
}

module.exports = { ensureModerationSubs };
