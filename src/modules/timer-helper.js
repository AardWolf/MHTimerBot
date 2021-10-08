const Logger = require('../modules/logger');
const { MessageEmbed } = require('discord.js');
const { timeLeft } = require('../modules/format-utils');

/**
 * Inspects the current timers list to dynamically determine the text to print when informing users
 * of what timers are available.
 * @param {Timer[]} timers_list Object with timer list and information
 * @returns {string} a ready-to-print string of timer details, with each timer on a new line.
 */
function getKnownTimersDetails(timers_list) {
    // Prepare a detailed list of known timers and their sub-areas.
    /** @type {Object <string, Set<string>> */
    const details = {};
    timers_list.forEach(timer => {
        const area = `**${timer.getArea()}**`;
        if (!details[area])
            details[area] = new Set();
        if (timer.getSubArea())
            details[area].add(timer.getSubArea());
    });
    const names = [];
    for (const area in details) {
        let description = area;
        if (details[area].size)
            description += ` (${Array.from(details[area]).join(', ')})`;
        names.push(description);
    }

    return names.join('\n');
}

/**
 * Attempt to find a Timer that satisfies the input tokens.
 * Returns a ReminderRequest of unknown state (may have some or all properties set).
 * @param {Timer[]} timers_list List of known timers
 * @param {string[]} tokens a set of tokens which may match known Timer areas or sub-areas.
 * @returns {ReminderRequest} an object that may have some or all of the needed properties to create a Reminder
 */
function timerAliases(timers_list, tokens) {
    const newReminder = {
        area: null,
        sub_area: null,
        count: null,
    };
    const timerAreas = timers_list.map(timer => timer.getArea());
    const timerSubAreas = timers_list.map(timer => timer.getSubArea());
    // Scan the input tokens and attempt to match them to a known timer.
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i].toLowerCase();

        // Check if this is an exact timer name, useful if we can dynamically add new timers.
        const areaIndex = timerAreas.indexOf(token);
        if (areaIndex !== -1) {
            newReminder.area = token;
            continue;
        } else {
            const subIndex = timerSubAreas.indexOf(token);
            if (subIndex !== -1) {
                newReminder.area = timerAreas[subIndex];
                newReminder.sub_area = token;
                continue;
            }
        }

        // Attempt to find an area from this token
        if (!newReminder.area && parseTokenForArea(token, newReminder))
            continue;

        // Attempt to find a sub-area from this token.
        if (!newReminder.sub_area && parseTokenForSubArea(token, newReminder))
            continue;

        // Attempt to find a count from this token.
        if (!newReminder.count && parseTokenForCount(token, newReminder))
            continue;

        // Upon reaching here, the token has no area, sub-area, or count information, or those fields
        // were already set, and thus it was not parsed for them.
        if (newReminder.area && newReminder.sub_area && newReminder.count !== null) {
            Logger.log(`MessageHandling: got an extra token '${String(token)}' from user input '${tokens}'.`);
            break;
        }
    }

    return newReminder;
}


/**
 * Attempt to match the input string to known Timer sub-areas. If successful, updates the given reminder.
 * Overwrites any previously-specified area.
 *
 * @param {string} token an input string from the user's message.
 * @param {ReminderRequest} newReminder the seed for a new reminder that will be updated.
 * @returns {boolean} if the token parsed to a sub-area.
 */
