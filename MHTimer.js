/*
  MHTimer Bot
*/
// Import required modules
const Discord = require('discord.js');
var Timer = require('./timerClass.js');
var fs = require ('fs');
const client = new Discord.Client();

// Globals
var guild_id = '245584660757872640';
var main_settings_filename = 'settings.json';
var timer_settings_filename = 'timer_settings.json';

var timers_list = [];
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
//    var b = new Promise(createTimersList);

    // Bot start up tasks
    a.then(() => {
        client.on('ready', () => {
            console.log ('I am alive!');
            announce_channel = client.guilds.get(guild_id).defaultChannel;
            //announce_channel.send("Who missed me?");
            createTimedAnnouncements(announce_channel);
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
            timers_list.push(new Timer(obj[i].area, obj[i].seed_time, obj[i].repeat_time, obj[i].announce_string));
            console.log('Added ' + i + ' ' + obj[i].area);
        }
    });
}

function createTimedAnnouncements(channel) {
    console.log('Creating timeouts');
    for (var i = 0; i < timers_list.length; i++) {
//        console.log('i: ' + i + ' of ' + timers_list.length);
//        channel.send("I think the next one is at " + timers_list[i].getNext());

        setTimeout(
            (announce, channel, repeat_time) => {
                channel.send(announce);
                setInterval((announce, channel) => {
                    channel.send(announce);
                }, repeat_time, announce, channel);
                console.log ("created a repeating timer for every " + repeat_time + " for " + announce);
            },
              timers_list[i].getNext().valueOf() - Date.now(),
              timers_list[i].getAnnounce(),
              channel,
              timers_list[i].getInterval()
        );
    }
    console.log ("Let's say that " +timers_list.length + " timeouts got created");
}

// Create an event listener for messages
function fgAnnouncer(message) {
    message.channel.send('next ' + timers_list[0].area + ' time is ' + timers_list[0].getNext().toUTCString());
    message.channel.send('That would be ' + timers_list[0].getNext() );
}

// Announce a timer
function announce(a, channel, t) {
    channel.send(a);
    setTimeout(announce(), t, a, channel, t);
}

//The meat of user interaction. Receives the message that starts with the magic character and decides if it knows what to do next
function messageParse(message) {
    var tokens = [];
    tokens = splitString(message.content);
    tokens.shift();
    switch (tokens[0].toLowerCase()) {
        case 'next':
            //TODO - This should be a PM, probably?
            var retStr = nextTimer(tokens[1]);
            message.channel.send("", {embed: retStr} );
            console.log(retStr);
            break;
        default:
            message.channel.send("Thank you for sending me '" + tokens[0] + "'. I hope to understand it soon.");
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

//Returns the next occurrence of the class of timers
function nextTimer(timerName) {
    var retStr = "I do not know the timer '" + timerName + "'";
    var youngestNext = 0;
    for (var i = 0; i < timers_list.length; i++) {
        if (timers_list[i].getArea() == timerName) {
            if (timers_list[i].getNext().valueOf() < youngestNext || youngestNext == 0) {
                youngestNext = timers_list[i].getNext().valueOf();
                retStr = timers_list[i].getAnnounce();
            }
        }
    }
    if (youngestNext != 0) {
        retStr = new Discord.RichEmbed()
            .setTitle("next " + timerName)
//            .setDescription()
            .setTimestamp(new Date(youngestNext))
//            .addField("This is a field")
            .setFooter(retStr);
//        retStr = {embed: { description: retStr,
//                fields: [{value: retStr}],
//                timestamp: new Date(youngestNext) },
//                footer: {text: "Just a test"} };
//        retStr = retStr + " at " + new Date(youngestNext).toUTCString();
    }
    return retStr;
}

//Resources:
//Timezones in Discord: https://www.reddit.com/r/discordapp/comments/68zkfs/timezone_tag_bot/


