
// eslint-disable-next-line no-unused-vars
const { Message } = require('discord.js');

const CommandResult = require('../interfaces/command-result');
const Logger = require('../modules/logger');
// const security = require('../modules/security');
const usage = [
    'view - see current settings for this server',
    'modrole - define the role on this server for moderation level',
    'adminrole - define the role on this server for admin level',
    'prefix - change the prefix on this server',
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
    let reply = '';
    if (!tokens.length)
        tokens = ['view'];
    const action = tokens.shift().toLowerCase();
    if (action === 'view' && guild) {
        // Show current settings
        reply = `\`adminrole\` - ${message.client.settings.guilds[guild.id].adminrole}\n`;
        reply += `\`modrole\` - ${message.client.settings.guilds[guild.id].modrole}`;
    }
    if (action === 'modrole') {
        // Set the moderator role on this server
    }
    if (action === 'adminrole') {
        // Set the admin role on this server
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
