module.exports.logToChannel = async function (guild, message) {
  try {
    const channelId = process.env.LOG_CHANNEL_ID;
    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    await channel.send({
      content: `📘 **Log:** ${message}`
    });

  } catch (err) {
    console.error("Logger Fehler:", err);
  }
};
