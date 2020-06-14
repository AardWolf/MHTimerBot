
// eslint-disable-next-line no-unused-vars
const { Message } = require('discord.js');

const CommandResult = require('../interfaces/command-result');
const Logger = require('../modules/logger');
const security = require('../modules/security');
const usage = [
    'view - see current settings for this server',
    'modrole - define the role on this server for moderation level',
    'adminrole - define the role on this server for admin level',
    'prefix - change the prefix on this server',
    'timers [add|remove] [<channel>] - add or remove a channel to announce timers in',
].join('\n\t');

/**
 *
 * @param {Message} message the message that triggered the command
 * @param {string[]} tokens tokenized arguments to the command
 * @returns {Promise<CommandResult>}
 */
async function doSet(message, tokens) {
    const theResult = new CommandResult({ message, success: false });
    const guild = message.guild;
    const guildSettings = message.client.settings.guilds[guild.id];
    let reply = '';
    if (!tokens.length)
        tokens = ['view'];
    const action = tokens.shift().toLowerCase();
    if (!security.checkPerms(message.member, 'admin')) {
        reply = 'Just who do you think you are?';
    }
    else if (action === 'view' && guild) {
        // Show current settings
        reply = `\`adminrole\` - ${guildSettings.adminrole}\n`;
        reply += `\`modrole\` - ${guildSettings.modrole}`;
    }
    else if (action === 'modrole' || action === 'adminrole') {
        // Set the moderator role on this server
        const newRole = tokens.shift();
        reply = `'${newRole}' not found in this guild.`;
        if (guild.available) {
            const roleKey = guild.roles.cache.findKey(r => r.name === newRole);
            const role = guild.roles.cache.get(roleKey);
            Logger.log(`Received ${role}`);
            if (role && role.name) {
                guildSettings[action] = role.name;
                reply = `${action} set to ${role.name}`;
            }
        }
        Logger.log(`Guild: ${guild.available}\nRole ${newRole}: ${guild.roles.cache.findKey(r => r.name === newRole)}`);
        Logger.log(`Roles: ${guild.roles.cache.array()}`);
    }
    else if (action === 'timers') {
        let subAction = '';
        if (tokens.length)
            subAction = tokens.shift().toLowerCase();
        if (subAction === 'add') {
            // Next argument should be a channel reference, add it to the array of timer channels.
            const channels = message.mentions.channels.array();
            if (channels && channels.length > 0) {
                const channel = channels.shift();
                if (!channel)
                    reply = 'I don\'t think you gave me a channel to add';
                else if (channel.type !== 'text')
                    reply = `Didn't add ${channel.toString()} because it's not a text channel`;
                else if (!channel.name)
                    reply = `Didn't add ${channel.toString()} because I couldn't figure out its name`;
                else if (guildSettings.timedAnnouncementChannels.has(channel.name))
                    reply = `Didn't add ${channel.name} because it's already in the list`;
                else {
                    guildSettings.timedAnnouncementChannels.add(channel.name);
                    reply = `I added ${channel.name} but because Aard is lazy it won't be used until next restart`;
                }
            } else {
                reply = 'I only work with mentions of channels and none were mentioned';
            }
        }
        else if (subAction === 'remove') {
            // Next argument should be a channel reference, remove it from the array of timer channels.
            const channels = message.mentions.channels.array();
            if (channels && channels.length > 0) {
                const channel = channels.shift();
                if (!channel)
                    reply = 'I don\'t think you gave me a channel to remove';
                else if (!channel.name)
                    reply = `Didn't remove ${channel.toString()} because I couldn't figure out its name`;
                else if (guildSettings.timedAnnouncementChannels.has(channel.name)) {
                    guildSettings.timedAnnouncementChannels.delete(channel.name);
                    reply = `Removed ${channel.name} but because Aard is lazy it won't stop being used until next restart`;
                }
                else {
                    reply = `I didn't remove ${channel.name} because it's not in use`;
                }
            } else {
                reply = 'I only work with mentions of channels and none was mentioned';
            }
        }
        else {
            const timers = Array.from(guildSettings.timedAnnouncementChannels);
            reply = `Timer channels for this server: ${timers.join(', ')}`;
        }
    }
    else if (action === 'prefix') {
        if (tokens.length) {
            guildSettings.newBotPrefix = tokens.shift();
            reply = `New prefix for this server after the bot restarts: \`${guildSettings.newBotPrefix}\``;
        } else {
            reply = `Current prefix for this server: \`${guildSettings.botPrefix}\``;
            if (guildSettings.newBotPrefix) {
                reply += `\nAfter restart the prefix will be \`${guildSettings.newBotPrefix}\``;
            }
        }
    }
    if (reply) {
        try {
            await message.channel.send(reply, { split: true });
            theResult.replied = true;
            if (message.channel.type === 'dm') theResult.sentDm = true;
            theResult.success = true;
        } catch (err) {
            Logger.error('IAM: failed to send reply', err);
            theResult.botError = true;
        }
    }
    return theResult;
}

module.exports = {
    name: 'config',
    requiresArgs: true,
    usage: usage,
    description: 'Configure settings per server',
    execute: doSet,
    minPerm: 'admin',
};
