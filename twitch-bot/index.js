const express = require('express');
const { RefreshingAuthProvider } = require('@twurple/auth');
const { ChatClient } = require('@twurple/chat');
const { ApiClient } = require('@twurple/api');
const { EventSubMiddleware } = require('@twurple/eventsub-http');

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

  const socialReminders = [
    '📸 Instagram für Stream Updates → https://www.instagram.com/zunami9000/',
    '🎬 TikTok für Clips → https://www.tiktok.com/@zunami9000',
    '▶️ YouTube Highlights → https://www.youtube.com/zunami'
  ];

  let socialIndex = 0;

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

  const commandCooldowns = new Map();

  const apiClient = new ApiClient({ authProvider });

  const chatClient = new ChatClient({
    authProvider,
    channels: [TWITCH_CHANNEL]
  });

  let liveAnnounced = false;
  const recentRaiders = new Map();

  let reminderInterval1 = null;
  let reminderInterval2 = null;

  function isOnCooldown(command, cooldownMs) {
    const now = Date.now();
    const lastUsed = commandCooldowns.get(command) || 0;

    if (now - lastUsed < cooldownMs) {
      return true;
    }

    commandCooldowns.set(command, now);
    return false;
  }

  function formatUptime(startDate) {
    const diffMs = Date.now() - new Date(startDate).getTime();
    const totalMinutes = Math.floor(diffMs / 1000 / 60);

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0) {
      return `${minutes}m`;
    }

    return `${hours}h ${minutes}m`;
  }

  function startLiveReminder(chatClient, channel) {
  if (reminderInterval1 || reminderInterval2) return;

  // Reminder 1 (Follow + Discord)
  reminderInterval1 = setInterval(async () => {
    try {
      await chatClient.say(
        channel,
        '💜 Wenn euch der Stream gefällt, lasst ein Follow da! 👋 Neu hier? Join den Discord → https://discord.gg/PjJeDSzNZ7'
      );

      console.log('[REMINDER] Follow reminder sent');
    } catch (err) {
      console.error('[REMINDER] Follow reminder failed:', err);
    }
  }, 30 * 60 * 1000);

  // Reminder 2 startet 15 Minuten später
  setTimeout(() => {
    reminderInterval2 = setInterval(async () => {
      try {
        const message = socialReminders[socialIndex];

        await chatClient.say(channel, message);

        socialIndex++;
        if (socialIndex >= socialReminders.length) {
          socialIndex = 0;
        }

        console.log('[REMINDER] Social reminder sent');
      } catch (err) {
        console.error('[REMINDER] Social reminder failed:', err);
      }
    }, 30 * 60 * 1000);
  }, 15 * 60 * 1000);
}

  function stopLiveReminder() {
    if (reminderInterval1) {
      clearInterval(reminderInterval1);
      reminderInterval1 = null;
    }

    if (reminderInterval2) {
      clearInterval(reminderInterval2);
      reminderInterval2 = null;
    }

    socialIndex = 0;

    console.log('[REMINDER] All reminders stopped');
  }

  chatClient.onConnect(() => {
    console.log(`[TWITCH] Connected as ${TWITCH_BOT_USERNAME} to #${TWITCH_CHANNEL}`);
  });

  chatClient.onMessage(async (channel, user, text) => {
    if (!text.startsWith('!')) return;

    const command = text.trim().toLowerCase();

    try {
      if (command === '!bot') {
        if (isOnCooldown('bot', 30_000)) return;

        await chatClient.say(
          channel,
          `Ja, ich bin ${TWITCH_BOT_USERNAME} 🤖 und LyGht hat mich programmiert, also beschwert euch bei ihm. 👀`
        );
      }

      if (command === '!uptime') {
        if (isOnCooldown('uptime', 30_000)) return;

        const stream = await apiClient.streams.getStreamByUserId(TWITCH_BROADCASTER_ID);

        if (!stream) {
          await chatClient.say(channel, 'Der Stream ist gerade offline.');
        } else {
          const uptime = formatUptime(stream.startDate);
          await chatClient.say(channel, `Der Stream läuft seit ${uptime}.`);
        }
      }

      if (command === '!discord') {
        if (isOnCooldown('discord', 30_000)) return;

        await chatClient.say(channel, 'Join den Discord hier: https://discord.gg/PjJeDSzNZ7');
      }

      if (command === '!distanz') {
        if (isOnCooldown('distanz', 30_000)) return;

        await chatClient.say(channel, 'ZUNAMI9000 distanziert sich ausdrücklich von den im Chat oder Stream getätigten Aussagen. Diese spiegeln nicht seine persönliche Meinung oder Haltung wider.');
      }

      if (command === '!mod') {
        if (isOnCooldown('mod', 30_000)) return;

        await chatClient.say(channel, '🛡️ Du möchtest Moderator bei Zunami werden? | 👉 Bewirb dich hier: https://forms.gle/MndvREDDNLMX8q2a6 | ⏰ Gesucht werden Mods für Streams von 16–20 Uhr');
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
    res.json({ ok: true, service: 'twitch-bot' });
  });

  app.get('/twitch/test', (_req, res) => {
    res.json({ ok: true, service: 'twitch-bot', route: '/twitch/test' });
  });

  const eventSub = new EventSubMiddleware({
    apiClient,
    hostName: new URL(PUBLIC_BASE_URL_BOT).hostname,
    pathPrefix: '/twitch/eventsub',
    secret: EVENTSUB_SECRET
  });

  eventSub.apply(app);

  app.listen(Number(TWITCH_BOT_PORT), async () => {
    console.log(`[HTTP] Health server running on port ${TWITCH_BOT_PORT}`);

    try {
      await eventSub.markAsReady();
      console.log(`[EVENTSUB] Listening on ${PUBLIC_BASE_URL_BOT}/twitch/eventsub`);

      await eventSub.onStreamOnline(TWITCH_BROADCASTER_ID, async () => {
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

          startLiveReminder(chatClient, TWITCH_CHANNEL);

          console.log('[EVENTSUB] Live announcement sent');
        } catch (err) {
          console.error('[EVENTSUB] Live announcement failed:', err);
        }
      });

      await eventSub.onStreamOffline(TWITCH_BROADCASTER_ID, async () => {
        liveAnnounced = false;
        stopLiveReminder();
        console.log('[EVENTSUB] Stream offline -> reset live flag');
      });

      await eventSub.onChannelRaidTo(
      TWITCH_BROADCASTER_ID,
      async (event) => {
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
        }
      );
    } catch (err) {
      console.error('[EVENTSUB] Setup failed:', err);
    }
  });
}

main().catch((err) => {
  console.error('[TWITCH BOT ERROR]', err);
  process.exit(1);
});
