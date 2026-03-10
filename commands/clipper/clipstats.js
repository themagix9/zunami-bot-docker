const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getAllClips } = require("../../utils/clip-store");

const CLIPPER_ROLE_ID = process.env.CLIPPER_ROLE_ID || "1480964609560285336";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clipstats")
    .setDescription("Zeigt die Clip-Stats eines Users")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("Discord User")
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "Dieser Befehl funktioniert nur auf dem Server.",
        ephemeral: true,
      });
    }

    const hasClipperRole = interaction.member?.roles?.cache?.has(CLIPPER_ROLE_ID);
    if (!hasClipperRole) {
      return interaction.reply({
        content: "Du brauchst die Clipper-Rolle, um diesen Befehl zu nutzen.",
        ephemeral: true,
      });
    }

    const user = interaction.options.getUser("user", true);
    const clips = getAllClips().filter((c) => c.discordUserId === user.id);

    if (!clips.length) {
      return interaction.reply({
        content: `Für ${user} wurden noch keine Clips gefunden.`,
        ephemeral: true,
      });
    }

    const totalViews = clips.reduce((sum, c) => sum + (c.currentViews || 0), 0);
    const totalPayout = clips.reduce((sum, c) => sum + (c.payoutUnlockedEuro || 0), 0);
    const ytCount = clips.filter((c) => c.platform === "youtube").length;
    const ttCount = clips.filter((c) => c.platform === "tiktok").length;

    const topClip = [...clips].sort((a, b) => (b.currentViews || 0) - (a.currentViews || 0))[0];

    const embed = new EmbedBuilder()
      .setTitle(`📊 Clip-Stats für ${user.username}`)
      .setColor(0x5865f2)
      .addFields(
        { name: "Gesamtclips", value: String(clips.length), inline: true },
        { name: "Gesamtviews", value: totalViews.toLocaleString("de-DE"), inline: true },
        { name: "Gesamtpayout", value: `${totalPayout}€`, inline: true },
        { name: "YouTube Clips", value: String(ytCount), inline: true },
        { name: "TikTok Clips", value: String(ttCount), inline: true },
        {
          name: "Bester Clip",
          value: topClip
            ? `#${topClip.id} • ${(topClip.currentViews || 0).toLocaleString("de-DE")} Views\n${topClip.url}`
            : "—",
          inline: false,
        }
      )
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp(new Date());

    return interaction.reply({ embeds: [embed] });
  },
};
