/*
  MHTimer Bot
*/
// Import required modules
const Discord = require('discord.js');
var Timer = require('./timerClass.js');
var fs = require ('fs');
const client = new Discord.Client();

// Globals
// var guild_id = '245584660757872640';
var main_settings_filename = 'settings.json';
var timer_settings_filename = 'timer_settings.json';
var reminder_filename = 'reminders.json';

var timers_list = [];
var reminders = [];
var file_encoding = 'utf8';
var settings = {};

//Only support announcing in 1 channel
var announce_channel;

process.on('uncaughtException', function (exception) {
  console.log(exception); // to see your exception details in the console
  // if you are on production, maybe you can send the exception details to your
  // email as well ?
});

function Main() {
    // Load global settings
    var a = new Promise(loadSettings);

    // Bot log in
    a.then(() => { client.login(settings.token); });

    // Create timers list from timers settings file
    a.then( createTimersList );
    
    // Load any saved reminders
    a.then( loadReminders );

    // Bot start up tasks
    a.then(() => {
        client.on('ready', () => {
            console.log ('I am alive!');
//            announce_channel = client.guilds.get(guild_id).defaultChannel;
            
            //for each guild find its #timers channel (if it has one)
            for (var [guildkey, guildvalue] of client.guilds) {
                for (var [chankey, chanvalue] of guildvalue.channels) {
                    if (chanvalue.name === "timers") {
                        console.log("Found #timers as " + chankey + " on guild " + guildvalue.name);
                        createTimedAnnouncements(chanvalue);
//                        chanvalue.send("Is this thing on?");
                    }
                }
            }
        });
    });
    
    // Message event router
    a.then(() => {
        client.on('message', message => {
            if (message.content.startsWith('-mh ')) {
                messageParse(message);
            }
        });
    });
}
Main();

// Load settings
function loadSettings(resolve, reject) {
    fs.readFile(main_settings_filename, file_encoding, (err, data) => {
        if (err) {
            console.log(err);
            reject();
            return;
        }
        settings = JSON.parse(data);
        resolve();
    });
}

// Read individual timer settings from a file and Create
//function createTimersList(resolve, reject) {
function createTimersList(resolve, reject) {
    fs.readFile(timer_settings_filename, file_encoding, (err, data) => {
        if (err) {
            reject();
            return console.log(err);
        }

        var obj = JSON.parse(data);
        for (var i = 0; i < obj.length; i++ ) {
            timers_list.push(new Timer(obj[i]));
//            console.log('Added ' + i + ' ' + obj[i].area);
        }
    });
}

function createTimedAnnouncements(channel) {
    console.log('Creating timeouts');
    var startDate = new Date();
    var temp_timeout;
    
    for (var i = 0; i < timers_list.length; i++) {
        temp_timeout = setTimeout( 
            (timer, channel) => {
                doAnnounce(timer, channel);
                timer.stopTimeout();
                var temp_timer = setInterval((timer, channel) => {
                    doAnnounce(timer, channel);
                }, timer.getRepeat(), timer, channel);
                timer.setInterval(temp_timer);
//                console.log ("created a repeating timer for every " + repeat_time + " for " + announce);
            },
              (timers_list[i].getNext().valueOf() - timers_list[i].getAnnounceOffset() - startDate.valueOf()),
              timers_list[i],
              channel
        );
        timers_list[i].setTimeout(temp_timeout);
//        console.log(timers_list[i].getAnnounce() + " next happens in " + (timers_list[i].getNext().valueOf() - startDate.valueOf() ) + " ms");
    }
    console.log ("Let's say that " +timers_list.length + " timeouts got created");
}

//The meat of user interaction. Receives the message that starts with the magic character and decides if it knows what to do next
function messageParse(message) {
    var tokens = [];
    tokens = splitString(message.content);
    tokens.shift();
    switch (tokens[0].toLowerCase()) {
        case 'next':
            //TODO - This should be a PM, probably?
            if (tokens.length === 1) { 
                message.channel.send("Did you want to know about sg, fg, reset, spill, or cove?"); 
            } else {
                var retStr = nextTimer(tokens[1].toLowerCase());
                if (typeof retStr === "string") {
                    message.channel.send(retStr);
                } else {
                    message.channel.send("", {embed: retStr} );
                }
            }
            // console.log(typeof retStr);
            break;
        case 'remind':
            if (tokens.length === 1) {
                message.channel.send("Did you want me to remind you for sg, fg, reset, spill, or cove?");
            } else {
                var area = timerAliases(tokens[1].toLowerCase());
                //confirm it is a valid area
                var found = 0;
                for (var i = 0; i < timers_list.length; i++) {
                    if (timers_list[i].getArea() === area) {
                        i = timers_list.length;
                        found = 1;
                    }
                }
                if (found === 0) {
                    message.channel.send("I do not know the area '" + area + "', only sg, fg, reset, spill, or cove");
                } else {
                    var num = -1;
                    var stop = 0;
                    if (tokens.length === 3) {
                        if (tokens[2].toLowerCase() === 'once') {
                            num = 1;
                        }
                        else if (tokens[2].toLowerCase() === 'stop') {
                            stop = 1;
                            //Find the reminder and remove it
                            var found = 0;
                            for (key in reminders) {
                                if ((reminders[key].user === message.author.id) && (reminders[key].area === area)) {
                                    reminders[key].count = 0;
                                    found = 1;
                                }
                            }
                            if (found === 1) {
                                message.channel.send("Reminder for '" + area + "' was turned off");
                            } else {
                                message.channel.send("I couldn't find a timer for you for '" + area);
                            }
                        }
                        else {
                            message.send("I only know 'once' and 'stop' as reminder frequency");
                            return;
                        }
                    }
                    if (stop === 0) {
                        var remind = {  "count" : num,
                                        "area" : area,
                                        "user" : message.author.id
                        }
                        reminders.push(remind);
                        message.channel.send("Reminder for " + area + " set");
                    }
                    saveReminders();
                }
            }
            break;
        default:
            message.channel.send("Right now I only know the word 'next' for timers: sg, fg, reset, spill, cove");
    }
}

