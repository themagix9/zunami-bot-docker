const axios = require("axios");

const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_USERNAME,
  EVENTSUB_SECRET,
} = process.env;

const CALLBACK_URL = "https://bot.gsoe.or.at/twitch/eventsub"; // <- fix oder aus ENV

async function getAppToken() {
  const url = "https://id.twitch.tv/oauth2/token";
  const res = await axios.post(url, null, {
    params: {
      client_id: TWITCH_CLIENT_ID,
      client_secret: TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials",
    },
  });
  return res.data.access_token;
}

async function getBroadcasterId(token) {
  const res = await axios.get("https://api.twitch.tv/helix/users", {
    params: { login: TWITCH_USERNAME },
    headers: {
      "Client-ID": TWITCH_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
  });

  const user = res.data.data?.[0];
  if (!user) throw new Error("Broadcaster not found for login=" + TWITCH_USERNAME);
  return user.id;
}

async function subscribe(token, type, broadcasterId) {
  const res = await axios.post(
    "https://api.twitch.tv/helix/eventsub/subscriptions",
    {
      type,
      version: "1",
      condition: { broadcaster_user_id: broadcasterId },
      transport: {
        method: "webhook",
        callback: CALLBACK_URL,
        secret: EVENTSUB_SECRET,
      },
    },
    {
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );

  console.log("Subscribed:", type, "status:", res.status);
}

(async () => {
  const token = await getAppToken();
  const broadcasterId = await getBroadcasterId(token);

  console.log("Broadcaster ID:", broadcasterId);

  await subscribe(token, "stream.online", broadcasterId);
  await subscribe(token, "stream.offline", broadcasterId);

  console.log("Done. Twitch will now verify your webhook.");
})().catch((e) => {
  console.error("Error:", e.response?.data || e.message);
  process.exit(1);
});
