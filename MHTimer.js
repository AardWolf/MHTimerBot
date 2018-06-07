/*
  MHTimer Bot
*/
// Import required modules
const Discord = require('discord.js');
var Timer = require('./timerClass.js');
var fs = require ('fs');
var request = require('request'); //Needed to use Jack's tools
const client = new Discord.Client();

// Globals
// var guild_id = '245584660757872640';
var main_settings_filename = 'settings.json';
var timer_settings_filename = 'timer_settings.json';
var hunter_ids_filename = 'hunters.json';
var reminder_filename = 'reminders.json';
var nickname_urls_filename = 'nicknames.json';

var timers_list = [];
var reminders = [];
var file_encoding = 'utf8';
var settings = {};
var mice = [];
var items = [];
var hunters = {};
var nicknames = {};
var nickname_urls = {};
var last_timestamps = {
  reminder_save: new Date()
}
var refresh_rate = 1000 * 60 * 5; //milliseconds between item, mouse refreshes

//Only support announcing in 1 channel
var announce_channel;

//https://stackoverflow.com/questions/12008120/console-log-timestamps-in-chrome
console.logCopy = console.log.bind(console);

console.log = function()
{
    // Timestamp to prepend
    var timestamp = new Date().toJSON();

    if (arguments.length)
    {
        // True array copy so we can call .splice()
        var args = Array.prototype.slice.call(arguments, 0);

        // If there is a format string then... it must
        // be a string
        if (typeof arguments[0] === "string")
        {
            // Prepend timestamp to the (possibly format) string
            args[0] = "[" + timestamp + "] " + arguments[0];

            // Insert the timestamp where it has to be
            //args.splice(0, 0, "[" + timestamp + "]");

            // Log the whole array
            this.logCopy.apply(this, args);
        }
        else
        {
            // "Normal" log
            this.logCopy(timestamp, args);
        }
    }
};

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

    // Load any saved hunters
    a.then( loadHunters );

    // Load nickname urls
    a.then( loadNicknameURLs );

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
            if (message.author.id === client.user.id) {
                return;
            }
            switch (message.channel.name){
                case 'larrys-freebies':
                    if(/^(http[s]?:\/\/htgb\.co\/).*/g.test(message.content.toLowerCase())){
                        convertRewardLink(message);

                    }
                    break;
                default:
                    if (message.channel.type === 'dm') {
                        messageParse(message);
                    } else if (message.content.startsWith('-mh ')) {
                        messageParse(message);
                    }
                    break;
            }
        });
        client.on('error', error => {
          console.log("Error Received");
          console.log(error);
          client.destroy();
          process.exit();
        });
        client.on('disconnect', event => {
          console.log("Close event: " + event.reason);
          console.log("Close code: " + event.code);
          client.destroy();
          process.exit();
        });

    });

    a.then( getMouseList );
    a.then( getItemList );

}
try {
  Main();
}
catch(error) {
  console.log(error);
}

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

    if (tokens[0] === '-mh') // coming from chat channel '-mh command...'
        tokens.shift();

    var command = tokens.shift();
    var timerName; // This has area and sub_area possibly defined
    if (typeof command === 'undefined') {
        message.channel.send("I didn't understand but you can ask me for help");
        return;
    } else {
        if (tokens.length >= 1) {
            timerName = timerAliases(tokens);
        } else {
            timerName = {};
        }
    }
    var usage_string;
    switch (command.toLowerCase()) {
        case 'next':
            //TODO - This should be a PM, probably?
            if ((tokens.length === 0) || (typeof timerName.area === 'undefined')) {
                if (typeof(tokens[0]) !== 'undefined') {
                    switch (tokens[0]) {
                        case 'ronza':
                            message.channel.send("Don't let aardwolf see you ask or you'll get muted"); //maybe add random things here
                            break;
                        default:
                            message.channel.send("Did you want to know about sg, fg, reset, spill, or cove?");
                    }
                }
            } else {
                var retStr = nextTimer(timerName);
                if (typeof retStr === "string") {
                    message.channel.send(retStr);
                } else {
                    message.channel.send("", {embed: retStr} );
                }
            }
            // console.log(typeof retStr);
            break;
        case 'remind':
            usage_string = "Usage: `-mh remind <sg|fg|reset|spill|cove> [once|stop|always|<num>]` where once/stop/num/always are optional"; // save this for a help
            if ((tokens.length === 0) || (typeof timerName.area === 'undefined')) {
                listRemind(message);
                // message.channel.send("Did you want me to remind you for sg, fg, reset, spill, or cove?\n" + usage_string);
            } else {
                addRemind(timerName, message);
            }
            break;
        case 'sched':
        case 'itin':
        case 'agenda':
        case 'itinerary':
        case 'schedule':
            usage_str = "Not implemented yet";
            var hours = 24;
            if ((tokens.length === 0) || (typeof timerName.count === 'undefined')) {
                timerName.count = 24;
            }
            usage_str = buildSchedule(timerName);
            var part_str;
            var curr_count = 0;
            while (usage_str.length > 2000) {
                part_str = usage_str.substr(0,usage_str.lastIndexOf('\n',2000));
                message.channel.send(part_str);
                usage_str = usage_str.substr(part_str.length);
            }
            //Issue 39, use the channel the request came in on
            //message.author.send(usage_str);
            message.channel.send(usage_str);
            break;
        case 'find':
        case 'mfind':
            if (tokens.length == 0) {
                message.channel.send("You have to supply mice to find");
            }
            else {
                var searchStr = tokens.join(" ").trim().toLowerCase().replace(/ mouse$/,'');
                if (searchStr.length < 3) {
                    message.channel.send("Your search string was too short, try again");
                } else {
                    findMouse(message.channel, searchStr, 'find');
                }
            }
            break;
        case 'ifind':
            if (tokens.length == 0) {
                message.channel.send("You have to supply an item to find");
            }
            else {
                var searchStr = tokens.join(" ").trim().toLowerCase();
                if (searchStr.length < 3) {
                    message.channel.send("Your search string was too short, try again");
                } else {
                    findItem(message.channel, searchStr, 'ifind');
                }
            }
            break;
        case 'iam':
            if (tokens.length == 0) {
                message.channel.send("Yes, you are. Provide a hunter ID to set that.");
            }
            else if ((tokens.length == 1) && !isNaN(tokens[0])) {
                setHunterID(message, tokens[0]);
            }
            else if ((tokens.length == 1) && (tokens[0].toLowerCase() === "not")) {
                unsetHunterID(message);
            }
            else {
                if ((tokens[0].toLowerCase() === "in") && (tokens[1])) {
                    tokens.shift();
                    var loc = tokens.join(" ").toLowerCase();
                    if (nicknames["locations"][loc]) {
                        loc = nicknames["locations"][loc];
                    }
                    setHunterProp(message, "location", loc);
                }
                else if (((tokens[0].toLowerCase() === "rank") || (tokens[0].toLowerCase() === "title")
                                || (tokens[0].toLowerCase() === "a"))
                            && (tokens[1])) {
                    tokens.shift();
                    var rank = tokens.join(" ").toLowerCase();
                    if (nicknames["ranks"][rank]) {
                        rank = nicknames["ranks"][rank];
                    }
                    setHunterProp(message, "rank", rank);
                }
                else if ((tokens[0].toLowerCase().substring(0,3) === "snu") && (tokens[1])) {
                    tokens.shift();
                    var snuid = tokens.join(" ").toLowerCase();
                    setHunterProp(message, "snuid", snuid);
                }
                else {
                    message.channel.send("I'm not sure what to do with that:\n  `-mh iam ###` to set a hunter ID.\n  `-mh iam rank <rank>` to set a rank.\n  `-mh iam in <location>` to set a location");
                }
            }
            break;
        case 'whois':
            if (tokens.length == 0) {
                message.channel.send("Who's who? Who's on first?");
            }
            else if (((tokens.length == 1) && !isNaN(tokens[0])) ||
                     ((tokens[0].toLowerCase().substring(0,3) === "snu") &&
                      (tokens.length == 2)))
            {
                var type = "hid";
                if (tokens.length == 2) {
                    // snuid lookup
                    type = "snuid";
                    tokens.shift();
                }
                if (!message.guild) {
                    message.channel.send("I cannot do this in PM");
                    return;
                }
                var discord_id = getHunterByID(message, tokens[0], type);
                if (!discord_id) {
                    message.channel.send("I did not find a hunter with `" + tokens[0] + "` as a hunter ID");
                    return;
                }
                var hid = getHunterByDiscordID(message, discord_id);
                client.fetchUser(discord_id)
                    .then((user) => {
                        message.guild.fetchMember(user)
                            .then((member) => {
                                message.channel.send("`" + tokens[0] + "` is " + member.displayName + " <https://mshnt.ca/p/" +
                                     hid + ">");
                            })
                            .catch( (err) => {message.channel.send("That person may not be on this server")} );
                    })
                    .catch( (err) => {message.channel.send("That person may not have a Discord account any more")} );
            }
            else if (tokens.length == 1) {
                var member;
                if (message.guild) {
                    let member = message.mentions.members.first() || message.guild.members
                        .filter(mem=> (mem.displayName.toLowerCase() === tokens[0].toLowerCase()))
                        .first();
                    if (!member) {
                        message.channel.send("Sorry, I couldn't figure out who you're looking for.");
                    } else {
                        var hunter_id = getHunterByDiscordID(message, member.id);
                        if (hunter_id) {
                            message.channel.send(member.displayName + " is `" + hunter_id + "` <https://mshnt.ca/p/" + hunter_id + ">");
                        } else {
                            message.channel.send("It looks like " + tokens[0] + " didn't set their hunter ID ");
                        }
                    }
                }
                else {
                    message.channel.send("I cannot look up users by name in a PM");
                    return;
                }
            }
            else {
                var hunters = [];
                var property = tokens[0];
                var search = tokens.join(" ");
                if ((tokens[0].toLowerCase() === "in") && (tokens[1])) {
                    tokens.shift();
                    var loc = tokens.join(" ").toLowerCase();
                    if (nicknames["locations"][loc]) {
                        loc = nicknames["locations"][loc];
                    }
                    property = "location";
                    search = loc;
                    hunters = getHunterByProp(message, "location", loc);
                }
                else if (((tokens[0].toLowerCase() === "rank") || (tokens[0].toLowerCase() === "title")
                            || (tokens[0].toLowerCase() === "a"))
                            && (tokens[1])) {
                    tokens.shift();
                    var rank = tokens.join(" ").toLowerCase();
                    if (nicknames["ranks"][rank]) {
                        rank = nicknames["ranks"][rank];
                    }
                    property = "rank";
                    search = rank;
                    hunters = getHunterByProp(message, "rank", rank);
                }
                else {
                    message.channel.send("I'm not sure what to do with that:\n  `-mh whois [###|<mention>]` to look up specific hunters.\n  `-mh whois [in|a] [<location>|<rank>]` to find up to 5 random new friends.");
                }
                if (hunters.length) {
//                    console.log(hunters);
                    message.channel.send(hunters.length + " random hunters: `" + hunters.join("`, `") + "`");
                } else {
                    message.channel.send("I couldn't find any hunters with `" + property + "` matching `" + (search) + "`");
                }
            }
            break;

        case 'help':
        case 'arrg':
        case 'aarg':
        default:
            if (tokens.length > 0) {
                if (tokens[0] === 'next') {
                    usage_str = "Usage: `-mh next [area/sub-area]` will provide a message about the next related occurrence.\n";
                    usage_str += "Areas are Seasonal Garden (**sg**), Forbidden Grove (**fg**), Toxic Spill (**ts**), Balack's Cove (**cove**), and the daily **reset**.\n";
                    usage_str += "Sub areas are the seasons, open/close, spill ranks, and tide levels\n";
                    usage_str += "Example: `-mh next fall` will tell when it is Autumn in the Seasonal Garden."
                }
                else if (tokens[0] === 'remind') {
                    usage_str = "Usage: `-mh remind [area/sub-area] [<number>/always/stop]` will control my reminder function relating to you specifically.\n";
                    usage_str += "Using the word `stop` will turn off a reminder if it exists.\n";
                    usage_str += "Using a number means I will remind you that many times for that timer.\n";
                    usage_str += "Use the word `always` to have me remind you for every occurrence.\n";
                    usage_str += "Just using `-mh remind` will list all your existing reminders and how to turn off each\n";
                    usage_str += "Areas are Seasonal Garden (**sg**), Forbidden Grove (**fg**), Toxic Spill (**ts**), Balack's Cove (**cove**), and the daily **reset**.\n";
                    usage_str += "Sub areas are the seasons, open/close, spill ranks, and tide levels\n";
                    usage_str += "Example: `-mh remind close always` will always PM you 15 minutes before the Forbidden Grove closes.\n";
                }
                else if (tokens[0].substring(0,5) === 'sched') {
                    usage_str = "Usage: `-mh schedule [<area>] [<number>]` will tell you the timers scheduled for the next `<number>` of hours. Default is 24, max is 240.\n";
                    usage_str += "If you provide an area I will only report on that area.";
                }
                else if (tokens[0] === 'find') {
                    usage_str = "Usage `-mh find <mouse>` will print the top attractions for the mouse, capped at 10.\n";
                    usage_str += "All attraction data is from <https://mhhunthelper.agiletravels.com/>.\n";
                    usage_str += "Help populate the database for better information!";
                }
                else if (tokens[0] === 'ifind') {
                    usage_str = "Usage `-mh ifind <item>` will print the top drop rates for the item, capped at 10.\n";
                    usage_str += "All drop rate data is from <https://mhhunthelper.agiletravels.com/>.\n";
                    usage_str += "Help populate the database for better information!";
                }
                else if (tokens[0] === 'iam') {
                    usage_str = "Usage `-mh iam <####>` will set your hunter ID. **This must be done before the other options will work.**\n";
                    usage_str += "  `-mh iam in <location>` will set your hunting location. Nicknames are allowed.\n";
                    usage_str += "  `-mh iam rank <rank>` will set your rank. Nicknames are allowed.\n";
                    usage_str += "  `-mh iam not` will remove you from results.\n";
                    usage_str += "Setting your location and rank means that when people search for those things you can be randomly added to the results.";
                }
                else if (tokens[0] === 'whois') {
                    usage_str = "Usage `-mh whois <####>` will try to look up a Discord user by MH ID. Only works if they set their ID.\n";
                    usage_str += "  `-mh whois <user>` will try to look up a hunter ID based on a user in the server.\n";
                    usage_str += "  `-mh whois in <location>` will find up to 5 random hunters in that location.\n";
                    usage_str += "  `-mh whois rank <rank>` will find up to 5 random hunters with that rank.\n";
                    usage_str += "Setting your location and rank means that when people search for those things you can be randomly added to the results.";
                }
                else {
                    //TODO: Update this with schedule
                    usage_str = "I don't know that one but I know `iam`, `whois`, `remind`, `next`, `find`, `ifind`, and `schedule`";
                }
            } else {
                //TODO: Update this with schedule
                usage_str = "I know the keywords `find`, `ifind`, `next`, `remind`, and `schedule`. \nYou can use `-mh help [find|ifind|next|remind|schedule]` to get specific information about these commands.\n";
                usage_str += "Example: `-mh help next` provides help about the 'next' keyword, `-mh help remind` provides help about the 'remind' keyword.\n";
                usage_str += "Pro Tip: **All commands work in PM!**";
            }
            message.channel.send(usage_str);
    }
}

