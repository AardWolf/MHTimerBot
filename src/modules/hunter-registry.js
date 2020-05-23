// Type-hinting imports
// eslint-disable-next-line no-unused-vars
const { Message } = require('discord.js');

const Logger = require('./logger');


/**
 * Unsets the hunter's id (and all other friend-related settings), and messages the user back.
 * Currently all settings are friend-related.
 *
 * @param {Message} message A Discord message object
 */
function unsetHunterID(message) {
    const hunter = message.author.id;
    let response = '';
    if (message.client.hunters[hunter]) {
        delete message.client.hunters[hunter];
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
    if (!message.client.hunters[discordId]) {
        message.client.hunters[discordId] = {};
        Logger.log(`Hunters: OMG! A new hunter id '${discordId}'`);
    }

    // If they already registered a hunter ID, update it.
    if (message.client.hunters[discordId]['hid']) {
        message_str = `You used to be known as \`${message.client.hunters[discordId]['hid']}\`. `;
        Logger.log(`Hunters: Updating hid ${message.client.hunters[discordId]['hid']} to ${hid}`);
    }
    message.client.hunters[discordId]['hid'] = hid;
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
    if (!message.client.hunters[discordId] || !message.client.hunters[discordId]['hid']) {
        return 'I don\'t know who you are so you can\'t set that now; set your hunter ID first.';
    }

    let message_str = !message.client.hunters[discordId][property] ? '' :
        `Your ${property} used to be \`${message.client.hunters[discordId][property]}\`. `;
    message.client.hunters[discordId][property] = value;

    message_str += `Your ${property} is set to \`${value}\``;
    return message_str;
}

exports.unsetHunterID = unsetHunterID;
exports.setHunterID = setHunterID;
exports.setHunterProperty = setHunterProperty;
