const Logger = require('../modules/logger');
const { initialize, findThing, isFilter } = require('../modules/mhct-lookup');
const CommandResult = require('../interfaces/command-result');
// eslint-disable-next-line no-unused-vars
const { Client, Collection, Guild, GuildMember, Message, MessageReaction, MessageEmbed, TextChannel, User } = Discord;

/**
 *
 * @param {Message} message The message that triggered the action
 * @param {Array} tokens The tokens of the command
 * @returns {Promise<CommandResult>} Status of the execution
 */
function doIFIND(message, tokens) {
    const theResult = new CommandResult({ message, success: false, sentDM: false });
    let reply = '';
    const opts = {};
    if (!tokens)
        reply = 'I just cannot find what you\'re looking for (since you didn\'t tell me what it was).';
    else {
        //Set the filter if it's requested
        if (isFilter(tokens[0])) {
            opts.filter = tokens[0];
            tokens.shift();
        }
    }
}

module.exports = {
    name: 'ifind',
    args: true,
    usage: 'Coming Soon',
    description: 'Find items sorted by their drop rates',
    canDM: true,
    execute: doIFIND,
    initialize: initialize,
};
