/**
 * MHTimer Bot
 */
// Import required modules
const { DateTime, Duration, Interval } = require('luxon');
const Discord = require('discord.js');
const fs = require('fs');

// Extract type-hinting definitions for Discord classes.
// eslint-disable-next-line no-unused-vars
const { Client, Collection, Guild, GuildMember, Intents, Message, MessageReaction, MessageEmbed, TextChannel, User } = Discord;

// Import our own local classes and functions.
const Timer = require('./modules/timers.js');
const CommandResult = require('./interfaces/command-result');
const {
    oxfordStringifyValues,
    splitString,
    timeLeft,
    unescapeEntities,
    isValidURL,
} = require('./modules/format-utils');
const { loadDataFromJSON, saveDataAsJSON } = require('./modules/file-utils');
const Logger = require('./modules/logger');
const {
    addMessageReaction,
} = require('./modules/message-utils');
const security = require('./modules/security.js');

// Access external URIs, like @devjacksmith 's tools.
const fetch = require('node-fetch');
// We need more robust CSV handling
const csv_parse = require('csv-parse');

// Globals
const client = new Client({ disabledEvents: ['TYPING_START'],
    intents: [Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_EMOJIS_AND_STICKERS,
        Intents.FLAGS.DIRECT_MESSAGES,
        Intents.FLAGS.DIRECT_MESSAGE_REACTIONS],
    partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });
const textChannelTypes = new Set(['GUILD_TEXT', 'DM', 'GROUP_DM', 'GUILD_NEWS', 'GUILD_NEWS_THREAD', 'GUILD_PUBLIC_THREAD', 'GUILD_PRIVATE_THREAD']);
const main_settings_filename = 'data/settings.json',
    timer_settings_filename = 'data/timer_settings.json',
    reminder_filename = 'data/reminders.json',
    dbgames_filename = 'data/dbgames_locations.json',
    nickname_urls_filename = 'data/nicknames.json';

const settings = {},
    dbgames_locations = {},
    relic_hunter = {
        location: 'unknown',
        source: 'startup',
        last_seen: DateTime.fromMillis(0),
        timeout: null,
    },
    nickname_urls = {};

client.nicknames = new Map();
/** @type {Timer[]} */
client.timers_list = [];
/** @type {TimerReminder[]} */
client.reminders = [];

const refresh_rate = Duration.fromObject({ minutes: 5 });
/** @type {Object<string, DateTime>} */
const last_timestamps = {
    reminder_save: DateTime.utc(),
};

/** @type {Object <string, NodeJS.Timer>} */
const dataTimers = {};
/** @type {Map <string, {active: boolean, channels: TextChannel[], inactiveChannels: TextChannel[]}>} */
const timer_config = new Map();

// A collection to hold all the commands in the commands directory
client.commands = new Collection();
const commandFiles = fs.readdirSync('src/commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    try {
        const command = require(`./commands/${file}`);
        if (command.name) {
            if (typeof(command.canDM) === 'undefined') {
                command.canDM = true;
                Logger.log(`Set canDM to true for ${command.name}`);
            }
            if (command.initialize) {
                command.initialize().catch((err) => {
                    Logger.error(`Error initializing ${command.name}: ${err}`);
                    throw err;
                });
            }
            client.commands.set(command.name, command);
        } else {
            Logger.error(`Error in ${file}: Command name property is missing`);
        }
    } catch (e) {
        Logger.error(`Could not load ${file}:`, e);
    }
}
Logger.log(`Commands: Loaded ${client.commands.size} commands: ${oxfordStringifyValues(client.commands.map(command => command.name))}`);

process.once('SIGINT', () => {
    client.destroy();
});
process.once('SIGTERM', () => {
    client.destroy();
});

process.on('uncaughtException', exception => {
    Logger.error(exception);
    doSaveAll().then(didSave => Logger.log(`Save status: files ${didSave ? '' : 'maybe '}saved.`));
});