//Simple utility function to tokenize a string, preserving double quotes
function splitString(inString) {
    var returnArray = [];
    var splitRegexp = /[^\s"]+|"([^"]*)"/gi;
    
    do {
        var match = splitRegexp.exec(inString);
        if (match != null ) {
            returnArray.push(match[1] ? match[1] : match[0]);
        }
    } while (match != null);
    return returnArray;
}

function timerAliases(timerName) {
    switch (timerName.toLowerCase()) {
        case 'sg':
        case 'seasonal':
        case 'season':
        case 'garden':
            timerName = 'sg';
            break;
        case 'fg':
        case 'grove':
        case 'gate':
        case 'realm':
            timerName = 'fg';
            break;
        case 'reset':
        case 'game':
        case 'rh':
        case 'midnight':
            timerName = 'reset';
            break;
        case 'spill':
        case 'toxic':
        case 'ts':
            timerName = 'spill';
            break;
        case 'cove':
        case 'balack':
        case 'tide':
            timerName = 'cove';
            break;
    }
    return timerName;
}

//Returns the next occurrence of the class of timers
function nextTimer(timerName) {
    var retStr = "I do not know the timer '" + timerName + "' but I do know: sg, fg, reset, spill, cove";
    var youngTimer;
    timerName = timerAliases(timerName);
    switch (timerName) {
        case 'ronza':
            retStr = 'She just left 10 minutes ago. I guess you missed her';
            break;
    }

    for (var timer of timers_list) {
        if (timer.getArea() === timerName) {
            if ((typeof youngTimer == 'undefined') || (timer.getNext() <= youngTimer.getNext())) {
                youngTimer = timer;
            }
        }
    }

    if (typeof youngTimer == 'undefined') {
        return retStr;
    } else {
        retStr = new Discord.RichEmbed()
//            .setTitle("next " + timerName) // removing this cleaned up the embed a lot
            .setDescription(youngTimer.getDemand() + "\n" + timeLeft(youngTimer.getNext())) // Putting here makes it look nicer and fit in portrait mode
            .setTimestamp(new Date(youngTimer.getNext().valueOf()))
//            .addField(retStr)
            .setFooter("at"); // There has to be something in here or there is no footer
    }
    return retStr;
}

function timeLeft (in_date) {
    var now_date = new Date();
    var retStr = "real soon";
    var ms_left = in_date.valueOf() - now_date.valueOf() ;
    if (ms_left > 1000) {
        retStr = "in ";
        if (ms_left > 1000 * 60 * 60 * 24) {
            //days left
            retStr += Math.floor(ms_left / (1000 * 60 * 60 * 24)) + " days ";
            ms_left = ms_left % (1000 * 60 * 60 * 24);
        }
        if (ms_left > 1000 * 60 * 60) {
            //hours left
            retStr += Math.floor(ms_left / (1000 * 60 * 60)) + " hours ";
            ms_left = ms_left % (1000 * 60 * 60);
        }
        if (ms_left > 1000 * 60) {
            //minutes left
            retStr += Math.floor(ms_left / (1000 * 60)) + " minutes ";
            ms_left = ms_left % (1000 * 60);
        }
        if (ms_left > 1000) {
            //seconds left
            retStr += Math.floor(ms_left / 1000) + " seconds";
        }
    }
    return retStr;
}

function loadReminders() {
    //Read the JSON into the reminders array
    console.log("loading reminders");
    fs.readFile(reminder_filename, file_encoding, (err, data) => {
        if (err) {
            console.log(err);
            return undefined;
        }

        reminders = JSON.parse(data);
        console.log (reminders.length + " reminders loaded");
    });
}

function saveReminders () {
    //Write out the JSON of the reminders array
    var i = reminders.length;
    while (i--) {
        if (reminders[i].count === 0) {
            reminders.splice(i, 1);
        }
    }
    fs.writeFile(reminder_filename, JSON.stringify(reminders, null, 1), file_encoding, (err) => {
        if (err) { 
            reject();
            return console.log(err);
        }
    });
    console.log("Reminders saved: " + reminders.length);
}

function doAnnounce (timer, channel) {
    //Announce into a channel, then process any reminders
    channel.send(timer.getAnnounce());
    
    doRemind(timer);
}

function doRemind (timer) {
    //Go through the reminder requests and process each
    for (key in reminders) {
        remind = reminders[key];
//        console.log(JSON.stringify(remind, null, 1));
        if ((timer.getArea() === remind.area) && (remind.count !== 0)) {
            var user = client.users.get(remind.user);
//            console.log("Got a user of " + typeof user + " when I tried with " + remind.user + " for " + remind.area);
            if (user.presence !== 'dnd') {
                user.send(timer.getAnnounce());
            }
            if (remind.count > 0) {
                remind.count -= 1;
            }
        }
    }
    saveReminders();
}

//Resources:
//Timezones in Discord: https://www.reddit.com/r/discordapp/comments/68zkfs/timezone_tag_bot/