function parseTokenForSubArea(token, newReminder) {
    switch (token) {
        // Seasonal Garden seasons aliases.
        case 'fall':
        case 'autumn':
            newReminder.area = 'sg';
            newReminder.sub_area = 'autumn';
            break;
        case 'spring':
            newReminder.area = 'sg';
            newReminder.sub_area = 'spring';
            break;
        case 'summer':
            newReminder.area = 'sg';
            newReminder.sub_area = 'summer';
            break;
        case 'winter':
            newReminder.area = 'sg';
            newReminder.sub_area = 'winter';
            break;

        // Forbidden Grove gate state aliases.
        case 'open':
        case 'opens':
        case 'opened':
        case 'opening':
            newReminder.area = 'fg';
            newReminder.sub_area = 'open';
            break;
        case 'close':
        case 'closed':
        case 'closing':
        case 'shut':
            newReminder.area = 'fg';
            newReminder.sub_area = 'close';
            break;

        // Balack's Cove tide aliases.
        case 'low-tide':
        case 'lowtide':
        case 'low':
            newReminder.area = 'cove';
            newReminder.sub_area = 'low';
            break;
        case 'mid-tide':
        case 'midtide':
        case 'mid':
            newReminder.area = 'cove';
            newReminder.sub_area = 'mid';
            break;
        case 'high-tide':
        case 'hightide':
        case 'high':
            newReminder.area = 'cove';
            newReminder.sub_area = 'high';
            break;

        // Toxic Spill severity level aliases.
        case 'archduke':
        case 'ad':
        case 'archduchess':
        case 'aardwolf':
        case 'arch':
            newReminder.area = 'spill';
            newReminder.sub_area = 'arch';
            break;
        case 'grandduke':
        case 'gd':
        case 'grandduchess':
        case 'grand':
            newReminder.area = 'spill';
            newReminder.sub_area = 'grand';
            break;
        case 'duchess':
        case 'duke':
            newReminder.area = 'spill';
            newReminder.sub_area = 'duke';
            break;
        case 'countess':
        case 'count':
            newReminder.area = 'spill';
            newReminder.sub_area = 'count';
            break;
        case 'baronness':
        case 'baron':
            newReminder.area = 'spill';
            newReminder.sub_area = 'baron';
            break;
        case 'lady':
        case 'lord':
            newReminder.area = 'spill';
            newReminder.sub_area = 'lord';
            break;
        case 'heroine':
        case 'hero':
            newReminder.area = 'spill';
            newReminder.sub_area = 'hero';
            break;

        // This token did not match any known Timer sub-areas.
        default:
            return false;
    }
    return true;
}


/**
 * Attempt to match the input string to a positive integer. If successful, updates the given reminder.
 * Overwrites any previously-specified count.
 *
 * @param {string} token an input string from the user's message.
 * @param {ReminderRequest} newReminder the seed for a new reminder that will be updated.
 * @returns {boolean} if the token parsed to a valid count.
 */
function parseTokenForCount(token, newReminder) {
    switch (token) {
        // Words for numbers...
        case 'once':
        case 'one':
            newReminder.count = 1;
            break;

        case 'twice':
        case 'two':
            newReminder.count = 2;
            break;

        case 'thrice':
        case 'three':
            newReminder.count = 3;
            break;

        case 'always':
        case 'forever':
        case 'unlimited':
        case 'inf':
        case 'infinity':
            newReminder.count = -1;
            break;

        case 'never':
        case 'end':
        case 'forget':
        case 'quit':
        case 'stop':
            newReminder.count = 0;
            break;

        // If it is an actual number, then we can just use it as normal. Note that parseInt will
        // take garbage input like unrepresentably large numbers and coerce to + /-Infinity.
        default:
            if (!isNaN(parseInt(token, 10))) {
                let val = parseInt(token, 10);
                if (val === Infinity || val < 0)
                    val = -1;
                newReminder.count = val;
                break;
            }
            return false;
    }
    return true;
}


/**
 * Attempt to match the input string to known Timer areas. If successful, updates the given reminder.
 *
 * @param {string} token a word or phrase from a Discord message
 * @param {ReminderRequest} newReminder the reminder request being built from the entirety of the input Discord message
 * @returns {boolean} if the token parsed to an area.
 */