function Main() {
    // Load saved settings data, such as the token for the bot.
    loadSettings()
        .then(hasSettings => {
            if (!hasSettings) {
                process.exitCode = 1;
                throw new Error('Exiting due to failure to acquire local settings data.');
            }
            function failedLoad(prefix, reason) {
                Logger.log(prefix, reason);
                return false;
            }
            // Settings loaded successfully, so initiate loading of other resources.
            const saveInterval = refresh_rate.as('milliseconds');

            // Schedule the daily Relic Hunter reset. Reset cancelled by issue 152
            // rescheduleResetRH();

            // Create timers list from the timers file.
            const hasTimers = loadTimers()
                .then(timerData => {
                    createTimersFromList(timerData);
                    Logger.log(`Timers: imported ${timerData.length} from file.`);
                    return client.timers_list.length > 0;
                })
                .catch(err => failedLoad('Timers: import error:\n', err));

            // Create reminders list from the reminders file.
            const hasReminders = loadReminders()
                .then(reminderData => {
                    if (createRemindersFromData(reminderData))
                        pruneExpiredReminders();
                    Logger.log(`Reminders: imported ${reminderData.length} from file.`);
                    return client.reminders.length > 0;
                })
                .catch(err => failedLoad('Reminders: import error:\n', err));
            hasReminders.then(() => {
                Logger.log(`Reminders: Configuring save every ${saveInterval / (60 * 1000)} min.`);
                dataTimers['reminders'] = setInterval(() => {
                    pruneExpiredReminders();
                    saveReminders();
                }, saveInterval);
            });

            // Register known nickname URIs
            const hasNicknames = loadNicknameURLs()
                .then(urls => {
                    Object.assign(nickname_urls, urls);
                    Logger.log(`Nicknames: imported ${Object.keys(urls).length} sources from file.`);
                    return Object.keys(nickname_urls).length > 0;
                })
                .catch(err => failedLoad('Nicknames: import error:\n', err));
            hasNicknames
                .then(refreshNicknameData)
                .then(() => {
                    Logger.log(`Nicknames: Configuring data refresh every ${saveInterval / (60 * 1000)} min.`);
                    dataTimers['nicknames'] = setInterval(refreshNicknameData, saveInterval);
                });

            // Register DBGames short -> long mappings
            const hasDBGamesLocations = loadDBGamesLocations()
                .then(DBGamesLocationData => {
                    Object.assign(dbgames_locations, DBGamesLocationData);
                    Logger.log(`DBGames Location: imported ${Object.keys(dbgames_locations).length} from file.`);
                    return Object.keys(dbgames_locations).length > 0;
                })
                .catch(err => failedLoad('DBGames Location: import error:\n', err));

            // Start loading remote data.
            const remoteData = [
                getRHLocation(),
            ];

            // Configure the bot behavior.
            client.once('ready', () => {
                Logger.log('I am alive!');
                // Migrate settings at this point since connection required for some pieces
                migrateSettings(client.settings);

                // Find all text channels on which to send announcements.
                const announcables = client.guilds.cache.reduce((channels, guild) => {
                    const requested = client.settings.guilds[guild.id].timedAnnouncementChannels;
                    const candidates = guild.channels.cache
                        .filter(c => requested.has(c.name) && textChannelTypes.has(c.type));
                    if (candidates.size)
                        Array.prototype.push.apply(channels, Array.from(candidates.values()));
                    else if (requested.size) {
                        Logger.warn(`Timers: No valid channels in ${guild.name} for announcements.`);
                    }
                    return channels;
                }, []);

                // Use one timeout per timer to manage default reminders and announcements.
                client.timers_list.forEach(timer => scheduleTimer(timer, announcables));
                Logger.log(`Timers: Initialized ${timer_config.size} timers on channels ${oxfordStringifyValues(announcables.map(c => `${c.guild.name}#${c.name}`))}.`);

                // If we disconnect and then reconnect, do not bother rescheduling the already-scheduled timers.
                client.on('ready', () => Logger.log('I am inVINCEeble!'));
            });

            // Message handling.
            const re = {};
            for (const guild in client.settings.guilds) {
                if (client.settings.guilds[guild].botPrefix)
                    re[guild] = new RegExp('^' + client.settings.guilds[guild].botPrefix.trim() + '\\s');
            }
            client.on('messageCreate', message => {
                if (message.author.id === client.user.id)
                    return;

                if (message.webhookId === settings.relic_hunter_webhook)
                    handleRHWebhook(message);

                switch (message.channel.name) {
                    case settings.linkConversionChannel:
                        if (/(http[s]?:\/\/htgb\.co\/)/g.test(message.content.toLowerCase()))
                            convertRewardLink(message);
                        break;
                    default:
                        if (message.channel.type === 'DM' || message.channel.type === 'GROUP_DM')
                            parseUserMessage(message);
                        else if (re[message.guild.id].test(message.content))
                            parseUserMessage(message);
                        break;
                }
            });

            // WebSocket connection error for the bot client.
            client.on('error', error => {
                Logger.error(`Discord Client Error Received: "${error.message}"\n`, error.error);
            //    quit(); // Should we? or just let it attempt to reconnect?
            });

            client.on('shardReconnecting', () => Logger.log('Connection lost, reconnecting to Discord...'));
            // WebSocket disconnected and is no longer trying to reconnect.
            client.on('shardDisconnect', event => {
                Logger.log(`Client socket closed: ${event.reason || 'No reason given'}`);
                Logger.log(`Socket close code: ${event.code} (${event.wasClean ? '' : 'not '}cleanly closed)`);
                quit();
            });
            // Configuration complete. Using Promise.all() requires these tasks to complete
            // prior to bot login.
            return Promise.all([
                hasNicknames,
                hasReminders,
                hasTimers,
                hasDBGamesLocations,
                ...remoteData,
            ]);
        })
        // Finally, log in now that we have loaded all data from disk,
        // requested data from remote sources, and configured the bot.
        .then(() => client.login(settings.token))
        .catch(err => {
            Logger.error('Unhandled startup error, shutting down:', err);
            client.destroy();
            process.exitCode = 1;
            return quit();
        });
}
try {
    Main();
}
catch(error) {
    Logger.error('Error executing Main:\n', error);
}

function quit() {
    return doSaveAll()
        .then(
            () => Logger.log('Shutdown: data saves completed'),
            (err) => {
                Logger.error('Shutdown: error while saving:\n', err);
                process.exitCode = 1;
            },
        )
        .then(() => { Logger.log('Shutdown: destroying client'); return client.destroy(); })
        .then(() => {
            Logger.log('Shutdown: deactivating data refreshes');
            for (const timer of Object.values(dataTimers))
                clearInterval(timer);
            Logger.log('Shutdown: deactivating timers');
            for (const timer of client.timers_list) {
                timer.stopInterval();
                timer.stopTimeout();
            }
            if (relic_hunter.timeout) {
                clearTimeout(relic_hunter.timeout);
            }
        })
        .then(() => process.exit())
        .catch(err => {
            Logger.error('Shutdown: unhandled error:\n', err, '\nImmediately exiting.');
            process.exit(1);
        });
}

/**
 * Any object which stores user-entered data should be periodically saved, or at minimum saved before
 * the bot shuts down, to minimize data loss.
 * @returns {Promise<boolean>} Whether volatile data was serialized, or perhaps not serialized.
 */
async function doSaveAll() {
    const saveableCommands = client.commands.filter(command => typeof command.save === 'function');
    const settingsSaved = await saveSettings();
    const remindersSaved = await saveReminders();
    const commandsSaved = await Promise.all(saveableCommands.map(c => {
        Logger.log(`Saving data for command "${c.name}"`);
        return c.save();
    }));
    return settingsSaved && remindersSaved && commandsSaved.every(saved => saved);
}

/**
 * Takes a settings object and performs whatever migration tasks are needed to get them to current version
 * @param {object} original_settings The settings read from disk
 *
 * Doesn't return anything; throws on errors
 */
function migrateSettings(original_settings) {
    if (!('version' in original_settings)) {
        Logger.log('Settings: Migrating from version 0');
        const guild_settings = {
            timedAnnouncementChannels: new Set(Array.from(original_settings.timedAnnouncementChannels)),
            linkConversionChannel: original_settings.linkConversionChannel,
            botPrefix: original_settings.botPrefix.trim(),
        };
        original_settings.guilds = client.guilds.cache.reduce((acc, guild) => {
            acc[guild.id] = guild_settings;
            return acc;
        }, {});
        original_settings.version = '1.00';
        delete original_settings.timedAnnouncementChannels;
        delete original_settings.linkConversionChannel;
    }
    // Perform additional updates based on the source version.
    switch (original_settings.version) {
        case '1.00':
            break;
        default:
            Logger.warn(`Unknown settings version "${original_settings.version}"`);
    }
}

/**
 * Load (or reload) settings from the input path, defaulting to the value of 'main_settings_filename'.
 * Any keys in the global settings object will be overwritten if they are defined in the file.
 *
 * @param {string} [path] The path to a JSON file to read data from. Default is the 'main_settings_filename'.
 * @returns {Promise <boolean>} Whether the read was successful.
 */
function loadSettings(path = main_settings_filename) {
    return loadDataFromJSON(path).then(data => {
        // (Re)initialize any keys to the value specified in the file.
        Object.assign(settings, data);
        // Version-agnostic defaults
        settings.relic_hunter_webhook = settings.relic_hunter_webhook || '283571156236107777';
        settings.owner = settings.owner || '0'; // So things don't fail if it's unset

        // Pre version 1.00 logic
        if (!('version' in settings)) {
            // Set defaults if they were not specified.
            if (!settings.linkConversionChannel)
                settings.linkConversionChannel = 'larrys-freebies';

            if (!settings.timedAnnouncementChannels)
                settings.timedAnnouncementChannels = ['timers'];
            if (!Array.isArray(settings.timedAnnouncementChannels)) {
                Logger.warn('Settings: attempting to parse unexpected "timed announcement channel" format');
                if (typeof settings.timedAnnouncementChannels === 'string') {
                    settings.timedAnnouncementChannels = settings.timedAnnouncementChannels.split(',').map(s => s.trim());
                } else if (typeof settings.timedAnnouncementChannels === 'object') {
                    settings.timedAnnouncementChannels = Object.keys(settings.timedAnnouncementChannels);
                }
            }
            settings.timedAnnouncementChannels = new Set(settings.timedAnnouncementChannels);
            settings.botPrefix = settings.botPrefix ? settings.botPrefix.trim() : '-mh';
        } else {
            for (const guild of Object.values(settings.guilds)) {
                guild.timedAnnouncementChannels = new Set(guild.timedAnnouncementChannels);
                if (guild.newBotPrefix) {
                    Logger.log(`Settings: Migrating bot prefix to ${guild.newBotPrefix} for ${guild}`);
                    guild.botPrefix = guild.newBotPrefix;
                    delete guild.newBotPrefix;
                }
            }
        }
        if (settings.DBGames && !isValidURL(settings.DBGames)) {
            settings.DBGames = false;
            Logger.warn('Settings: invalid value for DBGames, set to false');
        }
        client.settings = settings;

        return true;
    }).catch(err => {
        Logger.error(`Settings: error while reading settings from '${path}':\n`, err);
        return false;
    });
}

/**
 * Writes out the current settings to a file
 *
 * @param {string} [path] The file to save to
 * @returns {Promise<boolean>}
 */
function saveSettings(path = main_settings_filename) {
    // If we couldn't read settings in, don't overwrite the existing settings.
    if (!client.settings || !Object.keys(client.settings).length) {
        return Promise.resolve(false);
    }
    const outobj = Object.assign({}, client.settings);
    for (const guild of Object.values(outobj.guilds)) {
        guild.timedAnnouncementChannels = Array.from(guild.timedAnnouncementChannels);
    }
    return saveDataAsJSON(path, outobj);
}

/**
 * Load DBGames Location data from the input path, defaulting to the value of 'dbgames_filename'.
 * Returns an object mapping short names to long (or an empty array if there was an error reading the file)
 *
 * @param {string} [path] The path to a JSON file to read data from. Default is the 'dbgames_filename'
 * @returns {Promise <Object>} keys of short names with values of long/pretty names
 */
function loadDBGamesLocations(path = dbgames_filename) {
    return loadDataFromJSON(path).catch(err => {
        Logger.error(`DBGamesLocation: Error loading data from '${path}':\n`, err);
        return {};
    });
}

/**
 * Load timer data from the input path, defaulting to the value of 'timer_settings_filename'.
 * Returns an array of data objects (or an empty array if there was an error reading the file)
 * that can be made into timers.
 *
 * @param {string} [path] The path to a JSON file to read data from. Default is the 'timer_settings_filename'
 * @returns {Promise <TimerSeed[]>} All local information for creating timers
 */
function loadTimers(path = timer_settings_filename) {
    return loadDataFromJSON(path).then(data => {
        return Array.isArray(data) ? data : Array.from(data);
    }).catch(err => {
        Logger.error(`Timers: error during load from '${path}'. None loaded.\n`, err);
        return [];
    });
}

/**
 * Create Timer objects from the given array input.
 * Returns true if any timers were created, false if none were created.
 *
 * @param {TimerSeed[]} timerData An array containing data objects, each of which can create a timer, e.g. a timer "seed"
 * @returns {boolean} Whether or not any timers were created from the input.
 */
function createTimersFromList(timerData) {
    const knownTimers = client.timers_list.length;
    for (const seed of timerData) {
        let timer;
        try {
            timer = new Timer(seed);
        } catch (err) {
            Logger.error(`Timers: error occured while constructing timer: '${err}'. Received object:\n`, seed);
            continue;
        }
        client.timers_list.push(timer);
    }
    return client.timers_list.length !== knownTimers;
}

/**
 * Create the timeout (and interval) that will activate this particular timer, in order to send
 * its default announcement and its default reminders.
 *
 * @param {Timer} timer The timer to schedule.
 * @param {TextChannel[]} channels the channels on which this timer will initially perform announcements.
 */
function scheduleTimer(timer, channels) {
    if (timer.isSilent())
        return;
    if (!channels.length)
        return;
    const msUntilActivation = timer.getNext().diffNow().minus(timer.getAdvanceNotice()).as('milliseconds');
    timer.storeTimeout('scheduling',
        setTimeout(t => {
            t.stopTimeout('scheduling');
            t.storeInterval('scheduling',
                setInterval(timer => {
                    doRemind(timer);
                    doAnnounce(timer);
                }, t.getRepeatInterval().as('milliseconds'), t),
            );
            doRemind(t);
            doAnnounce(t);
        }, msUntilActivation, timer),
    );
    timer_config.set(timer.id, { active: true, channels, inactiveChannels: [] });
}

/**
 * The meat of user interaction. Receives the message that starts with the magic
 * character and decides if it knows what to do next.
 *
 * @param {Message} message a Discord message to parse
 */
function parseUserMessage(message) {
    const tokens = splitString(message.content);
    if (!tokens.length) {
        message.channel.send('What is happening???');
        return;
    }

    // Messages that come in from public chat channels will be prefixed with the bot's command prefix.
    const prefix = message.guild ? message.client.settings.guilds[message.guild.id].botPrefix.trim() :
        message.client.settings.botPrefix.trim();
    if (tokens[0] === prefix)
        tokens.shift();

    let command = tokens.shift(); // changed from const for RH case. TODO: Change back to const
    if (!command) {
        message.channel.send('I didn\'t understand, but you can ask me for help.');
        return;
    }
    // Today's hack brought to you by laziness - haven't migrated notifications/timers yet
    if (command.toLowerCase() === 'find' && tokens.length &&
            ((tokens[0].toLowerCase() === 'rh' || tokens[0].toLowerCase() === 'relic_hunter') ||
            (tokens.length >= 2 && tokens[0].toLowerCase() === 'relic' && tokens[1].toLowerCase() == 'hunter')))
        command = 'findrh';

    const dynCommand = client.commands.get(command.toLowerCase())
        || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(command));
    const botPrefix = message.guild ? message.client.settings.guilds[message.guild.id].botPrefix.trim() :
        message.client.settings.botPrefix.trim();
    if (dynCommand) {
        if (dynCommand.requiresArgs && !tokens.length) {
            const reply = 'You didn\'t provide arguments.\n' +
                `\`\`\`\n${botPrefix} ${dynCommand.name}:\n` +
                `\t${dynCommand.usage.replace('\n', '\t\n')}\n\`\`\``;
            message.reply({ content: reply });
        }
        else if (!dynCommand.canDM && message.channel.type === 'DM') {
            const reply = `\`${command.toLowerCase()}\` is not allowed in DMs`;
            message.reply({ content: reply });
        }
        else {
            let canRun = true;
            if ('minPerm' in dynCommand) {
                canRun = false;
                //Protected command, confirm they're allowed to run it
                if (message.author.id === message.client.settings.owner)
                    canRun = true;
                else if (('member' in message) && security.checkPerms(message.member, message.minPerm))
                    canRun = true;
            }
            if (canRun) {
                // Wrap in a promise, in case the dynamic command does not return a promise / is not async.
                Promise.resolve(dynCommand.execute(message, tokens))
                    // Ideally our dynamic commands will never throw (i.e. they will catch and handle any errors
                    // that occur during their execution) and instead just return the appropriate command result.
                    // In case they leak an exception, catch it here.
                    .catch((commandErr) => {
                        Logger.error(`Error executing dynamic command ${command.toLowerCase()}`, commandErr);
                        return message.reply({ content: `Sorry, I couldn't do ${command.toLowerCase()} for ... reasons.` })
                            .then(() => new CommandResult({
                                replied: true,
                                botError: true,
                                message,
                            }))
                            .catch((replyErr) => {
                                Logger.error('Furthermore, replying caused more problems.', replyErr);
                                return new CommandResult({
                                    botError: true,
                                    message,
                                });
                            });
                    })
                    // Whether or not there was an exception executing the command, we now have a CommandResult
                    // we can process further.
                    .then((cmdResult) => addMessageReaction(cmdResult));
            } else {
                const reply = `You do not have permission to use \`${command.toLowerCase()}\``;
                message.reply({ content: reply });
            }
        }
    }
    else
    {
        switch (command.toLowerCase()) {

            case 'findrh': {
                findRH(message.channel, { split: true });
                break;
            }
            case 'shutdown': {
                if (message.author.id === settings.owner) {
                    message.channel.send('Good-bye');
                    quit().then(didSave => didSave ? process.exit() : message.channel.send('Uhhh, save failed'));
                }
                break;
            }
            case 'save': {
                if (message.author.id === settings.owner) {
                    message.channel.send('Asynchronous save started');
                    doSaveAll().then(didSaveAll => message.channel.send(`Save complete: ${didSaveAll ? 'success': 'failure'}`));
                }
                break;
            }
            case 'reset':
                if (message.author.id === settings.owner) {
                    if (!tokens.length) {
                        message.channel.send('I don\'t know what to reset.');
                    }
                    const sub_command = tokens.shift();
                    switch (sub_command) {
                        case 'timers':
                            // TODO: re-add deactivated channels to active channels for each timer.
                            break;

                        case 'rh':
                        case 'relic_hunter':
                        default:
                            resetRH();
                    }
                    break;
                }
            // Fall through if user isn't the bot owner.
            case 'help':
            case 'arrg':
            case 'aarg':
            default: {
                const helpMessage = getHelpMessage(message, tokens);
                // TODO: Send help to PM?
                message.channel.send(helpMessage ? helpMessage : 'Whoops! That\'s a bug.');
            }
        }
    }
}
/**
 * Convert a HitGrab short link into a BitLy short link that does not send the clicker to Facebook.
 * If successful, sends the converted link to the same channel that received the input message.
 *
 * @param {Message} message a Discord message containing at least one htgb.co URL.
 */
