// eslint-disable-next-line no-unused-vars
const { Message, Util } = require('discord.js');

const CommandResult = require('../interfaces/command-result');
const { isDMChannel } = require('../modules/channel-utils');
const Logger = require('../modules/logger');
const { initialize, extractEventFilter, getMice, formatMice, sendInteractiveSearchResult,
    listFilters, getLoot, formatLoot, save } = require('../modules/mhct-lookup');

/**
 *
 * @param {Message} message The message that triggered the action
 * @param {string[]} userArgs The tokens of the command
 * @returns {Promise<CommandResult>} Status of the execution
 */
async function doFIND(message, userArgs) {
    const theResult = new CommandResult({ message, success: false, sentDM: false });
    let reply = '';
    const opts = {};
    const urlInfo = {
        qsParams: {},
        uri: 'https://www.mhct.win/attractions.php',
        type: 'mouse',
    };
    if (!userArgs)
        reply = 'I just cannot find what you\'re looking for (since you didn\'t tell me what it was).';
    else {
        const { tokens, filter } = extractEventFilter(userArgs);
        // Set the filter if it's requested.
        if (filter) {
            opts.timefilter = filter.code_name;
        }

        // Figure out what they're searching for.
        if (tokens[tokens.length - 1].toLowerCase() === 'mouse') {
            tokens.pop();
        }
        const searchString = tokens.join(' ').toLowerCase();
        const all_mice = getMice(searchString, message.client.nicknames.get('mice'));
        if (all_mice && all_mice.length) {
            // We have multiple options, show the interactive menu.
            urlInfo.qsParams = opts;
            sendInteractiveSearchResult(all_mice, message.channel, formatMice,
                isDMChannel(message.channel), urlInfo, searchString);
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = isDMChannel(message.channel);
        } else {
            const all_loot = getLoot(searchString, message.client.nicknames.get('loot'));
            if (all_loot && all_loot.length) {
                // We have multiple options, show the interactive menu.
                urlInfo.qsParams = opts;
                urlInfo.type = 'item';
                urlInfo.uri = 'https://www.mhct.win/loot.php';
                sendInteractiveSearchResult(all_loot, message.channel, formatLoot,
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
            // Note that a lot of this is handled by sendInteractiveSearchResult.
            for (const msg of Util.splitMessage(reply, { prepend: '```\n', append: '\n```' })) {
                await message.channel.send(msg);
            }
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = isDMChannel(message.channel);
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
    save: save,
};
