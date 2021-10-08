const fetch = require('node-fetch');
const Logger = require('../modules/logger');
const { DateTime, Duration } = require('luxon');
const { calculateRate, prettyPrintArrayAsString, intToHuman, integerComma } = require('../modules/format-utils');
const { getSearchedEntity } = require('../modules/search-helpers');
const { MessageEmbed, Util } = require('discord.js');
const { firstBy } = require('thenby');
const csv_parse = require('csv-parse');

const refresh_rate = Duration.fromObject({ minutes: 30 });
const refresh_list = {
    mouse: DateTime.utc().minus(refresh_rate),
    loot: DateTime.utc().minus(refresh_rate),
    filter: DateTime.utc().minus(refresh_rate),
    convertible: DateTime.utc().minus(refresh_rate),
    minluck: DateTime.utc().minus(refresh_rate),
};
const intervals = [];
const filters = [],
    mice = [],
    loot = [],
    convertibles = [];
const minlucks = {};
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
                rc = msg.createReactionCollector({ filter, time: 5 * 60 * 1000 });
            rc.on('collect', (mr, user) => {
                // Fetch the response and send it to the user.
                const match = matches.filter(m => m.emojiId === mr.emoji.identifier)[0];
                if (match) dataCallback(true, match.match, urlInfo.qsParams).then(
                    result => Util.splitMessage(result || `Not enough quality data for ${searchInput}`, { prepend: '```', append: '```' })
                        .forEach(part => user.send({ content: part })),
                    result => user.send(result || 'Not enough quality data to display this'),
                ).catch(err => Logger.error(err));
            }).on('end', () => rc.message.delete().catch(() => Logger.log('Unable to delete reaction message')));
        }).catch(err => Logger.error('Reactions: error setting reactions:\n', err));

    // Always send one result to the channel.
    sent.then(() => dataCallback(isDM, matches[0].match, urlInfo.qsParams).then(
        result => channel.send({ content: result || `Not enough quality data for ${searchInput}`, split: { prepend: '```\n', append: '\n```' } })),
    ).catch(err => Logger.error(err));
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
    //Sort the results
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
    const results = await findThing('convertible', convertible.id, opts);
    const target_url = `<https://www.mhct.win/converter.php?item=${convertible.id}>`;
    const minMax = (a, b) => {
        if (a && b && !isNaN(a) && !isNaN(b) && a === b)
            return integerComma(a);
        return (a || 'N/A').concat('-').concat(b || 'N/A');
    };
    const pctDisplay = (opens, total_items) => {
        return Number(calculateRate(opens, total_items*100)).toFixed(2);
    };
    const converter = results
        .map(convertible => {
            return {
                item: convertible.item.substring(0, 30),
                average_qty: calculateRate(convertible.total, convertible.total_items),
                min_max: minMax(convertible.min_item_quantity, convertible.max_item_quantity),
                average_when: calculateRate(convertible.times_with_any,
                    convertible.total_quantity_when_any),
                chance: pctDisplay(convertible.single_opens, convertible.times_with_any),
                total: convertible.total,
                single_opens: convertible.single_opens,
            };
        });
    const order = ['item', 'average_qty', 'chance', 'min_max', 'average_when'];
    const labels = {
        item: 'Item',
        average_qty: 'Per Open',
        min_max: 'Min-Max',
        chance: 'Chance',
        average_when: 'Per Slot',
    };
    //Sort the results
    const numSort = (a, b) => {
        return Number(a) - Number(b);
    };
    converter.sort(
        firstBy('average_qty', { cmp: numSort, direction: 'desc' })
            .thenBy('chance', { cmp: numSort, direction: 'desc' })
            .thenBy('item'),
    );
    converter.splice(isDM ? 100 : 10);
    const total_seen = converter[0].total;
    const single_seen = converter[0].single_opens;
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
    let reply = `${convertible.value} (convertible) has the following possible contents:\n\`\`\``;
    reply += prettyPrintArrayAsString(converter, columnFormatting, headers, '=');
    reply += '```\n' + `Seen ${intToHuman(total_seen)} times, ${intToHuman(single_seen)} as single opens. `;
    reply += `HTML version at: ${target_url}`;
    return reply;
}

/**
 * Determines if a string is a filter
 * @param {string} tester String to check if it's a filter
 * @returns {string} the filter as an object with code_name being the important attribute
 */
function getFilter(tester) {
    // Process filter-y nicknames
    if (!tester)
        return;
    tester = `${tester}`;
    if (tester.startsWith('3_d') || tester.startsWith('3d'))
        tester = '3_days';
    else if (tester.startsWith('3_m') || tester.startsWith('3m'))
        tester = '3_months';
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
 * @param {{ [x: string]: string }} nicknames The nicknames for loot
 * @returns the first loot that matched
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
 * @returns The first mice that matched
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
 * @returns The first convertible that matched
 */
function getConvertibles(tester) {
    if (!tester)
        return;
    tester = `${tester}`;

    return getSearchedEntity(tester, convertibles);
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
 * @param {Object} accumulator -- string or something with code_name as a property
 * @param {Object} current -- something with code_name as a property
 * @returns {String} Grows a string, meant to be with Array.reduce
 */
function code_name_reduce (accumulator, current) {
    if (accumulator.code_name) {
        accumulator = `\`${accumulator.code_name}\``;
    }
    if (current.code_name) {
        if (accumulator)
            return accumulator + `, \`${current.code_name}\``;
        else
            return `\`${current.code_name}\``;
    } else {
        return accumulator;
    }
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
    intervals.push(setInterval(() => { getMHCTList('mouse', mice); }, refresh_rate));
    intervals.push(setInterval(() => { getMHCTList('loot', loot); }, refresh_rate));
    intervals.push(setInterval(() => { getMHCTList('convertible', convertibles); }, refresh_rate));
    intervals.push(setInterval(() => { getFilterList(); }, refresh_rate));
    intervals.push(setInterval(() => { getMinLuck(); }, refresh_rate));
    Logger.log(`MHCT Initialized: Loot: ${loot.length}, mice: ${mice.length}, Convertibles: ${convertibles.length}, filters: ${filters.length}`);
    return true;
}

async function save() {
    intervals.forEach(i => clearInterval(i));
    return true;
}

module.exports.getMHCTList = getMHCTList;
module.exports.initialize = initialize;
module.exports.findThing = findThing;
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