async function convertRewardLink(message) {
    if (!settings.bitly_token) {
        Logger.warn(`Links: Received link to convert, but don't have a valid 'bitly_token' specified in settings: ${settings}.`);
        return;
    }

    const links = message.content.replace(/[<>]/gm,'').split(/\s|\n/).map(t => t.trim()).filter(text => /(http[s]?:\/\/htgb\.co\/).*/g.test(text));
    const newLinks = (await Promise.all(links.map(async link => {
        const target = await getHGTarget(link.replace(/[^\x20-\x7E]/g, ''));
        if (target) {
            const shortLink = await getBitlyLink(target);
            return shortLink ? { fb: link, mh: shortLink } : '';
        } else {
            return '';
        }
    }))).filter(nl => !!nl);
    if (!newLinks.length)
        return;

    let response = `<${newLinks[0].mh}> <-- Non-Facebook Link`;
    if (newLinks.length > 1) {
        // Print both old and new link on same line:
        response = 'Facebook Link --> Non-Facebook Link:\n';
        response += newLinks.map(linkData => `<${linkData.fb}> --> <${linkData.mh}>`).join('\n');
    }

    message.channel.send(response);

    /** Get the redirect url from htgb.co
     * @param {string} url A htgb.co link to be shortened.
     * @returns {Promise<string>} A mousehuntgame.com link that should be converted.
     */
    function getHGTarget(url) {
        return fetch(url, { redirect: 'manual' }).then((response) => {
            if (response.status === 301) {
                const facebookURL = response.headers.get('location');
                return facebookURL.replace('https://apps.facebook.com/mousehunt', 'https://www.mousehuntgame.com');
            } else {
                throw `HTTP ${response.status}`;
            }
        }).catch((err) => Logger.error('Links: GET to htgb.co failed with error', err))
            .then(result => result || '');
    }

    /**
     * Shorten the given link using the Bit.ly API.
     * @param {string} url The link to be shortened.
     * @returns {Promise<string>} A bit.ly link with the same resolved address, except to a non-Facebook site.
     */
    function getBitlyLink(url) {
        const options = {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${settings.bitly_token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ long_url: url }),
        };
        return fetch('https://api-ssl.bitly.com/v4/shorten', options).then(async (response) => {
            if ([200, 201].includes(response.status)) {
                const { link } = await response.json();
                return link;
            } else {
                // TODO: API rate limit error handling? Could delegate to caller. Probably not an issue with this bot.
                throw `HTTP ${response.status}`;
            }
        }).catch((err) => Logger.error('Links: Bitly shortener failed with error:', err))
            .then(result => result || '');
    }
}

