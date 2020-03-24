# MHTimerBot
Discord bot that understands mousehunt timers

## Needs
Store timers in a file, database, or something "static" for when it's offline
The definition of these timers should help determine that format.
Timers have a next occurrence. A duration. A repeat frequency. Some timers would change into next if they're fancy - spill timers, season timers. Or do like the currently do and repeat themselves
Timers need a way to catch back up if offline a while.

## Commands

* next \<area\> - displays how long until the next timer of that type and what the display message would be
  -next spill: The levels will rise to Arch in 2h31m
* remind \<area\> [sub-area] [always|once|stop|<num>] - Sends a PM to remind of ANY timer for an area
  -remind season once - Will only remind the next time the timer goes
  -remind season winter once - Will only remind the next time the timer goes
* schedule \<area\> [\<number\>] - Shows the timers for the next \<number\> of days for an area
  -schedule spill 2 - The levels will rise to Arch in 2h31m / The levels will fall through Arch in 1d2h31m
* find \<mouse\> - Finds a mouse using agiletravels' data. You need up to three characters of the start of the mouse's name
  -find Ful'mina OR -find ful

## TO-DO

* Implement setInterval for the timers.
* Configure which channel is announced on (should be #timers at some point)
* Read/Save reminder requests.
* Add commands to listener

## To Use In Your Own Server

Make a bot account. Google that if you don't know how. In the `data/settings.json` file you will need the following entries:

* token - this is your bot token
* bitly_token - this does link conversion. Not setting this just causes weird output but the bot works fine.
* linkConversionChannel - (optional) the name of the channel to monitor for links (default: larrys-freebies)
* timedAnnouncementsChannel - (optional) the name of the channel to announce timers in (default: timers)
* botPrefix - (optional) the prefix for the bot's commands (default: -mh)
