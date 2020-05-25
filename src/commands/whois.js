const CommandResult = require('../interfaces/command-result');
const { findHunter, getHuntersByProperty } = require('../modules/hunter-registry');
const Logger = require('../modules/logger');

async function WHOIS(message, tokens) {
    const theResult = new CommandResult({ message, success: false });
    let reply = '';
    if (!tokens.length)
        reply = 'Who\'s who? Who\'s on first?';
    else {
        let searchType = tokens.shift().toLowerCase();
        let failed = false;
        if (!isNaN(parseInt(searchType, 10))) {
            // hid lookup of 1 or more IDs.
            tokens.unshift(searchType);
            findHunter(message, tokens, 'hid');
            theResult.replied = true;
            theResult.success = true;
        } else if (searchType.substring(0, 3) === 'snu' && tokens.length >= 1) {
            // snuid lookup of 1 or more IDs.
            findHunter(message, tokens, 'snuid');
            theResult.replied = true;
            theResult.success = true;
        } else if (!tokens.length) {
            // Display name or user mention lookup.
            tokens.unshift(searchType);
            findHunter(message, tokens, 'name');
            theResult.replied = true;
            theResult.success = true;
        } else {
            // Rank or location lookup. tokens[] contains the terms to search
            let search = tokens.join(' ').toLowerCase();
            if (searchType === 'in') {
                if (message.client.nicknames.get('locations')[search]) {
                    search = message.client.nicknames.get('locations')[search];
                }
                searchType = 'location';
            } else if (['rank', 'title', 'a', 'an'].indexOf(searchType) !== -1) {
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
                //TODO remove the array concat that was added because I got frustrated with tests
                const hunters = [].concat(getHuntersByProperty(message, searchType, search) || []);
                reply = hunters.length
                    // eslint-disable-next-line no-useless-escape
                    ? `${hunters.length} random hunters: \`${hunters.join('\`, \`')}\``
                    : `I couldn't find any hunters with \`${searchType}\` matching \`${search}\``;
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
    execute: WHOIS,
};
