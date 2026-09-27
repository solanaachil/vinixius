// ==============================
// Tambay Bot — AFK + DM outreach
// ==============================
// Setup instructions are in README.md
// Want to change embed colors / titles / footers? Edit config.json — no code needed.

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
} = require('discord.js');
const config = require('./config.json');

const PREFIX = process.env.PREFIX || '$';
const TAMBAY_BATCH_SIZE = 10;
const TAMBAY_BATCH_DELAY_MS = 1200; // pause between batches to respect Discord rate limits

// ---- In-memory storage ----
// NOTE: resets if the bot restarts. Fine for most small servers — ask if you want
// this saved to a database later so it survives restarts.

// userId -> { reason: string, since: number (timestamp ms) }
const afkUsers = new Map();

// userId -> array of { from: string, channelId: string, guildId: string, messageId: string, timestamp: number }
const afkMentions = new Map();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers, // required to fetch + DM all members for /tambay
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

// ---- Slash command definitions ----

const slashCommands = [
  new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Mark yourself as AFK')
    .addStringOption((opt) =>
      opt.setName('reason').setDescription('Why are you AFK?').setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName('afkmentions')
    .setDescription('See who mentioned you while you were AFK'),
  new SlashCommandBuilder()
    .setName('tambay')
    .setDescription('DM all server members inviting them to a channel (Admins only)')
    .addStringOption((opt) =>
      opt.setName('message').setDescription('The message to DM everyone').setRequired(true)
    )
    .addChannelOption((opt) =>
      opt
        .setName('channel')
        .setDescription('The channel to invite them to')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((cmd) => cmd.toJSON());

async function registerSlashCommands() {
  const rest = new REST().setToken(process.env.DISCORD_TOKEN);
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!clientId) {
    console.warn('CLIENT_ID not set in .env — skipping slash command registration.');
    return;
  }

  try {
    if (guildId) {
      // Guild-specific: shows up instantly, good for a single-server bot.
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: slashCommands });
      console.log('Slash commands registered to guild.');
    } else {
      // Global: can take up to an hour to appear the first time.
      await rest.put(Routes.applicationCommands(clientId), { body: slashCommands });
      console.log('Slash commands registered globally (may take up to an hour to show up).');
    }
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerSlashCommands();
});

// ---- Helpers ----

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function isAdministrator(member) {
  return member?.permissions.has(PermissionsBitField.Flags.Administrator) ?? false;
}

function buildAfkSetEmbed(user, reason) {
  return new EmbedBuilder()
    .setColor(config.colors.afkSet)
    .setDescription(`💤 **${user.username}** is AFK → *${reason}*`)
    .setFooter({ text: config.afk.setFooter });
}

function buildWelcomeBackEmbed(user, duration, mentionCount) {
  return new EmbedBuilder()
    .setColor(config.colors.welcomeBack)
    .setAuthor({ name: config.afk.welcomeBackTitle })
    .setThumbnail(user.displayAvatarURL())
    .setDescription(
      `${user} was away for **${duration}**` +
        (mentionCount > 0
          ? `\n\n📬 You have **${mentionCount}** mention${mentionCount === 1 ? '' : 's'} — check \`/afkmentions\`.`
          : '')
    )
    .setFooter({ text: config.afk.welcomeBackFooter })
    .setTimestamp();
}

function buildMentionsEmbed(user, list) {
  const lines = list.slice(-10).map((m, i) => {
    const link = `https://discord.com/channels/${m.guildId}/${m.channelId}/${m.messageId}`;
    return `**${i + 1}.** From **${m.from}** • <t:${Math.floor(m.timestamp / 1000)}:R>\n${m.content}\n[Jump to Message](${link})`;
  });

  return new EmbedBuilder()
    .setColor(config.colors.mentions)
    .setAuthor({ name: config.afk.mentionsTitle })
    .setThumbnail(user.displayAvatarURL())
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: config.afk.mentionsFooter })
    .setTimestamp();
}

function buildDeniedEmbed() {
  return new EmbedBuilder()
    .setColor(config.colors.denied)
    .setAuthor({ name: config.tambay.deniedTitle })
    .setDescription(config.tambay.deniedText);
}

function setAfk(userId, reason) {
  afkUsers.set(userId, { reason, since: Date.now() });
  afkMentions.set(userId, []); // fresh mention log for this AFK session
}

function clearAfkIfNeeded(userId) {
  if (!afkUsers.has(userId)) return null;
  const data = afkUsers.get(userId);
  afkUsers.delete(userId);
  return data;
}

