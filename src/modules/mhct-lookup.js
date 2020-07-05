const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const Logger = require('../modules/logger');
const { DateTime, Duration } = require('luxon');
const { calculateRate, prettyPrintArrayAsString, intToHuman } = require('../modules/format-utils');
const { MessageEmbed } = require('discord.js');

const refresh_rate = Duration.fromObject({ minutes: 5 });
const refresh_list = {
    mouse: DateTime.utc().minus(refresh_rate),
    loot: DateTime.utc().minus(refresh_rate),
    filter: DateTime.utc().minus(refresh_rate),
};
const filters = [],
    mice = [],
    loot = [];
let someone_initialized = 0;

const emojis = [
    { id: '1%E2%83%A3', text: ':one:' },
    { id: '2%E2%83%A3', text: ':two:' },
    { id: '3%E2%83%A3', text: ':three:' },
    { id: '4%E2%83%A3', text: ':four:' },
    { id: '5%E2%83%A3', text: ':five:' },
    { id: '6%E2%83%A3', text: ':six:' },
    { id: '7%E2%83%A3', text: ':seven:' },
    { id: '8%E2%83%A3', text: ':eight:' },
    { id: '9%E2%83%A3', text: ':nine:' },
    { id: '%F0%9F%94%9F', text: ':keycap_ten:' },
];


/**
 * Construct and dispatch a reaction-enabled message for interactive "search result" display.
 *
 * @param {DatabaseEntity[]} searchResults An ordered array of objects that resulted from a search.
 * @param {TextChannel} channel The channel on which the client received the find request.
 * @param {Function} dataCallback a Promise-returning function that converts the local entity data into the desired text response.
 * @param {boolean} isDM Whether the response will be to a private message (i.e. if the response can be spammy).
 * @param {{qsParams: Object <string, string>, uri: string, type: string}} urlInfo Information about the query that returned the given matches, including querystring parameters, uri, and the type of search.
 * @param {string} searchInput a lower-cased representation of the user's input.
 */
function sendInteractiveSearchResult(searchResults, channel, dataCallback, isDM, urlInfo, searchInput) {
    // Associate each search result with a "numeric" emoji.
    const matches = searchResults.map((sr, i) => ({ emojiId: emojis[i].id, match: sr }));
    // Construct a MessageEmbed with the search result information, unless this is for a PM with a single response.
    const embed = new MessageEmbed({
        title: `Search Results for '${searchInput}'`,
        thumbnail: { url: 'https://cdn.discordapp.com/emojis/359244526688141312.png' }, // :clue:
        footer: { text: `For any reaction you select, I'll ${isDM ? 'send' : 'PM'} you that information.` },
    });

    // Pre-compute the url prefix & suffix for each search result. Assumption: single-valued querystring params.
    const urlPrefix = `${urlInfo.uri}?${urlInfo.type}=`;
    const urlSuffix = Object.keys(urlInfo.qsParams).reduce((acc, key) => `${acc}&${key}=${urlInfo.qsParams[key]}`, '');
    // Generate the description to include the reaction, name, and link to HTML data on @devjacksmith's website.
    const description = matches.reduce((acc, entity, i) => {
        const url = `${urlPrefix}${entity.match.id}${urlSuffix}`;
        const row = `\n\t${emojis[i].text}:\t[${entity.match.value}](${url})`;
        return acc + row;
    }, `I found ${matches.length === 1 ? 'a single result' : `${matches.length} good results`}:`);
    embed.setDescription(description);

    const searchResponse = (isDM && matches.length === 1)
        ? `I found a single result for '${searchInput}':`
        : embed;
    const sent = channel.send(searchResponse);
    // To ensure a sensible order of emojis, we have to await the previous react's resolution.
    if (!isDM || matches.length > 1)
        sent.then(async (msg) => {
            /** @type MessageReaction[] */
            const mrxns = [];
            for (const m of matches)
                mrxns.push(await msg.react(m.emojiId).catch(err => Logger.error(err)));
            return mrxns;
        }).then(msgRxns => {
            // Set a 5-minute listener on the message for these reactions.
            const msg = msgRxns[0].message,
                allowed = msgRxns.map(mr => mr.emoji.name),
                filter = (reaction, user) => allowed.includes(reaction.emoji.name) && !user.bot,
                rc = msg.createReactionCollector(filter, { time: 5 * 60 * 1000 });
            rc.on('collect', (mr, user) => {
                // Fetch the response and send it to the user.
                const match = matches.filter(m => m.emojiId === mr.emoji.identifier)[0];
                if (match) dataCallback(true, match.match, urlInfo.qsParams).then(
                    result => user.send(result || `Not enough quality data for ${searchInput}`, { split: { prepend: '```', append: '```' } }),
                    result => user.send(result || 'Not enough quality data to display this 4'),
                ).catch(err => Logger.error(err));
            }).on('end', () => rc.message.delete().catch(() => Logger.log('Unable to delete reaction message')));
        }).catch(err => Logger.error('Reactions: error setting reactions:\n', err));

    // Always send one result to the channel.
    sent.then(() => dataCallback(isDM, matches[0].match, urlInfo.qsParams).then(
        result => channel.send(result || `Not enough quality data for ${searchInput}`, { split: { prepend: '```\n', append: '\n```' } }),
        result => channel.send(result)),
    ).catch(err => Logger.error(err));
}

