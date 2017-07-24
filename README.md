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
* remind \<area\> [always|once|cancel] - Sends a PM to remind of ANY timer for an area  
  -remind season once - Will only remind the next time the timer goes  
* schedule \<area\> [\<number\>] - Shows the timers for the next \<number\> of days for an area  
  -schedule spill 2 - The levels will rise to Arch in 2h31m / The levels will fall through Arch in 1d2h31m

## TO-DO

* Implement setInterval for the timers.  
* Configure which channel is announced on (should be #timers at some point)  
* Read/Save reminder requests.  
* Add commands to listener
