const Logger = require('../modules/logger');
const { initialize, getFilter, getMice, formatMice, sendInteractiveSearchResult, 
    listFilters, getLoot, formatLoot } = require('../modules/mhct-lookup');
const CommandResult = require('../interfaces/command-result');

/**
 *
 * @param {Message} message The message that triggered the action
 * @param {Array} tokens The tokens of the command
 * @returns {Promise<CommandResult>} Status of the execution
 */
async function doFIND(message, tokens) {
    const theResult = new CommandResult({ message, success: false, sentDM: false });
    let reply = '';
    const opts = {};
    const urlInfo = {
        qsParams: {},
        uri: 'https://mhhunthelper.agiletravels.com/',
        type: 'mouse',
    };
    if (!tokens)
        reply = 'I just cannot find what you\'re looking for (since you didn\'t tell me what it was).';
    else {
        //Set the filter if it's requested
        if (tokens[0] === '-e')
            tokens.shift();
        const filter = getFilter(tokens[0]);
        if (filter && 'code_name' in filter) {
            opts.timefilter = filter.code_name;
            tokens.shift();
        }
        // Figure out what they're searching for
        const searchString = tokens.join(' ');
        const all_mice = getMice(searchString, message.client.nicknames.get('mouse'));
        if (all_mice && all_mice.length) {
            // We have multiple options, show the interactive menu
            urlInfo.qsParams = opts;
            sendInteractiveSearchResult(all_mice, message.channel, formatMice,
                ['dm', 'group'].includes(message.channel.type), urlInfo, searchString);
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = ['dm', 'group'].includes(message.channel.type);
        } else {
            const all_loot = getLoot(searchString, message.client.nicknames.get('loot'));
            if (all_loot && all_loot.length) {
                // We have multiple options, show the interactive menu
                urlInfo.qsParams = opts;
                sendInteractiveSearchResult(all_loot, message.channel, formatLoot,
                    ['dm', 'group'].includes(message.channel.type), urlInfo, searchString);
                theResult.replied = true;
                theResult.success = true;
                theResult.sentDM = ['dm', 'group'].includes(message.channel.type);
            } else {
                reply = `I don't know anything about "${searchString}"`;
            }
        }
    }
    if (reply) {
        try {
            // Note that a lot of this is handled by sendInteractiveSearchResult
            await message.channel.send(reply, { split: { prepend: '```\n', append: '\n```' } });
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = ['dm', 'group'].includes(message.channel.type);
        } catch (err) {
            Logger.error('FIND: failed to send reply', err);
            theResult.botError = true;
        }
    }
    return theResult;

}

function helpFind() {
    let reply = '-mh find [filter] mouse:\nFind the attraction rates for a mouse (nicknames allowed, filters optional).\n';
    reply += 'Known filters: `current`, ' + listFilters();
    return reply;
}

module.exports = {
    name: 'find',
    args: true,
    usage: 'Coming Soon',
    helpFunction: helpFind,
    description: 'Find items sorted by their drop rates',
    canDM: true,
    aliases: [ 'mfind' ],
    execute: doFIND,
    initialize: initialize,
};

// Testing area
//findThing('loot', 65, {})
//    .then(result => Logger.log(`Now is: ${JSON.stringify(result)}`));
