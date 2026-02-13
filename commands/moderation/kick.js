const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kicke ein Mitglied vom Server')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('Das Mitglied, das gekickt werden soll')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Der Grund für den Kick')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    const user = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason') ?? 'Kein Grund angegeben';

    try {
      const member = await interaction.guild.members.fetch(user.id);
      await member.kick(reason);

      await interaction.reply({
        content: `👢 ${user.tag} wurde gekickt.\nGrund: **${reason}**`
      });

    } catch (err) {
      console.error(err);
      interaction.reply({
        content: '❌ Kick fehlgeschlagen. Habe ich die nötigen Rechte?',
        ephemeral: true
      });
    }
  }
};