/**
 * @typedef {object} TimerReminder
 * @property {User} user The Discord user who requested the reminder.
 * @property {number} count The number of remaining times this reminder will activate.
 * @property {string} area The area to which this reminder applies, e.g. "fg"
 * @property {string} [sub_area] A logical "location" within the area, e.g. "close" or "open" for Forbidden Grove.
 * @property {number} [fail] The number of times this particular reminder encountered an error (during send, etc.)
 */

/**
 * Load reminder data from the input path, defaulting to the value of 'reminder_filename'.
 * Returns an array of data objects (or an empty array if there was an error reading the file)
 * that can be made into reminders.
 *
 * @param {string} [path] The path to a JSON file to read data from. Default is the 'reminder_filename'.
 * @returns {Promise <ReminderSeed[]>} Local data that can be used to create reminders.
 */
function loadReminders(path = reminder_filename) {
    return loadDataFromJSON(path).then(data => {
        return Array.isArray(data) ? data : Array.from(data);
    }).catch(err => {
        Logger.error(`Reminders: error during loading from '${path}':\n`, err);
        return [];
    });
}

/**
 * Create reminder objects from the given array input
 * Returns true if any reminders were created, false if none were created.
 *
 * @param {ReminderSeed[]} reminderData An array of data objects, each of which can create a reminder, e.g. a reminder "seed"
 * @returns {boolean} Whether or not any reminders were created from the input.
 */
