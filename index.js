// Zunami-Bot – index.js
// Discord.js v14
require("dotenv").config();


const { ensureEventSubSubscriptions } = require("./utils/eventsub-auto");

const cron = require("node-cron");
const { incAction } = require("./utils/modstats-store");
const { buildReport } = require("./utils/modreport");

const { getAuthUrl, exchangeCode, twitchApiGet } = require("./utils/twitch-oauth");
const { ensureModerationSubs } = require("./utils/eventsub-moderation");
const { scheduleLeaderboardUpdate, ensureLeaderboardMessage } = require("./utils/live-leaderboard");

const { startClipTracker } = require("./utils/clip-tracker");

const { resetLeaderboard } = require('./utils/modstats-store');

const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
  ActivityType,
  PermissionFlagsBits,
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// Logger Utility
const { logToChannel } = require("./utils/logger");

// Notifier (YT / Twitch Live / Clips)
const { startNotifier } = require("./utils/notifier");

const express = require("express");

const app = express();
const crypto = require("crypto");

app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

let discordClient = null;

app.get("/auth/twitch", (req, res) => {
  const url = getAuthUrl("zunami-bot");
  res.redirect(url);
});

app.get("/auth/twitch/callback", async (req, res) => {
  try {
    const code = req.query.code;
    if (!code) return res.status(400).send("Missing code");
    await exchangeCode(code);

    // optional: whoami anzeigen
    const me = await twitchApiGet("/users");
    const user = me.data?.[0];

    res.send(
      `OK authorized as ${user?.display_name || "unknown"} (id=${user?.id || "?"}). Du kannst das Fenster schließen.`
    );

    // nach OAuth direkt Subscriptions sicherstellen
    try {
      const r = await ensureModerationSubs();
      console.log(`✅ EventSub ensured after OAuth. created=${r.created} existing=${r.existing}`);
    } catch (e) {
      console.error("❌ ensureModerationSubs after OAuth failed:", e?.response?.data || e?.message || e);
    }
  } catch (e) {
    console.error(e?.response?.data || e);
    res.status(500).send("OAuth failed");
  }
});

app.get("/twitch/whoami", async (req, res) => {
  try {
    const me = await twitchApiGet("/users");
    res.json(me);
  } catch (e) {
    res.status(500).json({ error: e?.response?.data || e?.message || String(e) });
  }
});

app.get("/health", (req, res) => {
  res.send("OK");
});

app.listen(3000, () => {
  console.log("HTTP server running on port 3000");
});

function verifyTwitchEventSub(req) {
  const secret = process.env.EVENTSUB_SECRET;
  if (!secret) return { ok: false, reason: "EVENTSUB_SECRET missing" };

  const msgId = req.header("Twitch-Eventsub-Message-Id");
  const ts = req.header("Twitch-Eventsub-Message-Timestamp");
  const sig = req.header("Twitch-Eventsub-Message-Signature");

  if (!msgId || !ts || !sig || !req.rawBody) return { ok: false, reason: "missing headers/rawBody" };

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(msgId + ts + req.rawBody.toString("utf8"));
  const expected = "sha256=" + hmac.digest("hex");

  const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  return { ok, reason: ok ? "ok" : "bad signature" };
}

