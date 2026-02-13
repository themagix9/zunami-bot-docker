// Zunami-Bot – index.js
// Discord.js v14
require("dotenv").config();

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

  client.user.setActivity({
    name: "ZUNAMI9000",
    type: ActivityType.Watching,
  });

  // Notifier starten (YT / Twitch Live / Clips)
  try {
    await startNotifier(client);
    console.log("✅ Notifier gestartet");
  } catch (e) {
    console.error("❌ Notifier Fehler:", e?.message || e);
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
