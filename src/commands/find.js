// eslint-disable-next-line no-unused-vars
const { Message, CommandInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder } = require('discord.js');

const CommandResult = require('../interfaces/command-result');
const Logger = require('../modules/logger');
const { initialize, extractEventFilter, getMice, formatMice, sendInteractiveSearchResult,
    listFilters, getLoot, formatLoot, save, getFilter } = require('../modules/mhct-lookup');
const { splitMessageRegex } = require('../modules/format-utils');

/**
 *
 * @param {Message} message The message that triggered the action
 * @param {string[]} userArgs The tokens of the command
 * @returns {Promise<CommandResult>} Status of the execution
 */
async function doFIND(message, userArgs) {
    const theResult = new CommandResult({ message, success: false, sentDM: false });
    let reply = '';
    const opts = {};
    const urlInfo = {
        qsParams: {},
        uri: 'https://www.mhct.win/attractions.php',
        type: 'mouse',
    };
    if (!userArgs)
        reply = 'I just cannot find what you\'re looking for (since you didn\'t tell me what it was).';
    else {
        const { tokens, filter } = extractEventFilter(userArgs);
        // Set the filter if it's requested.
        if (filter) {
            opts.timefilter = filter.code_name;
        }

        // Figure out what they're searching for.
        if (tokens[tokens.length - 1].toLowerCase() === 'mouse') {
            tokens.pop();
        }
        const searchString = tokens.join(' ').toLowerCase();
        const all_mice = getMice(searchString, message.client.nicknames.get('mice'));
        if (all_mice && all_mice.length) {
            // We have multiple options, show the interactive menu.
            urlInfo.qsParams = opts;
            sendInteractiveSearchResult(all_mice, message.channel, formatMice,
                message.channel.isDMBased(), urlInfo, searchString);
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = message.channel.isDMBased();
        } else {
            const all_loot = getLoot(searchString, message.client.nicknames.get('loot'));
            if (all_loot && all_loot.length) {
                // We have multiple options, show the interactive menu.
                urlInfo.qsParams = opts;
                urlInfo.type = 'item';
                urlInfo.uri = 'https://www.mhct.win/loot.php';
                sendInteractiveSearchResult(all_loot, message.channel, formatLoot,
                    message.channel.isDMBased(), urlInfo, searchString);
                theResult.replied = true;
                theResult.success = true;
                theResult.sentDM = message.channel.isDMBased();
            } else {
                reply = `I don't know anything about "${searchString}"`;
            }
        }
    }
    if (reply) {
        try {
            // Note that a lot of this is handled by sendInteractiveSearchResult.
            for (const msg of splitMessageRegex(reply, { prepend: '```\n', append: '\n```' })) {
                await message.channel.send(msg);
            }
            theResult.replied = true;
            theResult.success = true;
            theResult.sentDM = message.channel.isDMBased();
        } catch (err) {
            Logger.error('FIND: failed to send reply', err);
            theResult.botError = true;
        }
    }
    return theResult;
}

function helpFind() {
    let reply = '-mh find [filter] mouse:\nFind the attraction rates for a mouse (nicknames allowed, filters optional).\n';
    reply += 'Known filters: `current`, ' + listFilters();
    return reply;
}

/**
 * Reply to an autotype request. Technically this could be folded into the interact?
 * @param {CommandInteraction} interaction Must be an autocomplete interaction
 */
async function autotype(interaction) {
    if (interaction.isAutocomplete()) {
        const focusedOption = interaction.options.getFocused(true);
        let choices = [];
        if (focusedOption.name === 'mouse') {
            choices = getMice(focusedOption.value, interaction.client.nicknames.get('mice'));
            if (choices) {
                await interaction.respond(
                    choices.map(mouse => ({ name: mouse.value, value: mouse.value })),
                );
            }
        }
        else if (focusedOption.name === 'filter') {
            choices = getFilter(focusedOption.value);
            if (choices) {
                await interaction.respond(
                    choices.map(filter => ({ name: filter.code_name, value: filter.code_name })),
                );
            }
        }
    }
}

/**
 * Reply to an interaction
 * @param {CommandInteraction} interaction -- the thing to respond to
 */
