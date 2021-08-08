const Logger = require('../modules/logger');
const { initialize, getMice, getMinluckString, save } = require('../modules/mhct-lookup');
const CommandResult = require('../interfaces/command-result');

const usage = [
    'minluck [-A] [-a] [-d] [-f] [-h] [-l] [-p] [-P] [-s] [-t] [-r] <mouse>',
    '-A[ll]         : All power types. This is the default.',
    '-a[rcane]      : Arcane',
    '-d[raconic]    : Draconic',
    '-f[orgotten]   : Forgotten',
    '-h[ydro]       : Hydro',
    '-l[aw]         : Law',
    '-p[hysical]    : Physical',
    '-P[arental]    : Parental (note the capital P)',
    '-s[hadow]      : Shadow',
    '-t[actical]    : Tactical',
    '-r[ift]        : Rift',
    'Only the first letter after the dash is considered, Parental must be a capital P, Physical must be lowercase p.',
].join('\n\t');

const typeMap = {
    'a': 'Arcane',
    'd': 'Draconic',
    'f': 'Forgotten',
    'h': 'Hydro',
    'l': 'Law',
    'p': 'Physical',
    'P': 'Parental',
    's': 'Shadow',
    't': 'Tactical',
    'r': 'Rift',
};

/**
 * Get the minluck of a mouse
 * @param {Message} message The message that triggered the action
 * @param {Array} tokens The tokens of the command
 * @returns {Promise<CommandResult>} Status of the execution
 */

async function doMINLUCK(message, tokens) {
    const theResult = new CommandResult({ message, success: false, sentDM: false });
    const allFlags = Object.keys(typeMap);
    let reply = '';
    if (!tokens)
        reply = 'Yeah, good luck with that...';
    else {
        const commandFlags = tokens.filter(word => word.charAt(0) === '-');
        let flags = commandFlags.map(flag => {
            if (flag.length > 1 && flag.charAt(1) === 'A') {
                return allFlags;
            }
            if (flag.length > 1 && flag.charAt(1) === 'P') {
                return 'P';
            }
            if (flag.length > 1 && flag.charAt(1) !== 'P') {
                if (flag.charAt(1).toLowerCase() in typeMap)
                    return flag.charAt(1).toLowerCase();
            }
        }).filter(word => !!word);
        if (!flags.length)
            flags = allFlags;
        flags = flags.flat().filter((value, index, self) => self.indexOf(value) === index);
        // Figure out what they're searching for
        if (tokens[tokens.length - 1].toLowerCase() === 'mouse') {
            tokens.pop();
        }
        const searchString = tokens.filter(word => word.charAt(0) !== '-').join(' ');
        const all_mice = getMice(searchString, message.client.nicknames.get('mice'));
        if (all_mice && all_mice.length) {
            if (all_mice.length > 1)
                reply = 'I found multiple matches, here is the first.';
            // all_mice.splice(1);
            // all_mice.id is the mhct id, all_mice.value is the text name of the mouse
            const types = flags.map(f => {
                if (f in typeMap)
                    return typeMap[f];
            });
            reply = getMinluckString(all_mice[0].value, types);
        }
    }
    if (reply) {
        try {
            if (typeof reply === 'string') {
                await message.channel.send(reply);
            } else {
                await message.channel.send('', { embeds: [reply] });
            }
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = ['dm', 'group'].includes(message.channel.type);
        } catch (err) {
            Logger.error('NEXT: failed to send reply', err);
            theResult.botError = true;
        }
    }
    return theResult;

}

module.exports = {
    name: 'minluck',
    args: true,
    usage: usage,
    description: 'Get the minluck values of mice - this is the lowest luck stat that "guarantees" a catch of that mouse with that power type.',
    canDM: true,
    aliases: [ 'luck', 'mluck' ],
    execute: doMINLUCK,
    initialize: initialize,
    save: save,
};