function convertRewardLink(message){
    // Get the redirect url from htgb.co
    request({
        url: message.content.split(" ")[0],
        method: 'GET',
        followRedirect: false
        }, function(error, response, body){
            if(!error && response.statusCode == 301){
                const facebookURL = response.headers.location;
                const mousehuntURL = facebookURL.replace('https://apps.facebook.com/mousehunt','https://www.mousehuntgame.com');
                const queryProperties = {access_token: settings.bitly_token, longUrl: mousehuntURL};
                // Use Bitly to shorten the non-facebook reward link because people link pretty things
                request({
                    url: 'https://api-ssl.bitly.com/v3/shorten',
                    qs: queryProperties
                    }, function(error, response, body){
                        if(!error && response.statusCode == 200){
                            const responseJSON = JSON.parse(response.body);
                            console.log("MH reward link converted for non-facebook users");
                            message.channel.send(responseJSON.data.url + " <-- Non-Facebook Link");
                        }else{
                            console.log("Bitly shortener failed for some reason" + error + response + body);
                        }
                    });
                }else{
                    console.log("GET to htgb.co failed for some reason" + error + response + body);
                }
        }
    );
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

function timerAliases(tokens) {
    var timerQuery = {};
    var timerName;
    var found = 0;
    for (var i = 0; i < tokens.length; i++) {
        timerName = tokens[i].toLowerCase();
        //Check if this is an exact timer name, useful if we can dynamically add new timers
        for (var j = 0; j < timers_list.length; j++) {
            if (timers_list[j].getArea() === timerName) {
                timerQuery.area = timerName;
//                found = 1;
//                j = timers_list.length;
            }
            else if (timers_list[j].getSubArea() === timerName) {
                timerQuery.area = timers_list[j].getArea();
                timerQuery.sub_area = timerName;
//                found = 1;
//                j = timers_list.length;
            }
        }
        if (found == 0) {
            switch (timerName) {
                case 'sg':
                case 'seasonal':
                case 'season':
                case 'garden':
                    timerQuery.area = 'sg';
                    break;
                case 'fall':
                case 'autumn':
                    timerQuery.area = 'sg';
                    timerQuery.sub_area = 'autumn';
                    break;
                case 'spring':
                    timerQuery.area = 'sg';
                    timerQuery.sub_area = 'spring';
                    break;
                case 'summer':
                    timerQuery.area = 'sg';
                    timerQuery.sub_area = 'summer';
                    break;
                case 'winter':
                    timerQuery.area = 'sg';
                    timerQuery.sub_area = 'winter';
                    break;
                case 'fg':
                case 'grove':
                case 'gate':
                case 'ar':
                case 'acolyte':
                case 'ripper':
                case 'realm':
                    timerQuery.area = 'fg';
                    break;
                case 'open':
                    timerQuery.area = 'fg';
                    timerQuery.sub_area = 'open';
                    break;
                case 'close':
                case 'closed':
                case 'shut':
                    timerQuery.area = 'fg';
                    timerQuery.sub_area = 'close';
                    break;
                case 'reset':
                case 'game':
                case 'rh':
                case 'midnight':
                    timerQuery.area = 'reset';
                    break;
                case 'cove':
                case 'balack':
                case 'tide':
                    timerQuery.area = 'cove';
                    break;
                case 'lowtide':
                case 'low':
                    timerQuery.area = 'cove';
                    timerQuery.sub_area = 'low';
                    break;
                case 'midtide':
                case 'mid':
                    timerQuery.area = 'cove';
                    timerQuery.sub_area = 'mid';
                    break;
                case 'hightide':
                case 'high':
                    timerQuery.area = 'cove';
                    timerQuery.sub_area = 'high';
                    break;
                case 'spill':
                case 'toxic':
                case 'ts':
                    timerQuery.area = 'spill';
                    break;
                case 'archduke':
                case 'ad':
                case 'archduchess':
                case 'aardwolf':
                case 'arch':
                    timerQuery.area = 'spill';
                    timerQuery.sub_area = 'arch';
                    break;
                case 'grandduke':
                case 'gd':
                case 'grandduchess':
                case 'grand':
                    timerQuery.area = 'spill';
                    timerQuery.sub_area = 'grand';
                    break;
                case 'duchess':
                case 'duke':
                    timerQuery.area = 'spill';
                    timerQuery.sub_area = 'duke';
                    break;
                case 'countess':
                case 'count':
                    timerQuery.area = 'spill';
                    timerQuery.sub_area = 'count';
                    break;
                case 'baronness':
                case 'baron':
                    timerQuery.area = 'spill';
                    timerQuery.sub_area = 'baron';
                    break;
                case 'lady':
                case 'lord':
                    timerQuery.area = 'spill';
                    timerQuery.sub_area = 'lord';
                    break;
                case 'heroine':
                case 'hero':
                    timerQuery.area = 'spill';
                    timerQuery.sub_area = 'hero';
                    break;
                case 'once':
                case '1':
                case 1:
                    timerQuery.count = 1;
                    break;
                case 'always':
                case 'forever':
                case 'unlimited':
                case '-1':
                case -1:
                    timerQuery.count = -1;
                    break;
                case 'stop':
                case '0':
                case 0:
                    timerQuery.count = 0;
                    break;
                default:
                    if (!isNaN(parseInt(timerName))) {
                        timerQuery.count = parseInt(timerName);
                    }
                    break;
            }
        }
    }
//    console.log(timerQuery);
    return timerQuery;
}

//Returns the next occurrence of the class of timers
//TODO - this should take an array as an argument and process the words passed in
function nextTimer(timerName) {
    var retStr = "I do not know that timer but I do know: sg, fg, reset, spill, cove and their sub-areas";
    var youngTimer;

    for (var timer of timers_list) {
        if (timer.getArea() === timerName.area) {
            if ((typeof timerName.sub_area === 'undefined') || (timerName.sub_area === timer.getSubArea())) {
                if ((typeof youngTimer === 'undefined') || (timer.getNext() <= youngTimer.getNext())) {
                    youngTimer = timer;
                }
            }
        }
    }

    if (typeof youngTimer == 'undefined') {
        return retStr;
    } else {
        var sched_syntax = "-mh remind " + timerName.area;
        if (typeof(timerName.sub_area) !== 'undefined') {
            sched_syntax += " " + timerName.sub_area;
        }

        retStr = new Discord.RichEmbed()
//            .setTitle("next " + timerName) // removing this cleaned up the embed a lot
            .setDescription(youngTimer.getDemand() + "\n" + timeLeft(youngTimer.getNext()) +
                    "\nTo schedule this reminder: " + sched_syntax) // Putting here makes it look nicer and fit in portrait mode
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
    //console.log(ms_left + " ms left");
    if (ms_left > 1000*60) {
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
        //if (ms_left > 1000) {
            ////seconds left
            //retStr += Math.floor(ms_left / 1000) + " seconds";
        //}
    } else {
        retStr = "in less than a minute";
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
//    console.log("Reminders saved: " + reminders.length);
}

function doAnnounce (timer, channel) {
    //Announce into a channel, then process any reminders
    channel.send(timer.getAnnounce())
      .catch(function(error) {
          console.log(error);
          console.log(channel.client.status)
        });

    doRemind(timer);
}

function doRemind (timer) {
    //Go through the reminder requests and process each
    var usage_str = "";
    var err=0;
    reminders.forEach(function (remind) {
//    for (key in reminders) {
        //remind = reminders[key];
//        console.log(JSON.stringify(remind, null, 1));
        if ((timer.getArea() === remind.area) &&
            (remind.count !== 0) &&
            (   (typeof remind.sub_area === 'undefined') ||
                (typeof timer.getSubArea() !== 'undefined') &&
                (timer.getSubArea() === remind.sub_area))
           )
        {
            //var user = client.users.get(remind.user);
            // client.users are just cached objects so might not be the best way to get a user object
            // console.log("Processing reminder ",remind);
            client.fetchUser(remind.user)
                    .then((user) => { sendRemind(user, remind, timer); })
                    .catch((err) => {
                        remind.fail = (remind.fail || 0) + 1;
                        console.log(err);
                    });
        }
    });
    saveReminders();
}

function sendRemind(user, remind, timer) {
    //Takes a user object and a remind "object" and sends the reminder
    // console.log("Got a user of " + typeof user + " when I tried with " + remind.user + " for " + remind.area);
    if (typeof user !== 'object') {
        remind.fail = (remind.fail || 0) + 1;
        return -1;
    }
    if (remind.count > 0) {
        remind.count -= 1;
    }
    //user.send(timer.getAnnounce());
    usage_str = "You have ";
    if (remind.count < 0) {
        usage_str += "unlimited";
    } else if (remind.count == 0) {
        usage_str += "no more";
    } else {
        usage_str += remind.count;
    }
    usage_str += " reminders left for this timer. Use `-mh remind " + remind.area;
    if (typeof remind.sub_area !== 'undefined') {
        usage_str += " " + remind.sub_area;
    }
    if (remind.count == 0) {
        usage_str += "` to turn this reminder back on.";
    } else {
        usage_str += " stop` to end them sooner.";
    }
    usage_str += " See also `-mh help remind` for other options.";
    if (remind.fail) {
        usage_str += " There were " + remind.fail + " failures before this got through.\n";
    }
    if (remind.fail > 10) {
        console.log("I am removing a reminder for " + remind.user + " due to too many failures\n");
        remind.count = 0;
    }
    // console.log("Processed reminder", remind);
    user.send(timer.getAnnounce() + "\n" + usage_str )
        .then(function() { err = 0; remind.fail = 0; }, //worked
            function() { err = 1; remind.fail = (remind.fail || 0) + 1; });
}

function addRemind(timerRequest, message) {
    //Add (or remove) a reminder
    var area = timerRequest.area;
    var response_str = "Tell aardwolf what you did. This used to break the bot";
    var sub_area = timerRequest.sub_area;
    var num = timerRequest.count;
    var timer_found = -1;
    var has_sub_area = 0;
    var turned_off = 0;

    if (typeof num === 'undefined') {
        num = 1; //new default is once
    }

    if (typeof area === 'undefined') {
        return "I do not know the area you asked for";
    }

    for (var i = 0; i < timers_list.length; i++) {
        if (timers_list[i].getArea() === area) {
            if (typeof sub_area === 'undefined') {
                timer_found = i;
                has_sub_area = 0;
                break;
            }
            else if (sub_area === timers_list[i].getSubArea()) {
                timer_found = i;
                has_sub_area = 1;
                break;
            }
        }
    }

    //confirm it is a valid area
    if (timer_found < 0) {
        for (var i = 0; i < timers_list.length; i++) {
            if (timers_list[i].getArea() === area) {
                timer_found = i;
                has_sub_area = 0;
                console.log ("Apparently this is still needed for '" + area + "'");
                console.log(timerRequest);
                break;
            }
        }
    }
    if (timer_found < 0) {
        return "I do not know the area requested, only sg, fg, reset, spill, or cove";
    }

    if (has_sub_area == 0) {
        sub_area = undefined;
    }

    if (num === 0) {
        //This is the stop case
        var i = reminders.length;
        while (i--) {
//        for (var i = 0; i < reminders.length; i++) {
            if ((reminders[i].user === message.author.id) &&
                (reminders[i].area === area))
            {
                if (has_sub_area &&
                    (typeof reminders[i].sub_area !== 'undefined') &&
                    (reminders[i].sub_area === sub_area))
                {
                    reminders[i].count = 0;
                    response_str = "Reminder for " + reminders[i].area + " (" + reminders[i].sub_area + ") turned off ";
                    reminders.splice(i,1);
                    turned_off++;
                }
                else if ((!has_sub_area) && (typeof reminders[i].sub_area === 'undefined')) {
                    reminders[i].count = 0;
                    response_str = "Reminder for " + reminders[i].area + " turned off ";
                    reminders.splice(i,1);
                    turned_off++;
                }
            }
        }
        if (turned_off === 0) {
            response_str = "I couldn't find a reminder for you in " + area;
            if (typeof sub_area !== 'undefined') {
                response_str += " (" + sub_area + ")";
            }
            console.log(timerRequest);
            console.log(has_sub_area);
        } else {
            saveReminders();
        }
        if (typeof response_str === 'undefined') {
            console.log("response_str got undefined");
            console.log(tokens);
            response_str = "That was a close one, I almost crashed!";
        }
        return response_str;
    }// end stop case

    response_str = "";
    var remind = {  "count" : num,
                    "area" : area,
                    "user" : message.author.id
    }
    if (has_sub_area === 1) {
        remind.sub_area = sub_area;
    }
    //Make sure the reminder doesn't already exist
    found = 0;
    for (var i = 0; i < reminders.length; i++) {
        if ((reminders[i].user === message.author.id) &&
            (reminders[i].area === area))
        {
            if ((typeof remind.sub_area === 'undefined') &&
                (typeof reminders[i].sub_area === 'undefined'))
            {
                response_str = "I already have a reminder for " + area + " for you";
                found = 1;
                break;
            }
            else if ((typeof remind.sub_area !== 'undefined') &&
                     (typeof reminders[i].sub_area !== 'undefined') &&
                     (reminders[i].sub_area === remind.sub_area))
            {
                response_str = "I already have a remind for " + area + " (" + remind.sub_area + ") for you";
                found = 1;
                break;
            }
        }
    }
    var save_ok;
    if (found === 0) {
        reminders.push(remind);
        response_str = "Reminder for " + area
        if (typeof remind.sub_area !== 'undefined') {
            response_str += " (" + remind.sub_area + ")";
        }
        response_str += " set to PM you ";
        if (remind.count === 1) {
            response_str += "once (stop this one and use the word 'always' if you wanted a repeating reminder) ";
        }
        else if (remind.count === -1) {
            response_str += "until you stop it";
        }
        else {
            response_str += remind.count + " times";
        }
        if (message.channel.type == "dm") {
            save_ok = 1;
        } else {
            message.author.send("Hi there! Reminders will be in PM and I'm just making sure I can PM you.\n" + response_str)
                .then(function()
                    {
                        save_ok = 1;
                        saveReminders();
                    }, //worked
                    function()
                    {
                        save_ok = 0;
                    });
        }
//        if (save_ok == 0) {
//            response_str = "I am not allowed to PM you so I will not set that timer. Check your Discord permissions.";
//        }
    }
    if (typeof response_str === 'undefined') {
        console.log("response_str got undefined");
        console.log(tokens);
        response_str = "That was a close one, I almost crashed!";
    }
    // Turns out if people block the bot from chatting with them reminders will fail anyway
//    if ((found + save_ok) >= 1) {
//        saveReminders();
//    }
//    return response_str;
}

function listRemind(message) {
    // List the reminders for the user, PM them the result
    var user = message.author.id;
    var pm_channel = message.author;
    var timer_str = "";
    var usage_str;
    var found = 0;

    for (var i = 0; i < reminders.length; i++) {
        //console.log ("Checking " + reminders[i].user );
        if (reminders[i].user === user) {
            timer_str += "Timer:    " + reminders[i].area;
            usage_str = "`-mh remind " + reminders[i].area;
            if (typeof reminders[i].sub_area !== 'undefined') {
                timer_str += " (" + reminders[i].sub_area + ")";
                usage_str += " " + reminders[i].sub_area;
            }
            if (reminders[i].count === 1) {
                timer_str += " one more time";
            }
            else if (reminders[i].count === -1) {
                timer_str += " until you stop it";
            }
            else {
                timer_str += " " + reminders[i].count + " times";
            }
            timer_str += ". " + usage_str + " stop` to turn off\n";
            found++;
            if (reminders[i].fail) {
                timer_str += "There have been " + reminders[i].fail + " failed attempts to remind you of this one.\n";
            }
        }
    }
    var err = 0;

    if (found > 0) {
        pm_channel.send(timer_str)
            .then(function() { err = 0; }, //worked
                function() { err = 1; });
    } else {
        pm_channel.send("I found no reminders for you, sorry")
            .then(function() { err = 0; }, //worked
                function() { err = 1; });
    }
    //TODO: If err=1 then the user has blocked the bot, disable timers?
}

function buildSchedule(timer_request) {
    //Build a list of timers coming up in the next bit of time
    var return_str = "";
    var upcoming_timers = [];
    var req_hours = timer_request.count;
    var area = timer_request.area;
    var max_count = 24;
    var curr_count = 0;

    if (isNaN(parseInt(req_hours))) {
        return "Somehow I got an argument that was not an integer.";
    }
    else if (req_hours <= 0) {
        req_hours = 24;
    }
    else if (req_hours >= 240) {
        req_hours = 240;
    }

    var time_span = req_hours * 60 * 60 * 1000;
    var cur_time = new Date();
    var end_time = new Date(cur_time.valueOf() + time_span);

    //Get the next occurrence for every timer. Compare its interval to determine how many of them to include
    var next_time;
    var timer_interval;
    for (var i = 0; i < timers_list.length; i++) {
        if ((typeof area !== 'undefined') && (timers_list[i].getArea() !== area)) {
            continue;
        }
        next_time = timers_list[i].getNext();
        if (next_time <= end_time) {
            upcoming_timers.push({  time: next_time.valueOf(),
                                    announce: timers_list[i].getDemand()
                                 });
            timer_interval = timers_list[i].getRepeat();
            //console.log("Schedule: " + (next_time.getTime()) + " AND " + (timer_interval) + " and " + end_time.getTime());
            while ((next_time.getTime() + timer_interval) < end_time.getTime()) {
                next_time.setTime(next_time.getTime() + timer_interval);
                upcoming_timers.push({  time: next_time.getTime(),
                                        announce: timers_list[i].getDemand()
                                     });
            }
        }
    }
    //Now we have an array of upcoming timers, let's sort it
    upcoming_timers.sort( function(a, b) {
        return a.time - b.time;
    });
    return_str = "I have " + (upcoming_timers.length) + " timers coming up in the next " + req_hours + " hours";
    if (upcoming_timers.length < max_count) {
        max_count = upcoming_timers.length;
    } else {
        return_str += " (truncated to " + max_count + " entries)";
    }
    return_str += ":\n";
    for (var i = 0; i < max_count; i++) {
        return_str += upcoming_timers[i].announce + " " + timeLeft(upcoming_timers[i].time) + "\n";
    }
    return return_str;

}

function getMouseList() {
    var url = "https://mhhunthelper.agiletravels.com/searchByItem.php?item_type=mouse&item_id=all";
    var now_time = new Date();
    console.log("Checking dates");
    if ("mouse_refresh" in last_timestamps) {
      var refresh_time = new Date(last_timestamps.mouse_refresh.valueOf() + refresh_rate);
      if (refresh_time < now_time) {
        last_timestamps.mouse_refresh = now_time;
      } else {
        return;
      }
    } else {
      last_timestamps.mouse_refresh = now_time;
    }
    request({
        url: url,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log("Got a mouse list");
//            console.log(body);
            mice = body;
            for (var i = 0; i < mice.length; i++ ) {
                mice[i].lowerValue = mice[i].value.toLowerCase();
            }
        }
    });
    getNicknames("mice");

}

function findMouse(channel, args, command) {
    //NOTE: RH location is https://mhhunthelper.agiletravels.com/tracker.json
    var url = 'https://mhhunthelper.agiletravels.com/searchByItem.php?item_type=mouse';
    var retStr = "'" + args + "' not found";
    var found = 0;
    var orig_args = args;

    //Process args for flags
    event = "";
    argArray = args.split(/\s+/);
    if (argArray.length > 2) {
        if (argArray[0] == "-e") {
            event = argArray[1];
            url += "&timefilter=" + event;
            argArray.splice(0,2);
        }
        args = argArray.join(" ");
    }
    //Check if it's a nickname
    if (nicknames["mice"][args]) {
        args = nicknames["mice"][args];
    }



    var len = args.length;
    var mouseID = 0;
    var mouseName;
    var attractions = [];
    var stage_used = 0;
//    console.log("Check for a string length of " + len)
    for (var i = 0; (i < mice.length && !found); i++) {
        if (mice[i].lowerValue.substring(0,len) === args) {
//            retStr = "'" + args + "' is '" + mice[i].value + "' AKA " + mice[i].id;
            mouseID = mice[i].id;
            mouseName = mice[i].value;
            url += "&item_id=" + mouseID;
//            console.log("Lookup: " + url);
            request( {
                url: url,
                json: true
            }, function (error, response, body) {
//                console.log("Doing a lookup");
                if (!error && response.statusCode == 200 && Array.isArray(body)) {
                    //body is an array of objects with: location, stage, total_hunts, rate, cheese
                    // sort by "rate" but only if hunts > 100
                    var attractions = [];
                    var collengths = { location: 0, stage: 0, total_hunts: 0, cheese: 0};
                    for (var j = 0; j < body.length; j++) {
                        if (body[j].total_hunts >= 100) {
                            attractions.push(
                                {   location: body[j].location,
                                    stage: (body[j].stage === null) ? " N/A " : body[j].stage,
                                    total_hunts: body[j].total_hunts,
                                    rate: body[j].rate,
                                    cheese: body[j].cheese
                                } );
                        }
                    }
                } else {
                    console.log("Lookup failed for some reason", error, response, body);
                    retStr = "Could not process results for '" + args + "', AKA " + mouseName;
                    channel.send(retStr);
                }
                //now to sort that by AR, descending
                attractions.sort( function (a,b) {
                    return b.rate - a.rate;
                });
                //And then to make a nice output. Or an output
                retStr = "";
                if (attractions.length > 0) {
                    attractions.unshift({ location: "Location", stage: "Stage", total_hunts: "Hunts", rate: "AR", cheese: "Cheese"});
                    attractions.splice(11);
                    for (var j = 0; j < attractions.length; j++) {
                        if (j > 0) {
                            attractions[j].total_hunts = integerComma(attractions[j].total_hunts);
                        }
                        for (var field in collengths) {
                            if ( attractions[j].hasOwnProperty(field) &&
                                (attractions[j][field].length > collengths[field])) {
                                collengths[field] = attractions[j][field].length;
                            }
                        }
                        if (j > 0 && attractions[j].stage != " N/A ") {
                          stage_used = 1;
                        }
                    }
                    retStr += attractions[0].location.padEnd(collengths.location) + ' |';
                    if (stage_used === 1) {
                        retStr += attractions[0].stage.padEnd(collengths.stage) + ' |' ;
                    } else {
                        collengths.stage = 0;
                    }
                    retStr += attractions[0].cheese.padEnd(collengths.cheese) + ' |' ;
                    retStr += attractions[0].rate.padEnd(7) + ' |';
                    retStr += attractions[0].total_hunts.padEnd(collengths.total_hunts);
                    retStr += "\n";
                    retStr += '='.padEnd(collengths.location + collengths.stage + collengths.cheese + 15 + collengths.total_hunts,'=') + "\n";
                    for (var j = 1; j < attractions.length ; j++) {
                        retStr += attractions[j].location.padEnd(collengths.location) + ' |';
                        if (stage_used === 1) {
                            retStr += attractions[j].stage.padEnd(collengths.stage) + ' |' ;
                        }
                        retStr += attractions[j].cheese.padEnd(collengths.cheese) + ' |' ;
                        retStr += String((attractions[j].rate * 1.0 / 100)).padStart(6) + '% |';
                        retStr += attractions[j].total_hunts.padStart(collengths.total_hunts);
                        retStr += "\n";
                    }
                    retStr = mouseName + " (mouse) can be found the following ways:\n```\n" + retStr + "\n```\n";
                    retStr += "HTML version at: <https://mhhunthelper.agiletravels.com/?mouse=" + mouseID + ">";
                } else {
                    retStr = mouseName + " either hasn't been seen enough or something broke";
                }
                channel.send(retStr);
            });
            found = 1;
        }
    }
    if (!found) {
        //If this was an item find try finding a mouse
        if (command === 'find') {
            findItem(channel, orig_args, command);
        } else {
//        console.log("Nothing found for '", args, "'");
            channel.send(retStr);
            getItemList();
        }
    }
}

function getItemList() {
    var url = "https://mhhunthelper.agiletravels.com/searchByItem.php?item_type=loot&item_id=all";
    var now_time = new Date();
    console.log("Checking dates");
    if ("item_refresh" in last_timestamps) {
      var refresh_time = new Date(last_timestamps.item_refresh.valueOf() + refresh_rate);
      if (refresh_time < now_time) {
        last_timestamps.item_refresh = now_time;
      } else {
        return;
      }
    } else {
      last_timestamps.item_refresh = now_time;
    }
    request({
        url: url,
        json: true
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            console.log("Got a loot list");
//            console.log(body);
            items = body;
            for (var i = 0; i < items.length; i++ ) {
                items[i].lowerValue = items[i].value.toLowerCase();
            }
        }
    });
    getNicknames("loot");
}

function findItem(channel, args, command) {
    //NOTE: RH location is https://mhhunthelper.agiletravels.com/tracker.json
    var url = 'https://mhhunthelper.agiletravels.com/searchByItem.php?item_type=loot';
    var retStr = "'" + args + "' not found";
    var found = 0;
    var orig_args = args;

    //Process args for flags
    event = "";
    argArray = args.split(/\s+/);
    if (argArray.length > 2) {
        if (argArray[0] == "-e") {
            event = argArray[1];
            url += "&timefilter=" + event;
            argArray.splice(0,2);
        }
        args = argArray.join(" ");
    }
    //Check if it's a nickname
    if (nicknames["loot"][args]) {
        args = nicknames["loot"][args];
    }

    var len = args.length;
    var itemID = 0;
    var itemName;
    var attractions = [];
    var stage_used = 0;
    var results_limit = 10;
//    console.log("Check for a string length of " + len)
    for (var i = 0; (i < items.length && !found); i++) {
        if (items[i].lowerValue.substring(0,len) === args) {
//            retStr = "'" + args + "' is '" + items[i].value + "' AKA " + items[i].id;
            itemID = items[i].id;
            itemName = items[i].value;
            url += "&item_id=" + itemID;
//            console.log("Lookup: " + url);
            request( {
                url: url,
                json: true
            }, function (error, response, body) {
//                console.log("Doing a lookup");
                if (!error && response.statusCode == 200 && Array.isArray(body)) {
                    //body is an array of objects with: location, stage, total_hunts, rate, cheese
                    // sort by "rate" but only if hunts > 100
                    var attractions = [];
                    var collengths = { location: 0, stage: 0, total_hunts: 0, cheese: 0, rate: 0};
                    for (var j = 0; j < body.length; j++) {
                        if (body[j].total_hunts >= 100) {
                            attractions.push(
                                {   location: body[j].location,
                                    stage: (body[j].stage === null) ? " N/A " : body[j].stage,
                                    total_hunts: body[j].total_hunts,
                                    rate: body[j].rate,
                                    cheese: body[j].cheese
                                } );
                        }
                    }
                } else {
                    console.log("Lookup failed for some reason", error, response, body);
                    retStr = "Could not process results for '" + args + "', AKA " + itemName;
                    channel.send(retStr);
                }
                //now to sort that by AR, descending
                attractions.sort( function (a,b) {
                    return b.rate - a.rate;
                });
                //And then to make a nice output. Or an output
                retStr = "";
                if (attractions.length > 0) {
                    attractions.unshift({ location: "Location", stage: "Stage", total_hunts: "Hunts", rate: "DR", cheese: "Cheese"});
                    attractions.splice(11);
                    for (var j = 0; j < attractions.length; j++) {
//                        console.log((attractions[j].rate * 1.0 / 1000).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                        if (j > 0) {
                            attractions[j].rate = (attractions[j].rate * 1.0 / 1000).toLocaleString('en-US', {minimumFractionDigits: 3, maximumFractionDigits: 3 });
                            attractions[j].total_hunts = integerComma(attractions[j].total_hunts);
                        }
                        for (var field in collengths) {
                            if ( attractions[j].hasOwnProperty(field) &&
                                (attractions[j][field].length > collengths[field])) {
                                collengths[field] = attractions[j][field].length;
                            }
                        }
                        if (j > 0 && attractions[j].stage != " N/A ") {
                          stage_used = 1;
                        }
                    }
                    collengths.rate += 1; //account for the decimal
                    retStr += attractions[0].location.padEnd(collengths.location) + ' |';
                    if (stage_used === 1) {
                        retStr += attractions[0].stage.padEnd(collengths.stage) + ' |' ;
                    } else {
                        collengths.stage = 0;
                    }
                    retStr += attractions[0].cheese.padEnd(collengths.cheese) + ' |' ;
                    retStr += attractions[0].rate.padEnd(collengths.rate) + ' |';
                    retStr += attractions[0].total_hunts.padEnd(collengths.total_hunts);
                    retStr += "\n";
                    retStr += '='.padEnd(collengths.location + collengths.stage + collengths.cheese + collengths.rate + collengths.total_hunts + 8,'=') + "\n";
                    for (var j = 1; j < attractions.length ; j++) {
                        retStr += attractions[j].location.padEnd(collengths.location) + ' |';
                        if (stage_used === 1) {
                            retStr += attractions[j].stage.padEnd(collengths.stage) + ' |' ;
                        }
                        retStr += attractions[j].cheese.padEnd(collengths.cheese) + ' |' ;
                        retStr += attractions[j].rate.padStart(collengths.rate) + ' |';
                        retStr += attractions[j].total_hunts.padStart(collengths.total_hunts);
                        retStr += "\n";
                    }
                    retStr = itemName + " (loot) can be found the following ways:\n```\n" + retStr + "\n```\n";
                    retStr += "HTML version at: <https://mhhunthelper.agiletravels.com/loot.php?item=" + itemID + ">";
                } else {
                    retStr = itemName + " either hasn't been seen enough or something broke";
                }
                channel.send(retStr);
            });
            found = 1;
        }
    }
    if (!found) {
        //If this was an item find try finding a mouse
        if (command === 'ifind') {
            findMouse(channel, orig_args, command);
        } else {
//        console.log("Nothing found for '", args, "'");
            channel.send(retStr);
            getMouseList();
        }
    }
}

