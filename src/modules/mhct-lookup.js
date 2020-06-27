const fetch = require('node-fetch');
const { URLSearchParams } = require('url');
const Logger = require('../modules/logger');
const { DateTime, Duration } = require('luxon');
const {
    oxfordStringifyValues,
    prettyPrintArrayAsString,
    splitString,
    timeLeft,
    unescapeEntities,
    isValidURL,
} = require('../modules/format-utils');

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

/**
 * Return a sorted list of approximate matches to the given input and container
 *
 * @param {string} input The text to match against
 * @param {DatabaseEntity[]} values The known values.
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
function isFilter(tester) {
    return !!getSearchedEntity(tester, filters).length;
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
    const url = 'https:////mhhunthelper.agiletravels.com/searchByItem.php?' + qsOptions.toString();
    return await fetch(url)
        .then(response => response.ok ? response.json() : [])
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
module.exports.isFilter = isFilter;
