// eslint-disable-next-line no-unused-vars
const { Message, Util } = require('discord.js');

const CommandResult = require('../interfaces/command-result');
const { getHunterByDiscordID, getHuntersByProperty, initialize } = require('../modules/hunter-registry');
const Logger = require('../modules/logger');

/**
 * The whois command
 * @param {Message} message Discord message that triggered the command
 * @param {string[]} tokens "Words" that followed the command in an array
 * @returns {Promise<CommandResult>}
 */
async function doWHOIS(message, tokens) {
    const theResult = new CommandResult({ message, success: false, sentDM: false });
    let reply = '';
    if (!tokens.length)
        reply = 'Who\'s who? Who\'s on first?';
    else {
        let searchType = tokens.shift().toLowerCase();
        let failed = false;
        let foundHunters = [];
        if (!isNaN(parseInt(searchType, 10))) {
            // hid lookup
            foundHunters = getHuntersByProperty('hid', searchType, 1);
            tokens.unshift(searchType);
        } else if (searchType.substring(0, 3) === 'snu' && tokens.length >= 1) {
            // snuid lookup of 1
            foundHunters = getHuntersByProperty('snuid', tokens[0], 1);
        } else if (!tokens.length) {
            // Display name or user mention lookup, so restore the "searchType",
            // which is actually the name or user mention to look up.
            // Use message text or mentions to obtain the discord ID.
            tokens.unshift(searchType);
            const member = message.mentions.members.first() || message.guild.members.cache
                .filter(member => member.displayName.toLowerCase() === tokens[0].toLowerCase()).first();
            if (member) {
                // Prevent mentioning this user in our reply.
                tokens[0] = member.displayName;
                // Ensure only registered hunters get a link in our reply.
                foundHunters = getHunterByDiscordID(member.id);
            }
        } else {
            // Rank or location lookup. tokens[] contains the terms to search.
            let search = tokens.join(' ').toLowerCase();
            if (searchType === 'in') {
                if (message.client.nicknames.get('locations')[search]) {
                    search = message.client.nicknames.get('locations')[search];
                }
                searchType = 'location';
            } else if (['rank', 'title', 'a', 'an'].includes(searchType)) {
                if (message.client.nicknames.get('ranks')[search]) {
                    search = message.client.nicknames.get('ranks')[search];
                }
                searchType = 'rank';
            } else {
                const prefix = message.client.settings.botPrefix;
                const commandSyntax = [
                    'I\'m not sure what to do with that. Try:',
                    `\`${prefix} whois [#### | <mention>]\` to look up specific hunters`,
                    `\`${prefix} whois [in <location> | a <rank>]\` to find up to 5 random new friends`,
                ];
                reply = commandSyntax.join('\n\t');
                failed = true;
            }
            if (!failed) {
                foundHunters = getHuntersByProperty(searchType, search);
            }
        }
        if (!foundHunters) {
            reply = 'No hunters matched that search';
        }
        else if (typeof(foundHunters) === 'string') {
            reply = `${tokens[0]} is https://mshnt.ca/p/${foundHunters}`;
        } else if (foundHunters.length === 0) {
            reply = 'No hunters matched that search';
        } else if (foundHunters.length === 1) {
            //TODO: Make this a reference to a user in the server.
            reply = `1 match for '${tokens.join(' ')}' is https://mshnt.ca/p/${foundHunters[0]}`;
        } else {
            // eslint-disable-next-line no-useless-escape
            reply = `${foundHunters.length} random hunters: \`${foundHunters.join('\`, \`')}\``;
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
            Logger.error('WHOIS: failed to send reply', err);
            theResult.botError = true;
        }
    }
    return theResult;
}

/**
 * Display volunteered information about known users. Handled inputs:
 * -mh whois ####                   -> hid lookup (No PM)
 * -mh whois snuid ####             -> snuid lookup (No PM)
 * -mh whois <word/@mention>        -> name lookup (No PM)
 * -mh whois in <words>             -> area lookup
 * -mh whois [rank|title|a] <words> -> random query lookup
 */
module.exports = {
    name: 'whois',
    args: true,
    usage: [
        '####                   -> hid lookup (No PM)',
        'snuid ####             -> snuid lookup (No PM)',
        '<word/@mention>        -> name lookup (No PM)',
        'in <words>             -> area lookup',
        '[rank|title|a] <words> -> random query lookup',
    ].join('\n\t'),
    description: 'Identify yourself so others can find/friend you',
    canDM: false,
    execute: doWHOIS,
    initialize: initialize,
};
