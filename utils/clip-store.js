const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR || "/app/data";
const FILE = path.join(DATA_DIR, "clips.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function initialData() {
  return {
    lastId: 0,
    clips: [],
  };
}

function load() {
  ensureDir();

  if (!fs.existsSync(FILE)) {
    const init = initialData();
    fs.writeFileSync(FILE, JSON.stringify(init, null, 2), "utf8");
    return init;
  }

  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch (err) {
    console.error("❌ clips.json konnte nicht gelesen werden:", err);
    return initialData();
  }
}

function save(data) {
  ensureDir();
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, FILE);
}

function addClip({
  discordUserId,
  discordUsername,
  guildId,
  channelId,
  platform,
  url,
  videoId = null,
  title = null,
  trackingStatus = "pending",
}) {
  const data = load();
  const id = data.lastId + 1;

  const clip = {
    id,
    discordUserId,
    discordUsername,
    guildId,
    channelId,
    platform,
    url,
    videoId,
    title,
    trackingStatus, // tracking | pending_platform | error | completed
    submittedAt: new Date().toISOString(),
    currentViews: 0,
    currentLikes: 0,
    currentComments: 0,
    highestMilestoneNotified: 0,
    payoutUnlockedEuro: 0,
    lastCheckedAt: null,
    lastError: null,
  };

  data.lastId = id;
  data.clips.push(clip);
  save(data);
  return clip;
}

function getAllClips() {
  return load().clips || [];
}

function findClipById(id) {
  const data = load();
  return data.clips.find((c) => c.id === Number(id)) || null;
}

function findClipByUrl(url) {
  const data = load();
  return data.clips.find((c) => c.url === url) || null;
}

function updateClip(id, patch) {
  const data = load();
  const idx = data.clips.findIndex((c) => c.id === Number(id));
  if (idx === -1) return null;

  data.clips[idx] = {
    ...data.clips[idx],
    ...patch,
  };

  save(data);
  return data.clips[idx];
}

function getTrackableClips() {
  const data = load();
  return data.clips.filter((clip) => clip.trackingStatus === "tracking");
}

module.exports = {
  load,
  save,
  addClip,
  getAllClips,
  findClipById,
  findClipByUrl,
  updateClip,
  getTrackableClips,
};
