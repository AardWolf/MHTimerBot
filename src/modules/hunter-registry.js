// Type-hinting imports
// eslint-disable-next-line no-unused-vars
const { Message } = require('discord.js');
// eslint-disable-next-line no-unused-vars
const version = 1.00;
const { DateTime, Duration } = require('luxon');

const Logger = require('./logger');
const { loadDataFromJSON, saveDataAsJSON } = require('../modules/file-utils');
const hunter_ids_filename = 'data/hunters.json';
const hunters = {};
// eslint-disable-next-line no-unused-vars
let last_save_time = DateTime.utc();
// eslint-disable-next-line no-unused-vars
let hunterSaveInterval;
const save_frequency = Duration.fromObject({ minutes: 5 });

/**
 * Meant to be called when commands that muck with the hunter registry get loaded
 *
 * @returns {Promise<boolean>}
 */
async function initialize() {
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
        });
}

/**
 * Function that is called when the bot is shutting down or unloading a command
 */
async function save() {
    saveHunters().catch((err) => {
        Logger.error(`Error saving hunters on save call: ${err}`);
    });
    return true;
}

/**
 * Checks the saved version of the hunters object with the current version and performs upgrades if needed
 */
function migrateData() {
    if (Object.keys(hunters).length === 0) {
        return false;
    }
    if (!hunters.version) {
        //First version of the object is version 1.
        hunters.version = 1.00;
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
    return loadDataFromJSON(path).catch(err => {
        Logger.error(`Hunters: Error loading data from '${path}':\n`, err);
        return {};
    });
}

/**
 * Serialize the hunters object to the given path, defaulting to the value of 'hunter_ids_filename'
 *
 * @param {string} [path] The path to a file to write JSON data to. Default is the 'hunter_ids_filename'.
 * @returns {Promise <boolean>} Whether the save operation completed without error.
 */
async function saveHunters(path = hunter_ids_filename) {
    return saveDataAsJSON(path, hunters).then(didSave => {
        Logger.log(`Hunters: ${didSave ? 'Saved' : 'Failed to save'} ${Object.keys(hunters).length} to '${path}'.`);
        last_save_time = DateTime.utc();
        return didSave;
    });
}


/**
 * Unset the hunter's id (and all other friend-related settings), and messages the user back.
 * Currently all settings are friend-related.
 *
 * @param {Message} message A Discord message object
 */
function unsetHunterID(message) {
    const hunter = message.author.id;
    let response = '';
    if (hunters[hunter]) {
        delete hunters[hunter];
        response = '*POOF*, you\'re gone!';
    } else
        response = 'I didn\'t do anything but that\'s because you didn\'t do anything either.';
    return response;
}

/**
 * Sets the message author's hunter ID to the passed argument, and messages the user back.
 *
 * @param {Message} message a Discord message object from a user
 * @param {string} hid a "Hunter ID" string, which is known to parse to a number.
 */
function setHunterID(message, hid) {
    const discordId = message.author.id;
    let message_str = '';

    // Initialize the data for any new registrants.
    if (!hunters[discordId]) {
        hunters[discordId] = {};
        Logger.log(`Hunters: OMG! A new hunter id '${discordId}'`);
    }

    // If they already registered a hunter ID, update it.
    if (hunters[discordId]['hid']) {
        message_str = `You used to be known as \`${hunters[discordId]['hid']}\`. `;
        Logger.log(`Hunters: Updating hid ${hunters[discordId]['hid']} to ${hid}`);
    }
    hunters[discordId]['hid'] = hid;
    message_str += `If people look you up they'll see \`${hid}\`.`;

    return message_str;
}

/**
 * Accepts a message object and hunter id, sets the author's hunter ID to the passed argument
 *
 * @param {Message} message a Discord message object
 * @param {string} property the property key for the given user, e.g. 'hid', 'rank', 'location'
 * @param {any} value the property's new value.
 */
function setHunterProperty(message, property, value) {
    const discordId = message.author.id;
    if (!hunters[discordId] || !hunters[discordId]['hid']) {
        return 'I don\'t know who you are so you can\'t set that now; set your hunter ID first.';
    }

    let message_str = !hunters[discordId][property] ? '' :
        `Your ${property} used to be \`${hunters[discordId][property]}\`. `;
    hunters[discordId][property] = value;

    message_str += `Your ${property} is set to \`${value}\``;
    return message_str;
}

/**
 * Find random hunter ids to befriend, based on the desired property and criterion.
 *
 * @param {Message} message a Discord message object
 * @param {string} property a hunter attribute, like "location" or "rank"
 * @param {string} criterion user-entered input.
 * @param {number} limit the maximum number of hunters to return.
 * @returns {string[]} an array of up to 5 hunter ids where the property value matched the user's criterion
 */
function getHuntersByProperty(message, property, criterion, limit = 5) {
    const valid = Object.keys(hunters)
        .filter(key => hunters[key][property] === criterion)
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
function getHunterByDiscordID(message, discordId) {
    if (hunters[discordId])
        return hunters[discordId]['hid'];
}

/**
 * Find the first Discord account for the user with the given input property.
 * Returns undefined if no registered user has the given property.
 *
 * @param {message} message a Discord message object
 * @param {string} input The property value to attempt to match.
 * @param {string} type Any stored property type (typically fairly-unique ones such as 'snuid' or 'hid').
 * @returns {string?} The discord ID, or undefined if the hunter ID was not registered.
 */
function getHunterByID(message, input, type) {
    if (input)
        for (const key in hunters)
            if (hunters[key][type] === input)
                return key;
}


/**
 * Interrogate the local 'hunters' data object to find self-registered hunters that match the requested
 * criteria. NOTE: Handles sending of messages
 *
 * @param {Message} message the Discord message that initiated this search
 * @param {string[]} searchValues an array of hids, snuids, or names/mentions to search for.
 * @param {string} type the method to use to find the member
 */
function findHunter(message, searchValues, type) {
    const noPM = ['hid', 'snuid', 'name'];
    if (message.channel.type === 'dm' && noPM.indexOf(type) !== -1) {
        message.channel.send(`Searching by ${type} isn't allowed via PM.`);
        return;
    }

    let discordId;
    if (type === 'name') {
        // Use message text or mentions to obtain the discord ID.
        const member = message.mentions.members.first() || message.guild.members
            .filter(member => member.displayName.toLowerCase() === searchValues[0].toLowerCase()).first();
        if (member) {
            // Prevent mentioning this user in our reply.
            searchValues[0] = member.displayName;
            // Ensure only registered hunters get a link in our reply.
            if (getHunterByDiscordID(message, member.id))
                discordId = member.id;
        }
    } else if (searchValues[0]) {
        // This is self-volunteered information that is tracked.
        discordId = getHunterByID(message, searchValues[0], type);
    }
    if (!discordId) {
        message.channel.send(`I did not find a registered hunter with **${searchValues[0]}** as a ${type === 'hid' ? 'hunter ID' : type}.`,
            { disableEveryone: true });
        return;
    }
    // The Discord ID belongs to a registered member of this server.
    const link = `https://mshnt.ca/p/${getHunterByDiscordID(message, discordId)}`;
    message.client.fetchUser(discordId).then(user => message.guild.fetchMember(user))
        .then(member => message.channel.send(`**${searchValues[0]}** is ${member.displayName} ${link}`,
            { disableEveryone: true }))
        .catch(err => {
            Logger.error(err);
            message.channel.send('That person may not be on this server.');
        });
}

exports.findHunter = findHunter;
exports.getHuntersByProperty = getHuntersByProperty;
exports.unsetHunterID = unsetHunterID;
exports.setHunterID = setHunterID;
exports.setHunterProperty = setHunterProperty;
exports.initialize = initialize;
exports.save = save;
