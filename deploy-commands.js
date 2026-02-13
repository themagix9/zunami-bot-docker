// Registriert alle Slash Commands auf deinem Discord-Server
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

const loadCommands = (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const full = path.join(dir, file);
    if (fs.lstatSync(full).isDirectory()) {
      loadCommands(full);
      continue;
    }
    if (file.endsWith('.js')) {
      const command = require(full);
      if (command.data) commands.push(command.data.toJSON());
    }
  }
};

loadCommands(commandsPath);

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔧 Registriere Slash Commands...");

    // Schnell: GUILD-Scope
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log("✔ Slash Commands erfolgreich registriert!");
  } catch (error) {
    console.error("❌ Fehler beim Registrieren:", error);
  }
})();