// ---- Message handling (prefix commands + mention tracking + welcome back) ----

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const content = message.content.trim();
  const isAfkCommand = content.toLowerCase().startsWith(`${PREFIX}afk`);

  // 1. Welcome-back check
  if (afkUsers.has(message.author.id) && !isAfkCommand) {
    const data = clearAfkIfNeeded(message.author.id);
    const duration = formatDuration(Date.now() - data.since);
    const mentionCount = (afkMentions.get(message.author.id) || []).length;
    message.channel
      .send({ embeds: [buildWelcomeBackEmbed(message.author, duration, mentionCount)] })
      .catch(() => {});
  }

  // 2. Mention tracking
  if (message.mentions.users.size > 0) {
    for (const [, mentioned] of message.mentions.users) {
      if (mentioned.bot) continue;
      if (!afkUsers.has(mentioned.id)) continue;

      const data = afkUsers.get(mentioned.id);
      const duration = formatDuration(Date.now() - data.since);
      message.channel
        .send(`💤 **${mentioned.username}** is AFK → *${data.reason}* (away ${duration})`)
        .catch(() => {});

      const list = afkMentions.get(mentioned.id) || [];
      list.push({
        from: message.author.tag,
        channelId: message.channel.id,
        guildId: message.guild.id,
        messageId: message.id,
        content: message.content.slice(0, 200),
        timestamp: Date.now(),
      });
      afkMentions.set(mentioned.id, list);
    }
  }

  if (!content.startsWith(PREFIX)) return;
  const [cmdRaw, ...args] = content.slice(PREFIX.length).split(/\s+/);
  const cmd = cmdRaw.toLowerCase();

  if (cmd === 'afk') {
    const reason = args.join(' ') || 'AFK';
    setAfk(message.author.id, reason);
    message.reply({ embeds: [buildAfkSetEmbed(message.author, reason)] }).catch(() => {});
    return;
  }

  if (cmd === 'afkmentions') {
    const list = afkMentions.get(message.author.id) || [];
    if (list.length === 0) {
      message.reply(config.afk.noMentionsText).catch(() => {});
      return;
    }
    message.reply({ embeds: [buildMentionsEmbed(message.author, list)] }).catch(() => {});
    return;
  }
});

// ---- Slash command handling ----

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'afk') {
    const reason = interaction.options.getString('reason') || 'AFK';
    setAfk(interaction.user.id, reason);
    await interaction.reply({ embeds: [buildAfkSetEmbed(interaction.user, reason)] });
    return;
  }

  if (interaction.commandName === 'afkmentions') {
    const list = afkMentions.get(interaction.user.id) || [];
    if (list.length === 0) {
      await interaction.reply({ content: config.afk.noMentionsText, ephemeral: true });
      return;
    }
    await interaction.reply({ embeds: [buildMentionsEmbed(interaction.user, list)] });
    return;
  }

  if (interaction.commandName === 'tambay') {
    if (!isAdministrator(interaction.member)) {
      await interaction.reply({ embeds: [buildDeniedEmbed()], ephemeral: true });
      return;
    }

    const dmText = interaction.options.getString('message');
    const targetChannel = interaction.options.getChannel('channel');
    const channelMention = `<#${targetChannel.id}>`;
    const guild = interaction.guild;

    const startingEmbed = new EmbedBuilder()
      .setColor(config.colors.tambay)
      .setAuthor({ name: config.tambay.startingTitle })
      .setDescription('Sending... 0 done')
      .setFooter({ text: config.tambay.embedFooter });

    await interaction.reply({ embeds: [startingEmbed] });

    const members = await guild.members.fetch();
    const humanMembers = [...members.values()].filter((m) => !m.user.bot);

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < humanMembers.length; i += TAMBAY_BATCH_SIZE) {
      const batch = humanMembers.slice(i, i + TAMBAY_BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map((member) => {
          const personalizedText = dmText
            .replaceAll('{user}', member.user.username)
            .replaceAll('{channel}', channelMention)
            .replaceAll('{server}', guild.name);

          const dmEmbed = new EmbedBuilder()
            .setColor(config.colors.tambay)
            .setAuthor({ name: config.tambay.embedTitle })
            .setThumbnail(guild.iconURL() || null)
            .setDescription(personalizedText)
            .setFooter({ text: config.tambay.embedFooter })
            .setTimestamp();

          return member.send({ embeds: [dmEmbed] });
        })
      );

      results.forEach((r) => (r.status === 'fulfilled' ? sent++ : failed++));

      const progressEmbed = new EmbedBuilder()
        .setColor(config.colors.tambay)
        .setAuthor({ name: config.tambay.startingTitle })
        .setDescription(`Sending... **${sent + failed}/${humanMembers.length}** processed`)
        .setFooter({ text: config.tambay.embedFooter });

      await interaction.editReply({ embeds: [progressEmbed] }).catch(() => {});

      if (i + TAMBAY_BATCH_SIZE < humanMembers.length) {
        await new Promise((resolve) => setTimeout(resolve, TAMBAY_BATCH_DELAY_MS));
      }
    }

    const doneEmbed = new EmbedBuilder()
      .setColor(config.colors.welcomeBack)
      .setAuthor({ name: config.tambay.doneTitle })
      .setDescription(`Sent to **${sent}** members, failed for **${failed}** (DMs likely closed).`)
      .setFooter({ text: config.tambay.embedFooter })
      .setTimestamp();

    await interaction.editReply({ embeds: [doneEmbed] }).catch(() => {});
    return;
  }
});

client.login(process.env.DISCORD_TOKEN);
