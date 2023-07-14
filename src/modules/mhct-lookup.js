// eslint-disable-next-line no-unused-vars
const { Message, MessageEmbed, MessageReaction, Util, TextChannel } = require('discord.js');
const { DateTime, Duration } = require('luxon');
const fetch = require('node-fetch');
const { firstBy } = require('thenby');
const csv_parse = require('csv-parse');

const DatabaseFilter = require('../models/dbFilter');
const { calculateRate, prettyPrintArrayAsString, intToHuman, integerComma } = require('../modules/format-utils');
const Logger = require('../modules/logger');
const { getSearchedEntity } = require('../modules/search-helpers');

const refresh_rate = Duration.fromObject({ minutes: 30 });
const refresh_list = {
    mouse: DateTime.utc().minus(refresh_rate),
    loot: DateTime.utc().minus(refresh_rate),
    filter: DateTime.utc().minus(refresh_rate),
    convertible: DateTime.utc().minus(refresh_rate),
    minluck: DateTime.utc().minus(refresh_rate),
};
/** @type {NodeJS.Timeout[]} Stored setInterval timers, to be cleaned up during shutdown. */
const intervals = [];
/** @type {DatabaseFilter[]} Database filters, populated by mhct.win/filters.php */
const filters = [];
const mice = [];
const loot = [];
const convertibles = [];
const minlucks = {};
let someone_initialized = false;

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

const powerFlags = ['Arcane', 'Draconic', 'Forgotten', 'Hydro', 'Parental', 'Physical', 'Shadow',
    'Tactical', 'Law', 'Rift'];

