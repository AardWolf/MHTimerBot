// Type-hinting imports
// eslint-disable-next-line no-unused-vars
const { Message, Util } = require('discord.js');

const CommandResult = require('../interfaces/command-result');
const Logger = require('../modules/logger');
const { unsetHunterID, setHunterID, setHunterProperty, cleanHunters } = require('../modules/hunter-registry');
const security = require('../modules/security');

const usage = [
    'user USER - Removes the user from the registry',
    'block USER - Removes and blocks the user from re-registering, `user` undoes the block',
    'hid USER <hid> - sets a hunter ID for a user and turns on stalker mode',
    'clean - triggers a cleaning cycle to remove users no longer in the server [admin only]',
].join('\n\t');

/**
 * @param {Message} message The message that triggered the command
 * @param {string[]} tokens The arguments to the command
 */
async function doNOT_IAM(message, tokens) {
    const theResult = new CommandResult({ message, success: false });
    let reply = '';
    if (!tokens.length)
        reply = 'You have permissions to use this command but not like that.';
    else if (tokens.length === 1 && tokens[0].toLowerCase() === 'clean') {
        if (security.checkPerms(message.member, 'admin')) {
            reply = cleanHunters(message);
        } else {
            Logger.log(`NOTIAM: Unauthorized use of "clean" command by "${message.author.tag}" (ID ${message.author.id})`);
            reply = `I'm sorry ~Dave~ ${message.member.displayName}, I'm afraid I can't do that.`;
        }
    }
    else {
        const subCommand = tokens.shift().toLowerCase();
        // Find the discordID to act on.
        let hunter;
        if (message.mentions && message.mentions.members.first()) {
            hunter = message.mentions.members.first().id;
        }
        else if (tokens[0]) {
            hunter = message.guild.members.cache.get(tokens[0])?.id;
            if (!hunter) {
                reply = `I was not able to find a member for ${tokens[0]}`;
            }
        }

        if (hunter) {
            if (subCommand === 'user' || subCommand === 'remove') {
                reply = unsetHunterID(hunter);
            }
            else if (subCommand === 'block') {
                reply = setHunterProperty(hunter, 'block', 1);
            }
            else if (subCommand === 'hid' && tokens.length > 1) {
                reply = setHunterID(hunter, tokens[1]);
            }
            else {
                const prefix = message.client.settings.botPrefix;
                reply = `I'm not sure what to do with that. Try \`${prefix} notiam\`:\n\t${usage}`;
            }
        }
    }
    if (reply) {
        try {
            for (const msg of Util.splitMessage(reply)) {
                await message.channel.send(msg);
            }
            theResult.replied = true;
            theResult.success = true;
        } catch (err) {
            Logger.error('NOTIAM: failed to send reply', err);
            theResult.botError = true;
        }
    }
    return theResult;
}

module.exports = {
    name: 'notiam',
    requiresArgs: true,
    usage: usage,
    description: 'Manage hunter registry for users',
    execute: doNOT_IAM,
    canDM: false,
    minPerm: 'mod',
};
