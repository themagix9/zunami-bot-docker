const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getAllClips } = require("../../utils/clip-store");

const CLIPPER_ROLE_ID = process.env.CLIPPER_ROLE_ID || "1480964609560285336";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("payouts")
    .setDescription("Zeigt alle Clips mit freigeschaltetem Payout"),

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

    const payoutClips = getAllClips()
      .filter((c) => (c.payoutUnlockedEuro || 0) > 0)
      .sort((a, b) => (b.payoutUnlockedEuro || 0) - (a.payoutUnlockedEuro || 0));

    if (!payoutClips.length) {
      return interaction.reply({
        content: "Aktuell gibt es noch keine Clips mit freigeschaltetem Payout.",
        ephemeral: true,
      });
    }

    const top10 = payoutClips.slice(0, 10);
    const totalPayout = payoutClips.reduce((sum, c) => sum + (c.payoutUnlockedEuro || 0), 0);

    const embed = new EmbedBuilder()
      .setTitle("💸 Freigeschaltete Payouts")
      .setColor(0x57f287)
      .setDescription(`Gesamtsumme aktuell: **${totalPayout}€**`)
      .setTimestamp(new Date());

    for (const clip of top10) {
      embed.addFields({
        name: `#${clip.id} • ${clip.discordUsername}`,
        value:
          `**Payout:** ${clip.payoutUnlockedEuro || 0}€\n` +
          `**Views:** ${(clip.currentViews || 0).toLocaleString("de-DE")}\n` +
          `**Plattform:** ${clip.platform}\n` +
          `${clip.url}`,
        inline: false,
      });
    }

    return interaction.reply({ embeds: [embed] });
  },
};
