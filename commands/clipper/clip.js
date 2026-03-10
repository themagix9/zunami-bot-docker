const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { findClipById } = require("../../utils/clip-store");

const CLIPPER_ROLE_ID = process.env.CLIPPER_ROLE_ID || "1480964609560285336";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clip")
    .setDescription("Zeigt Details zu einem einzelnen Clip")
    .addIntegerOption((option) =>
      option
        .setName("id")
        .setDescription("Clip-ID")
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

    const id = interaction.options.getInteger("id", true);
    const clip = findClipById(id);

    if (!clip) {
      return interaction.reply({
        content: `Kein Clip mit der ID **${id}** gefunden.`,
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`🎬 Clip #${clip.id}`)
      .setColor(0x00b0f4)
      .addFields(
        { name: "Clipper", value: `<@${clip.discordUserId}>`, inline: true },
        { name: "Plattform", value: clip.platform, inline: true },
        { name: "Status", value: clip.trackingStatus || "unbekannt", inline: true },
        { name: "Views", value: (clip.currentViews || 0).toLocaleString("de-DE"), inline: true },
        { name: "Likes", value: (clip.currentLikes || 0).toLocaleString("de-DE"), inline: true },
        { name: "Kommentare", value: (clip.currentComments || 0).toLocaleString("de-DE"), inline: true },
        { name: "Payout", value: `${clip.payoutUnlockedEuro || 0}€`, inline: true },
        { name: "Milestone", value: (clip.highestMilestoneNotified || 0).toLocaleString("de-DE"), inline: true },
        { name: "Eingereicht", value: clip.submittedAt ? `<t:${Math.floor(new Date(clip.submittedAt).getTime() / 1000)}:F>` : "—", inline: false },
        { name: "Titel", value: clip.title || "Unbekannt", inline: false },
        { name: "Link", value: clip.url, inline: false }
      )
      .setTimestamp(new Date());

    return interaction.reply({ embeds: [embed] });
  },
};