app.post("/twitch/eventsub", async (req, res) => {
  const v = verifyTwitchEventSub(req);
  if (!v.ok) {
    console.warn("❌ EventSub verify failed:", v.reason);
    return res.sendStatus(403);
  }

  const messageType = req.header("Twitch-Eventsub-Message-Type");
  const subType = req.body?.subscription?.type;

  // 1) verification challenge
  if (messageType === "webhook_callback_verification") {
    console.log(`✅ Twitch EventSub verified for ${subType}`);
    return res.status(200).send(req.body.challenge);
  }

  // 2) revocation (Twitch disabled a subscription)
  if (messageType === "revocation") {
    const status = req.body?.subscription?.status;
    const reason = req.body?.subscription?.status_message;
    console.warn(`⚠️ EventSub revoked: type=${subType} status=${status} reason=${reason}`);
    return res.sendStatus(200);
  }

  // 3) notifications
  if (messageType === "notification") {
    // --- stream online/offline (optional debug)
    if (subType === "stream.online") {
      const ev = req.body?.event;
      console.log(`🔴 stream.online: broadcaster=${ev?.broadcaster_user_name} id=${ev?.broadcaster_user_id}`);
      return res.sendStatus(200);
    }

    if (subType === "stream.offline") {
      const ev = req.body?.event;
      console.log(`⚫ stream.offline: broadcaster=${ev?.broadcaster_user_name} id=${ev?.broadcaster_user_id}`);
      return res.sendStatus(200);
    }

    // --- moderation events -> leaderboard
    if (subType === "channel.moderate") {
      const ev = req.body?.event;
      const action = ev?.action; // timeout | ban | delete | unban | untimeout | ...

      const modId = ev?.moderator_user_id || "unknown";
      const modName = ev?.moderator_user_name || ev?.moderator_user_login || modId;

      // Wir zählen nur die Actions, die du willst
      const counted = new Set(["timeout", "ban", "delete"]);

      if (counted.has(action)) {
        incAction({ moderatorId: modId, moderatorName: modName, action });

        if (discordClient) {
          // live embed updaten (rate-limited über scheduleLeaderboardUpdate)
          scheduleLeaderboardUpdate(discordClient);
        }

        console.log(`[MOD] action=${action} by ${modName}`);
      } else {
        // nur loggen damit du siehst, was Twitch sonst noch liefert
        console.log(`[MOD] action=${action} by ${modName} (ignored)`);
      }

      return res.sendStatus(200);
    }

    // fallback: unknown event type
    console.log(`ℹ️ EventSub notification received: type=${subType}`);
    return res.sendStatus(200);
  }

  // fallback: unknown message type
  console.log(`ℹ️ EventSub messageType=${messageType} type=${subType}`);
  return res.sendStatus(200);
});


// -------------------- CREATE CLIENT --------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// -------------------- LOAD SLASH COMMANDS --------------------
client.commands = new Collection();

const commandsPath = path.join(__dirname, "commands");
const loadCommands = (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);

    if (fs.lstatSync(full).isDirectory()) {
      loadCommands(full);
      continue;
    }

    if (file.endsWith(".js")) {
      const command = require(full);
      if (command?.data?.name) {
        client.commands.set(command.data.name, command);
      }
    }
  }
};

if (fs.existsSync(commandsPath)) {
  loadCommands(commandsPath);
} else {
  console.warn("⚠️ commands/ Ordner nicht gefunden – Slash Commands werden nicht geladen.");
}

// -------------------- LOAD config.json (Reaction Roles) --------------------
let config = { reactionRoles: [] };
const configPath = path.join(__dirname, "config.json");
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    console.error("❌ config.json konnte nicht gelesen werden:", e);
  }
}

// -------------------- READY --------------------
client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot ist online als ${client.user.tag}`);

  // Discord Presence
  client.user.setActivity("ZUNAMI9000", {
    type: ActivityType.Streaming,
    url: "https://www.twitch.tv/zunami9000",
  });

  // global reference für Webhooks (EventSub -> Discord updates)
  discordClient = client;

  try {
      startClipTracker(client);
      console.log("✅ Clip-Tracker gestartet");
    } catch (e) {
      console.error("❌ Clip-Tracker Fehler:", e?.message || e);
    }

  // 1) Live-Leaderboard Nachricht sicherstellen (eine Message, die editiert wird)
  try {
    await ensureLeaderboardMessage(client);
    console.log("✅ Live leaderboard message ensured");
  } catch (e) {
    console.error("❌ Live leaderboard ensure failed:", e?.message || e);
  }

  // 2) Notifier starten (YT / Twitch Live / Clips) - kannst du behalten
  //    (hat nix mit Mod-Stats zu tun, aber stört nicht)
  try {
    await startNotifier(client);
    console.log("✅ Notifier gestartet");
  } catch (e) {
    console.error("❌ Notifier Fehler:", e?.message || e);
  }

  try {
    const r = await ensureModerationSubs();
    console.log(
      `✅ EventSub ensured. callback=${r.callback} broadcasterId=${r.broadcasterId} moderatorId=${r.moderatorId} created=${r.created} existing=${r.existing}`
    );
  } catch (e) {
    // Twitch gibt hier oft sehr hilfreiche JSON Errors zurück:
    const details = e?.response?.data || e?.message || e;
    console.error("❌ ensureModerationSubs failed (OAuth/Scopes?):", details);
  }
});

// -------------------- MEMBER JOIN / LEAVE --------------------
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const welcomeChannel = process.env.WELCOME_CHANNEL_ID;
    const autoRole = process.env.AUTO_ROLE_ID;

    if (autoRole) {
      const role = member.guild.roles.cache.get(autoRole);
      if (role) await member.roles.add(role).catch(console.error);
    }

    if (welcomeChannel) {
      const ch = member.guild.channels.cache.get(welcomeChannel);
      if (ch) {
        ch.send({
          content: `👋 Willkommen ${member}! Schau in **#regeln-und-rechte** vorbei und sag kurz Hallo! 💙`,
        });
      }
    }

    await logToChannel(member.guild, `👤 **Join:** ${member.user.tag}`);
  } catch (err) {
    console.error("Fehler bei Join Event:", err);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  await logToChannel(member.guild, `🚪 **Leave:** ${member.user?.tag ?? "Unbekannt"}`);
});

