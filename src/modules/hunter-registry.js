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
    const valid = Object.keys(message.client.hunters)
        .filter(key => message.client.hunters[key][property] === criterion)
        .map(key => message.client.hunters[key].hid);

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
    if (message.client.hunters[discordId])
        return message.client.hunters[discordId]['hid'];
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
        for (const key in message.client.hunters)
            if (message.client.hunters[key][type] === input)
                return key;
}


/**
 * Interrogate the local 'hunters' data object to find self-registered hunters that match the requested
 * criteria.
 *
 * @param {Message} message the Discord message that initiated this search
 * @param {string[]} searchValues an array of hids, snuids, or names/mentions to search for.
 * @param {string} type the method to use to find the member
 */
function findHunter(message, searchValues, type) {
    const noPM = ['hid', 'snuid', 'name'];
    if (!message.guild && noPM.indexOf(type) !== -1) {
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
    const link = `<https://mshnt.ca/p/${getHunterByDiscordID(discordId)}>`;
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
