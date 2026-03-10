const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getAllClips } = require("../../utils/clip-store");

const CLIPPER_ROLE_ID = process.env.CLIPPER_ROLE_ID || "1480964609560285336";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clips")
    .setDescription("Zeigt die zuletzt eingereichten Clips")
    .addIntegerOption((option) =>
      option
        .setName("limit")
        .setDescription("Wie viele Clips angezeigt werden sollen (max 10)")
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(false)
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

    const limit = interaction.options.getInteger("limit") || 5;

    const clips = getAllClips()
      .slice()
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .slice(0, limit);

    if (!clips.length) {
      return interaction.reply({
        content: "Es wurden noch keine Clips eingereicht.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("🎬 Letzte eingereichte Clips")
      .setColor(0x5865f2)
      .setTimestamp(new Date());

    for (const clip of clips) {
      embed.addFields({
        name: `#${clip.id} • ${clip.platform}`,
        value:
          `**Von:** <@${clip.discordUserId}>\n` +
          `**Status:** ${clip.trackingStatus}\n` +
          `**Views:** ${(clip.currentViews || 0).toLocaleString("de-DE")}\n` +
          `**Payout:** ${clip.payoutUnlockedEuro || 0}€\n` +
          `**Link:** ${clip.url}`,
        inline: false,
      });
    }

    return interaction.reply({ embeds: [embed], ephemeral: false });
  },
};