/**
 * @param {boolean} isDM Whether the command came as a DM
 * @param {Object} loot A loot object - it has an id and a value
 * @param {Object} opts Options property. It has filter and DM information
 * @returns {Promise<string>} Formatted loot table
 */
async function formatLoot(isDM, loot, opts) {
    const results = await findThing('loot', loot.id, opts);
    const no_stage = ' N/A ';
    const target_url = `<https://mhhunthelper.agiletravels.com/loot.php?item=${loot.id}&timefilter=${opts.timefilter ? opts.timefilter : 'all_time'}>`;
    const drops = results.filter(loot => loot.total_catches > 99)
        .map(loot => {
            return {
                location: loot.location.substring(0, 20),
                stage: loot.stage === null ? no_stage : loot.stage.substring(0, 20),
                cheese: loot.cheese.substring(0,15),
                total_catches: intToHuman(loot.total_catches),
                dr: calculateRate(loot.total_catches, loot.total_drops),
                pct: loot.drop_pct,
            };
        });
    if (!drops.length)
        return `There were no results with 100 or more catches for ${loot.value}, see more at ${target_url}`;
    const order = ['location', 'stage', 'cheese', 'pct', 'dr', 'total_catches'];
    const labels = { location: 'Location', stage: 'Stage', total_catches: 'Catches',
        dr: '/Catch', cheese: 'Cheese', pct: 'Chance' };
    //Sort the results
    drops.sort((a, b) => parseFloat(b.dr) - parseFloat(a.dr));
    drops.splice(isDM ? 100 : 10);
    if (drops.every(row => row.stage === no_stage))
        order.splice(order.indexOf('stage'), 1);
    // Column Formatting specification.
    /** @type {Object <string, ColumnFormatOptions>} */
    const columnFormatting = {};
    const headers = order.map(key => {
        columnFormatting[key] = {
            columnWidth: labels[key].length,
            alignRight: !isNaN(parseInt(drops[0][key], 10)),
        };
        return { 'key': key, 'label': labels[key] };
    });
    // Give the numeric column proper formatting.
    // TODO: toLocaleString - can it replace integerComma too?
    columnFormatting['dr'] = {
        alignRight: true,
        isFixedWidth: true,
        columnWidth: 7,
    };
    columnFormatting['pct'] = {
        alignRight: true,
        isFixedWidth: true,
        suffix: '%',
        columnWidth: 7,
    };
    let reply = `${loot.value} (loot) can be found the following ways:\n\`\`\``;
    reply += prettyPrintArrayAsString(drops, columnFormatting, headers, '=');
    reply += '```\n' + `HTML version at: ${target_url}`;
    return reply;
}


/**
 * Return a sorted list of approximate matches to the given input and container
 *
 * @param {string} input The text to match against
 * @param {Array} values An array of objects with a lowerValue property.
 * @returns {Array <number>[]} Up to 10 indices and their search score.
 */
function getSearchedEntity(input, values) {
    if (!input.length || !Array.isArray(values) || !values.length)
        return [];

    const matches = values.filter(v => v.lowerValue.includes(input)).map(v => {
        return { entity: v, score: v.lowerValue.indexOf(input) };
    });
    matches.sort((a, b) => {
        const r = a.score - b.score;
        // Sort lexicographically if the scores are equal.
        return r ? r : a.entity.value.localeCompare(b.entity.value, { sensitivity: 'base' });
    });
    // Keep only the top 10 results.
    matches.splice(10);
    return matches.map(m => m.entity);
}

/**
 * Determines if a string is a filter
 * @param {String} tester String to check if it's a filter
 * @returns {boolean} whether the filter is known
 */
function getFilter(tester) {
    // Process filter-y nicknames
    if (tester.startsWith('3'))
        tester = '3_days';
    else if (tester.startsWith('all'))
        tester = 'alltime';
    else if (tester === 'current') {
        tester = '1_month';
        for (const filter of filters) {
            if (filter.start_time && !filter.end_time && filter.code_name !== tester) {
                tester = filter.code_name;
                break;
            }
        }
    }
    return getSearchedEntity(tester, filters)[0];
}

/**
 * Checks if the loot listed is one we know about. Returns the highest scoring match
 *
 * @param {string} tester The loot we're looking for
 * @param {Array} nicknames The nicknames for loot
 * @returns {Array<number>} The first loot that matched
 */
function getLoot(tester, nicknames) {
    if (nicknames && (tester in nicknames) && nicknames[tester])
        tester = nicknames[tester];
    return getSearchedEntity(tester, loot);
}

