const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { findClipById, deleteClipById } = require("../../utils/clip-store");

const MODS_ROLE_ID = process.env.MODS_ROLE_ID;
const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("removeclip")
    .setDescription("Entfernt einen Clip aus dem Tracking")
    .addIntegerOption((option) =>
      option
        .setName("id")
        .setDescription("Clip-ID")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({
        content: "Dieser Befehl funktioniert nur auf dem Server.",
        ephemeral: true,
      });
    }

    const member = interaction.member;
    const hasRole =
      (MODS_ROLE_ID && member?.roles?.cache?.has(MODS_ROLE_ID)) ||
      (ADMIN_ROLE_ID && member?.roles?.cache?.has(ADMIN_ROLE_ID)) ||
      member?.permissions?.has(PermissionFlagsBits.ManageMessages);

    if (!hasRole) {
      return interaction.reply({
        content: "Du hast keine Berechtigung für diesen Befehl.",
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

    deleteClipById(id);

    return interaction.reply({
      content:
        `🗑️ Clip entfernt\n\n` +
        `**ID:** ${clip.id}\n` +
        `**Clipper:** <@${clip.discordUserId}>\n` +
        `**Plattform:** ${clip.platform}\n` +
        `**Link:** ${clip.url}`,
    });
  },
};