function createRemindersFromData(reminderData) {
    const knownReminders = client.reminders.length;
    /** TODO: Reminders as class instead of just formatted object
     * Class instantiation code would be here and replace the push call.
     */
    // Add each of these objects to the reminder list.
    Array.prototype.push.apply(client.reminders, reminderData);
    return client.reminders.length !== knownReminders;
}

/**
 * Inspect the reminders list and remove any that are no longer active.
 */
function pruneExpiredReminders() {
    // Remove any expired timers - no need to save them.
    if (client.reminders.length) {
        // Move expired reminders to the end.
        client.reminders.sort((a, b) => (a.count === 0) ? 1 : (b.count - a.count));

        // Find the first non-expired one.
        let i = client.reminders.length,
            numExpired = 0;
        while (i--) {
            if (client.reminders[i].count === 0)
                ++numExpired;
            else
                break;
        }
        if (numExpired === client.reminders.length)
            client.reminders.length = 0;
        else if (numExpired) {
            // Advance to the next record (which should be expired and a valid index).
            ++i;
            // If the current reminder is expired, splice it and the others away.
            if (i < client.reminders.length && client.reminders[i].count === 0) {
                const discarded = client.reminders.splice(i, numExpired);
                Logger.log(`Reminders: spliced ${discarded.length} that were expired. ${client.reminders.length} remaining.`);
            }
            else
                Logger.warn(`Reminders: found ${numExpired} expired, but couldn't splice because reminder at index ${i} was bad:\n`, client.reminders, '\n', client.reminders[i]);
        }
    }
}

/**
 * Serialize the reminders object to the given path, defaulting to the value of 'reminder_filename'
 *
 * @param {string} [path] The path to a file to write JSON data to. Default is the 'reminder_filename'.
 * @returns {Promise <boolean>} Whether the save operation completed without error.
 */
