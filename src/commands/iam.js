// Type-hinting imports
// eslint-disable-next-line no-unused-vars
const { Message, Util } = require('discord.js');

const CommandResult = require('../interfaces/command-result');
const Logger = require('../modules/logger');
const { unsetHunterID, setHunterID, setHunterProperty, initialize, save, getHunterProperties } = require('../modules/hunter-registry');
const usage = [
    '#### - provide a number to set your hunter ID (**Must be done first**)',
    'rank <rank> - identify your rank',
    'in <location> - identify where you\'re hunting / looking for friends',
    'snuid #### - sets your in-game user id',
    'not - removes you from the registry',
    'status - shows you what the bot knows about you',
    'auto - turns on automatic updating of rank and location. Set either of those to turn it off.',
].join('\n\t');

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
        reply = await setHunterID(message.author.id, tokens[0]);
    else if (tokens.length === 1 && tokens[0].toLowerCase() === 'not')
        reply = unsetHunterID(message.author.id);
    else if (tokens.length === 1 && tokens[0].toLowerCase() === 'auto')
        reply = setHunterProperty(message.author.id, 'manual', false);
    else if (tokens.length === 1 && tokens[0].toLowerCase() === 'status')
        reply = getHunterProperties(message.author.id);
    else {
        // received -mh iam <words>. The user can specify where they are hunting, their rank/title, or their in-game id.
        // Nobody should need this many tokens to specify their input, but someone is gonna try for more.
        let userText = tokens.slice(1, 10).join(' ').trim().toLowerCase();
        const userCommand = tokens[0].toLowerCase();
        if (userCommand === 'in' && userText) {
            if (message.client.nicknames.get('locations')[userText])
                userText = message.client.nicknames.get('locations')[userText];
            reply = setHunterProperty(message.author.id, 'location', userText);
        } else if (['rank', 'title', 'a', 'an'].indexOf(userCommand) !== -1 && userText) {
            if (message.client.nicknames.get('ranks')[userText])
                userText = message.client.nicknames.get('ranks')[userText];
            reply = setHunterProperty(message.author.id, 'rank', userText);
        } else if (userCommand.substring(0, 3) === 'snu' && userText)
            reply = setHunterProperty(message.author.id, 'snuid', userText);
        else {
            const prefix = message.client.settings.botPrefix;
            reply = `I'm not sure what to do with that. Try \`${prefix} iam\`:\n${usage}`;
        }
    }
    if (reply) {
        try {
            for (const msg of Util.splitMessage(reply)) {
                await message.channel.send(msg);
            }
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
    usage: usage,
    description: 'Identify yourself so others can find/friend you',
    execute: doIAM,
    initialize: initialize,
    save: save,
};