function unsetHunterID(message) {
    //Unsets the hunter's id (and all other friend-related settings)
    //Currently all settings are friend-related
    var hunter = message.author.id;
    var did_delete = 0;
    if (hunters[hunter]) {
        delete hunters[hunter];
        saveHunters();
        message.channel.send("OK, you have been deleted from results.");
    } else {
        message.channel.send("I didn't do anything but that's because you didn't do anything either.");
    }
}

function setHunterID(message, hid) {
    // Accepts a message object and hunter id, sets the author's hunter ID to the passed argument
    // Also saves the resulting object
    var hunter = message.author.id;
    var oldval = 0;
    var message_str = "";
    if (isNaN(hid)) {
        message.channel.send("I'm not sure that `" + hid + "` is a number so I am ignoring you.");
        return;
    }
    if (!hunters[hunter]) {
        hunters[hunter] = {};
        console.log(" OMG! A new hunter " + hunter);
    }
    if (hunters[hunter]['hid']) {
        //Replace
        oldval = hunters[hunter]['hid'];
        message_str = "You used to be known as `" + oldval + "`. ";
        console.log("Found an old hid");
    }
    hunters[hunter]['hid'] = hid;
    message_str += "If people look you up they'll see `" + hid + "`."
//    console.log(hunters);
    saveHunters(); // TODO: Change this to a scheduled save
    message.channel.send(message_str);
}

