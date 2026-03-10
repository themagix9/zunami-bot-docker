const axios = require("axios");
const cron = require("node-cron");
const { EmbedBuilder } = require("discord.js");
const { getTrackableClips, updateClip } = require("./clip-store");

const CLIP_PERFORMANCE_CHANNEL_ID =
  process.env.CLIP_PERFORMANCE_CHANNEL_ID || "1480964308140822769";

const CLIP_PAYOUTS_CHANNEL_ID =
  process.env.CLIP_PAYOUTS_CHANNEL_ID || "1480964464533573692";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

let trackerStarted = false;

function detectPlatform(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();

    if (host.includes("youtube.com") || host === "youtu.be") return "youtube";
    if (host.includes("tiktok.com")) return "tiktok";

    return null;
  } catch {
    return null;
  }
}

function normalizeClipUrl(raw) {
  try {
    const u = new URL(raw.trim());
    u.hash = "";

    // query bei YouTube watch Links behalten, sonst kriegst du keine v=
    if (u.hostname.includes("tiktok.com")) {
      u.search = "";
    }

    return u.toString();
  } catch {
    return null;
  }
}

function extractYouTubeVideoId(url) {
  try {
    const u = new URL(url);

    if (u.hostname === "youtu.be") {
      return u.pathname.replace("/", "").trim() || null;
    }

    if (u.pathname.startsWith("/shorts/")) {
      const parts = u.pathname.split("/").filter(Boolean);
      return parts[1] || null;
    }

    if (u.pathname === "/watch") {
      return u.searchParams.get("v");
    }

    return null;
  } catch {
    return null;
  }
}

function calculateMilestone(views) {
  if (!views || views < 100000) return 0;
  return Math.floor(views / 100000) * 100000;
}

function calculatePayoutEuro(views) {
  return Math.floor((views || 0) / 100000) * 10;
}

async function fetchYouTubeStats(videoId) {
  if (!YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY fehlt");
  }

  const endpoint = "https://www.googleapis.com/youtube/v3/videos";

  const { data } = await axios.get(endpoint, {
    params: {
      part: "snippet,statistics",
      id: videoId,
      key: YOUTUBE_API_KEY,
    },
    timeout: 15000,
  });

  const item = data?.items?.[0];
  if (!item) {
    throw new Error(`Kein YouTube-Video für ID ${videoId} gefunden`);
  }

  return {
    title: item.snippet?.title || null,
    views: Number(item.statistics?.viewCount || 0),
    likes: Number(item.statistics?.likeCount || 0),
    comments: Number(item.statistics?.commentCount || 0),
  };
}

async function sendMilestoneNotification(client, clip, milestone, stats) {
  const performanceChannel = await client.channels.fetch(CLIP_PERFORMANCE_CHANNEL_ID).catch(() => null);
  const payoutsChannel = await client.channels.fetch(CLIP_PAYOUTS_CHANNEL_ID).catch(() => null);

  const payout = calculatePayoutEuro(stats.views);

  const embed = new EmbedBuilder()
    .setTitle("📈 Clip-Meilenstein erreicht")
    .setDescription(
      `**Clipper:** <@${clip.discordUserId}>\n` +
      `**Plattform:** ${clip.platform}\n` +
      `**Views:** ${stats.views.toLocaleString("de-DE")}\n` +
      `**Freigeschalteter Milestone:** ${milestone.toLocaleString("de-DE")}\n` +
      `**Gesamt-Payout für diesen Clip:** ${payout}€`
    )
    .addFields(
      { name: "Clip ID", value: String(clip.id), inline: true },
      { name: "Titel", value: stats.title || clip.title || "Unbekannt", inline: false },
      { name: "Link", value: clip.url, inline: false }
    )
    .setColor(0x00b0f4)
    .setTimestamp(new Date());

  if (performanceChannel?.isTextBased()) {
    await performanceChannel.send({ embeds: [embed] }).catch(console.error);
  }

  if (payoutsChannel?.isTextBased()) {
    await payoutsChannel
      .send({
        content:
          `💸 **Payout-Update**\n` +
          `Clipper: <@${clip.discordUserId}>\n` +
          `Clip ID: **${clip.id}**\n` +
          `Views: **${stats.views.toLocaleString("de-DE")}**\n` +
          `Aktuelles Gesamt-Payout für diesen Clip: **${payout}€**\n` +
          `${clip.url}`,
      })
      .catch(console.error);
  }
}

async function processClip(client, clip) {
  try {
    if (clip.platform !== "youtube") return;

    const stats = await fetchYouTubeStats(clip.videoId);
    const milestone = calculateMilestone(stats.views);
    const payout = calculatePayoutEuro(stats.views);

    const updated = updateClip(clip.id, {
      title: stats.title,
      currentViews: stats.views,
      currentLikes: stats.likes,
      currentComments: stats.comments,
      payoutUnlockedEuro: payout,
      lastCheckedAt: new Date().toISOString(),
      lastError: null,
    });

    if (!updated) return;

    if (milestone > 0 && milestone > (updated.highestMilestoneNotified || 0)) {
      await sendMilestoneNotification(client, updated, milestone, stats);

      updateClip(clip.id, {
        highestMilestoneNotified: milestone,
        payoutUnlockedEuro: payout,
        lastCheckedAt: new Date().toISOString(),
      });
    }
  } catch (err) {
    console.error(`❌ Clip-Tracking Fehler bei Clip ${clip.id}:`, err.message || err);

    updateClip(clip.id, {
      lastCheckedAt: new Date().toISOString(),
      lastError: err.message || String(err),
    });
  }
}

async function runClipTracking(client) {
  const clips = getTrackableClips();

  if (!clips.length) return;

  for (const clip of clips) {
    await processClip(client, clip);
  }
}

function startClipTracker(client) {
  if (trackerStarted) return;
  trackerStarted = true;

  console.log("🎬 Clip-Tracker gestartet");

  // Direkt nach Bot-Start einmal prüfen
  runClipTracking(client).catch(console.error);

  // Danach alle 30 Minuten
  cron.schedule("*/30 * * * *", async () => {
    await runClipTracking(client);
  });
}

module.exports = {
  startClipTracker,
  runClipTracking,
  detectPlatform,
  normalizeClipUrl,
  extractYouTubeVideoId,
  calculateMilestone,
  calculatePayoutEuro,
};
