/*
  A ping pong bot, whenever you send "ping", it replies "pong".
*/

// Import the discord.js module
const Discord = require('discord.js');
var Timers = require('./timers.js');
var fs = require ('fs');


//A test to add a timer
var timers = [];
// var timers = [new Timers('gate', 1500573088000, 86400000, "Test timer is happening")];
//Read it from a file
var obj;
fs.readFile('timers.json', 'utf8', function readFileCallback(err, data) {
	if (err) {
		console.log(err);
	} else {
		obj = JSON.parse(data);
		for (var i = 0; i < obj.length; i++ ) {
//		console.log('obj length' + obj.length);
			timers.push(new Timers(obj[i].area, obj[i].seed_time, obj[i].repeat_time, obj[i].announce_string));
		}

//		var str = JSON.stringify(timers, ['area', 'seed_time', 'repeat_time', 'announce_string'], 1);
//		fs.writeFile('timers.json', str, 'utf8', function writeCallback(err, data){
//			if (err) {
//				console.log(err);
//			}
//		});
	}
});




// Create an instance of a Discord client
const client = new Discord.Client();
//Use a file to store the token

// The token of your bot - https://discordapp.com/developers/applications/me
var token;
fs = require('fs');
fs.readFile('secret_token', 'utf8', function (err,data) {
	if (err) {
		return console.log(err);
	}
	// Log our bot in
	token = data.replace(/\n/,"");
	// console.log("'" + token + "'");
	client.login(token);
//	token = data;
  });
// console.log(token);


// The ready event is vital, it means that your bot will only start reacting to information
// from Discord _after_ ready is emitted
client.on('ready', () => {
  console.log('I am ready!');
});

// Create an event listener for messages
client.on('message', message => {
  // If the message is "ping"
  if (message.content === '-gate') {
    // Send "pong" to the same channel
//    message.channel.send('pong');
    message.channel.send('next ' + timers[0].area + ' time is ' + timers[0].getNext().toUTCString());
    message.channel.send('That would be ' + timers[0].getNext() );
//    message.channel.send('I know about ' + timers.length + ' timers');
//    message.channel.send('The first one is ' + timers[0].area);
  }
});


