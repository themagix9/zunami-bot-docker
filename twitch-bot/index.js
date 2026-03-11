const express = require('express');
const { RefreshingAuthProvider } = require('@twurple/auth');
const { ChatClient } = require('@twurple/chat');
const { ApiClient } = require('@twurple/api');
const { EventSubHttpListener } = require('@twurple/eventsub-http');

async function main() {
  const {
    TWITCH_CLIENT_ID_BOT,
    TWITCH_CLIENT_SECRET_BOT,
    TWITCH_BOT_ACCESS_TOKEN,
    TWITCH_BOT_REFRESH_TOKEN,
    TWITCH_BOT_USERNAME,
    TWITCH_CHANNEL,
    TWITCH_BROADCASTER_ID,
    EVENTSUB_SECRET,
    PUBLIC_BASE_URL_BOT,
    TWITCH_BOT_PORT
  } = process.env;

  const missing = [
    'TWITCH_CLIENT_ID_BOT',
    'TWITCH_CLIENT_SECRET_BOT',
    'TWITCH_BOT_ACCESS_TOKEN',
    'TWITCH_BOT_REFRESH_TOKEN',
    'TWITCH_BOT_USERNAME',
    'TWITCH_CHANNEL',
    'TWITCH_BROADCASTER_ID',
    'EVENTSUB_SECRET',
    'PUBLIC_BASE_URL_BOT',
    'TWITCH_BOT_PORT'
  ].filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing env vars: ${missing.join(', ')}`);
  }

  const authProvider = new RefreshingAuthProvider({
    clientId: TWITCH_CLIENT_ID_BOT,
    clientSecret: TWITCH_CLIENT_SECRET_BOT
  });

  await authProvider.addUserForToken(
    {
      accessToken: TWITCH_BOT_ACCESS_TOKEN,
      refreshToken: TWITCH_BOT_REFRESH_TOKEN,
      expiresIn: 0,
      obtainmentTimestamp: Date.now() - 3600_000
    },
    ['chat']
  );

  const apiClient = new ApiClient({ authProvider });

  const chatClient = new ChatClient({
    authProvider,
    channels: [TWITCH_CHANNEL]
  });

  let liveAnnounced = false;
  const recentRaiders = new Map();

  chatClient.onConnect(() => {
    console.log(`[TWITCH] Connected as ${TWITCH_BOT_USERNAME} to #${TWITCH_CHANNEL}`);
  });

  chatClient.onMessage(async (channel, user, text) => {
    if (!text.startsWith('!')) return;

    const command = text.trim().toLowerCase();

    try {
      if (command === '!bot') {
        await chatClient.say(channel, `Ja, ich bin ${TWITCH_BOT_USERNAME} 🤖 gebaut von LyGht und ich überwache den Chat 👀`);
      }

      if (command === '!discord') {
        await chatClient.say(channel, 'Join den Discord hier: discord.gg/DEINLINK');
      }

      if (command === '!lurk') {
        await chatClient.say(channel, `${user} ist jetzt im Lurk-Modus 👀`);
      }
    } catch (err) {
      console.error('[TWITCH] Command error:', err);
    }
  });

  await chatClient.connect();

  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  const listener = new EventSubHttpListener({
    apiClient,
    hostName: new URL(PUBLIC_BASE_URL_BOT).hostname,
    pathPrefix: '/twitch/eventsub',
    secret: EVENTSUB_SECRET,
    port: Number(TWITCH_BOT_PORT)
  });

  await listener.listen();
  console.log(`[EVENTSUB] Listening on ${PUBLIC_BASE_URL_BOT}/twitch/eventsub`);

  await listener.subscribeToStreamOnlineEvents(TWITCH_BROADCASTER_ID, async () => {
    if (liveAnnounced) return;
    liveAnnounced = true;

    try {
      const stream = await apiClient.streams.getStreamByUserId(TWITCH_BROADCASTER_ID);
      const title = stream?.title || 'Ohne Titel';
      const gameName = stream?.gameName || 'Unbekannte Kategorie';

      await chatClient.say(
        TWITCH_CHANNEL,
        `🔴 ${TWITCH_CHANNEL} ist jetzt live und streamt ${gameName} - ${title}`
      );

      console.log('[EVENTSUB] Live announcement sent');
    } catch (err) {
      console.error('[EVENTSUB] Live announcement failed:', err);
    }
  });

  await listener.subscribeToStreamOfflineEvents(TWITCH_BROADCASTER_ID, async () => {
    liveAnnounced = false;
    console.log('[EVENTSUB] Stream offline -> reset live flag');
  });

  await listener.subscribeToChannelRaidToBroadcasterEvents(TWITCH_BROADCASTER_ID, async (event) => {
    const raiderName = event.raidingBroadcasterDisplayName;
    const raiderLogin = event.raidingBroadcasterName;
    const viewerCount = event.viewers ?? 0;

    const now = Date.now();
    const lastSeen = recentRaiders.get(raiderLogin) || 0;

    if (now - lastSeen < 1000 * 60 * 60 * 6) {
      console.log(`[EVENTSUB] Raid from ${raiderLogin} skipped due to cooldown`);
      return;
    }

    recentRaiders.set(raiderLogin, now);

    setTimeout(async () => {
      try {
        await chatClient.say(
          TWITCH_CHANNEL,
          `Danke für den Raid ${raiderName} mit ${viewerCount} Viewern 💜 Schaut auch bei twitch.tv/${raiderLogin} vorbei!`
        );
        console.log('[EVENTSUB] Raid shoutout sent');
      } catch (err) {
        console.error('[EVENTSUB] Raid shoutout failed:', err);
      }
    }, 15000);
  });

  app.listen(Number(TWITCH_BOT_PORT), () => {
    console.log(`[HTTP] Health server running on port ${TWITCH_BOT_PORT}`);
  });
}

main().catch((err) => {
  console.error('[TWITCH BOT ERROR]', err);
  process.exit(1);
});
