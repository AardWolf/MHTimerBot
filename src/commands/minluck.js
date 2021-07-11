const Logger = require('../modules/logger');
const { initialize, getMice, save } = require('../modules/mhct-lookup');
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
    'Only the first letter after the dash is considered, Parental must be a capital P, Physical must be lowercase p.'
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
}

/**
 * Get the minluck of a mouse
 * @param {Message} message The message that triggered the action
 * @param {Array} tokens The tokens of the command
 * @returns {Promise<CommandResult>} Status of the execution
 */

async function doMINLUCK(message, tokens) {
    const theResult = new CommandResult({ message, success: false, sentDM: false });
    const flags = [];
    const allFlags = Object.keys(typeMap);
    let reply = '';
    if (!tokens)
        reply = 'Yeah, good luck with that...';
    else {
        const commandFlags = tokens.filter(word => word.charAt(0) === '-');
        commandFlags.forEach(flag => {
            if (flag.length > 1 && flag.charAt(1) === 'A') {
                return allFlags;
            }
            if (flag.length > 1 && flag.charAt(1) === 'P') {
                return flag.charAt(1).toLowerCase();
            }
            if (flag.length > 1 && flag.charAt(1) !== 'P') {
                if (flag.charAt(1).toLowerCase() in typeMap)
                    return flag.charAt(1).toLowerCase();
            }
        }).filter((value, index, self) => self.indexOf(value) === index);
        // Figure out what they're searching for
        if (tokens[tokens.length - 1].toLowerCase() === 'mouse') {
            tokens.pop();
        }
        const searchString = tokens.filter(word => word.charAt(0) !=== '-').join(' ');
        const all_mice = getMice(searchString, message.client.nicknames.get('mice'));
        if (all_mice && all_mice.length) {
            if (all_mice.length > 1)
                reply = 'I found multiple matches, here is the first.';
            all_mice.splice(1);
            // all_mice.id is the mhct id, all_mice.value is the text name of the mouse

        }
    }

}

module.exports = {
    name: 'minluck',
    args: true,
    usage: 'minluck [-A] [-a] [-d] [-f] [-h] [-p] [-s] [-t] [-l] [-r] <mouse>',
    description: 'Get the minluck values of mice - this is the lowest luck stat that "guarantees" a catch of that mouse with that power type.',
    canDM: true,
    aliases: [ 'luck', 'mluck' ],
    execute: doMINLUCK,
    initialize: initialize,
    save: save,
};