function setHunterProp(message, property, value) {
    // Accepts a message object and hunter id, sets the author's hunter ID to the passed argument
    // Also saves the resulting object
    var hunter = message.author.id;
    var oldval = 0;
    var message_str = "";
    if ((!hunters[hunter]) || (!hunters[hunter]['hid'])) {
        message.channel.send("I don't know who you are so you can't set that now, set your hunter ID first");
        return;
    }
    if (hunters[hunter][property]) {
        oldval = hunters[hunter][property];
        message_str = "Your " + property + " used to be `" + oldval + "`. ";
    }

    hunters[hunter][property] = value;
    message_str += "Your " + property + " is set to `" + value + "`."
    saveHunters(); // TODO: Change this to a scheduled save
    message.channel.send(message_str);
}


function loadHunters() {
    //Read the JSON into the reminders array
    console.log("loading hunters");
    fs.readFile(hunter_ids_filename, file_encoding, (err, data) => {
        if (err) {
            console.log(err);
            return undefined;
        }

        hunters = JSON.parse(data);
        console.log (Object.keys(hunters).length + " hunters loaded");
    });
}

function loadNicknameURLs() {
    //Read the JSON into the reminders array
    console.log("loading nicknames");
    fs.readFile(nickname_urls_filename, file_encoding, (err, data) => {
        if (err) {
            console.log(err);
            return undefined;
        }

        nickname_urls = JSON.parse(data);
        console.log (Object.keys(nickname_urls).length + " nickname sources loaded");
        nicknames = {}; //Clear it out
        for (var key in nickname_urls) {
            getNicknames(key);
        }
    });
}


