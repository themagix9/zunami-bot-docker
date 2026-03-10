const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getAllClips } = require("../../utils/clip-store");

const CLIPPER_ROLE_ID = process.env.CLIPPER_ROLE_ID || "1480964609560285336";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("topclips")
    .setDescription("Zeigt die besten Clips nach Views")
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
      .sort((a, b) => (b.currentViews || 0) - (a.currentViews || 0))
      .slice(0, limit);

    if (!clips.length) {
      return interaction.reply({
        content: "Es wurden noch keine Clips gefunden.",
        ephemeral: true,
      });
    }

    const embed = new EmbedBuilder()
      .setTitle("🏆 Top Clips")
      .setColor(0xf1c40f)
      .setTimestamp(new Date());

    clips.forEach((clip, index) => {
      embed.addFields({
        name: `${index + 1}. #${clip.id} • ${(clip.currentViews || 0).toLocaleString("de-DE")} Views`,
        value:
          `**Clipper:** <@${clip.discordUserId}>\n` +
          `**Payout:** ${clip.payoutUnlockedEuro || 0}€\n` +
          `**Plattform:** ${clip.platform}\n` +
          `${clip.url}`,
        inline: false,
      });
    });

    return interaction.reply({ embeds: [embed] });
  },
};
