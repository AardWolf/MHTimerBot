// Type-hinting imports
// eslint-disable-next-line no-unused-vars
const { Message } = require('discord.js');
const { Duration } = require('luxon');
// These two added to auto-populate some values
const fetch = require('node-fetch');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const Logger = require('./logger');
const { loadDataFromJSON, saveDataAsJSON } = require('../modules/file-utils');
const hunter_ids_filename = 'data/hunters.json';
const hunters = {};
//const hunters = require('../../data/hunters.json');
const save_frequency = Duration.fromObject({ minutes: 5 });
const refresh_frequency = Duration.fromObject({ minutes: 90 });
let someone_initialized = 0;
let hunterSaveInterval ;
let hunterRefreshInterval ;

//If a user sets these they go into manual mode
const manual_properties = ['rank', 'location'];

/**
 * Meant to be called when commands that muck with the hunter registry get loaded
 *
 * @returns {Promise<boolean>}
 */
async function initialize() {
    if (someone_initialized) {
        //Initialize once only
        return true;
    }
    someone_initialized = true;
    if (Object.keys(hunters).length > 0) {
        Logger.log('Hunters already loaded');
        return true;
    }
    const hasHunters = loadHunterData()
        .then(hunterData => {
            Object.assign(hunters, hunterData);
            Logger.log(`Hunters: imported ${Object.keys(hunterData).length} from file.`);
            return Object.keys(hunters).length > 0;
        });
    hasHunters.then(() => migrateData())
        .then(() => {
            Logger.log(`Hunters: Configuring save every ${save_frequency / (60 * 1000)} min.`);
            hunterSaveInterval = setInterval(saveHunters, save_frequency);
            hunterRefreshInterval = setInterval(refreshHunters, refresh_frequency);
        });
}

/**
 * Function that is called when the bot is shutting down or unloading a command
  */
async function save() {
    let saved = false;
    if (someone_initialized) {
        someone_initialized = 0;
        saved = await saveHunters();
        clearInterval(hunterSaveInterval);
        clearInterval(hunterRefreshInterval);
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
        return false;
    }
    if (!hunters.version) {
        //First version of the object is version 1.
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
    let response = '';
    if (hunters[hunter]) {
        delete hunters[hunter];
        response = '*POOF*, all gone!';
    } else
        response = 'I didn\'t do anything but that\'s because you didn\'t do anything either.';
    return response;
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
        hunters[discordId] = {};
        Logger.log(`Hunters: OMG! A new hunter id '${discordId}'`);
        hunters[discordId]['hid'] = hid;
        hunters[discordId]['manual'] = false;
        hunters[discordId]['failureCount'] = 0;
        hunters[discordId]['guilds'] = [];
        await populateHunter(discordId); // This is asynchronous and that is ok
        message_str += `If people look you up they'll see \`${hid}\` and find you for rank \`${hunters[discordId]['rank']}\` in \`${hunters[discordId]['location']}\`.`;
    } else if (hunters[discordId]['hid']) {
        message_str = `You used to be known as \`${hunters[discordId]['hid']}\`.`;
        Logger.log(`Hunters: Updating hid ${hunters[discordId]['hid']} to ${hid}`);
    }
    if (!hunters[discordId]['manual']) {
        message_str += ' I am automatically updating your rank and location, set them manually and I will stop.';
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
 * @param {bigint} hunter the discordId for the user to look up
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
 * @param {message} message a Discord message object
 * @param {string} discordId the Discord ID of a registered hunter.
 * @returns {string?} the hunter ID of the registered hunter having that Discord ID.
 */
function getHunterByDiscordID(discordId) {
    if (hunters[discordId] && !('block' in hunters[discordId]))
        return hunters[discordId]['hid'];
}

/**
 * Populates some values based on the discordId
 * @param hunterId
 */
async function populateHunter(discordId) {
    if (!hunters[discordId] || !hunters[discordId]['hid'])
        return false;

    const url = `https://www.mousehuntgame.com/p.php?id=${hunters[discordId]['hid']}`;
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
    } catch (error) {
        hunters[discordId].failureCount += 1;
        Logger.error(`Hunter: Populating for ${discordId} failed: ${error.message}`);
        if (hunters[discordId].failureCount >= 5) {
            delete hunters[discordId];
            Logger.log(`5 strikes, ${discordId} is forgotten`);
        }
    }

}

/**
 * Clean up hunters who are no longer in the server
 * TODO: This needs to work with multiple servers -- might be handled in unsetHunterID
 * @param message message that triggered the action
 */
function cleanHunters(message) {
    const author = message.author;
    Logger.log(`Hunter: cleaning cycle triggered by ${author.id} for guild ${message.guild.id}`);
    Object.keys(hunters)
        .filter(key => hunters[key].hid)
        .forEach((discordID) => {
            if(!message.guild.members.cache.get(discordID)) {
                Logger.log(`Cleaning up ${discordID} from ${message.guild.id}`);
                unsetHunterID(discordID);
            }
        });
    return 'Clean cycle complete';
}

/**
 * Simple function set in the interval to refresh the hunter locations and ranks
 */
function refreshHunters() {
    Logger.log('Refreshing non-manual hunters');
    Object.keys(hunters)
        .filter(key => hunters[key]['manual'] === false)
        .forEach((discordId) => {
            populateHunter(discordId);
        });
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