function saveHunters () {
    //Write out the JSON of the reminders array
    fs.writeFile(hunter_ids_filename, JSON.stringify(hunters, null, 1), file_encoding, (err) => {
        if (err) {
            reject();
            return console.log(err);
        }
    });
//    console.log("hunters saved: " + hunters.size);
//    console.log(hunters);
}

function getNicknames() {
    // Wrapper function to get all the nicknames
    nicknames = {}; //Clear it out
    for (var key in nickname_urls) {
        getNicknames(key);
    }
}

function getNicknames(type) {
    if (!nickname_urls[type]) {
        console.log("Received " + type + " but I don't know that URL");
        return false;
    }
    nicknames[type] = {};
    //It returns a CSV, not a JSON
    request({
        url: nickname_urls[type]
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            lines = body.split(/[\r\n]+/);
            lines.shift(); // Remove the header
            for (var i = 0; i < lines.length; i++ ) {
                line = lines[i].toLowerCase().split(',', 2);
                if (line.length === 2) {
                    nicknames[type][line[0]] = line[1];
                }
            }
        }
        console.log(Object.keys(nicknames[type]).length + " " + type + " nicknames loaded");
    });
}

function getLootNicknames() {
    nicknames["loot"] = {};
    var url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQRxGO1iLgX6N2P2iUT57ftCbh5lv_cmnatC6F8NevrdYDtumjcIJw-ooAqm1vIjSu6b0HfP4v2DYil/pub?gid=1181602359&single=true&output=csv";
    //It returns a CSV, not a JSON
    request({
        url: url
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            lines = body.split(/[\r\n]+/);
            lines.shift(); // Remove the header
            for (var i = 0; i < lines.length; i++ ) {
                line = lines[i].toLowerCase().split(',', 2);
                if (line.length === 2) {
                    nicknames["loot"][line[0]] = line[1];
                }
            }
        }
    });
}

