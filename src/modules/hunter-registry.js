// Type-hinting imports
// eslint-disable-next-line no-unused-vars
const { Message, Snowflake } = require('discord.js');
const { Duration } = require('luxon');
// These two added to auto-populate some values
const fetch = require('node-fetch');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const Logger = require('./logger');
const { loadDataFromJSON, saveDataAsJSON } = require('../modules/file-utils');
const hunter_ids_filename = 'data/hunters.json';
const hunters = {};
const save_frequency = Duration.fromObject({ minutes: 5 });
const refresh_frequency = Duration.fromObject({ minutes: 90 });
let someone_initialized = false;
let hunterSaveInterval = null;
let hunterRefreshInterval = null;

//If a user sets these they go into manual mode
const manual_properties = ['rank', 'location'];

/**
 * Meant to be called when commands that muck with the hunter registry get loaded
 *
 * @returns {Promise<boolean>}
 */
async function initialize() {
    // Initialize only once.
    if (someone_initialized) {
        return true;
    }
    someone_initialized = true;

    // Schedule timers.
    Logger.log(`Hunters: Configuring save every ${save_frequency / (60 * 1000)} min.`);
    hunterSaveInterval = setInterval(saveHunters, save_frequency);
    hunterRefreshInterval = setInterval(refreshHunters, refresh_frequency);

    // If we don't have any hunters yet, promptly fetch them.
    if (Object.keys(hunters).length > 0) {
        Logger.warn('Hunters: Hunters already loaded when initialize called');
        return true;
    }

    const hunterData = await loadHunterData();
    Object.assign(hunters, hunterData);
    Logger.log(`Hunters: imported ${Object.keys(hunterData).length} from file.`);
    migrateData();
    return Object.keys(hunters).length > 0;
}

/**
 * Function that is called when the bot is shutting down or unloading a command
  */
async function save() {
    let saved = false;
    if (hunterSaveInterval !== null) clearInterval(hunterSaveInterval);
    if (hunterRefreshInterval !== null) clearInterval(hunterRefreshInterval);
    if (someone_initialized) {
        saved = await saveHunters();
        someone_initialized = false;
    }

    return saved;
}

/**
 * Checks the saved version of the hunters object with the current version and performs upgrades if needed
 * 1.00 - previous object did not have versions
 * 1.01 - Added a flag for manual refresh (default). Added (empty) array for guilds identified on. Added failureCount
 */
function migrateData() {
    if (Object.keys(hunters).length === 0) {
        return;
    }
    if (!hunters.version) {
        // First version of the object is version 1.
        hunters.version = 1.00;
    }
    if (hunters.version < 1.01) {
        Object.keys(hunters).forEach((discordId) => {
            hunters[discordId]['manual'] = true;
            hunters[discordId]['guilds'] = [];
            hunters[discordId]['failureCount'] = 0;
        });
        hunters.version = 1.01;
        Logger.log(`Hunters: Migrated hunters object to ${hunters.version}`);
    }
}

/**
 * Load hunter data from the input path, defaulting to the value of 'hunter_ids_filename'.
 * Returns the hunter data contained in the given file.
 *
 * @param {string} [path] The path to a JSON file to read data from. Default is the 'hunter_ids_filename'.
 * @returns {Promise <{}>} Data from the given file, as an object to be consumed by the caller.
 */
async function loadHunterData(path = hunter_ids_filename) {
    try {
        return await loadDataFromJSON(path);
    } catch (err) {
        Logger.error(`Hunters: Error loading data from '${path}':\n`, err);
        return {};
    }
}

/**
 * Serialize the hunters object to the given path, defaulting to the value of 'hunter_ids_filename'
 *
 * @param {string} [path] The path to a file to write JSON data to. Default is the 'hunter_ids_filename'.
 * @returns {Promise <boolean>} Whether the save operation completed without error.
 */