function saveReminders(path = reminder_filename) {
    // Write out the JSON of the reminders array
    return saveDataAsJSON(path, client.reminders).then(didSave => {
        Logger.log(`Reminders: ${didSave ? 'Saved' : 'Failed to save'} ${client.reminders.length} to '${path}'.`);
        last_timestamps.reminder_save = DateTime.utc();
        return didSave;
    });
}

/**
 * Instruct the given timer to send its announcement to all channels it is instructed to send to.
 *
 * @param {Timer} timer The timer being announced.
 */
function doAnnounce(timer) {
    if (!timer)
        return;
    const config = timer_config.get(timer.id);
    if (!config || !config.active)
        return;
    if (!config.channels.length)
        config.active = false;

    const message = timer.getAnnouncement();
    config.channels.forEach(tc => {
        if (tc.guild.available)
            tc.send(message).catch(err => {
                Logger.error(`(${timer.name}): Error during announcement on channel "${tc.name}" in "${tc.guild.name}".\nClient status: ${client.status}\n`, err);
                // Deactivate this channel only if we are connected to Discord. (Status === 'READY')
                // TODO: actually use the enum instead of a value for the enum (in case it changes):
                // https://github.com/discordjs/discord.js/blob/de0cacdf3209c4cc33b537ca54cd0969d57da3ab/src/util/Constants.js#L258
                if (client.status === 0) {
                    const index = config.channels.indexOf(tc);
                    Array.prototype.push.apply(config.inactiveChannels, config.channels.splice(index, 1));
                    Logger.warn(`(${timer.name}): deactivated announcement on channel ${tc.name} in ${tc.guild.name} due to send error during send.`);
                }
            });
    });
}

/**
 * Locate any known reminders that reference this timer, and send a PM to
 * the chatter who requested it.
 *
 * @param {Timer} timer The activated timer.
 */
function doRemind(timer) {
    if (!timer) return;

    // Cache these values.
    const area = timer.getArea(),
        sub = timer.getSubArea();

    // TODO: Build a basic embed template object and package that to each recipient, rather than
    // fully construct the (basically equivalent) embed for each user.
    const toDispatch = client.reminders
        // If there no sub-area for this reminder, or the one specified matches
        // that of the timer, send the reminder.
        .filter(r => area === r.area && r.count !== 0 && (!r.sub_area || r.sub_area === sub))
        // The reminder is sent using whichever one has the fewest remaining reminders.
        // For reminders with equivalent remaining quota, the more specific reminder is sent.
        .sort((a, b) => {
            if (a.count === b.count)
                // The two reminder quotas are equal: coerce the sub-areas from string -> bool -> int
                // and then return a descending sort (since true -> 1 and true means it was specific).
                return (!!b.sub_area) * 1 - (!!a.sub_area) * 1;

            // For dissimilar quotas, we know only one can be perpetual. If one is perpetual, sort descending.
            // Else, sort ascending.
            if (a.count === -1 || b.count === -1)
                return b.count - a.count;
            return a.count - b.count;
        });

    // Obtain a set of users who have not yet been notified from the sorted reminder array.
    const sent = new Set();
    // Dispatch the reminders, and update the set as we go.
    toDispatch.forEach(reminder => {
        const uid = reminder.user;
        if (!sent.has(uid)) {
            sent.add(uid);
            client.users.fetch(uid).then(user => sendRemind(user, reminder, timer))
                .catch(err => {
                    reminder.fail = (reminder.fail || 0) + 1;
                    Logger.error(`Reminders: Error during notification of user <@${uid}>:\n`, err);
                });
        }
    });
}

/**
 * Takes a user object and a reminder "object" and sends
 * the reminder as a MessageEmbed via PM.
 * MAYBE: Add ReminderInfo class, let Timers ID one, and have timer definitions provide additional information
 *      to improve the appearance of the reminders.
 * @param {User} user The Discord user to be reminded
 * @param {TimerReminder} remind the user's specific data w.r.t. the Timer that activated
 * @param {Timer} timer the Timer that activated
 */
function sendRemind(user, remind, timer) {
    // Don't remind invalid users.
    if (!user) {
        remind.fail = (remind.fail || 0) + 1;
        return;
    }
    if (remind.count === 0)
        return;
    // TODO: better timer title info - no markdown formatting in the title.
    const output = new MessageEmbed({ title: timer.getAnnouncement() });

    if (timer.getArea() === 'relic_hunter') {
        output.addField('Current Location', `She's in **${relic_hunter.location}**`, true);
        output.addField('Source', relic_hunter.source, true);
        output.setTitle(`RH: ${relic_hunter.location}`);
    }

    // Describe the remaining reminders.
    if (remind.fail > 10)
        remind.count = 1;
    // For non-perpetual reminders, decrement the counter.
    output.addField('Reminders Left', (remind.count < 0) ? 'unlimited' : `${--remind.count}`, true);

    const advanceAmount = timer.getAdvanceNotice().as('milliseconds');
    // Should this be next user reminder, or next activation of this timer?
    output.addField('Next Reminder', (advanceAmount
        ? timer.getNext().plus(timer.getRepeatInterval()).minus(advanceAmount)
        : timer.getNext()
    ).diffNow().toFormat('dd\'d \'hh\'h \'mm\'m\'', { round: true }), true);

    // How to add or remove additional counts.
    let alter_str = `Use \`${settings.botPrefix} remind ${remind.area}${remind.sub_area ? ` ${remind.sub_area}` : ''}`;
    alter_str += (!remind.count) ? '` to turn this reminder back on.' : ' stop` to end these sooner.';
    alter_str += `\nUse \`${settings.botPrefix} help remind\` for additional info.`;
    output.addField('To Update:', alter_str, false);


    if (remind.fail) {
        output.setDescription(`(There were ${remind.fail} failures before this got through.)`);
        if (remind.fail > 10)
            Logger.warn(`Reminders: Removing reminder for ${remind.user} due to too many failures`);
    }

    // The timestamp could be the activation time, not the notification time. If there is
    // advance notice, then the activation time is yet to come (vs. moments ago).
    output.setTimestamp(new Date());
    output.setFooter('Sent:');

    user.send({ embeds: [output] }).then(
        () => remind.fail = 0,
        () => remind.fail = (remind.fail || 0) + 1,
    );
}