// Default but overwrite with guild-level config
const powerEmoji = {
    'arcane': 'Arcane',
    'draconic': 'Draconic',
    'forgotten': 'Forgotten',
    'hydro': 'Hydro',
    'parental': 'Parental',
    'physical': 'Physical',
    'shadow': 'Shadow',
    'tactical': 'Tactical',
    'law': 'Law',
    'rift': 'Rift',
};

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
async function sendInteractiveSearchResult(searchResults, channel, dataCallback, isDM, urlInfo, searchInput) {
    // Associate each search result with a "numeric" emoji.
    searchResults.slice(0, emojis.length);
    const matches = searchResults.map((sr, i) => ({ emojiId: emojis[i].id, match: sr }));
    // Construct a MessageEmbed with the search result information, unless this is for a PM with a single response.
    const embed = new MessageEmbed({
        title: `Search Results for '${searchInput}'`,
        thumbnail: { url: 'https://cdn.discordapp.com/emojis/867110562617360445.png' }, // :clue:
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
        : { embeds: [embed] };

    const executeCallback = async (asDM, entity) => {
        let result = '';
        try {
            result = await dataCallback(asDM, entity, urlInfo.qsParams);
        } catch (err) {
            Logger.error(`SendInteractive: error executing data callback for "${entity.value}"`, err);
            return `Sorry, I had an issue looking up "${entity.value}"`;
        }
        return result ? result : `Sorry, I didn't find anything when looking up "${entity.value}"`;
    };

    const sendResponse = async (ctx, text, errMsg) => {
        try {
            for (const content of Util.splitMessage(text, { prepend: '```', append: '```' })) {
                // splitMessage going away: https://github.com/discordjs/discord.js/issues/7674#issuecomment-1073273262
                await ctx.send({ content });
            }
        } catch (sendError) {
            Logger.error(`SendInteractive: ${errMsg}`, sendError);
        }
    };

    /**
     * Enable users to react to the given message to get detailed DB results for their selection.
     * @param {Message} msg The bot's interactive query message
     */
    const addReactivity = async (msg) => {
        const ids = matches.map((m) => m.emojiId);
        // Add a reaction listener to the message first, to eliminate latency issues in processing reactions.
        const filter = (reaction, user) => !user.bot && ids.includes(reaction.emoji.identifier);
        const rc = msg.createReactionCollector({ filter, time: 5 * 60 * 1000 });
        rc.on('collect', async (mr, user) => {
            // Fetch the response and DM it to the user.
            const entity = matches.find(m => m.emojiId === mr.emoji.identifier)?.match;
            if (!entity) {
                Logger.warn(`SendInteractive: Collected unexpected reaction "${mr.emoji}" from "${user.tag}"`);
                return;
            }
            // Get the DB response for the given entity.
            const result = await executeCallback(true, entity);
            await sendResponse(user, result, `Error while DMing user "${user.tag}"`);
        });
        rc.on('end', () => rc.message.delete().catch((err) => Logger.error('SendInteractive: Failed to delete interactive message', err)));
        // Add the reactions
        for (const m of matches) {
            try {
                await msg.react(m.emojiId);
            } catch (reactErr) {
                Logger.error(`SendInteractive: error adding reaction emoji ${m.emojiId}`, reactErr);
            }
        }
    };

    const sent = channel.send(searchResponse);
    if (!isDM || matches.length > 1) {
        sent.then(addReactivity);
    }

    // Always send one result to the channel.
    const query = executeCallback(isDM, matches[0].match);
    sent.then(async () => sendResponse(channel, await query, 'error responding in channel'));
}

/**
 * Formats loot into a nice table
 * @param {boolean} isDM Whether the command came as a DM
 * @param {object} loot A loot object - it has an id and a value
 * @param {object} opts Options property. It has filter and DM information
 * @returns {Promise<string>} Formatted loot table
 */
async function formatLoot(isDM, loot, opts) {
    const results = await findThing('loot', loot.id, opts);
    const no_stage = ' N/A ';
    const target_url = `<https://www.mhct.win/loot.php?item=${loot.id}&timefilter=${opts.timefilter ? opts.timefilter : 'all_time'}>`;
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
    // Sort the results by overall drop rate.
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
        return { key, label: labels[key] };
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
 * Formats mice into a nice table
 * @param {boolean} isDM Whether the command came as a DM
 * @param {object} loot A mouse object - it has an id and a value
 * @param {object} opts Options property. It has filter and DM information
 * @returns {Promise<string>} Formatted mouse AR table
 */
async function formatMice(isDM, mouse, opts) {
    const results = await findThing('mouse', mouse.id, opts);
    if (results === null) {
        const reply = 'Looks like I\'m having a bit of trouble finding your mouse right now.' ;
        return reply;
    }
    const no_stage = ' N/A ';
    const target_url = `<https://www.mhct.win/attractions.php?mouse=${mouse.id}&timefilter=${opts.timefilter ? opts.timefilter : 'all_time'}>`;
    const attracts = results.filter(mouse => mouse.total_hunts > 99)
        .map(mice => {
            return {
                location: mice.location.substring(0, 20),
                stage: mice.stage === null ? no_stage : mice.stage.substring(0, 20),
                cheese: mice.cheese.substring(0,15),
                total_hunts: intToHuman(mice.total_hunts),
                ar: mice.rate / 100,
            };
        });
    if (!attracts.length)
        return `There were no results with 100 or more hunts for ${mouse.value}, see more at ${target_url}`;
    const order = ['location', 'stage', 'cheese', 'ar', 'total_hunts'];
    const labels = { location: 'Location', stage: 'Stage', total_hunts: 'Hunts',
        ar: '/Hunt', cheese: 'Cheese' };
    // Sort the results.
    attracts.sort((a, b) => parseFloat(b.ar) - parseFloat(a.ar));
    attracts.splice(isDM ? 100 : 10);
    if (attracts.every(row => row.stage === no_stage))
        order.splice(order.indexOf('stage'), 1);
    // Column Formatting specification.
    /** @type {Object <string, ColumnFormatOptions>} */
    const columnFormatting = {};
    const headers = order.map(key => {
        columnFormatting[key] = {
            columnWidth: labels[key].length,
            alignRight: !isNaN(parseInt(attracts[0][key], 10)),
        };
        return { 'key': key, 'label': labels[key] };
    });
    // Give the numeric column proper formatting.
    // TODO: toLocaleString - can it replace integerComma too?
    columnFormatting['ar'] = {
        alignRight: true,
        isFixedWidth: true,
        suffix: '%',
        columnWidth: 7,
    };
    const minLuckString = getMinluckString(mouse.value, powerFlags, true);
    let reply = `${mouse.value} (mouse) can be found the following ways:\n\`\`\``;
    reply += prettyPrintArrayAsString(attracts, columnFormatting, headers, '=');
    reply += '```\n';
    if (minLuckString) {
        reply += minLuckString + '\n';
    }
    reply += `HTML version at: ${target_url}`;
    return reply;
}

/**
 * Formats convertibles into a nice table
 * @param {boolean} isDM Whether the command came as a DM
 * @param {object} convertible A convertible object - it has an id and a value
 * @param {object} opts Options property. It has filter and DM information
 * @returns {Promise<string>} Formatted mouse AR table
 */
async function formatConvertibles(isDM, convertible, opts) {
    const minMaxFormat = (a, b) => {
        if (!a || !b || !Number(a) || !Number(b))
            return 'N/A';
        else if(a === b)
            return integerComma(a);
        else
            return `${a}-${b}`;
    };
    const pctFormat = (opens, total_items) => {
        return Number(calculateRate(opens, total_items*100)).toFixed(2);
    };

    const results = await findThing('convertible', convertible.id, opts);
    for (const item of results) {
        item.average_qty = calculateRate(item.total, item.total_items);
    }

    const converter = results
        .map(item => {
            return {
                item: item.item.substring(0, 30),
                average_qty: item.average_qty,
                min_max: minMaxFormat(item.min_item_quantity, item.max_item_quantity),
                average_when: calculateRate(item.times_with_any, item.total_quantity_when_any),
                chance: pctFormat(item.single_opens, item.times_with_any),
                total: item.total,
                single_opens: item.single_opens,
                gold_value: item.item_gold_value 
                    ? intToHuman(item.item_gold_value * item.average_qty) : 'N/A',
            };
        });
    const order = ['item', 'average_qty', 'chance', 'min_max', 'average_when', 'gold_value'];
    const labels = {
        item: 'Item',
        average_qty: 'Per Open',
        min_max: 'Min-Max',
        chance: 'Chance',
        average_when: 'Per Slot',
        gold_value: 'MP value',
    };
    //Sort the results
    const numComparer = (a, b) => Number(a) - Number(b);
    converter.sort(
        firstBy('average_qty', { cmp: numComparer, direction: 'desc' })
            .thenBy('chance', { cmp: numComparer, direction: 'desc' })
            .thenBy('item'),
    );
    converter.splice(isDM ? 100 : 10);
    // Column Formatting specification.
    /** @type {Object <string, ColumnFormatOptions>} */
    const columnFormatting = {};
    const headers = order.map(key => {
        columnFormatting[key] = {
            columnWidth: labels[key].length,
            alignRight: !isNaN(parseInt(converter[0][key], 10)),
        };
        return { 'key': key, 'label': labels[key] };
    });
    // Give the numeric column proper formatting.
    columnFormatting['average_qty'] = {
        alignRight: true,
        isFixedWidth: true,
        columnWidth: 7,
        commify: true,
    };
    columnFormatting['chance'] = {
        alignRight: true,
        isFixedWidth: true,
        suffix: '%',
        columnWidth: 7,
    };
    columnFormatting['average_when'] = {
        alignRight: true,
        isFixedWidth: true,
        columnWidth: 7,
        commify: true,
    };
    columnFormatting['gold_value'] = {
        alignRight: true,
        isFixedWidth: true,
        columnWidth: 7,
        commify: true,
    };

    const total_seen = converter[0].total;
    const single_seen = converter[0].single_opens;
    const target_url = `<https://www.mhct.win/converter.php?item=${convertible.id}>`;
    const total_gold_value = results.reduce((a, item) => {
        return a + (item.item_gold_value ?? 0) * item.average_qty;
    }, 0);
    const total_sb_value = results.reduce((a, item) => {
        return a + (item.item_sb_value ?? 0) * item.average_qty;
    }, 0);

    let reply = `${convertible.value} (convertible) has the following possible contents:\n\`\`\``;
    reply += prettyPrintArrayAsString(converter, columnFormatting, headers, '=');
    reply += '```\n' + `Seen ${intToHuman(total_seen)} times, ${intToHuman(single_seen)} as single opens. `;
    if (total_gold_value > 0) {
        reply += `Gold value of tradeable items per open: ${intToHuman(total_gold_value)} (~${total_sb_value.toPrecision(3)} SB). `;
    }
    reply += `HTML version at: ${target_url}`;

    return reply;
}

/**
 * Gets the filter that matches the given string, if possible.
 * @param {string} tester String to check if it's a filter
 * @returns {DatabaseFilter|undefined} The closest matching filter, if any.
 */
function getFilter(tester) {
    // Process filter-y nicknames.
    if (!tester || typeof tester !== 'string')
        return;
    const asFilterSearchTerm = (token) => {
        if (/^3_?d/i.test(token)) return '3_days';
        if (/^3_?m/i.test(token)) return '3_months';
        if (/^all/i.test(token)) return 'alltime';
        if (token === 'current') return '1_month';
        return token;
    };
    // If there is an ongoing event, we will use that instead of the 1-month filter.
    if (tester === 'current') {
        const currentEvent = filters.find((f) => f.code_name !== '1_month' && f.start_time && !f.end_time);
        if (currentEvent) return currentEvent;
    }
    const searchTerm = asFilterSearchTerm(tester);
    return getSearchedEntity(searchTerm, filters)[0];
}

/**
 * Processes the given tokens, extracting the event filter if possible.
 * @param {string[]} tokens user-specified command arguments, one of which may be a filter identifier
 * @returns {{ tokens: string[], filter: DatabaseFilter|null }} Unused tokens and the filter, if any
 */
function extractEventFilter(tokens) {
    // The filter term must immediately follow the introducer token or be the first token.
    const introducerIndex = tokens.findIndex((token) => token === '-e');
    const filterIndex = introducerIndex + 1;
    let filter = null;
    if (filterIndex < tokens.length) {
        filter = getFilter(tokens[filterIndex]);
    }

    // Construct the remaining (unused) tokens from all input tokens except the one that produced the filter
    // and the event specifier token.
    const remaining = [];
    if (filter || introducerIndex !== -1) {
        const firstSkippedIndex = Math.max(0, introducerIndex);
        if (firstSkippedIndex) {
            remaining.push(...tokens.slice(0, firstSkippedIndex));
        }
        // Add all tokens following the one used to obtain the filter.
        remaining.push(...tokens.slice(filterIndex + 1));
    } else {
        remaining.push(...tokens);
    }

    return { tokens: remaining, filter };
}

/**
 * Checks if the loot listed is one we know about. Returns the highest scoring match
 *
 * @param {string} tester The loot we're looking for
 * @param {{ [x: string]: string }} nicknames The nicknames for loot
 * @returns the first ten loots that matched
 */
function getLoot(tester, nicknames) {
    if (!tester)
        return;
    tester = `${tester}`;
    if (nicknames && (tester in nicknames) && nicknames[tester])
        tester = nicknames[tester];
    return getSearchedEntity(tester, loot);
}

/**
 * Checks if the mouse requested is one we know about. Returns the highest scoring match
 *
 * @param {string} tester The mouse we're looking for
 * @param {{ [x: string]: string }} nicknames The nicknames for mice
 * @returns The first ten mice that matched
 */
function getMice(tester, nicknames) {
    if (!tester)
        return;
    let ltester = `${tester}`.toLowerCase();
    if (nicknames && (ltester in nicknames) && nicknames[ltester])
        ltester = nicknames[ltester].toLowerCase();
    return getSearchedEntity(ltester, mice);
}

/**
 * Checks if the convertible requested is one we know about. Returns the highest scoring match
 *
 * @param {string} tester The convertible we're looking for
 * @returns The first ten convertibles that matched
 */
function getConvertibles(tester) {
    if (!tester)
        return;

    return getSearchedEntity(`${tester}`, convertibles);
}

/**
 * Finds a thing - uses MHCT searchByItem.php
 * @param {string} type Type of thing to find, supported by searchByItem.php
 * @param {int} id The MHCT numeric id of the thing to find
 * @param {object} options Search options such as filter
 * @returns {Promise<any[]|null>} An array of things it found
 */
async function findThing(type, id, options) {
    if (!type || !id)
        return [];

    // If caching is ever implemented it'd be checked here
    const qsOptions = new URLSearchParams(options);
    qsOptions.append('item_type', type);
    qsOptions.append('item_id', id);
    const url = 'https://www.mhct.win/searchByItem.php?' + qsOptions.toString();
    return await fetch(url)
        .then((response) => {
            if(response.ok){
                return response.json();
            }
            else {
                return null;
            }
        })
        .catch(err => {
            Logger.log(`findThings: Error getting item ${qsOptions.toString()} - ${err}`);
        });
}

/**
 * Initialize (or refresh) a list of items from MHCT
 * @param {'mouse'|'loot' | 'convertible'} type The type of thing to get a list of
 * @param {any[]} list The list to populate / re-populate
 */
async function getMHCTList(type, list) {
    const now = DateTime.utc();
    if (type && refresh_list[type]) {
        const next_refresh = refresh_list[type].plus(refresh_rate);
        if (now < next_refresh)
            return;
        refresh_list[type] = now;
    } else {
        Logger.log(`getMHCTList: Received a request for ${type} but I don't do that yet`);
    }
    Logger.log(`MHCT list: Getting a new ${type} list`);
    const url = `https://www.mhct.win/searchByItem.php?item_type=${type}&item_id=all`;
    await fetch(url)
        .then(response => (response.status === 200) ? response.json() : '')
        .then((body) => {
            if (body) {
                Logger.log(`MHCT: Got a new ${type} list`);
                list.splice(0, list.length);
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
            return;
    }
    refresh_list.filter = now;

    Logger.log('Filters: Requesting a new filter list.');
    const url = 'https://www.mhct.win/filters.php';
    try {
        const response = await fetch(url);
        if (response.status !== 200) {
            Logger.warn(`Filters: request returned non-200 response code "${response.status}`);
            return;
        }
        const body = await response.json();
        if (!Array.isArray(body) || !body.length) {
            Logger.warn('Filters: request body was empty or incompatible');
            return;
        }
        filters.length = 0;
        Array.prototype.push.apply(filters, body
            .filter((f) => f && typeof f.code_name === 'string')
            .map(({ code_name, ...rest }) => new DatabaseFilter(code_name, rest)));
        Logger.log(`Filters: Replaced filter list with ${filters.length} items`);
    } catch (err) {
        Logger.error('Filters: request returned error:', err);
    }
}

/**
 * Initialize (or refresh) the mouse minlucks from Selianth's spreadsheet.
 * @returns {Promise<void>}
 */
async function getMinLuck() {
    const now = DateTime.utc();
    if (refresh_list.minluck) {
        const next_refresh = refresh_list.minluck.plus(refresh_rate);
        if (now < next_refresh)
            return;
    }
    refresh_list.minluck = now;

    Logger.log('Minluck: Grabbing a fresh copy');
    const url = 'https://docs.google.com/a/google.com/spreadsheets/d/13hKjNDFTFR3rTkmQzyi3d4ZDOlQJUvTfWPDQemmFW_Y/gviz/tq?tq=select%20*&tqx=out:csv&sheet=Minlucks';
    const newMinlucks = {};
    // Set up the parser
    const parser = csv_parse({ delimiter: ',' })
        .on('readable', () => {
            let record;
            while ((record = parser.read())) {
                if (record.length < 14) {
                    Logger.log(`Minluck: Short entry found: ${record}`);
                    continue;
                }
                newMinlucks[record[0]] = {
                    'Arcane': record[4] || '∞',
                    'Draconic': record[5] || '∞',
                    'Forgotten': record[6] || '∞',
                    'Hydro': record[7] || '∞',
                    'Parental': record[8] || '∞',
                    'Physical': record[9] || '∞',
                    'Shadow': record[10] || '∞',
                    'Tactical': record[11] || '∞',
                    'Law': record[12] || '∞',
                    'Rift': record[13] || '∞',
                };
            }
        })
        .on('error', err => Logger.error(err.message));

    fetch(url).then(async (response) => {
        if (response.status !== 200) {
            throw new Error(`HTTP ${response.status}`);
        }
        const body = await response.text();
        // Pass the response to the CSV parser (after removing the header row).
        parser.write(body.split(/[\r\n]+/).splice(1).join('\n').toLowerCase());
        parser.end(() => {
            Object.assign(minlucks, newMinlucks);
            Logger.log(`Minlucks: ${Object.keys(minlucks).length} minlucks loaded.`);
        });
    }).catch(err => Logger.error('Minlucks: request for minlucks failed with error:', err));
}

/**
 * Given a mouse and an array of power types, return the minlucks that match
 * @param {string} mouse The mouse being looked up
 * @param {string[]} flags Full named power types
 * @param {boolean} shorten_flags True if the output should be reduced to one line
 * @param {object} emojiMap Key-value pairs for power type to emoji to use
 * @returns {string} The string to report to the requester
 */
function getMinluckString(mouse, flags, shorten_flag = false, emojiMap = powerEmoji) {
    let reply = '';
    if (!flags || !Array.isArray(flags))
        flags = powerFlags;
    if (!mouse || !(mouse.toLowerCase() in minlucks)) {
        reply = `Sorry, I don't know ${mouse}'s minluck values`;
    }
    else {
        // Minluck for <mouse>: <power> <num>
        const lmouse = mouse.toLowerCase();
        reply = `Minluck for __${mouse}__: `;
        const lucks = {};
        flags.forEach(flag => {
            if (minlucks[lmouse] && flag in minlucks[lmouse]) {
                if (minlucks[lmouse][flag] in lucks) {
                    lucks[minlucks[lmouse][flag]].push(flag.toLowerCase());
                } else {
                    lucks[minlucks[lmouse][flag]] = [flag.toLowerCase()];
                }
            }
        });
        const powerString = Object.keys(lucks).sort(sortMinluck).map(minluck => {
            const pString = lucks[minluck].map(power => {
                if (power in emojiMap) {
                    return emojiMap[power];
                } else {
                    return powerEmoji[power];
                }
            }).join(' ');
            // const pString = lucks[minluck].join(' ');
            return `**${minluck}**: ${pString}`;
        }).join(`${shorten_flag ? ' / ': '\n'}`);
        if (powerString) {
            reply += `\n${powerString}`;
        } else {
            reply += 'Not susceptible to those powers or something broke.';
        }
    }
    return reply;
}

/**
 * Sort function that will make strings higher than any numbers, for minluck specifically.
 * @param {*} a First value, if integer will attempt to compare against b but if not returns 1
 * @param {*} b Second value, if integer will compare against a but if not returns -1
 * @returns a-b if Integers, 1 if a is not integer, -1 if b is not integer, 0 if neither is integer
 */
function sortMinluck(a, b) {
    if (Number.isInteger(a)) {
        if (Number.isInteger(b)) {
            return a - b;
        } else {
            return -1;
        }
    } else {
        if (Number.isInteger(b)) {
            return 1;
        } else {
            return 0;
        }
    }
}

/**
 *
 * @param {string} accumulator -- the string to grow
 * @param {DatabaseFilter} current -- something with code_name as a property
 * @returns {string} the fully grown string.
 */
function code_name_reduce (accumulator, current) {
    // Empty entry? Skip it.
    if (!current?.code_name)
        return accumulator;
    // Existing items? Join with comma.
    if (accumulator) {
        return `${accumulator}, \`${current.code_name}\``;
    }
    // This is the first item in the list.
    return `\`${current.code_name}\``;
}

/**
 * Returns all known filters as a comma-separated list with back-ticks for "code" designation
 * @returns {string} Known filters, formatted for discord
 */
function listFilters() {
    return filters.reduce(code_name_reduce, '');
}

async function initialize() {
    if (someone_initialized)
        return true;
    someone_initialized = true;
    await Promise.all([
        getMHCTList('mouse', mice),
        getMHCTList('loot', loot),
        getMHCTList('convertible', convertibles),
        getFilterList(),
        getMinLuck(),
    ]);
    intervals.push(
        setInterval(() => getMHCTList('mouse', mice), refresh_rate),
        setInterval(() => getMHCTList('loot', loot), refresh_rate),
        setInterval(() => getMHCTList('convertible', convertibles), refresh_rate),
        setInterval(() => getFilterList(), refresh_rate),
        setInterval(() => getMinLuck(), refresh_rate),
    );
    Logger.log(`MHCT Initialized: Loot: ${loot.length}, mice: ${mice.length}, Convertibles: ${convertibles.length}, filters: ${filters.length}`);
    return true;
}

/**
 * Deactivate and clear all data-fetching tasks.
 * @returns {Promise<true>}
 */
async function save() {
    let timeout;
    while ((timeout = intervals.pop()))
        clearInterval(timeout);
    return true;
}

module.exports.getMHCTList = getMHCTList;
module.exports.initialize = initialize;
module.exports.findThing = findThing;
module.exports.extractEventFilter = extractEventFilter;
module.exports.getFilter = getFilter;
module.exports.getLoot = getLoot;
module.exports.getMice = getMice;
module.exports.getConvertibles = getConvertibles;
module.exports.formatLoot = formatLoot;
module.exports.formatMice = formatMice;
module.exports.formatConvertibles = formatConvertibles;
module.exports.sendInteractiveSearchResult = sendInteractiveSearchResult;
module.exports.getSearchedEntity = getSearchedEntity;
module.exports.listFilters = listFilters;
module.exports.save = save;
module.exports.getMinluckString = getMinluckString;
