// utils/modreport.js
const { EmbedBuilder } = require("discord.js");
const { getLeaderboard } = require("./modstats-store");

function buildReport({ mentionRoleId, title = "📊 Mod Report (Woche)" } = {}) {
  const { data, rows } = getLeaderboard();
  const top = rows.slice(0, 10);

  const lines = top.length
    ? top.map((r, i) => {
        const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "•";
        return `${medal} **${r.name}** — **${r.score}**  _(TO:${r.timeouts||0} | Ban:${r.bans||0} | Del:${r.deletes||0} | Warn:${r.warns||0})_`;
      })
    : ["_(noch keine Daten diese Woche)_"];

  const t = data.totals || {};
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(lines.join("\n"))
    .addFields(
      { name: "Totals", value: `Timeouts: **${t.timeouts||0}**\nBans: **${t.bans||0}**\nDeletes: **${t.deletes||0}**\nWarns: **${t.warns||0}**`, inline: true },
      { name: "Week Start", value: data.weekStart, inline: true }
    );

  const content = mentionRoleId ? `<@&${mentionRoleId}>` : undefined;
  return { content, embed };
}

module.exports = { buildReport };