function getHunterByID(message, hid, type) {
    //Find the account for the user identified by the hid
    var keys = Object.keys(hunters);
    for (var i = 0; i < keys.length; i++) {
        if (hunters[keys[i]][type] == hid) {
            return keys[i];
        }
    }
}

function getHunterByDiscordID(message, id) {
    //Find the account for the user identified by the author.id. Easiest case
    if (hunters[id] && hunters[id]["hid"]) {
        return hunters[id]["hid"]
    }
    return 0;
}

function getHunterByProp(message, property, string) {
    //Find random hunter ids to befriend
    var valid = [];
    var keys = Object.keys(hunters);
//    console.log("Checking " + keys.length + " hunters to see if '" + property + "' is '" + string + "'");
    for (var i = 0; i < keys.length; i++) {
        if (hunters[keys[i]][property] === string) {
            valid.push(hunters[keys[i]]["hid"]);
        }
    }
    return valid.sort( function() { return 0.5 - Math.random() } ).slice(0,5);
}

function integerComma(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

//Resources:
//Timezones in Discord: https://www.reddit.com/r/discordapp/comments/68zkfs/timezone_tag_bot/
//Location nicknames as csv: https://docs.google.com/spreadsheets/d/e/2PACX-1vQRxGO1iLgX6N2P2iUT57ftCbh5lv_cmnatC6F8NevrdYDtumjcIJw-ooAqm1vIjSu6b0HfP4v2DYil/pub?gid=0&single=true&output=csv
//Loot nicknames as csv:     https://docs.google.com/spreadsheets/d/e/2PACX-1vQRxGO1iLgX6N2P2iUT57ftCbh5lv_cmnatC6F8NevrdYDtumjcIJw-ooAqm1vIjSu6b0HfP4v2DYil/pub?gid=1181602359&single=true&output=csv
//Mice nicknames as csv:     https://docs.google.com/spreadsheets/d/e/2PACX-1vQRxGO1iLgX6N2P2iUT57ftCbh5lv_cmnatC6F8NevrdYDtumjcIJw-ooAqm1vIjSu6b0HfP4v2DYil/pub?gid=762700375&single=true&output=csv
