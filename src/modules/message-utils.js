const fs = require('fs');
const CommandResult = require('../interfaces/command-result');
const Logger = require('./logger');

// Read instance overrides from the settings file.
const settingsPath = '../../data/settings';
const settings = fs.existsSync(settingsPath) ? require(settingsPath) : {};
const { reactions = {} } = settings;
const successfulEmoji = reactions.success || '✅';
const failedEmoji = reactions.failure || '❌';
const errorSequence = (reactions.errorSequence && reactions.errorSequence.length > 0)
    ? reactions.errorSequence
    : ['🤖', '💣', '💥'];

const botErrorSequence = async (msg) => {
    for (const emoji of errorSequence)
        await msg.react(emoji);
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

    let shouldAddReaction = false;

    if (!inputResult.message) {
        ourResult.botError = true;
    } else if (inputResult.message.channel.type === 'dm') {
        // The requesting message was a DM, so we likely replied via DM.
        shouldAddReaction = !inputResult.sentDm;
    } else if (inputResult.sentDm) {
        // We sent a DM, but the request came from a non-DM channel (e.g. group DM or regular TextChannel)
        // and thus we should react to it.
        shouldAddReaction = true;
    } else if (inputResult.botError || !inputResult.replied) {
        // If there was an error, or we didn't reply at all, we should add a reaction to the request.
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
            Logger.error('Command Reaction: Failed to react to input message:', err, inputResult);
            ourResult.botError = true;
        }
    }

    // This method's result is always a success, unless there was an issue reacting to
    // the original message or some other fundamental issue.
    ourResult.success == !ourResult.botError;

    return ourResult;
};

exports.addMessageReaction = addMessageReaction;
