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
* minluck \<mouse\> - Displays a mouse's minluck values
  -minluck Ful'mina OR -minluck ful
* config - Bot and server owner, mostly. Allows for some server-level configurations such as who can run that command

## To use with your own discord server

Note: If you just want to use existing bot on your own discord server, ask Aardwolf if you can join our bot testing. Otherwise, these instructions are to host your own copy of the bot, so you can help us develop and customize it.

Note: The slash commands should work, everything else is buggy right now. Please submit your feedback or questions in official MH Discord in the Comm Tools Thread named "Larry Updates".

1. Log into discord in a browser and create a discord bot account [like this](https://discordpy.readthedocs.io/en/stable/discord.html)
2. In the [bot account settings](https://discord.com/developers/applications):
    * Under Bot tab: Ensure that the [Message Content intent](https://support-dev.discord.com/hc/en-us/articles/4404772028055) is enabled.
    * Under Oath2->Url Generator: Add the following permissions and open the new generated url to invite the bot to your server
        * View Channels
        * Send Messages
        * Send Messages in Threads (if you use threads on your server)
        * Embed Links
        * Add Reactions
        * Read Message History
        * Use Application Commands
3. Invide the bot to any private channels from that channel settings
4. Clone this repo to your server and cd into that new directory
5. Modify the `data/settings.json` (copy it from the sample file provided there):
    * token (REQUIRED) - this is your bot token
    * owner ID (REQUIRED) - this is your discord numerical id
    * bitly_token - this does link conversion. Not setting this just causes weird output but the bot works fine.
    * linkConversionChannel - the name of the channel to monitor for links (default: larrys-freebies)
    * timedAnnouncementsChannel - the name of the channel to announce timers in (default: timers)
    * botPrefix - the prefix for the bot's commands (default: -mh)
6. Make sure you have nodejs (minimum v16.15) and npm installed
7. Run `npm install` inside the repo folder
8. Run `node src/MHTimer.js` to start the bot or `nohup node src/MHTimers.js >error.log 2>&1 &` to run it in background.


