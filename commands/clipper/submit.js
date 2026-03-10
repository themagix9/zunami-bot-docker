const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { addClip, findClipByUrl } = require("../../utils/clip-store");
const { detectPlatform, normalizeClipUrl, extractYouTubeVideoId } = require("../../utils/clip-tracker");

const CLIP_SUBMIT_CHANNEL_ID = process.env.CLIP_SUBMIT_CHANNEL_ID || "1480964246295548006";
const CLIPPER_ROLE_ID = process.env.CLIPPER_ROLE_ID || "1480964609560285336";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("submit")
    .setDescription("Reicht einen neuen Clip zum Tracking ein")
    .addStringOption((option) =>
      option
        .setName("link")
        .setDescription("TikTok- oder YouTube-Shorts-Link")
        .setRequired(true)
    ),

  async execute(interaction) {
    const rawLink = interaction.options.getString("link", true).trim();

    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "Dieser Befehl funktioniert nur auf dem Server.",
        ephemeral: true,
      });
    }

    if (interaction.channelId !== CLIP_SUBMIT_CHANNEL_ID) {
      return interaction.reply({
        content: `Bitte nutze diesen Befehl nur im <#${CLIP_SUBMIT_CHANNEL_ID}> Channel.`,
        ephemeral: true,
      });
    }

    const member = interaction.member;
    const hasClipperRole = member?.roles?.cache?.has(CLIPPER_ROLE_ID);

    if (!hasClipperRole) {
      return interaction.reply({
        content: "Du brauchst die Clipper-Rolle, um Clips einzureichen.",
        ephemeral: true,
      });
    }

    const normalizedUrl = normalizeClipUrl(rawLink);
    if (!normalizedUrl) {
      return interaction.reply({
        content: "Ungültiger Link. Bitte sende einen vollständigen TikTok- oder YouTube-Link.",
        ephemeral: true,
      });
    }

    const existing = findClipByUrl(normalizedUrl);
    if (existing) {
      return interaction.reply({
        content: `Dieser Clip wurde bereits eingereicht.\nID: **${existing.id}**\nLink: ${existing.url}`,
        ephemeral: true,
      });
    }

    const platform = detectPlatform(normalizedUrl);
    if (!platform) {
      return interaction.reply({
        content: "Aktuell werden nur YouTube Shorts und TikTok Links angenommen.",
        ephemeral: true,
      });
    }

    let videoId = null;
    let trackingStatus = "pending_platform";
    let note = "";

    if (platform === "youtube") {
      videoId = extractYouTubeVideoId(normalizedUrl);
      if (!videoId) {
        return interaction.reply({
          content: "YouTube-Link erkannt, aber die Video-ID konnte nicht gelesen werden.",
          ephemeral: true,
        });
      }
      trackingStatus = "tracking";
      note = "YouTube-Tracking ist aktiv.";
    }

    if (platform === "tiktok") {
      trackingStatus = "pending_platform";
      note = "TikTok wurde gespeichert. Auto-Tracking kommt später dazu.";
    }

    const clip = addClip({
      discordUserId: interaction.user.id,
      discordUsername: interaction.user.tag,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      platform,
      url: normalizedUrl,
      videoId,
      title: null,
      trackingStatus,
    });

    return interaction.reply({
      content:
        `✅ Clip gespeichert\n\n` +
        `**ID:** ${clip.id}\n` +
        `**Plattform:** ${platform}\n` +
        `**Status:** ${trackingStatus}\n` +
        `**Hinweis:** ${note}\n` +
        `**Link:** ${clip.url}`,
      ephemeral: false,
    });
  },
};