/**
 * Get the help text.
 * TODO: Should this be a MessageEmbed?
 * TODO: Dynamically generate this information based on timers, etc.
 *
 * @param {Message} message The message that triggered the command
 * @param {string[]} [tokens] An array of user text, the first of which is the specific command to get help for.
 * @returns {string} The desired help text.
 */
function getHelpMessage(message, tokens) {
    // TODO: Remove these as external commands are added
    const keywordArray = [ ]; // This was used for commands not properly moved out of this file.
    const allowedCommands = client.commands
        .filter(command => {
            let canRun = false;
            if (!command.minPerm)
                canRun = true;
            else if (message.author.id === message.client.settings.owner)
                canRun = true;
            else if (('member' in message) && security.checkPerms(message.member, command.minPerm))
                canRun = true;
            return canRun;
        });
    keywordArray.push(...allowedCommands.map(command => command.name));
    const keywords = oxfordStringifyValues(keywordArray.map(name => `\`${name}\``));
    const prefix = settings.botPrefix.trim();
    if (!tokens || !tokens.length) {
        return [
            '**help**',
            `I know the keywords ${keywords}.`,
            `You can use \`${prefix} help <keyword>\` to get specific information about how to use it.`,
            `Example: \`${prefix} help next\` provides help about the 'next' keyword, \`${prefix} help remind\` provides help about the 'remind' keyword.`,
            'Pro Tip: **Most commands work in PM!**',
        ].join('\n');
    }

    const command = tokens[0].toLowerCase();

    const dynCommand = allowedCommands.get(command)
        || allowedCommands.find(cmd => cmd.aliases && cmd.aliases.includes(command));
    if (dynCommand) {
        if ('helpFunction' in dynCommand)
            return dynCommand.helpFunction();
        else if (dynCommand.usage)
            return `\`\`\`\n${prefix} ${dynCommand.name}:\n` +
                `\t${dynCommand.usage.replace('\n', '\t\n')}\n\`\`\``;
        else
            return `I know how to ${command} but I don't know how to tell you how to ${command}`;
    }
    else
        return `I don't know that one, but I do know ${keywords}.`;
}



/**
 * Load nickname data from the input path, defaulting to the value of 'nickname_urls_filename'.
 * Returns the type: url data contained in the given file. (Does not assign it.)
 *
 * @param {string} [path] The path to a JSON file to read data from. Default is the 'nickname_urls_filename'.
 * @returns {Promise <{}>} Data from the given file, as an object to be consumed by the caller.
 */
function loadNicknameURLs(path = nickname_urls_filename) {
    return loadDataFromJSON(path).catch(err => {
        Logger.error(`Nicknames: Error loading data from '${path}':\n`, err);
        return {};
    });
}

/**
 * Load all nicknames from all sources.
 */
function refreshNicknameData() {
    for (const key in nickname_urls)
        getNicknames(key);
}

/**
 * Read the CSV exported from a Google Sheets file containing nicknames, and
 * initialize the specific 'nickname' property denoted by 'type'.
 *
 * // TODO use the Google Sheets REST API or an Apps Script webapp for
 * better control / formatting (e.g. JSON output, referencing sheets by name)
 *
 * @param {string} type The type of nickname to populate. Determines the sheet that is read.
 */
function getNicknames(type) {
    if (!nickname_urls[type]) {
        Logger.warn(`Nicknames: Received '${type}' but I don't know its URL.`);
        return;
    }
    const newData = {};
    // It returns a string as CSV, not JSON.
    // Set up the parser
    const parser = csv_parse({ delimiter: ',' })
        .on('readable', () => {
            let record;
            while ((record = parser.read()))
                newData[record[0]] = record[1];
        })
        .on('error', err => Logger.error(err.message));

    fetch(nickname_urls[type]).then(async (response) => {
        if (response.status !== 200) {
            throw new Error(`HTTP ${response.status}`);
        }
        const body = await response.text();
        // Pass the response to the CSV parser (after removing the header row).
        parser.write(body.split(/[\r\n]+/).splice(1).join('\n').toLowerCase());
        client.nicknames.set(type, newData);
        parser.end(() => Logger.log(`Nicknames: ${Object.keys(newData).length} of type '${type}' loaded.`));
    }).catch(err => Logger.error(`Nicknames: request for type '${type}' failed with error:`, err));
}

/**
 * Reset the Relic Hunter location so reminders know to update people
 */
function resetRH() {
    Logger.log(`Relic hunter: resetting location to "unknown", was ${relic_hunter.source}: ${relic_hunter.location}`);
    relic_hunter.location = 'unknown';
    relic_hunter.source = 'reset';
    relic_hunter.last_seen = DateTime.fromMillis(0);
    // Schedule the next reset.
    rescheduleResetRH();
}

/**
 * Continue resetting Relic Hunter location
 */
function rescheduleResetRH() {
    return; // Rescheduled reset cancelled by issue 152
    // eslint-disable-next-line no-unreachable
    if (relic_hunter.timeout)
        clearTimeout(relic_hunter.timeout);

    const now = DateTime.utc();
    relic_hunter.timeout = setTimeout(resetRH, Interval.fromDateTimes(now, now.endOf('day')).length('milliseconds'));
}

/**
 * Notify about relic hunter changing location
 */
function remindRH(new_location) {
    //Logic to look for people with the reminder goes here
    if (new_location !== 'unknown') {
        Logger.log(`Relic Hunter: Sending reminders for ${new_location}`);
        doRemind(client.timers_list.find(t => t.getArea() === 'relic_hunter'));
    }
}

/**
 * Relic Hunter location was announced, save it and note the source
 * @param {Message} message Webhook-generated message announcing RH location
 */