// -------------------- REACTION ROLES --------------------
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();

    const entry = config.reactionRoles.find(
      (r) => r.messageId === reaction.message.id && r.emoji === reaction.emoji.name
    );

    if (entry) {
      const member = await reaction.message.guild.members.fetch(user.id);
      await member.roles.add(entry.roleId);
      await logToChannel(
        reaction.message.guild,
        `➕ Rolle hinzugefügt: ${user.tag} -> ${entry.roleId}`
      );
    }
  } catch (err) {
    console.error(err);
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot) return;

  try {
    if (reaction.partial) await reaction.fetch();

    const entry = config.reactionRoles.find(
      (r) => r.messageId === reaction.message.id && r.emoji === reaction.emoji.name
    );

    if (entry) {
      const member = await reaction.message.guild.members.fetch(user.id);
      await member.roles.remove(entry.roleId);
      await logToChannel(
        reaction.message.guild,
        `➖ Rolle entfernt: ${user.tag} -> ${entry.roleId}`
      );
    }
  } catch (err) {
    console.error(err);
  }
});

// -------------------- LOGGING MESSAGE DELETES --------------------
client.on(Events.MessageDelete, async (message) => {
  if (!message.guild) return;

  await logToChannel(
    message.guild,
    `🗑️ **Message Deleted** in #${message.channel?.name ?? "unknown"}\nVon: ${
      message.author?.tag ?? "Unbekannt"
    }\nInhalt: ${message.content ?? "Kein Inhalt"}`
  );
});

// -------------------- SLASH COMMANDS HANDLING --------------------
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;

  try {
    await cmd.execute(interaction, client);
  } catch (err) {
    console.error(err);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: "Fehler beim Ausführen des Befehls.", ephemeral: true });
    } else {
      await interaction.reply({ content: "Fehler beim Ausführen des Befehls.", ephemeral: true });
    }
  }
});

// -------------------- PREFIX COMMANDS (optional) --------------------
client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;

  const prefix = process.env.PREFIX ?? "!";
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const cmd = args.shift()?.toLowerCase();

  if (cmd === "modstats") {
  await updateLeaderboardMessage(client);
  return message.reply("✅ Leaderboard aktualisiert.");
}

if (cmd === "resetleaderboard") {
    // ✅ Nur Admins erlauben
    if (!message.member.permissions.has("Administrator")) {
      return message.reply("❌ Keine Berechtigung.");
    }

    resetLeaderboard();
    await updateLeaderboardMessage(client);

    await message.channel.send("📊 Leaderboard wurde zurückgesetzt.");
  }

    if (cmd === "embedtest") {
      const { EmbedBuilder } = require("discord.js");
      const e = new EmbedBuilder().setTitle("Embed Test").setDescription("Wenn du das siehst, sind Embeds ok.");
      return message.channel.send({ embeds: [e] });
    }

  // Beispiel: !mute
  if (cmd === "mute") {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply("❌ Keine Berechtigung.");
    }

    const target = message.mentions.members?.first();
    if (!target) return message.reply("Bitte ein Mitglied angeben.");

    const muteRoleId = process.env.MUTE_ROLE_ID;
    if (!muteRoleId) return message.reply("Mute-Rolle nicht konfiguriert.");

    await target.roles.add(muteRoleId);
    await message.reply(`${target.user.tag} wurde gemutet.`);
    await logToChannel(message.guild, `🔇 ${message.author.tag} muted ${target.user.tag}`);
  }
});

// -------------------- LOGIN --------------------
client.login(process.env.DISCORD_TOKEN);
