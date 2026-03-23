// utils/modstats-store.js
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || "/app/data";
const FILE = path.join(DATA_DIR, "modstats.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function startOfWeekSunday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sunday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d;
}

function load() {
  ensureDir();
  if (!fs.existsSync(FILE)) {
    const init = {
      mods: {},
      totals: { timeouts: 0, bans: 0, deletes: 0, automod: 0 },
    };
    fs.writeFileSync(FILE, JSON.stringify(init, null, 2), "utf8");
    return init;
  }
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function save(data) {
  ensureDir();
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, FILE);
}

function ensureCurrentWeek(data) {
  return data;
}

function incAction({ moderatorId, moderatorName, action }) {
  // Erzwinge Twitch-Key (verhindert Discord/Twitch-Duplikate)
  const key = `twitch:${moderatorId}`;

  let data = ensureCurrentWeek(load());

  if (!data.mods[key]) {
    data.mods[key] = {
      name: moderatorName || moderatorId,
      counts: { timeouts: 0, bans: 0, deletes: 0, automod: 0 },
    };
  }

  const map = {
    timeout: "timeouts",
    ban: "bans",
    delete: "deletes",
    automod: "automod",
  };

  const k = map[action];
  if (!k) return;

  data.mods[key].counts[k] = (data.mods[key].counts[k] || 0) + 1;
  data.totals[k] = (data.totals[k] || 0) + 1;

  save(data);
}

function getLeaderboard() {
  const data = ensureCurrentWeek(load());
  const rows = Object.entries(data.mods).map(([id, m]) => {
    const c = m.counts;
    const score =
      (c.timeouts || 0) +
      (c.bans || 0) * 3 +
      (c.deletes || 0) +
      (c.automod || 0);

    return { id, name: m.name, ...c, score };
  });

  rows.sort((a, b) => b.score - a.score);
  return { data, rows };
}

if (command === '!resetleaderboard') {
  if (!user.isMod) return;

  const fs = require('fs');
  const path = require('path');

  const FILE = path.join(process.env.DATA_DIR || '/app/data', 'modstats.json');

  const resetData = {
    weekStart: new Date().toISOString(),
    mods: {},
    totals: { timeouts: 0, bans: 0, deletes: 0, automod: 0 },
  };

  fs.writeFileSync(FILE, JSON.stringify(resetData, null, 2), 'utf8');

  await chatClient.say(channel, '📊 Leaderboard wurde zurückgesetzt.');
}

module.exports = { incAction, getLeaderboard };