function handleRHWebhook(message) {
    // Find the location in the text.
    const locationRE = /spotted in \*\*(.+)\*\*/;
    if (locationRE.test(message.cleanContent)) {
        const new_location = locationRE.exec(message.cleanContent)[1];
        if (relic_hunter.location !== new_location) {
            relic_hunter.location = new_location;
            relic_hunter.source = 'webhook';
            relic_hunter.last_seen = DateTime.utc();
            Logger.log(`Relic Hunter: Webhook set location to "${new_location}"`);
            setImmediate(remindRH, new_location);
        } else {
            Logger.log(`Relic Hunter: skipped location update (already set by ${relic_hunter.source})`);
        }
    } else {
        Logger.error('Relic Hunter: failed to extract location from webhook message:', message.cleanContent);
    }
}

/**
 * Especially at startup, find the relic hunter's location
 * TODO: This might replace the reset function
 */
async function getRHLocation() {
    Logger.log(`Relic Hunter: Was in ${relic_hunter.location} according to ${relic_hunter.source}`);
    const [dbg, mhct] = await Promise.all([
        DBGamesRHLookup(),
        MHCTRHLookup(),
    ]);
    // Trust MHCT more, since it would actually observe an RH appearance, rather than decode a hint.
    if (mhct.location !== 'unknown') {
        Object.assign(relic_hunter, mhct);
    } else if (dbg.location !== 'unknown' && dbg.location !== relic_hunter.location) {
        Object.assign(relic_hunter, dbg);
    }
    Logger.log(`Relic Hunter: location set to "${relic_hunter.location}" with source "${relic_hunter.source}"`);
}

/**
 * Looks up Relic Hunter Location from DBGames via Google Sheets
 * @returns {Promise<{ location: string, source: 'DBGames' }>}
 */
function DBGamesRHLookup() {
    if (!settings.DBGames) {
        return { source: 'DBGames', location: 'unknown' };
    }
    // Politeness cool down - if we've got a location for today, stop asking
    if (relic_hunter.last_seen >= DateTime.utc().startOf('day')) {
        return relic_hunter;
    }
    return fetch(settings.DBGames)
        .then(async (response) => {
            if (!response.ok) throw `HTTP ${response.status}`;
            const json = await response.json();
            if (json.location) {
                Logger.log('Relic Hunter: DBGames query OK, reported location:', json.location);
                if (dbgames_locations[json.location]) {
                    Logger.log('Relic Hunter: Translated DBGames location: ', dbgames_locations[json.location]);
                    return { source: 'DBGames', location: dbgames_locations[json.location], last_seen: DateTime.utc().startOf('day') };
                } else {
                    return { source: 'DBGames', location: json.location, last_seen: DateTime.utc().startOf('day') };
                }
            }
        })
        .catch((err) => {
            Logger.error('Relic Hunter: DBGames query failed:', err);
            return { source: 'DBGames', location: 'unknown' };
        });
}

/**
 * Looks up the relic hunter location from MHCT
 * @returns {Promise<{ location: string, source: 'MHCT' }>}
 */
function MHCTRHLookup() {
    return fetch('https://www.mhct.win/tracker.json')
        .then(async (response) => {
            if (!response.ok) throw `HTTP ${response.status}`;
            const { rh } = await response.json();
            if (rh.location)
                rh.location = unescapeEntities(rh.location);
            Logger.log(`Relic Hunter: MHCT query OK, location: ${rh.location}, last_seen: ${rh.last_seen}`);
            const last_seen = Number(rh.last_seen);
            return {
                source: 'MHCT',
                last_seen: DateTime.fromSeconds(isNaN(last_seen) ? 0 : last_seen),
                location: rh.location,
            };
        })
        .catch((err) => {
            Logger.error('Relic Hunter: MHCT query failed:', err);
            return { source: 'MHCT', location: 'unknown' };
        });
}

/**
 * Processes a request to find the relic hunter
 * @param {TextChannel} channel the channel on which to respond.
 */
async function findRH(channel) {
    const asMessage = (location) => {
        let message = (location !== 'unknown')
            ? `Relic Hunter has been spotted in **${location}**`
            : 'Relic Hunter has not been spotted yet';
        message += ` and moves again ${timeLeft(DateTime.utc().endOf('day'))}`;
        return message;
    };
    const original_location = relic_hunter.location;
    // If we have MHCT data from today, trust it, otherwise attempt to update our known location.
    if (relic_hunter.source !== 'MHCT' || !DateTime.utc().hasSame(relic_hunter.last_seen, 'day')) {
        Logger.log(`Relic Hunter: location requested, might be "${original_location}"`);
        await getRHLocation();
        Logger.log(`Relic Hunter: location update completed, is now "${relic_hunter.location}"`);
    }

    channel.send(asMessage(relic_hunter.location))
        .catch((err) => Logger.error('Relic Hunter: Could not send response to Find RH request', err));
    if (relic_hunter.location !== 'unknown' && relic_hunter.location !== original_location) {
        setImmediate(remindRH, relic_hunter.location);
    }
}

//Resources:
//Timezones in Discord: https://www.reddit.com/r/discordapp/comments/68zkfs/timezone_tag_bot/
//Location nicknames as csv: https://docs.google.com/spreadsheets/d/e/2PACX-1vQRxGO1iLgX6N2P2iUT57ftCbh5lv_cmnatC6F8NevrdYDtumjcIJw-ooAqm1vIjSu6b0HfP4v2DYil/pub?gid=0&single=true&output=csv
//Loot nicknames as csv:     https://docs.google.com/spreadsheets/d/e/2PACX-1vQRxGO1iLgX6N2P2iUT57ftCbh5lv_cmnatC6F8NevrdYDtumjcIJw-ooAqm1vIjSu6b0HfP4v2DYil/pub?gid=1181602359&single=true&output=csv
//Mice nicknames as csv:     https://docs.google.com/spreadsheets/d/e/2PACX-1vQRxGO1iLgX6N2P2iUT57ftCbh5lv_cmnatC6F8NevrdYDtumjcIJw-ooAqm1vIjSu6b0HfP4v2DYil/pub?gid=762700375&single=true&output=csv