/**
 * Finds a thing - uses MHCT searchByItem.php
 * @param {String} type Type of thing to find, supported by searchByItem.php
 * @param {int} id The MHCT numeric id of the thing to find
 * @param {Object} options Search options such as filter
 * @returns {Array} An array of things it found
 */
async function findThing(type, id, options) {
    if (!type || !id)
        return [];

    // If caching is ever implemented it'd be checked here
    const qsOptions = new URLSearchParams(options);
    qsOptions.append('item_type', type);
    qsOptions.append('item_id', id);
    const url = 'https://mhhunthelper.agiletravels.com/searchByItem.php?' + qsOptions.toString();
    return await fetch(url)
        .then(response => response.json())
        .catch(err => {
            Logger.log(`findThings: Error getting item ${qsOptions.toString()} - ${err}`);
        });
}

/**
 * Process args for flags, like the -e event filter. Returns the args without any processed flags.
 *
 * @param {string} args a lowercased string of search criteria that may contain flags that map to querystring parameters
 * @param {Object <string, string>} qsParams an object which will have any discovered querystring parameters added
 * @returns {string} args, after stripping out any tokens associated with querystring parameters.
 */
function removeQueryStringParams(args, qsParams) {
    const tokens = args.split(/\s+/);
    if (tokens.length > 2) {
        if (tokens[0] === '-e') {
            // Allow shorthand specifications instead of only the literal `last3days`.
            // TODO: discover valid shorthands on startup.
            // TODO: parse flag and argument even if given after the query.
            switch (tokens[1].toLowerCase()) {
                case '3':
                case '3d':
                    tokens[1] = '3_days';
                    break;
                case 'current':
                    // Default to last 3 days, but if there is an ongoing event, use that instead.
                    tokens[1] = '1_month';
                    for (const filter of filters) {
                        if (filter.start_time && !filter.end_time && filter.code_name !== tokens[1]) {
                            tokens[1] = filter.code_name;
                            break;
                        }
                    }
                    break;
            }
            qsParams.timefilter = tokens[1].toString();
            tokens.splice(0, 2);
        }
        // TODO: other querystring params (once supported).
        args = tokens.join(' ');
    }
    return args;
}

/**
 * Initialize (or refresh) a list of items from MHCT
 * @param {'mouse'|'loot'} type The type of thing to get a list of
 * @param {Array} list The list to populate / re-populate
 */
async function getMHCTList(type, list) {
    const now = DateTime.utc();
    if (type && refresh_list[type]) {
        const next_refresh = refresh_list[type].plus(refresh_rate);
        if (now < next_refresh)
            return [];
        refresh_list[type] = now;
    } else {
        Logger.log(`getMHCTList: Received a request for ${type} but I don't do that yet`);
    }
    Logger.log(`MHCT list: Getting a new ${type} list`);
    const url = `https://mhhunthelper.agiletravels.com/searchByItem.php?item_type=${type}&item_id=all`;
    await fetch(url)
        .then(response => (response.status === 200) ? response.json() : '')
        .then((body) => {
            if (body) {
                Logger.log(`MHCT: Got a new ${type} list`);
                Array.prototype.push.apply(list, body);
                list.forEach(item => item.lowerValue = item.value.toLowerCase());
            }
        });
    Logger.log(`MHCT List: ${type} was ${list.length} long`);
}

/**
 * Initialize (or refresh) the known filters from @devjacksmith's tools.
 * @returns {Promise<void>}
 */
async function getFilterList() {
    const now = DateTime.utc();
    if (refresh_list.filter) {
        const next_refresh = refresh_list.filter.plus(refresh_rate);
        if (now < next_refresh)
            return Promise.resolve();
    }
    refresh_list.filter = now;

    Logger.log('Filters: Requesting a new filter list.');
    const url = 'https://mhhunthelper.agiletravels.com/filters.php';
    return fetch(url).then(response => (response.status === 200) ? response.json() : '').then((body) => {
        if (body) {
            Logger.log('Filters: Got a new filter list');
            filters.length = 0;
            Array.prototype.push.apply(filters, body);
            filters.forEach(filter => filter.lowerValue = filter.code_name.toLowerCase());
        } else {
            Logger.warn('Filters: request returned non-200 response');
        }
    }).catch(err => Logger.error('Filters: request returned error:', err));
}

async function initialize() {
    if (someone_initialized)
        return true;
    someone_initialized = true;
    await getMHCTList('mouse', mice);
    await getMHCTList('loot', loot);
    await getFilterList();
    Logger.log(`MHCT Initialized: Loot: ${loot.length}, mice: ${mice.length}, filters: ${filters.length}`);
    return true;
}

module.exports.removeQueryStringParams = removeQueryStringParams;
module.exports.getMHCTList = getMHCTList;
module.exports.initialize = initialize;
module.exports.findThing = findThing;
module.exports.getFilter = getFilter;
module.exports.getLoot = getLoot;
module.exports.formatLoot = formatLoot;
module.exports.sendInteractiveSearchResult = sendInteractiveSearchResult;