async function saveHunters(path = hunter_ids_filename) {
    Logger.log('Hunters: Attempting to save data');
    const didSave = await saveDataAsJSON(path, hunters);
    Logger.log(`Hunters: ${didSave ? 'Saved' : 'Failed to save'} ${Object.keys(hunters).length} to '${path}'.`);
    return didSave;
}


/**
 * Unset the hunter's id (and all other friend-related settings), and messages the user back.
 * Currently all settings are friend-related.
 *
 * @param {Snowflake} hunter A Discord ID snowflake
 */
function unsetHunterID(hunter) {
    if (hunter in hunters) {
        delete hunters[hunter];
        return '*POOF*, all gone!';
    }
    return 'I didn\'t do anything but that\'s because you didn\'t do anything either.';
}

/**
 * Sets the message author's hunter ID to the passed argument, and messages the user back.
 *
 * @param {Snowflake} discordId a Discord id Snowflake
 * @param {string} hid a "Hunter ID" string, which is known to parse to a number.
 */
async function setHunterID(discordId, hid) {
    let message_str = '';

    // Initialize the data for any new registrants.
    if (!hunters[discordId]) {
        Logger.log(`Hunters: OMG! A new hunter id '${discordId}'`);
        hunters[discordId] = {
            hid,
            manual: false,
            failureCount: 0,
            guilds: [],
        };
        message_str += `If people look up you they'll see \`${hid}\``;
        message_str += (await populateHunter(discordId))
            ? `and find you for rank \`${hunters[discordId].rank}\` in \`${hunters[discordId].location}\`.`
            : '. (I couldn\'t find your rank or location just yet.)';
    } else if (hunters[discordId].hid) {
        message_str = `You used to be known as \`${hunters[discordId].hid}\`.`;
        Logger.log(`Hunters: Updating hid ${hunters[discordId].hid} to ${hid}`);
        hunters[discordId].hid = hid;
    }
    if (!hunters[discordId].manual) {
        message_str += ' I am automatically updating your `rank` and `location`; set them manually and I will stop.';
    }
    return message_str;
}

/**
 * Accepts a message object and hunter id, sets the author's hunter ID to the passed argument
 *
 * @param {Snowflake} discordId a Discord ID Snowflake
 * @param {string} property the property key for the given user, e.g. 'hid', 'rank', 'location'
 * @param {any} value the property's new value.
 */
function setHunterProperty(discordId, property, value) {
    if (!hunters[discordId] || !hunters[discordId]['hid']) {
        return 'I don\'t know who you are so you can\'t set that now; set your hunter ID first.';
    }

    let message_str = !hunters[discordId][property] ? '' :
        `Your ${property} used to be \`${hunters[discordId][property]}\`. `;
    hunters[discordId][property] = value;
    message_str += `Your ${property} is set to \`${value}\``;
    if (manual_properties.includes(property))
        if (!hunters[discordId].manual) {
            hunters[discordId].manual = true;
            message_str += ' and I stopped tracking you.';
        }
    return message_str;
}

/**
 * Returns a stringified version of the hunter's object
 *
 * @param {Snowflake} hunter the discordId for the user to look up
 * @returns {string} The property string for that ID
 */
function getHunterProperties(hunter) {
    if (!(hunter in hunters))
        return 'I\'ve never met you before in my life';
    let message_str = 'Here\'s what I know\n';
    const properties = ['Rank', 'Location', 'snuid'];
    for (const property of properties) {
        if (property.toLowerCase() in hunters[hunter])
            message_str += `\t**${property}**: ${hunters[hunter][property.toLowerCase()]}\n`;
        else
            message_str+= `\t**${property}**: Not Set\n`;
    }
    if ('manual' in hunters[hunter])
        message_str += hunters[hunter]['manual'] ? 'You set your rank and/or location' :
            '**I am updating your rank and location**';
    return message_str;
}

