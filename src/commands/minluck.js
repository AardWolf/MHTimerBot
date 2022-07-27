// eslint-disable-next-line no-unused-vars
const { Message, CommandInteraction, MessageActionRow, MessageButton, Constants } = require('discord.js');
const { SlashCommandBuilder } = require('@discordjs/builders');

const CommandResult = require('../interfaces/command-result');
const { isDMChannel } = require('../modules/channel-utils');
const Logger = require('../modules/logger');
const { initialize, getMice, getMinluckString, save } = require('../modules/mhct-lookup');

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
 * @param {string[]} tokens The tokens of the command
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
        }).filter(word => Boolean(word));
        if (!flags.length)
            flags = allFlags;
        flags = flags.flat().filter((value, index, self) => self.indexOf(value) === index);
        // Figure out what they're searching for
        if (tokens.length > 0 && tokens[tokens.length - 1].toLowerCase() === 'mouse') { // Issue #244
            tokens.pop();
        }
        const searchString = tokens.filter(word => word.charAt(0) !== '-').join(' ');
        reply = getMinLuck(message, searchString, flags);
    }
    if (reply) {
        try {
            await message.channel.send((typeof reply === 'string') ? reply : { embeds: [reply] });
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = isDMChannel(message.channel);
        } catch (err) {
            Logger.error('MINLUCK: failed to send reply', err);
            theResult.botError = true;
        }
    }
    return theResult;

}

/**
 * Get the string for minluck for a mouse
 * @param {Message|CommandInteraction} message -- Hook back to the bot client
 * @param {String} mouse -- Search string
 * @param {String|Array} flags -- Power type flags
 *
 * @returns {String} -- Minluck result as a string
 */
function getMinLuck(message, mouse, flags) {
    if (!mouse || mouse === '') {
        return 'Looks like you forgot what you were searching for';
    }
    if (!flags || flags === '*' || flags === ['*']) {
        flags = Object.keys(typeMap);
    }
    if (!Array.isArray(flags)) {
        flags = [flags];
    }
    let reply = '';
    const all_mice = getMice(mouse, message.client.nicknames.get('mice'));
    if (all_mice && all_mice.length) {
        if (all_mice.length > 1)
            reply = 'I found multiple matches, here is the first.\n';
        // all_mice.id is the mhct id, all_mice.value is the text name of the mouse.
        const types = flags.map(f => {
            if (f in typeMap)
                return typeMap[f];
        }).filter(type => !!type );
        if ('guildId' in message 
            && message['guildId']
            && message['guildId'] in message.client.settings.guilds
            && 'emoji' in message.client.settings.guilds[message.guildId]) {
            reply += getMinluckString(all_mice[0].value, types, false, message.client.settings.guilds[message.guild.id].emoji);
        } else {
            reply += getMinluckString(all_mice[0].value, types, false);
        }
    } else {
        reply = `I did not find ${mouse}`;
    }
    return reply;
}

/**
 * Reply to an interaction
 * @param {CommandInteraction} interaction -- the thing to respond to
 */
async function interact(interaction) {
    if (interaction.isCommand()) {
        const filter = f => f.customId === interaction.id && f.user.id === interaction.user.id;
        const shareButton = new MessageActionRow()
            .addComponents(
                new MessageButton()
                    .setCustomId(interaction.id)
                    .setLabel('Send to Channel')
                    .setStyle('PRIMARY'),
            );
        const results = getMinLuck(interaction, interaction.options.getString('mouse'), interaction.options.getString('powertype'));
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 1 * 60 * 1000 });
        collector.on('collect', async c => {
            const sharer = interaction.user;
            await c.message.channel.send( { content: `<@${sharer.id}> used \`/minluck ${interaction.options.getString('mouse')}\`:\n${results}` });
            await c.update({ content: 'Shared', ephemeral: false, components: [] });

            // await interaction.editReply({ content: results, ephemeral: false, components: [] }); // Does not stop it from being ephemeral
        });
        collector.on('end', async () => {
            await interaction.editReply({ content: results, components: [] });
        });
        await interaction.reply({ content: results, ephemeral: true, components: [shareButton] });
    } else {
        Logger.error('Somehow minluck command interaction was called without a command');
    }
}

/**
 * Reply to an autotype request. Technically this could be folded into the interact?
 * @param {CommandInteraction} interaction Must be an autocomplete interaction
 */
async function automice(interaction) {
    if (interaction.isAutocomplete()) {
        const focus = interaction.options.getFocused();
        const all_mice = getMice(focus, interaction.client.nicknames.get('mice'));
        if (all_mice) {
            await interaction.respond(
                all_mice.map(mouse => ({ name: mouse.value, value: mouse.value })),
            );
        }
    }
}

// Build the slashCommand registration JSON.
const slashCommand = new SlashCommandBuilder()
    .setName('minluck')
    .setDescription('Get the minluck values for a mouse')
    .setDMPermission(true)
    .addStringOption(option =>
        option.setName('mouse')
            .setDescription('The mouse to look up')
            .setRequired(true)
            .setAutocomplete(true))
    .addStringOption(option =>
        option.setName('powertype')
            .setDescription('The specific power type to look up (Default: all)')
            .setRequired(false)
            .addChoices(
                { name: 'All', value: '*' },
                { name: 'Arcane', value: 'a' },
                { name: 'Draconic', value: 'd' },
                { name: 'Forgotten', value: 'f' },
                { name: 'Hydro', value: 'h' },
                { name: 'Law', value: 'l' },
                { name: 'Physical', value: 'p' },
                { name: 'Shadow', value: 's' },
                { name: 'Tactical', value: 't' },
                { name: 'Rift', value: 'r' },
            ));

module.exports = {
    name: 'minluck',
    args: true,
    usage: usage,
    description: 'Get the minluck values of mice - this is the lowest luck stat that "guarantees" a catch of that mouse with that power type.',
    canDM: true,
    aliases: [ 'luck', 'lucks', 'mluck', 'mlucks', 'minlucks' ],
    slashCommand: slashCommand,
    autocompleteHandler: automice,
    interactionHandler: interact,
    execute: doMINLUCK,
    initialize: initialize,
    save: save,
};
