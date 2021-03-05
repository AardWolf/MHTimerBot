const Logger = require('../modules/logger');
const { initialize, getConvertibles, sendInteractiveSearchResult, 
    save, formatConvertibles } = require('../modules/mhct-lookup');
const CommandResult = require('../interfaces/command-result');

const usage = [
    '<convertible> will report stats about what is inside that convertible',
    'Example: `whatsin gilded charm` will show how much SUPER|Brie+ comes out of gilded charms, on average',
    'See Also: find; for finding mice. ifind; for finding loot drops.',
].join('\n\t');

/**
 *
 * @param {Message} message The message that triggered the action
 * @param {Array} tokens The tokens of the command
 * @returns {Promise<CommandResult>} Status of the execution
 */
async function doWHATSIN(message, tokens) {
    const theResult = new CommandResult({ message, success: false, sentDM: false });
    let reply = '';
    const opts = {};
    const urlInfo = {
        qsParams: {},
        uri: 'https://agiletravels.com/converter.php',
        type: 'item',
    };
    if (!tokens)
        reply = 'I just cannot find what you\'re looking for (since you didn\'t tell me what it was).';
    else {
        const searchString = tokens.join(' ').toLowerCase();
        const all_convertibles = getConvertibles(searchString);
        if (all_convertibles && all_convertibles.length) {
            // We have multiple options, show the interactive menu
            urlInfo.qsParams = opts;
            sendInteractiveSearchResult(all_convertibles, message.channel, formatConvertibles,
                ['dm', 'group'].includes(message.channel.type), urlInfo, searchString);
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = ['dm', 'group'].includes(message.channel.type);
        } else {
             
            reply = `I don't know anything about "${searchString}"`;
            
        }
    }
    if (reply) {
        try {
            // Note that a lot of this is handled by sendInteractiveSearchResult
            Logger.log(`Reply size: ${reply.length}`);
            await message.channel.send(reply, { split: { prepend: '```\n', append: '\n```' } });
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = ['dm', 'group'].includes(message.channel.type);
        } catch (err) {
            Logger.error('WHATSIN: failed to send reply', err);
            theResult.botError = true;
        }
    }
    return theResult;

}

module.exports = {
    name: 'whatsin',
    args: true,
    usage: usage,
    description: 'Check what is inside a convertable',
    canDM: true,
    aliases: [ 'convert', 'inside' ],
    execute: doWHATSIN,
    initialize: initialize,
    save: save,
};