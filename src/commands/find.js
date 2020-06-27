const CommandResult = require('../interfaces/command-result');
const Logger = require('../modules/logger');
const mhct = require('../modules/mhct-lookup');
const { DateTime, Duration } = require('luxon');
const {
    oxfordStringifyValues,
    prettyPrintArrayAsString,
    splitString,
    timeLeft,
    unescapeEntities,
    isValidURL,
} = require('./modules/format-utils');

let known_filters = '(none known yet)';
const mouse_list = [];
/**
 * Display Mouse ARs:
 * -mh find <mouse/nickname>             -> Finds a mouse's AR
 * -mh find -e <filter> <mouse/nickname> -> Applies the
 */

/**
 * find command - find mice and their attraction rates
 * @param {Message} message Discord message that triggered the command
 * @param {Array} tokens "Words" that followed the command in an array
 * @returns {Promise<CommandResult>}
 */
async function doFind(message, tokens) {
    /**
     * Request the latest information about the valid mouse.
     * @param {boolean} canSpam Whether the long or short response should be sent back.
     * @param {DatabaseEntity} mouse The valid mouse to query for
     * @param {Object <string, string>} opts Additional querystring parameters for the request, like 'timefilter'
     * @returns {Promise<string>} The result of the lookup.
     */
    let args = tokens.join(' ').trim().toLowerCase().replace(/ mouse$/, '');
    function _getQueryResult(canSpam, mouse, opts) {
        return mhct.getQueriedData('mouse', mouse, opts).then(body => {
            // Querying succeeded. Received a JSON object (either from cache or HTTP lookup).
            // body is an array of objects with: location, stage, total_hunts, rate, cheese
            // Sort it by "rate" but only if hunts > 100
            const attractions = body.filter(setup => setup.total_hunts > 99)
                .map(setup => {
                    return {
                        location: setup.location,
                        stage: setup.stage ? setup.stage : ' N/A ',
                        total_hunts: integerComma(setup.total_hunts),
                        rate: setup.rate * 1.0 / 100,
                        cheese: setup.cheese,
                    };
                });
            if (!attractions.length)
                return `${mouse.value} either hasn't been seen enough, or something broke.`;

            // Sort that by Attraction Rate, descending.
            attractions.sort((a, b) => b.rate - a.rate);
            // Keep only the top 10 results, unless this is a DM.
            attractions.splice(!canSpam ? 10 : 100);

            // Column Formatting specification.
            /** @type {Object <string, ColumnFormatOptions>} */
            const columnFormatting = {};

            // Specify the column order.
            const order = ['location', 'stage', 'cheese', 'rate', 'total_hunts'];
            // Inspect the attractions array to determine if we need to include the stage column.
            if (attractions.every(row => row.stage === ' N/A '))
                order.splice(order.indexOf('stage'), 1);

            // Build the header row.
            const labels = { location: 'Location', stage: 'Stage', total_hunts: 'Hunts', rate: 'AR', cheese: 'Cheese' };
            const headers = order.map(key => {
                columnFormatting[key] = {
                    columnWidth: labels[key].length,
                    alignRight: !isNaN(parseInt(attractions[0][key], 10)),
                };
                return { 'key': key, 'label': labels[key] };
            });

            // Give the numeric column proper formatting.
            // TODO: toLocaleString - can it replace integerComma too?
            columnFormatting['rate'] = {
                alignRight: true,
                isFixedWidth: true,
                columnWidth: 7,
                suffix: '%',
            };

            let retStr = `${mouse.value} (mouse) can be found the following ways:\n\`\`\``;
            retStr += prettyPrintArrayAsString(attractions, columnFormatting, headers, '=');
            retStr += `\`\`\`\nHTML version at: <https://mhhunthelper.agiletravels.com/?mouse=${mouse.id}&timefilter=${opts.timefilter ? opts.timefilter : 'all_time'}>`;
            return retStr;
        }, reason => {
            // Querying failed. Received an error object / string, and possibly a response object.
            Logger.error('Mice: Lookup failed for some reason:\n', reason.error, reason.response ? reason.response.toJSON() : 'No HTTP response');
            throw new Error(`Could not process results for '${args}', AKA ${mouse.value}`);
        });
    }


    const isDM = ['dm', 'group'].includes(message.channel.type);
    const urlInfo = {
        qsParams: {},
        uri: 'https://mhhunthelper.agiletravels.com/',
        type: 'mouse',
    };

    // Deep copy the input args, in case we modify them.
    const orig_args = JSON.parse(JSON.stringify(args));
    args = mhct.removeQueryStringParams(args, urlInfo.qsParams);

    // If the input was a nickname, convert it to the queryable value.
    if (message.client.nicknames.get('mice')[args])
        args = message.client.nicknames.get('mice')[args];

    // Special case of the relic hunter RGW
    if (args.toLowerCase() === 'relic hunter') {
        findRH(message);
        return;
    }

    const matches = getSearchedEntity(args, mice);
    if (!matches.length) {
        // If this was a mouse search, try finding an item.
        if (command === 'find')
            findItem(channel, orig_args, command);
        else {
            channel.send(`'${orig_args}' not found.`);
            getItemList();
        }
    }
    else
        sendInteractiveSearchResult(matches, channel, _getQueryResult, isDM, urlInfo, args);
}

/**
 * Processes a request to find the relic hunter
 * @param {Message} message the message that triggered the command.
 */
async function findRH(message) {
    const asMessage = (location) => {
        let response = (location !== 'unknown')
            ? `Relic Hunter has been spotted in **${location}**`
            : 'Relic Hunter has not been spotted yet';
        response += ` and moves again ${timeLeft(DateTime.utc().endOf('day'))}`;
        return response;
    };
    const relic_hunter = message.client.settings.relic_hunter;
    const original_location = relic_hunter.location;
    // If we have MHCT data from today, trust it, otherwise attempt to update our known location.
    if (relic_hunter.source !== 'MHCT' || !DateTime.utc().hasSame(relic_hunter.last_seen, 'day')) {
        Logger.log(`Relic Hunter: location requested, might be "${original_location}"`);
        await getRHLocation();
        Logger.log(`Relic Hunter: location update completed, is now "${relic_hunter.location}"`);
    }

    message.channel.send(asMessage(relic_hunter.location))
        .catch((err) => Logger.error('Relic Hunter: Could not send response to Find RH request', err));
    if (relic_hunter.location !== 'unknown' && relic_hunter.location !== original_location) {
        setImmediate(remindRH, relic_hunter.location);
    }
}

module.exports = {
    name: 'find',
    args: true,
    usage: [
        '[-e <filter>] <mouse/nickname> will print the top attraction rates for the mouse, capped at 10.',
        'Use of -e <filter> is optional and adds a time filter to constrain the search.',
        `    Known filters: ${known_filters}`,
        'All attraction data is from <https://mhhunthelper.agiletravels.com/>.',
        'Help populate the database for better information!',
    ].join('\n\t'), // TODO this will almost certainly need to become a function call
    description: 'Find mice!',
    canDM: true,
    execute: doFind,
};
