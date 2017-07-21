/*
  MHTimer Bot
*/
// Import required modules
const Discord = require('discord.js');
var Timer = require('./timerClass.js');
var fs = require ('fs');
const client = new Discord.Client();

// Globals
var message_channel_id = 245584660757872640;
var main_settings_filename = 'settings.json';
var timer_settings_filename = 'timer_settings.json';
//var token_filename = 'secret_token';
var timers_list = [];
var file_encoding = 'utf8';
var settings = {};

process.on('uncaughtException', function (exception) {
  console.log(exception); // to see your exception details in the console
  // if you are on production, maybe you can send the exception details to your
  // email as well ?
});

function Main() {
    // console.log('fire');
    // Load global settings
    var a = new Promise(loadSettings);

    // Bot log in
    a.then(() => { client.login(settings.token); });

    // Create timers list from timers settings file
    var b = new Promise(createTimersList);

    // Bot start up tasks
    a.then(() => {
        client.on('ready', () => {
            // Get channel
            //guild = client.guilds.get("'" + message_channel_id + "'");
            //var channel = guild.defaultChannel;

            // Create timed announcements
            //createTimedAnnouncements(channel)
        });
    });

    // Message event router
    a.then(() => {
        client.on('message', message => {
            if (message.content === '.mhtimer fg') {
                fgAnnouncer(message);
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
        settings = JSON.parse(data)[0];
        resolve();
    });
}

// Read individual timer settings from a file and Create
function createTimersList(resolve, reject) {
    fs.readFile(timer_settings_filename, file_encoding, (err, data) => {
	if (err) {
        reject();
		return console.log(err);
	}

    var obj = JSON.parse(data);
    for (var i = 0; i < obj.length; i++ ) {
        // var timers_list = [new Timer('gate', 1500573088000, 86400000, "Test timer is happening")];
        timers_list.push(new Timer(obj[i].area, obj[i].seed_time, obj[i].repeat_time, obj[i].announce_string));
        console.log('Added ' + i + ' ' + obj[i].area);
        // setTimeout(announce(),timers_list[i].getInterval(),timers_list[i]);
    }

//		var str = JSON.stringify(timers_list, ['area', 'seed_time', 'repeat_time', 'announce_string'], 1);
//		fs.writeFile('timers_list.json', str, 'utf8', function writeCallback(err, data){
//			if (err) {
//				console.log(err);
//			}
//		});
    resolve();
    });
}

// The ready event is vital, it means that your bot will only start reacting to information
// from Discord _after_ ready is emitted

function createTimedAnnouncements(channel) {
	for (var i = 0; i < timers_list.length; i++) {
		console.log('i: ' + i + ' of ' + timers.length);
//		channel.send("setting announce '" + timers_list[i].getAnnounce() + "' to " + timers_list[i].getNext().valueOf() + " - " + Date.now() + " ms from now");
		channel.send("because I am dumb and think the next one is at " + timers_list[i].getNext());
//		setImmediate( (a) => {
//			channel.send(a);
//		}, timers_list[i].getAnnounce());
//		announce(timers_list[i], channel);
		setTimeout(
//				announce(timers_list[i], channel),
			(ann, chan, time) => {
				chan.send(ann);
//				setInterval();
			},
			  timers_list[i].getNext().valueOf() - Date.now(),
			  timers_list[i].getAnnounce(),
			  channel,
			  timers_list[i].getInterval()
        );
	}
}

// Create an event listener for messages
function fgAnnouncer(message) {
    message.channel.send('next ' + timers_list[0].area + ' time is ' + timers_list[0].getNext().toUTCString());
    message.channel.send('That would be ' + timers_list[0].getNext() );
}

// Announce a timer
function announce(a, channel, t) {
//	var channel = client.guilds.get("'" + message_channel_id + "'").defaultChannel;
	channel.send(a);
	setTimeout(announce(), t, a, channel, t);
}
