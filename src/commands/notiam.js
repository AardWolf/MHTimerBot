// Type-hinting imports
// eslint-disable-next-line no-unused-vars
const { Message, GuildMember, Snowflake } = require('discord.js');

const CommandResult = require('../interfaces/command-result');
const Logger = require('../modules/logger');
const { unsetHunterID, setHunterID, setHunterProperty, cleanHunters } = require('../modules/hunter-registry');
const usage = [
    'user USER - Removes the user from the registry',
    'block USER - Removes and blocks the user from re-registering, `user` undoes the block',
    'hid USER <hid> - sets a hunter ID for a user and turns on stalker mode',
    'clean - triggers a cleaning cycle to remove users no longer in the server [admin only]',
].join('\n\t');
const security = require('../modules/security');
/**
 * @param {Message} message The message that triggered the command
 * @param {string[]} tokens The arguments to the command
 */
async function doNOT_IAM(message, tokens) {
    const theResult = new CommandResult({ message, success: false });
    let reply = '';
    if (!tokens.length)
        reply = 'You have permissions to use this command but not like that.';
    else if (tokens.length === 1
        && tokens[0].toLowerCase() === 'clean'
        && security.checkPerms(message.member, 'admin'))
        reply = await cleanHunters(message);
    else {
        const subCommand = tokens.shift().toLowerCase();
        // Find the discordID to act on
        let hunter;
        if (message.mentions && message.mentions.members.first()) {
            hunter = message.mentions.members.first().id;
        }
        else if (tokens[0]) {
            hunter = message.guild.member(tokens[0]);
            if (hunter && hunter.id) {
                hunter = hunter.id;
            } else {
                reply = `I was not able to find a member for ${tokens[0]}`;
                hunter = '';
            }
        }
        if ((subCommand === 'user' || subCommand === 'remove') && hunter) {
            reply = await unsetHunterID(hunter);
        }
        else if (subCommand === 'block' && hunter) {
            reply = await setHunterProperty(hunter, 'block', 1);
        }
        else if (subCommand === 'hid' && hunter && tokens.length > 1) {
            reply = await setHunterID(hunter, tokens[1]);
        }
        else {
            const prefix = message.client.settings.botPrefix;
            reply = `I'm not sure what to do with that. Try \`${prefix} notiam\`:\n\t${usage}`;
        }
    }
    if (reply) {
        try {
            await message.channel.send(reply, { split: true });
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
