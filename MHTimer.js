/*
  A ping pong bot, whenever you send "ping", it replies "pong".
*/

// Import the discord.js module
const Discord = require('discord.js');

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
  if (message.content === 'ping') {
    // Send "pong" to the same channel
    message.channel.send('pong');
  }
});


