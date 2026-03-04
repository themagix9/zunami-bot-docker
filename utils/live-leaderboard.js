// utils/live-leaderboard.js
const fs = require("fs");
const path = require("path");
const { buildReport } = require("./modreport");

const DATA_DIR = process.env.DATA_DIR || "/app/data";
const FILE = path.join(DATA_DIR, "leaderboard_message.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadState() {
  ensureDir();
  if (!fs.existsSync(FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2), "utf8");
}

let updateTimer = null;
let pending = false;

async function ensureLeaderboardMessage(client) {
  const channelId = process.env.MODREPORT_CHANNEL_ID;
  if (!channelId) throw new Error("MODREPORT_CHANNEL_ID fehlt");

  const state = loadState();
  const channel = await client.channels.fetch(channelId);
  if (!channel) throw new Error("Modreport Channel nicht gefunden");

  // Falls Message-ID existiert, versuchen wir sie zu laden
  if (state.messageId) {
    try {
      const msg = await channel.messages.fetch(state.messageId);
      return msg;
    } catch {
      // gelöscht oder nicht mehr fetchbar -> neu erstellen
    }
  }

  // Neu erstellen (Ping nur beim ersten Mal optional)
  const { embed } = buildReport({ title: "📊 Mod Statistik (Live)" });

  const msg = await channel.send({
    content: "", // kein Ping beim Erstellen (kannst du ändern, wenn du willst)
    embeds: embed ? [embed] : [],
  });

  saveState({ messageId: msg.id });
  return msg;
}

async function updateLeaderboardMessage(client) {
  const msg = await ensureLeaderboardMessage(client);

  // KEIN Ping bei Updates
  const { embed } = buildReport({ title: "📊 Mod Statistik (Live)" });

  await msg.edit({
    content: "",
    embeds: embed ? [embed] : [],
  });
}

// Rate-limit: max 1 Update alle 5 Sekunden
function scheduleLeaderboardUpdate(client, delayMs = 5000) {
  pending = true;
  if (updateTimer) return;

  updateTimer = setTimeout(async () => {
    updateTimer = null;
    if (!pending) return;
    pending = false;

    try {
      await updateLeaderboardMessage(client);
      console.log("✅ Live leaderboard updated");
    } catch (e) {
      console.error("❌ Live leaderboard update failed:", e?.message || e);
    }
  }, delayMs);
}

module.exports = {
  ensureLeaderboardMessage,
  updateLeaderboardMessage,
  scheduleLeaderboardUpdate,
};