async function interact(interaction) {
    if (interaction.isChatInputCommand()) {
        let mouse = {};
        await interaction.deferReply({ ephemeral: true });
        const search_string = interaction.options.getString('mouse');
        const all_mice = getMice(search_string);
        let results = 'Somehow you did not search for a mouse'; // also happens when no matching mouse
        if (all_mice && all_mice.length) {
            mouse = all_mice[0];
            results = await formatMice(true, mouse, { timefilter: interaction.options.getString('filter') || 'all_time' });
            // Here we need to split the results into chunks. The button goes on the last chunk?
            const result_pages = splitMessageRegex(results, { maxLength: 1800, prepend: '```', append: '```' });
            await interactionDisplayPage(interaction, result_pages, 0);
        } else {
            // TODO: Figure out how to see what was provided when it didn't match a mouse...
            await interaction.editReply({ content: `Your search for '${search_string}' was not a success...`, ephemeral: true });
        }
    } else {
        Logger.error('Somehow find-mouse command interaction was called without a mouse');
    }
}

async function interactionDisplayPage(interaction, pages, current_page) {
    if (interaction.id && interaction.isChatInputCommand() && pages.length) {
        current_page = current_page || 0;
        // Build buttons
        let buttons = new ActionRowBuilder();
        if (pages.length > current_page + 1) {
            buttons = buttons.addComponents(new ButtonBuilder()
                .setCustomId(`fmmore_${interaction.id}_${current_page}`)
                .setLabel('More Results')
                .setStyle(ButtonStyle.Primary));
            // Logger.log(`FIND: Page ${current_page} of ${pages.length}`);
        }
        const share_button = new ButtonBuilder()
            .setCustomId(`fmshare_${interaction.id}_${current_page}`)
            .setLabel('Send to Channel')
            .setStyle(ButtonStyle.Primary);
        buttons = buttons.addComponents(share_button); 
        // Set filter
        const filter = f => (f.customId === `fmshare_${interaction.id}_${current_page}` || f.customId === `fmmore_${interaction.id}_${current_page}`) 
                            && f.user.id === interaction.user.id;
        // Set collector
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 1 * 60 * 1000 });
        collector.on('collect', async c => {
            if (c.customId === `fmshare_${interaction.id}_${current_page}`) {
                const sharer = interaction.user;
                const allow_share = true;
                if (allow_share) {
                    // TODO: Probably better to calculate X lines of attractions for sharing
                    await c.message.channel.send({ content: `<@${sharer.id}> used \`/find-mouse ${interaction.options.getString('mouse')}\`:\n${pages[current_page]}` });
                    await c.update({ content: 'Shared', ephemeral: true, components: [ buttons ] })
                        .catch((error) => Logger.error(error));
                } else {
                    await c.reply( { content: 'Sorry, share is turned off right now', ephemeral: true } );
                }
            }
            else if (c.customId === `fmmore_${interaction.id}_${current_page}`) {
                // Here we use only the first chunk of results for sharing if it's not a DM
                // Logger.log(`Find-mouse: Sending next page of results, ${current_page}`);
                await interactionDisplayPage(interaction, pages, current_page+1);
                await c.update({ content: pages[current_page], components: [ buttons ] })
                    .catch((error) => Logger.error(error));
            }
        });
        collector.on('end', async () => {
            await interaction.editReply({ content: pages[current_page], components: [] })
                .catch(e => {
                    Logger.error(`FIND-MOUSE: ${e}`);
                });
        });
        // Send message
        if (current_page === 0) {
            await interaction.editReply({ content: pages[current_page], ephemeral: true, components: [ buttons ] });
        } else {
            await interaction.followUp({ content: pages[current_page], ephemeral: true, components: [ buttons ] });
        }
    }
}

// Build the slashcommand usage and things
const slashCommand = new SlashCommandBuilder()
    .setName('find-mouse')
    .setDescription('Get the attraction rates for a mouse')
    .setDMPermission(true)
    .addStringOption(option =>
        option.setName('mouse')
            .setDescription('The mouse to look up')
            .setRequired(true)
            .setAutocomplete(true))
    .addStringOption(option =>
        option.setName('filter')
            .setDescription('The specific power type to look up (Default: all)')
            .setRequired(false)
            .setAutocomplete(true));

module.exports = {
    name: 'find-mouse',
    args: true,
    usage: 'Coming Soon',
    helpFunction: helpFind,
    description: 'Find mice sorted by their attraction rates',
    canDM: true,
    aliases: ['mfind', 'find'],
    slashCommand: slashCommand,
    autocompleteHandler: autotype,
    interactionHandler: interact,
    execute: doFIND,
    initialize: initialize,
    save: save,
};