function parseTokenForArea(token, newReminder) {
    switch (token) {
        // Seasonal Garden aliases
        case 'sg':
        case 'seasonal':
        case 'season':
        case 'garden':
            newReminder.area = 'sg';
            break;

        // Forbidden Grove aliases
        case 'fg':
        case 'grove':
        case 'gate':
        case 'ar':
        case 'acolyte':
        case 'ripper':
        case 'realm':
            newReminder.area = 'fg';
            break;

        // Game Reset
        case 'reset':
        case 'game':
        case 'midnight':
            newReminder.area = 'reset';
            break;

        case 'rh':
        case 'rhm':
        case 'relic':
            newReminder.area = 'relic_hunter';
            break;

        // Balack's Cove aliases
        case 'cove':
        case 'balack':
        case 'tide':
            newReminder.area = 'cove';
            break;

        // Toxic Spill aliases
        case 'spill':
        case 'toxic':
        case 'ts':
            newReminder.area = 'spill';
            break;

        // This token is not a known timer area.
        default:
            return false;
    }
    return true;
}


/**
 * Returns the next occurrence of the desired class of timers as a MessageEmbed.
 * @param {any[]} timers_list List of known timers
 * @param {ReminderRequest} validTimerData Validated input that is known to match an area and subarea
 * @param {string} botPrefix The prefix for the bot on this guild
 * @returns {MessageEmbed} A rich snippet summary of the next occurrence of the matching timer.
 */
function nextTimer(timers_list, validTimerData, botPrefix) {
    // Inspect all known timers to determine the one that matches the requested area, and occurs soonest.
    const area = validTimerData.area,
        sub = validTimerData.sub_area,
        areaTimers = timers_list.filter(timer => timer.getArea() === area);

    let nextTimer;
    for (const timer of areaTimers)
        if (!sub || sub === timer.getSubArea())
            if (!nextTimer || timer.getNext() < nextTimer.getNext())
                nextTimer = timer;

    const sched_syntax = `${botPrefix} remind ${area}${sub ? ` ${sub}` : ''}`;
    return (new MessageEmbed()
        .setDescription(nextTimer.getDemand()
            + `\n${timeLeft(nextTimer.getNext())}`
            // Putting here makes it look nicer and fit in portrait mode
            + `\nTo schedule this reminder: \`${sched_syntax}\``,
        )
        .setTimestamp(nextTimer.getNext().toJSDate())
        .setFooter('at') // There has to be something in here or there is no footer
    );
}

/**
 * List the reminders for the user, and PM them the result.
 *
 * @param {string} user A Discord Snowflake user id
 * @param {any[]} reminders Array of reminders the bot is managing
 * @param {string} botPrefix The bot prefix for the channel in use
 */
function listRemind(user, reminders, botPrefix) {
    let timer_str = 'Your reminders:';
    let usage_str;

    const userReminders = reminders.filter(r => r.user === user && r.count);
    userReminders.forEach(reminder => {
        // TODO: prettyPrint this info.
        const name = `${reminder.area}${reminder.sub_area ? ` (${reminder.sub_area})` : ''}`;
        timer_str += `\nTimer:\t**${name}**`;
        usage_str = `\`${botPrefix} remind ${reminder.area}`;
        if (reminder.sub_area)
            usage_str += ` ${reminder.sub_area}`;

        timer_str += '\t';
        if (reminder.count === 1)
            timer_str += ' one more time';
        else if (reminder.count === -1)
            timer_str += ' until you stop it';
        else
            timer_str += ` ${reminder.count} times`;

        timer_str += `.\nTo turn off\t${usage_str} stop\`\n`;

        if (reminder.fail)
            timer_str += `There have been ${reminder.fail} failed attempts to activate this reminder.\n`;
    });
    return userReminders.length ? timer_str : 'I found no reminders for you, sorry.';
}


module.exports.getKnownTimersDetails = getKnownTimersDetails;
module.exports.timerAliases = timerAliases;
module.exports.nextTimer = nextTimer;
module.exports.listRemind = listRemind;
