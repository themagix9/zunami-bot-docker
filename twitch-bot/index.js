const { RefreshingAuthProvider } = require('@twurple/auth');
const { ChatClient } = require('@twurple/chat');

async function main() {
  const {
    TWITCH_CLIENT_ID_BOT,
    TWITCH_CLIENT_SECRET_BOT,
    TWITCH_BOT_ACCESS_TOKEN,
    TWITCH_BOT_REFRESH_TOKEN,
    TWITCH_BOT_USER_ID,
    TWITCH_BOT_USERNAME,
    TWITCH_CHANNEL
  } = process.env;

  if (
    !TWITCH_CLIENT_ID_BOT ||
    !TWITCH_CLIENT_SECRET_BOT ||
    !TWITCH_BOT_ACCESS_TOKEN ||
    !TWITCH_BOT_REFRESH_TOKEN ||
    !TWITCH_BOT_USER_ID ||
    !TWITCH_BOT_USERNAME ||
    !TWITCH_CHANNEL
  ) {
    throw new Error('Missing required Twitch environment variables');
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

  const chatClient = new ChatClient({
    authProvider,
    channels: [TWITCH_CHANNEL]
  });

  chatClient.onConnect(() => {
    console.log(`Connected to Twitch chat as ${TWITCH_BOT_USERNAME}`);
  });

  chatClient.onMessage(async (channel, user, text, msg) => {
    if (!text.startsWith('!')) return;

    const command = text.trim().toLowerCase();

    if (command === '!discord') {
      await chatClient.say(channel, 'Join den Discord hier: discord.gg/DEINLINK');
    }

    if (command === '!lurk') {
      await chatClient.say(channel, `${user} ist jetzt im Lurk-Modus 👀`);
    }

    if (command === '!bot') {
      await chatClient.say(channel, `Ja, ich bin ${TWITCH_BOT_USERNAME} 🤖`);
    }
  });

  await chatClient.connect();
}

main().catch((err) => {
  console.error('Twitch bot failed:', err);
  process.exit(1);
});
