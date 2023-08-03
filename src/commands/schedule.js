// eslint-disable-next-line no-unused-vars
const { Message, Util } = require('discord.js');

const { DateTime, Duration } = require('luxon');
const CommandResult = require('../interfaces/command-result');
const { isDMChannel } = require('../modules/channel-utils');
const { timeLeft, splitMessageRegex } = require('../modules/format-utils');
const Logger = require('../modules/logger');
const { timerAliases } = require('../modules/timer-helper');

const usage = [
    'Displays upcoming reminders know or filtered to an area or sub-area.',
    '<area>            -> specify a particular area with a timer (sg)',
    '<sub-area>        -> specify the specific sub-area for the reminder (autumn)',
    '<number>          -> How many hours into the future you\'re looking',
    'Areas are Seasonal Garden (sg), Forbidden Grove (fg), Toxic Spill (ts), Balack\'s Cove (cove), and the daily reset (reset).',
    'Sub areas are the seasons (winter, spring, summer, fall), open/close, spill ranks, and tide levels (low, mid, high)',
    'Example: "-mh sched 24" will show you the timers for the next 24 hours.',
    'See Also: next; for when a timer occurs next. remind; for setting a reminder for a specific timer.',
].join('\n\t');

/**
 * @param {Message} message
 * @param {string[]} tokens
 * @returns {Promise<CommandResult>}
 */
async function doSCHED(message, tokens) {
    const theResult = new CommandResult({ message, success: false, sentDM: false });
    let reply = '';
    const timerRequest = timerAliases(message.client.timers_list, tokens);

    // Default the searched time period to 24 hours if it was not specified.
    timerRequest.count = timerRequest.count || 24;

    const area = timerRequest.area;

    // Search from 1 hour to 10 days out.
    let req_hours = Duration.fromObject({ hours: timerRequest.count });
    if (!req_hours.isValid) {
        try {
            await message.channel.send('Invalid timespan given - how many hours did you want to look ahead?');
            theResult.replied = true;
            theResult.success = false;
            theResult.sentDM = isDMChannel(message.channel);
        } catch (err) {
            Logger.error('SCHED: failed to send reply', err);
            theResult.botError = true;
        }
        return theResult;
    }
    else if (req_hours.as('hours') <= 0)
        req_hours = req_hours.set({ hours: 24 });
    else if (req_hours.as('days') >= 10)
        req_hours = req_hours.shiftTo('days').set({ days: 10 });

    // Get the next occurrence for every timer. Compare its interval to determine how many of them to include
    const until = DateTime.utc().plus(req_hours);
    /** @type {{time: DateTime, message: string}[]} */
    const upcoming_timers = [];
    const max_timers = 24;
    (!area ? message.client.timers_list : message.client.timers_list.filter(t => t.getArea() === area && !t.isSilent()))
        .forEach(timer => {
            const message = timer.getDemand();
            for (const time of timer.upcoming(until))
                upcoming_timers.push({ time, message });
        });

    // Sort the list of upcoming timers in this area by time, so that the soonest is printed first.
    upcoming_timers.sort((a, b) => a.time - b.time);

    // Make a nice message to display.
    reply = `I have ${upcoming_timers.length} timers coming up in the next ${req_hours.as('hours')} hours`;
    if (upcoming_timers.length > max_timers) {
        reply += `. Here are the next ${max_timers} of them`;
        upcoming_timers.splice(max_timers, upcoming_timers.length);
    }
    reply += upcoming_timers.length ? ':\n' : '.';

    reply = upcoming_timers.reduce((str, val) => {
        return `${str}${val.message} ${timeLeft(val.time)}\n`;
    }, reply);

    if (reply) {
        try {
            // Note that a lot of this is handled by sendInteractiveSearchResult.
            if (typeof reply === 'string') {
                for (const msg of splitMessageRegex(reply)) {
                    await message.channel.send(msg);
                }
            } else {
                await message.channel.send({ embeds: [reply] });
            }
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = isDMChannel(message.channel);
        } catch (err) {
            Logger.error('SCHED: failed to send reply', err);
            theResult.botError = true;
        }
    }
    return theResult;
}

module.exports = {
    name: 'schedule',
    args: true,
    usage: usage,
    description: 'Set and retrieve reminders for MouseHunt Timers',
    canDM: true,
    aliases: ['sched', 'agenda', 'itinerary', 'itin'],
    execute: doSCHED,
};
