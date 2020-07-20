/**
 * MHTimer Bot
 */
// Import required modules
const { DateTime, Duration, Interval } = require('luxon');
const Discord = require('discord.js');
const fs = require('fs');

// Extract type-hinting definitions for Discord classes.
// eslint-disable-next-line no-unused-vars
const { Client, Collection, Guild, GuildMember, Message, MessageReaction, MessageEmbed, TextChannel, User } = Discord;

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
const client = new Client({ disabledEvents: ['TYPING_START'] });
const textChannelTypes = new Set(['text', 'dm', 'group']);
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
    nicknames = new Map(),
    nickname_urls = {};

//TODO This will replace the above, temporarily both exist
client.nicknames = new Map();
/** @type {Timer[]} */
const timers_list = [];
/** @type {TimerReminder[]} */
const reminders = [];

const refresh_rate = Duration.fromObject({ minutes: 5 });
/** @type {Object<string, DateTime>} */
const last_timestamps = {
    reminder_save: DateTime.utc(),
    hunter_save: DateTime.utc(),
    item_refresh: null,
    mouse_refresh: null,
    filter_refresh: null,
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
                    return timers_list.length > 0;
                })
                .catch(err => failedLoad('Timers: import error:\n', err));

            // Create reminders list from the reminders file.
            const hasReminders = loadReminders()
                .then(reminderData => {
                    if (createRemindersFromData(reminderData))
                        pruneExpiredReminders();
                    Logger.log(`Reminders: imported ${reminderData.length} from file.`);
                    return reminders.length > 0;
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
                //Migrate settings at this point since connection required for some pieces
                migrateSettings(client.settings);

                // Find all text channels on which to send announcements.
                const announcables = client.guilds.cache.reduce((channels, guild) => {
                    const candidates = guild.channels.cache
                        .filter(c => client.settings.guilds[guild.id].timedAnnouncementChannels.has(c.name) && textChannelTypes.has(c.type))
                        .map(tc => tc);
                    if (candidates.length)
                        Array.prototype.push.apply(channels, candidates);
                    else
                        Logger.warn(`Timers: No valid channels in ${guild.name} for announcements.`);
                    return channels;
                }, []);

                // Use one timeout per timer to manage default reminders and announcements.
                timers_list.forEach(timer => scheduleTimer(timer, announcables));
                Logger.log(`Timers: Initialized ${timer_config.size} timers on channels ${announcables}.`);

                // If we disconnect and then reconnect, do not bother rescheduling the already-scheduled timers.
                client.on('ready', () => Logger.log('I am inVINCEeble!'));
            });

            // Message handling.
            const re = {};
            for (const guild in client.settings.guilds) {
                if (client.settings.guilds[guild].botPrefix)
                    re[guild] = new RegExp('^' + client.settings.guilds[guild].botPrefix.trim() + '\\s');
            }
            client.on('message', message => {
                if (message.author.id === client.user.id)
                    return;

                if (message.webhookID === settings.relic_hunter_webhook)
                    handleRHWebhook(message);

                switch (message.channel.name) {
                    case settings.linkConversionChannel:
                        if (/(http[s]?:\/\/htgb\.co\/)/g.test(message.content.toLowerCase()))
                            convertRewardLink(message);
                        break;
                    default:
                        if (message.channel.type === 'dm')
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
            client.destroy()
                .then(() => process.exitCode = 1);
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
            (err) => Logger.error('Shutdown: error while saving:\n', err),
        )
        .then(() => { Logger.log('Shutdown: destroying client'); return client.destroy(); })
        .then(() => {
            Logger.log('Shutdown: deactivating data refreshes');
            for (const timer of Object.values(dataTimers))
                clearInterval(timer);
            Logger.log('Shutdown: deactivating timers');
            for (const timer of timers_list) {
                timer.stopInterval();
                timer.stopTimeout();
            }
            if (relic_hunter.timeout) {
                clearTimeout(relic_hunter.timeout);
            }
        })
        .then(() => process.exitCode = 1)
        .catch(err => {
            Logger.error('Shutdown: unhandled error:\n', err, '\nImmediately exiting.');
            process.exit();
        });
}

/**
 * Any object which stores user-entered data should be periodically saved, or at minimum saved before
 * the bot shuts down, to minimize data loss.
 * @returns {boolean} Whether volatile data was serialized, or perhaps not serialized.
 */
function doSaveAll() {
    client.commands.filter(command => command.save).every((command => {
        Logger.log(`Saving ${command.name}`);
        Promise.resolve(command.save());
    }));
    return (saveSettings().then(saveReminders()));
}

/**
 * Takes a settings object and performs whatever migration tasks are needed to get them to current version
 * @param {Object} original_settings The settings read from disk
 *
 * Doesn't return anything; throws on errors
 */
function migrateSettings(original_settings) {
    if (!('version' in original_settings)) {
        //OG Settings file detected
        Logger.log('SETTINGS: Migrating from version 0');
        const guild_settings = {
            timedAnnouncementChannels: Array.from(original_settings.timedAnnouncementChannels),
            linkConversionChannel: original_settings.linkConversionChannel,
            botPrefix: original_settings.botPrefix.trim(),
        };
        //Logger.log(`SETTINGS: ${typeof(client.guilds.cache)} - ${JSON.stringify(client.guilds.cache)}`);
        const guilds = client.guilds.cache;
        original_settings.guilds = {};
        guilds.forEach((guild) => {
            original_settings.guilds[guild.id] = guild_settings;
        });
        original_settings.version = '1.00';
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
        // Pre version 1.00 logic
        if (!('version' in settings)) {
            // Set defaults if they were not specified.
            if (!settings.linkConversionChannel)
                settings.linkConversionChannel = 'larrys-freebies';

            if (!settings.timedAnnouncementChannels)
                settings.timedAnnouncementChannels = ['timers'];
            Logger.log(`TAC: ${JSON.stringify(settings.timedAnnouncementChannels)}`);
            if (!Array.isArray(settings.timedAnnouncementChannels)) {
                settings.timedAnnouncementChannels = settings.timedAnnouncementChannels.split(',').map(s => s.trim());
                Logger.log('Not an array so we turned it into one, sort of');
            }
            settings.timedAnnouncementChannels = new Set(settings.timedAnnouncementChannels);

            settings.relic_hunter_webhook = settings.relic_hunter_webhook || '283571156236107777';

            settings.botPrefix = settings.botPrefix ? settings.botPrefix.trim() : '-mh';

            settings.owner = settings.owner || '0'; // So things don't fail if it's unset
        } else {
            for (const guild in settings.guilds) {
                settings.guilds[guild].timedAnnouncementChannels = new Set(settings.guilds[guild].timedAnnouncementChannels);
                if (settings.guilds[guild].newBotPrefix) {
                    Logger.log(`Migrating bot prefix to ${settings.guilds[guild].newBotPrefix} for ${guild}`);
                    settings.guilds[guild].botPrefix = settings.guilds[guild].newBotPrefix;
                    delete settings.guilds[guild].newBotPrefix;
                }
            }
        }
        if (settings.DBGames && !isValidURL(settings.DBGames)) {
            settings.DBGames = false;
            Logger.log('Settings: invalid value for DBGames, set to false');
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
    const outobj = {};
    Object.assign(outobj, client.settings);
    for (const guild in outobj.guilds) {
        outobj.guilds[guild].timedAnnouncementChannels = Array.from(outobj.guilds[guild].timedAnnouncementChannels);
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
    const knownTimers = timers_list.length;
    for (const seed of timerData) {
        let timer;
        try {
            timer = new Timer(seed);
        } catch (err) {
            Logger.error(`Timers: error occured while constructing timer: '${err}'. Received object:\n`, seed);
            continue;
        }
        timers_list.push(timer);
    }
    return timers_list.length !== knownTimers;
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
    timer_config.set(timer.id, { active: true, channels: channels, inactiveChannels: [] });
}

/**
 * Inspects the current timers list to dynamically determine the text to print when informing users
 * of what timers are available.
 *
 * @returns {string} a ready-to-print string of timer details, with each timer on a new line.
 */
function getKnownTimersDetails() {
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
            (tokens[0].toLowerCase() === 'rh' || tokens[0].toLowerCase() === 'relic_hunter') ||
            (tokens.length >= 2 && tokens[0].toLowerCase() === 'relic' && tokens[1].toLowerCase() == 'hunter'))
        command = 'findrh';

    // Parse the message to see if it matches any known timer areas, sub-areas, or has count information.
    const reminderRequest = tokens.length ? timerAliases(tokens) : {};
    const dynCommand = client.commands.get(command.toLowerCase())
        || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(command));
    const botPrefix = message.guild ? message.client.settings.guilds[message.guild.id].botPrefix.trim() :
        message.client.settings.botPrefix.trim();
    if (dynCommand) {
        if (dynCommand.requiresArgs && !tokens.length) {
            const reply = 'You didn\'t provide arguments.\n' +
                `\`\`\`\n${botPrefix} ${dynCommand.name}:\n` +
                `\t${dynCommand.usage.replace('\n', '\t\n')}\n\`\`\``;
            message.reply(reply);
        }
        else if (!dynCommand.canDM && message.channel.type === 'dm') {
            const reply = `\`${command.toLowerCase()}\` is not allowed in DMs`;
            message.reply(reply);
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
                        return message.reply(`Sorry, I couldn't do ${command.toLowerCase()} for ... reasons.`)
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
                message.reply(reply);
            }
        }
    }
    else
    {
        switch (command.toLowerCase()) {
            // Display information about the next instance of a timer.
            case 'next': {
                const aboutTimers = `I know these timers:\n${getKnownTimersDetails()}`;
                if (!tokens.length) {
                    // received "-mh next" -> display the help string.
                    // TODO: pretty-print known timer info
                    message.channel.send(aboutTimers);
                } else if (!reminderRequest.area) {
                    // received "-mh next <words>", but the words didn't match any known timer information.
                    // Currently, the only other information we handle is RONZA.
                    switch (tokens[0].toLowerCase()) {
                        case 'ronza':
                            message.channel.send('Don\'t let aardwolf see you ask or you\'ll get muted');
                            break;
                        default:
                            message.channel.send(aboutTimers);
                    }
                } else {
                    // Display information about this known timer.
                    const timerInfo = nextTimer(reminderRequest);
                    if (typeof timerInfo === 'string')
                        message.channel.send(timerInfo);
                    else
                        message.channel.send('', { embed: timerInfo });
                }
                break;
            }

            // Display or update the user's reminders.
            case 'remind': {
                // TODO: redirect responses to PM.
                if (!tokens.length || !reminderRequest.area)
                    addMessageReaction(listRemind(message));
                else
                    addMessageReaction(addRemind(reminderRequest, message));
                break;
            }

            // Display information about upcoming timers.
            case 'sched':
            case 'itin':
            case 'agenda':
            case 'itinerary':
            case 'schedule': {
                // Default the searched time period to 24 hours if it was not specified.
                reminderRequest.count = reminderRequest.count || 24;

                const usage_str = buildSchedule(reminderRequest);
                // Discord limits messages to 2000 characters, so use multiple messages if necessary.
                message.channel.send(usage_str, { split: true });
                break;
            }
            case 'findrh': {
                findRH(message.channel, { split: true });
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

    const links = message.content.replace(/[<>]/gm,'').split(/\s|\n/).map(t => t.trim()).filter(text => /^(http[s]?:\/\/htgb\.co\/).*/g.test(text));
    const newLinks = (await Promise.all(links.map(async link => {
        const target = await getHGTarget(link);
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
 * @typedef {Object} ReminderRequest
 * @property {string} [area] The area of a Timer
 * @property {string} [sub_area] The sub-area of a Timer
 * @property {number} [count] The number of times a Timer should activate before this reminder is removed.
 */

/**
 * Attempt to find a Timer that satisfies the input tokens.
 * Returns a ReminderRequest of unknown state (may have some or all properties set).
 *
 * @param {string[]} tokens a set of tokens which may match known Timer areas or sub-areas.
 * @returns {ReminderRequest} an object that may have some or all of the needed properties to create a Reminder
 */
function timerAliases(tokens) {
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
 * Returns the next occurrence of the desired class of timers as a MessageEmbed.
 *
 * @param {ReminderRequest} validTimerData Validated input that is known to match an area and subarea
 * @returns {MessageEmbed} A rich snippet summary of the next occurrence of the matching timer.
 */
function nextTimer(validTimerData) {
    // Inspect all known timers to determine the one that matches the requested area, and occurs soonest.
    const area = validTimerData.area,
        sub = validTimerData.sub_area,
        areaTimers = timers_list.filter(timer => timer.getArea() === area);

    let nextTimer;
    for (const timer of areaTimers)
        if (!sub || sub === timer.getSubArea())
            if (!nextTimer || timer.getNext() < nextTimer.getNext())
                nextTimer = timer;

    const sched_syntax = `${settings.botPrefix} remind ${area}${sub ? ` ${sub}` : ''}`;
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
 * @typedef {Object} TimerReminder
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
    const knownReminders = reminders.length;
    /** TODO: Reminders as class instead of just formatted object
     * Class instantiation code would be here and replace the push call.
     */
    // Add each of these objects to the reminder list.
    Array.prototype.push.apply(reminders, reminderData);
    return reminders.length !== knownReminders;
}

/**
 * Inspect the reminders list and remove any that are no longer active.
 */
function pruneExpiredReminders() {
    // Remove any expired timers - no need to save them.
    if (reminders.length) {
        // Move expired reminders to the end.
        reminders.sort((a, b) => (a.count === 0) ? 1 : (b.count - a.count));

        // Find the first non-expired one.
        let i = reminders.length,
            numExpired = 0;
        while (i--) {
            if (reminders[i].count === 0)
                ++numExpired;
            else
                break;
        }
        if (numExpired === reminders.length)
            reminders.length = 0;
        else if (numExpired) {
            // Advance to the next record (which should be expired and a valid index).
            ++i;
            // If the current reminder is expired, splice it and the others away.
            if (i < reminders.length && reminders[i].count === 0) {
                const discarded = reminders.splice(i, numExpired);
                Logger.log(`Reminders: spliced ${discarded.length} that were expired. ${reminders.length} remaining.`);
            }
            else
                Logger.warn(`Reminders: found ${numExpired} expired, but couldn't splice because reminder at index ${i} was bad:\n`, reminders, '\n', reminders[i]);
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
    return saveDataAsJSON(path, reminders).then(didSave => {
        Logger.log(`Reminders: ${didSave ? 'Saved' : 'Failed to save'} ${reminders.length} to '${path}'.`);
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
    const toDispatch = reminders
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
    output.addField('Reminders Left', (remind.count < 0) ? 'unlimited' : --remind.count, true);

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

    user.send({ embed: output }).then(
        () => remind.fail = 0,
        () => remind.fail = (remind.fail || 0) + 1,
    );
}

/**
 * Add (or remove) a reminder.
 *
 * @param {ReminderRequest} timerRequest a timer request which has already passed through token
 *                                       validation to set 'area' and 'sub_area' as possible.
 * @param {Message} message the Discord message that initiated this request.
 */
async function addRemind(timerRequest, message) {
    // If there were no area, the reminders would have been
    // listed instead of 'addRemind' being called.
    const area = timerRequest.area;
    const subArea = timerRequest.sub_area;
    if (!area) {
        await message.channel.send('I do not know the area you asked for');
        return new CommandResult({ success: false, replied: true, message });
    }

    // Default to reminding the user once.
    const count = timerRequest.count || (timerRequest.count === 0 ? 0 : 1);
    const requestName = `${area}${subArea ? `: ${subArea}` : ''}`;

    // Delete the reminder, if that is being requested.
    // (Rather than try to modify the positions and number of elements in
    // reminders e.g. thread race saveReminders, simply set the count to 0.)
    if (!count) {
        const responses = [];
        for (const reminder of reminders)
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

        await message.author.send(responses.length
            ? `\`\`\`${responses.join('\n')}\`\`\``
            : `I couldn't find a matching reminder for you in '${requestName}'.`,
        );
        return new CommandResult({ success: responses.length > 0, sentDm: true, message });
    }

    // User asked to be reminded - find a timer that meets the request, and sort in order of next activation.
    const choices = timers_list
        .filter(t => area === t.getArea() && (!subArea || subArea === t.getSubArea()))
        .sort((a, b) => a.getNext() - b.getNext());
    Logger.log(`Timers: found ${choices.length} matching input request:\n`, timerRequest);

    // Assume the desired timer is the one that matched the given criteria and occurs next.
    const [timer] = choices;
    if (!timer) {
        await message.author.send(`I'm sorry, there weren't any timers I know of that match your request. I know\n${getKnownTimersDetails()}`);
        return new CommandResult({ success: false, sentDm: true, message });
    }

    // If the reminder already exists, set its new count to the requested count.
    const responses = [];
    for (const reminder of reminders)
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
        await message.author.send(`\`\`\`${responses.join('\n')}\`\`\``);
        return new CommandResult({ success: true, sentDm: true, message });
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
    reminders.push(newReminder);

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
    if (message.channel.type !== 'dm' && !reminders.some(r => r.user === message.author.id))
        responses.unshift('Hi there! Reminders are only sent via PM, and I\'m just making sure I can PM you.');

    // Send notice of the update via PM.
    const ourResult = new CommandResult({ success: true, sentDm: false, message });
    try {
        await message.author.send(responses.join(' '));
        ourResult.sentDm = true;
    } catch(err) {
        Logger.error(`Reminders: notification failure for ${message.author.username}.`);
        ourResult.success = false;
        ourResult.botError = true;
    }
    return ourResult;
}

/**
 * List the reminders for the user, and PM them the result.
 *
 * @param {Message} message a Discord message containing the request to list reminders.
 */
async function listRemind(message) {
    const user = message.author.id,
        pm_channel = message.author;
    let timer_str = 'Your reminders:';
    let usage_str;

    const userReminders = reminders.filter(r => r.user === user && r.count);
    const botPrefix = message.guild ? message.client.settings.guilds[message.guild.id].botPrefix.trim() :
        message.client.settings.botPrefix.trim();
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

    const ourResult = new CommandResult({ success: true, sentDm: false, message });
    try {
        await pm_channel.send(userReminders.length ? timer_str : 'I found no reminders for you, sorry.');
        ourResult.sentDm = true;
    } catch (err) {
        Logger.error(`Reminders: notification failure for ${pm_channel.username}. Possibly blocked.`, err);
        ourResult.success = false;
        ourResult.botError = true;
    }
    return ourResult;
}

/**
 * Compute which timers are coming up in the next bit of time, for the requested area.
 * Returns a ready-to-print string listing up to 24 of the found timers, with their "demand" and when they will activate.
 * TODO: should this return a MessageEmbed?
 *
 * @param {{area: string, count: number}} timer_request A request that indicates the number of hours to search ahead, and the area in which to search
 * @returns {string} a ready-to-print string containing the timer's demand, and how soon it will occur.
 */
function buildSchedule(timer_request) {
    const area = timer_request.area;

    // Search from 1 hour to 10 days out.
    let req_hours = Duration.fromObject({ hours: timer_request.count });
    if (!req_hours.isValid) {
        return 'Invalid timespan given - how many hours did you want to look ahead?';
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
    (!area ? timers_list : timers_list.filter(t => t.getArea() === area && !t.isSilent()))
        .forEach(timer => {
            const message = timer.getDemand();
            for (const time of timer.upcoming(until))
                upcoming_timers.push({ time: time, message: message });
        });

    // Sort the list of upcoming timers in this area by time, so that the soonest is printed first.
    upcoming_timers.sort((a, b) => a.time - b.time);

    // Make a nice message to display.
    let return_str = `I have ${upcoming_timers.length} timers coming up in the next ${req_hours.as('hours')} hours`;
    if (upcoming_timers.length > max_timers) {
        return_str += `. Here are the next ${max_timers} of them`;
        upcoming_timers.splice(max_timers, upcoming_timers.length);
    }
    return_str += upcoming_timers.length ? ':\n' : '.';

    return_str = upcoming_timers.reduce((str, val) => {
        return `${str}${val.message} ${timeLeft(val.time)}\n`;
    }, return_str);

    return return_str;
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
    const keywordArray = [ 'remind', 'next', 'schedule' ];
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

    const areaInfo = 'Areas are Seasonal Garden (**sg**), Forbidden Grove (**fg**), Toxic Spill (**ts**), Balack\'s Cove (**cove**), and the daily **reset**.';
    const subAreaInfo = 'Sub areas are the seasons, open/close, spill ranks, and tide levels';
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
    else if (tokens[0] === 'next') {
        return [
            '**next**',
            `Usage: \`${prefix} next [<area> | <sub-area>]\` will provide a message about the next related occurrence.`,
            areaInfo,
            subAreaInfo,
            `Example: \`${prefix} next fall\` will tell when it is Autumn in the Seasonal Garden.`,
        ].join('\n');
    }
    else if (tokens[0] === 'remind') {
        return [
            '**remind**',
            `Usage: \`${prefix} remind [<area> | <sub-area>] [<number> | always | stop]\` will control my reminder function relating to you specifically.`,
            'Using the word `stop` will turn off a reminder if it exists.',
            'Using a number means I will remind you that many times for that timer.',
            'Use the word `always` to have me remind you for every occurrence.',
            `Just using \`${prefix} remind\` will list all your existing reminders and how to turn off each`,
            areaInfo,
            subAreaInfo,
            `Example: \`${prefix} remind close always\` will always PM you 15 minutes before the Forbidden Grove closes.`,
        ].join('\n');
    }
    else if (tokens[0].substring(0, 5) === 'sched') {
        return [
            '**schedule**',
            `Usage: \`${prefix} schedule [<area>] [<number>]\` will tell you the timers scheduled for the next \`<number>\` of hours. Default is 24, max is 240.`,
            'If you provide an area, I will only report on that area.',
            areaInfo,
        ].join('\n');
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
            // eslint-disable-next-line no-cond-assign
            while (record = parser.read())
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
        // Create a new (or replace the existing) nickname definition for this type.
        nicknames.set(type, newData);
        //TODO Remove above when nicknames are ONLY in the client
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
        doRemind(timers_list.find(t => t.getArea() === 'relic_hunter'));
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
    return fetch('https://mhhunthelper.agiletravels.com/tracker.json')
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