/**
 * Find random hunter ids to befriend, based on the desired property and criterion.
 *
 * @param {string} property a hunter attribute, like "location" or "rank"
 * @param {string} criterion user-entered input.
 * @param {number} limit the maximum number of hunters to return.
 * @returns {string[]} an array of 0 to "limit" hunter ids where the property value matched the user's criterion
 */
function getHuntersByProperty(property, criterion, limit = 5) {
    const valid = Object.keys(hunters)
        .filter(key => hunters[key][property] === criterion && !('block' in hunters[key]))
        .map(key => hunters[key].hid);

    return valid.sort(() => 0.5 - Math.random()).slice(0, limit);
}

/**
 * Find the self-registered account for the user identified by the given Discord ID.
 * Returns undefined if the user has not self-registered.
 *
 * @param {Snowflake} discordId the Discord ID of a registered hunter.
 * @returns {string?} the hunter ID of the registered hunter having that Discord ID.
 */
function getHunterByDiscordID(discordId) {
    if (discordId in hunters && !('block' in hunters[discordId]))
        return hunters[discordId]['hid'];
}

/**
 * Populates some values based on the discordId
 * @param {Snowflake} hunterId
 * @returns {Promise<boolean>}
 */
async function populateHunter(discordId) {
    const hunter = hunters[discordId];
    const hid = hunter?.hid;
    if (!hid)
        return false;

    const url = `https://www.mousehuntgame.com/p.php?id=${hid}`;
    try {
        const response = await fetch(url);
        const body = await response.text();
        const dom = new JSDOM(body);
        const description = dom.window.document.querySelector('meta[property=\'og:description\']').getAttribute('content');
        const lines = description.split('\n');
        // Pull the title from line 0
        hunters[discordId]['rank'] = / an* (.*?) in MouseHunt./.exec(lines[0])[1].toLowerCase() || 'unknown';
        hunters[discordId]['location'] = /Location: (.*?)$/.exec(lines[5])[1].toLowerCase() || 'unknown';
        hunters[discordId]['failureCount'] = 0;
        return true;
    } catch (error) {
        hunters[discordId].failureCount += 1;
        Logger.error(`Hunter: Populating for ${discordId} failed: ${error.message}`);
        if (hunters[discordId].failureCount >= 5) {
            delete hunters[discordId];
            Logger.warn(`Hunters: 5 strikes, ${discordId} is forgotten`);
        }
    }
    return false;
}

/**
 * Clean up hunters who are no longer in the server
 * TODO: This needs to work with multiple servers -- might be handled in unsetHunterID
 * @param {Message} message message that triggered the action
 */
function cleanHunters(message) {
    Logger.log(`Hunter: cleaning cycle triggered by "${message.author.id}" for guild "${message.guild.id}"`);
    const guildMembers = message.guild.members.cache;
    const removed = Object.keys(hunters)
        .filter(discordID => hunters[discordID].hid && !guildMembers.get(discordID))
        .map((discordID) => ((unsetHunterID(discordID) === '*POOF*, all gone!') ? discordID : null))
        .filter((id) => Boolean(id));

    if (removed.length) {
        Logger.log(`Hunters: Cleaned up ${removed.length} hunters that left: "${removed.join('", "')}"`);
    }
    return 'Clean cycle complete';
}

/**
 * Simple function set in the interval to refresh the hunter locations and ranks
 */
function refreshHunters() {
    Logger.log('Refreshing non-manual hunters');
    Object.keys(hunters)
        .filter(key => hunters[key]['manual'] === false)
        .forEach((discordId) => populateHunter(discordId));
}

exports.getHuntersByProperty = getHuntersByProperty;
exports.getHunterByDiscordID = getHunterByDiscordID;
exports.unsetHunterID = unsetHunterID;
exports.setHunterID = setHunterID;
exports.setHunterProperty = setHunterProperty;
exports.getHunterProperties = getHunterProperties;
exports.initialize = initialize;
exports.save = save;
exports.cleanHunters = cleanHunters;
