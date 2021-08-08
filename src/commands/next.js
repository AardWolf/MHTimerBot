const Logger = require('../modules/logger');
const CommandResult = require('../interfaces/command-result');
const { getKnownTimersDetails, timerAliases, nextTimer } = require('../modules/timer-helper');
const usage = [
    '<area> or <sub-area> will provide a message about the next related occurrence.',
    'Areas are Seasonal Garden (sg), Forbidden Grove (fg), Toxic Spill (ts), Balack\'s Cove (cove), and the daily reset (reset).',
    'Sub areas are the seasons (winter, spring, summer, fall), open/close, spill ranks, and tide levels (low, mid, high)',
    'Example: "next sg fall" will tell how long until Autumn in Seasonal Garden',
    'See Also: remind; for setting reminders. schedule; for seeing a bunch of timers at once.',
].join('\n\t');

/**
 *
 * @param {Message} message The message that triggered the action
 * @param {Array} tokens The tokens of the command
 * @returns {Promise<CommandResult>} Status of the execution
 */
async function doNEXT(message, tokens) {
    const theResult = new CommandResult({ message, success: false, sentDM: false });
    let reply = '';

    const aboutTimers = `I know these timers:\n${getKnownTimersDetails(message.client.timers_list)}`;
    // Parse the message to see if it matches any known timer areas, sub-areas, or has count information.
    const reminderRequest = tokens.length ? timerAliases(message.client.timers_list, tokens) : {};
    if (!tokens.length) {
        // TODO: pretty-print known timer info
        reply = aboutTimers;
    } else if (!reminderRequest || !reminderRequest['area']) {
        // received "-mh next <words>", but the words didn't match any known timer information.
        // Currently, the only other information we handle is RONZA.
        switch (tokens[0].toLowerCase()) {
            case 'ronza':
                reply = 'Don\'t let aardwolf see you ask or you\'ll get muted';
                break;
            default:
                reply = aboutTimers;
        }
    } else {
        // Display information about this known timer.
        let botPrefix = message.client.settings.botPrefix;
        if (message.guild && message.client.settings.guilds[message.guild.id].botPrefix)
            botPrefix = message.client.settings.guilds[message.guild.id].botPrefix;
        reply = nextTimer(message.client.timers_list, reminderRequest, botPrefix);
    }
    if (reply) {
        try {
            // Note that a lot of this is handled by sendInteractiveSearchResult
            if (typeof reply === 'string') {
                await message.channel.send(reply);
            } else {
                await message.channel.send({ embeds: [reply] });
            }
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = ['DM', 'GROUP_DM'].includes(message.channel.type);
        } catch (err) {
            Logger.error('NEXT: failed to send reply', err);
            theResult.botError = true;
        }
    }

    return theResult;
}


module.exports = {
    name: 'next',
    args: true,
    usage: usage,
    description: 'Display timer information',
    canDM: true,
    execute: doNEXT,
};
