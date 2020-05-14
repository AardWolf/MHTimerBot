const CommandResult = require('../interfaces/command-result');
const Logger = require('./logger');

const botErrorSequence = async (msg) => {
    try {
        await msg.react('🤖');
        await msg.react('💣');
        await msg.react('💥');
    } catch (err) {
        Logger.error('Command Reaction: Failed to react to input message:', err);
    }
};

/**
 * Based on the given result of a previous command, react (or don't) accordingly on the source message.
 * @param {Promise<CommandResult>|CommandResult} executedCommand A previous bot command's result output.
 */
const addMessageReaction = async function addMessageReaction(executedCommand) {
    if (!executedCommand) throw new TypeError('Missing required input parameter');

    const inputResult = await executedCommand;
    if (!inputResult || !(inputResult instanceof CommandResult)) {
        throw new TypeError('Input parameter must resolve to a CommandResult');
    }

    const ourResult = new CommandResult({ success: false, request: inputResult.message });
    const successfulEmoji = '✔️';
    const failedEmoji = '❌';

    let shouldAddReaction = false;

    if (!inputResult.message) {
        ourResult.success = false;
        ourResult.botError = true;
    } else if (inputResult.message.channel.type === 'dm') {
        // The requesting message was a DM, so we likely replied via DM.
        shouldAddReaction = !inputResult.sentDm;
    } else if (inputResult.sentDm) {
        // We sent a DM, but the request came from a non-DM channel (e.g. group DM or regular TextChannel)
        // and thus we should react to it.
        shouldAddReaction = true;
    }


    // Now that we know whether we should react to the original message, do so.
    if (shouldAddReaction) {
        try {
            // Did the original command fail due to *our* issue? Let the user know.
            if (inputResult.botError) {
                await botErrorSequence(inputResult.message);
            } else {
                // Did it succeed or fail normally?
                await inputResult.message.react(inputResult.success ? successfulEmoji : failedEmoji);
            }
        } catch (err) {
            Logger.error('Command Reaction: Failed to react to input message:', err);
            ourResult.botError = true;
            ourResult.success = false;
        }
    }

    // Our result is always a success, unless there was an issue reacting to the original message
    // or some other fundamental issue. When there is a bot error, try to signal this fact.
    if (!ourResult.botError) {
        ourResult.success = true;
    } else if (inputResult.message) {
        await botErrorSequence(inputResult.message);
    }

    return ourResult;
};

exports.addMessageReaction = addMessageReaction;
