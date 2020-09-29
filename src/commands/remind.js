const Logger = require('../modules/logger');
const CommandResult = require('../interfaces/command-result');
const { listRemind, timerAliases, getKnownTimersDetails } = require('../modules/timer-helper');
const { oxfordStringifyValues } = require('../modules/format-utils');

const usage = [
    'Provide no arguments for a list of your reminders. Use [<area>] [<sub-area>] [<number>] to set a reminder',
    '<area>            -> specify a particular area with a timer (sg)',
    '<sub-area>        -> specify the specific sub-area for the reminder (autumn)',
    '<number>          -> How many time it should remind you, default 1 (once, always, 5, etc)',
    'Areas are Seasonal Garden (sg), Forbidden Grove (fg), Toxic Spill (ts), Balack\'s Cove (cove), and the daily reset (reset).',
    'Sub areas are the seasons (winter, spring, summer, fall), open/close, spill ranks, and tide levels (low, mid, high)',
    'Example: "-mh remind close always" will always PM you 15 minutes before the Forbidden Grove closes.',
    'See Also: next; for when a timer occurs next. schedule; for seeing a bunch of timers at once.',
].join('\n\t');

/**
 *
 * @param {Message} message The message that triggered the action
 * @param {Array} tokens The tokens of the command
 * @returns {Promise<CommandResult>} Status of the execution
 */
async function doREMIND(message, tokens) {
    const theResult = new CommandResult({ message, success: false, sentDM: false });
    let reply = '';
    let botPrefix = message.client.settings.botPrefix;
    const timerRequest = tokens.length ? timerAliases(message.client.timers_list, tokens) : {};
    if (message.guild && message.client.settings.guilds[message.guild.id].botPrefix) {
        botPrefix = message.client.settings.guilds[message.guild.id].botPrefix;
    }
    if (!tokens.length || !timerRequest.area) {
        // This reminders array could be pre-filtered
        reply = listRemind(message.author.id, message.client.reminders, botPrefix);
    }
    else {
        const area = timerRequest.area;
        const subArea = timerRequest.sub_area;
        if (!area) {
            return 'I do not know the area you asked for';
        }
    
        // Default to reminding the user once.
        const count = timerRequest.count || (timerRequest.count === 0 ? 0 : 1);
        const requestName = `${area}${subArea ? `: ${subArea}` : ''}`;
    
        // Delete the reminder, if that is being requested.
        // (Rather than try to modify the positions and number of elements in
        // reminders e.g. thread race saveReminders, simply set the count to 0.)
        if (!count) {
            const responses = [];
            for (const reminder of message.client.reminders) {
                if (reminder.user === message.author.id && reminder.area === area) {
                    if (subArea && subArea === reminder.sub_area) {
                        reminder.count = 0;
                        responses.push(`Reminder for '${requestName}' turned off.`);
                    }
                    else if (!subArea && !reminder.sub_area) {
                        reminder.count = 0;
                        responses.push(`Reminder for '${requestName}' turned off.`);
                    }
                }
            }
    
            try {
                await message.author.send(responses.length
                    ? `\`\`\`${responses.join('\n')}\`\`\``
                    : `I couldn't find a matching reminder for you in '${requestName}'.`,
                );
                theResult.success = responses.length > 0;
                theResult.sentDm = true;
            } catch (err) {
                Logger.error('REMIND: Failed to DM the user', err);
                theResult.botError = true;
            }
            return theResult;
        }
    
        // User asked to be reminded - find a timer that meets the request, and sort in order of next activation.
        const choices = message.client.timers_list
            .filter(t => area === t.getArea() && (!subArea || subArea === t.getSubArea()))
            .sort((a, b) => a.getNext() - b.getNext());
        Logger.log(`Timers: found ${choices.length} matching input request:\n`, timerRequest);
    
        // Assume the desired timer is the one that matched the given criteria and occurs next.
        const [timer] = choices;
        if (!timer) {
            try {
                await message.author.send(`I'm sorry, there weren't any timers I know of that match your request. I know\n${getKnownTimersDetails()}`);
                theResult.success = false;
                theResult.sentDm = true;
            } catch (err) {
                Logger.error('REMIND: Failed to DM the user', err);
                theResult.botError = true;
            }
            return theResult;
        }
    
        // If the reminder already exists, set its new count to the requested count.
        const responses = [];
        for (const reminder of message.client.reminders)
            if (reminder.user === message.author.id && reminder.area === area)
                if ((subArea && reminder.sub_area === subArea)
                    || (!subArea && !reminder.sub_area))
                {
                    responses.push(`Updated reminder count for '${requestName}' from '${reminder.count === -1
                        ? 'always' : reminder.count}' to '${count === -1 ? 'always' : count}'.`);
                    reminder.count = count;
                }
    
        if (responses.length) {
            Logger.log(`Reminders: updated ${responses.length} for ${message.author.username} to a count of ${count}.`, timerRequest);
            try {
                await message.author.send(`\`\`\`${responses.join('\n')}\`\`\``);
                theResult.success = true;
                theResult.sentDm = true;
            } catch (err) {
                Logger.error('REMIND: Failed to DM the user', err);
                theResult.botError = true;
            }
            return theResult;
        }
    
        // No updates were made - free to add a new reminder.
        const newReminder = {
            'count': count,
            'area': area,
            'user': message.author.id,
        };
        // If the matched timer has a sub-area, we need to care about the sub-area specified
        // in the request. It will either be the same as that of this timer, or it will be
        // null / undefined (i.e. a request for reminders from all timers in the area).
        if (timer.getSubArea())
            newReminder.sub_area = subArea;
        message.client.reminders.push(newReminder);
    
        // If the user entered a generic reminder, they may not expect the specific name. Generic reminder
        // requests will have matched more than one timer, so we can reference 'choices' to determine the
        // proper response.
        const isGenericRequest = !subArea && timer.getSubArea();
        const subAreas = new Set(choices.map(t => `**${t.getSubArea()}**`));
        responses.push(`Your reminder for **${isGenericRequest ? area : timer.name}** is set. ${choices.length > 1
            ? `You'll get reminders for ${oxfordStringifyValues(subAreas)}. I'll PM you about them`
            : 'I\'ll PM you about it'}`);
        responses.push((count === 1) ? 'once.' : (count < 0) ? 'until you stop it.' : `${count} times.`);
    
        // Inform a new user of the reminder functionality (i.e. PM only).
        if (message.channel.type !== 'dm' && !message.client.reminders.some(r => r.user === message.author.id))
            responses.unshift('Hi there! Reminders are only sent via PM, and I\'m just making sure I can PM you.');
    
        // Send notice of the update via PM.
        try {
            await message.author.send(responses.join(' '));
            theResult.success = true;
            theResult.sentDm = true;
        } catch(err) {
            Logger.error(`Reminders: notification failure for ${message.author.username}.`);
            theResult.success = false;
            theResult.botError = true;
        }
        return theResult;    
    }
    if (reply) {
        try {
            await message.author.send(reply);
            theResult.sentDm = true;
            theResult.success = true;
        } catch (err) {
            Logger.error(`REMIND: notification failure for ${message.author.username}. Possibly blocked.`, err);
            theResult.success = false;
            theResult.botError = true;
        }
    }
    return theResult;
}

module.exports = {
    name: 'remind',
    args: true,
    usage: usage,
    description: 'Set and retrieve reminders for MouseHunt Timers',
    canDM: true,
    execute: doREMIND,
};
