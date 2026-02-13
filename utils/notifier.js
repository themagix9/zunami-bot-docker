const axios = require("axios");
const fs = require("fs");
const path = require("path");

const DATA_DIR = "/app/data";
const STATE_FILE = path.join(DATA_DIR, "state.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  ensureDir();
  if (!fs.existsSync(STATE_FILE)) return {};
  return JSON.parse(fs.readFileSync(STATE_FILE));
}

function saveState(state) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function getTwitchToken() {
  const res = await axios.post("https://id.twitch.tv/oauth2/token", null, {
    params: {
      client_id: process.env.TWITCH_CLIENT_ID,
      client_secret: process.env.TWITCH_CLIENT_SECRET,
      grant_type: "client_credentials"
    }
  });
  return res.data.access_token;
}

async function startNotifier(client) {
  const interval = Number(process.env.CHECK_INTERVAL || 60) * 1000;
  const mention = process.env.MENTION_EVERYONE === "true" ? "@everyone " : "";

  let state = loadState();
  let twitchToken = null;

  setInterval(async () => {

    // ---------------- YouTube ----------------
    if (process.env.YOUTUBE_RSS_URL) {
      try {
        const res = await axios.get(process.env.YOUTUBE_RSS_URL);
        const match = res.data.match(/<yt:videoId>(.*?)<\/yt:videoId>/);

        if (match) {
          const videoId = match[1];
          if (state.lastVideo !== videoId) {
            state.lastVideo = videoId;
            saveState(state);

            const ch = await client.channels.fetch(process.env.YT_ANNOUNCE_CHANNEL_ID);
            await ch.send(`${mention}🎬 Neues YouTube Video!\nhttps://youtu.be/${videoId}`);
          }
        }
      } catch (e) {
        console.log("YouTube error:", e.message);
      }
    }

    // ---------------- Twitch Live ----------------
    if (process.env.TWITCH_USERNAME) {
      try {
        if (!twitchToken) twitchToken = await getTwitchToken();

        const res = await axios.get("https://api.twitch.tv/helix/streams", {
          headers: {
            "Client-ID": process.env.TWITCH_CLIENT_ID,
            "Authorization": `Bearer ${twitchToken}`
          },
          params: { user_login: process.env.TWITCH_USERNAME }
        });

        const isLive = res.data.data.length > 0;

        if (isLive && !state.wasLive) {
          state.wasLive = true;
          saveState(state);

          const ch = await client.channels.fetch(process.env.LIVE_ANNOUNCE_CHANNEL_ID);
          await ch.send(`${mention}🔴 Zunami ist LIVE auf Twitch!\nhttps://twitch.tv/${process.env.TWITCH_USERNAME}`);
        }

        if (!isLive && state.wasLive) {
          state.wasLive = false;
          saveState(state);
        }

      } catch (e) {
        console.log("Twitch live error:", e.message);
      }
    }

    // ---------------- Twitch Clips ----------------
    if (process.env.TWITCH_USERNAME) {
      try {
        if (!twitchToken) twitchToken = await getTwitchToken();

        const userRes = await axios.get("https://api.twitch.tv/helix/users", {
          headers: {
            "Client-ID": process.env.TWITCH_CLIENT_ID,
            "Authorization": `Bearer ${twitchToken}`
          },
          params: { login: process.env.TWITCH_USERNAME }
        });

        const userId = userRes.data.data[0]?.id;
        if (!userId) return;

        const clipsRes = await axios.get("https://api.twitch.tv/helix/clips", {
          headers: {
            "Client-ID": process.env.TWITCH_CLIENT_ID,
            "Authorization": `Bearer ${twitchToken}`
          },
          params: {
            broadcaster_id: userId,
            first: 1
          }
        });

        const clip = clipsRes.data.data[0];
        if (!clip) return;

        if (state.lastClip !== clip.id) {
          state.lastClip = clip.id;
          saveState(state);

          const ch = await client.channels.fetch(process.env.CLIPS_CHANNEL_ID);
          await ch.send(`${mention}✂️ Neuer Twitch Clip!\n${clip.url}`);
        }

      } catch (e) {
        console.log("Twitch clip error:", e.message);
      }
    }

  }, interval);
}

module.exports = { startNotifier };
