// eslint-disable-next-line no-unused-vars
const { Message, Util } = require('discord.js');

const CommandResult = require('../interfaces/command-result');
const { isDMChannel } = require('../modules/channel-utils');
const Logger = require('../modules/logger');
const { getFilter, getLoot, formatLoot,
    sendInteractiveSearchResult, listFilters, getMice, formatMice } = require('../modules/mhct-lookup');

/**
 *
 * @param {Message} message The message that triggered the action
 * @param {string[]} tokens The tokens of the command
 * @returns {Promise<CommandResult>} Status of the execution
 */
async function doIFIND(message, tokens) {
    const theResult = new CommandResult({ message, success: false, sentDM: false });
    let reply = '';
    const opts = {};
    const urlInfo = {
        qsParams: {},
        uri: 'https://www.mhct.win/loot.php',
        type: 'item',
    };
    if (!tokens)
        reply = 'I just cannot find what you\'re looking for (since you didn\'t tell me what it was).';
    else {
        // Set the filter if it's requested.
        if (tokens.includes('-e')) {
            const introducerIndex = tokens.findIndex((token) => token === '-e');
            // The index of the filter term must immediately follow the introducer token.
            const filterIndex = introducerIndex + 1;
            let spliceCount = 1;
            if (filterIndex < tokens.length) {
                const filter = getFilter(tokens[filterIndex]);
                if (filter && tokens.length > 2) {
                    opts.timefilter = filter.code_name;
                    ++spliceCount;
                }
            }
            // Remove the processed tokens.
            tokens.splice(introducerIndex, spliceCount);
        }

        // Figure out what they're searching for (remove mouse at the end in case of fallthrough)
        if (tokens[tokens.length - 1].toLowerCase() === 'mouse') {
            tokens.pop();
        }
        const searchString = tokens.join(' ').toLowerCase();
        // TODO: When I put the reaction menu back it goes here
        const all_loot = getLoot(searchString, message.client.nicknames.get('loot'));
        if (all_loot && all_loot.length) {
            // We have multiple options, show the interactive menu
            urlInfo.qsParams = opts;
            sendInteractiveSearchResult(all_loot, message.channel, formatLoot,
                isDMChannel(message.channel), urlInfo, searchString);
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = isDMChannel(message.channel);
        } else {
            const all_mice = getMice(searchString, message.client.nicknames.get('mice'));
            if (all_mice && all_mice.length) {
                // We have multiple options, show the interactive menu
                urlInfo.qsParams = opts;
                urlInfo.type = 'mouse';
                urlInfo.uri = 'https://www.mhct.win/attractions.php';
                sendInteractiveSearchResult(all_mice, message.channel, formatMice,
                    isDMChannel(message.channel), urlInfo, searchString);
                theResult.replied = true;
                theResult.success = true;
                theResult.sentDM = isDMChannel(message.channel);
            } else {
                reply = `I don't know anything about "${searchString}"`;
            }
        }
    }
    if (reply) {
        try {
            // Note that a lot of this is handled by sendInteractiveSearchResult
            for (const msg of Util.splitMessage(reply, { prepend: '```\n', append: '\n```' })) {
                await message.channel.send(msg);
            }
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = isDMChannel(message.channel);
        } catch (err) {
            Logger.error('IFIND: failed to send reply', err);
            theResult.botError = true;
        }
    }
    return theResult;

}


function helpFind() {
    let reply = '-mh find [filter] loot:\nFind the drop rates for loot (nicknames allowed, filters optional).\n';
    reply += 'Known filters: `current`, ' + listFilters();
    return reply;
}

// initialize and save are in find.js
module.exports = {
    name: 'ifind',
    args: true,
    usage: 'Coming Soon',
    description: 'Find items sorted by their drop rates',
    canDM: true,
    helpFunction: helpFind,
    execute: doIFIND,
};

