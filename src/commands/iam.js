// Type-hinting imports
// eslint-disable-next-line no-unused-vars
const { Message } = require('discord.js');

const CommandResult = require('../interfaces/command-result');
const Logger = require('../modules/logger');
const { unsetHunterID, setHunterID, setHunterProperty } = require('../modules/hunter-registry');

/**
 * @param {Message} message
 * @param {string[]} tokens
 */
async function doIAM(message, tokens) {
    const theResult = new CommandResult({ message, success: false });
    let reply = '';
    if (!tokens.length)
        reply = 'Yes, you are. Provide a hunter ID number to set that.';
    else if (tokens.length === 1 && !isNaN(parseInt(tokens[0], 10)))
        reply = setHunterID(message, tokens[0]);
    else if (tokens.length === 1 && tokens[0].toLowerCase() === 'not')
        reply = unsetHunterID(message);
    else {
        // received -mh iam <words>. The user can specify where they are hunting, their rank/title, or their in-game id.
        // Nobody should need this many tokens to specify their input, but someone is gonna try for more.
        let userText = tokens.slice(1, 10).join(' ').trim().toLowerCase();
        const userCommand = tokens[0].toLowerCase();
        if (userCommand === 'in' && userText) {
            if (message.client.nicknames.get('locations')[userText])
                userText = message.client.nicknames.get('locations')[userText];
            reply = setHunterProperty(message, 'location', userText);
        } else if (['rank', 'title', 'a'].indexOf(userCommand) !== -1 && userText) {
            if (message.client.nicknames.get('ranks')[userText])
                userText = message.client.nicknames.get('ranks')[userText];
            reply = setHunterProperty(message, 'rank', userText);
        } else if (userCommand.substring(0, 3) === 'snu' && userText)
            reply = setHunterProperty(message, 'snuid', userText);
        else {
            const prefix = message.client.settings.botPrefix;
            const commandSyntax = [
                'I\'m not sure what to do with that. Try:',
                `\`${prefix} iam ####\` to set a hunter ID.`,
                `\`${prefix} iam rank <rank>\` to set a rank.`,
                `\`${prefix} iam in <location>\` to set a location`,
                `\`${prefix} iam snuid ####\` to set your in-game user id`,
                `\`${prefix} iam not\` to unregister (and delete your data)`,
            ];
            reply = commandSyntax.join('\n\t');
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
    name: 'iam',
    requiresArgs: true,
    usage: [
        '#### - provide a number to set your hunter ID',
        'rank <rank> - identify your rank',
        'in <location> - identify where you\'re hunting / looking for friends',
        'snuid #### - sets your in-game user id',
        'not - removes you from the registry',
    ].join('\n\t'),
    description: 'Identify yourself so others can find/friend you',
    execute: doIAM,
};
