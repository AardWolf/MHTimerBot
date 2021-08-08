# MHTimerBot
Discord bot that understands mousehunt timers and MouseHunt Community Tools (MHCT) and a few other things about life.

## Needs
Next big push is make things into slash commands.

## Commands

* next \<area\> - displays how long until the next timer of that type and what the display message would be
  -next spill: The levels will rise to Arch in 2h31m
* remind \<area\> [sub-area] [always|once|stop|<num>] - Sends a PM to remind of ANY timer for an area
  -remind season once - Will only remind the next time the timer goes
  -remind season winter once - Will only remind the next time the timer goes
* schedule \<area\> [\<number\>] - Shows the timers for the next \<number\> of days for an area
  -schedule spill 2 - The levels will rise to Arch in 2h31m / The levels will fall through Arch in 1d2h31m
* find \<mouse\> - Finds a mouse using MHCT data. You need up to three characters of the start of the mouse's name
  -find Ful'mina OR -find ful
* ifind \<loot\> - Finds a loot drop using MHCT data. You need up to three characters of the loot's name
  -ifind tooth
* whatsin \<convertible\> - Displays things that MHCT has seen in other things
  -whatsin arduous
* iam \<hunter id\> - Enters you into the hunter registry
* whois [in|a] [\<location|title\>] - Looks for potential new friends in the hunter's registry
  -whois in lagoon
* minluck \<mouse\> - Displays a mouse's minluck values
  -minluck Ful'mina OR -minluck ful


## TO-DO

* Slash commands

## To Use In Your Own Server

Make a bot account. Google that if you don't know how. In the `data/settings.json` file you will need the following entries:

* token - this is your bot token
* bitly_token - this does link conversion. Not setting this just causes weird output but the bot works fine.
* linkConversionChannel - (optional) the name of the channel to monitor for links (default: larrys-freebies)
* timedAnnouncementsChannel - (optional) the name of the channel to announce timers in (default: timers)
* botPrefix - (optional) the prefix for the bot's commands (default: -mh)

Current requirement is for discord.js v13 and node.js v16.6

Fork this repo to your hosting server, edit the config files to put in your values (including your ID as owner), and run `node src/MHTimer.js`.
