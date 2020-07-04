const Logger = require('../modules/logger');
const { initialize, getFilter, getLoot, formatLoot } = require('../modules/mhct-lookup');
const CommandResult = require('../interfaces/command-result');

/**
 *
 * @param {Message} message The message that triggered the action
 * @param {Array} tokens The tokens of the command
 * @returns {Promise<CommandResult>} Status of the execution
 */
async function doIFIND(message, tokens) {
    const theResult = new CommandResult({ message, success: false, sentDM: false });
    let reply = '';
    const opts = {};
    if (!tokens)
        reply = 'I just cannot find what you\'re looking for (since you didn\'t tell me what it was).';
    else {
        //Set the filter if it's requested
        const filter = getFilter(tokens[0]);
        if (filter && 'code_name' in filter) {
            opts.timefilter = filter.code_name;
            tokens.shift();
        }
        CommandResult.sentDM = opts.isDM;
        // Figure out what they're searching for
        const searchString = tokens.join(' ');
        // TODO: When I put the reaction menu back it goes here
        const loot = getLoot(searchString, message.client.nicknames.get('loot'));
        if (loot && 'id' in loot) {
            reply = await formatLoot(loot, opts);
            if (reply) {
                reply += '```\n' + `HTML version at: <https://mhhunthelper.agiletravels.com/?loot=${loot.id}&timefilter=${opts.timefilter ? opts.timefilter : 'all_time'}>`;
            }
            else
                reply = `There weren't enough valuable results for ${loot.value}`;
        } else {
            reply = `I don't know anything about ${searchString}`;
        }
    }
    if (reply) {
        try {
            await message.channel.send(reply, { split: { prepend: '```', append: '```' } });
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = ['dm', 'group'].includes(message.channel.type);
        } catch (err) {
            Logger.error('WHOIS: failed to send reply', err);
            theResult.botError = true;
        }
    }
    return theResult;

}

module.exports = {
    name: 'ifind',
    args: true,
    usage: 'Coming Soon',
    description: 'Find items sorted by their drop rates',
    canDM: true,
    execute: doIFIND,
    initialize: initialize,
};

// Testing area
//findThing('loot', 65, {})
//    .then(result => Logger.log(`Now is: ${JSON.stringify(result)}`));
