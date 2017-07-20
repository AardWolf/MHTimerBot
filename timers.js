// timers.js
//   Define what a mousehunt timer is.

var Timer = function(area, next_time, repeat_time, announce_string) {
	//Simple constructor. Takes input arguments and gives them names, sets a few next times
	this.area = area;
	this.next_time = new Date(next_time); //milliseconds since epoch, UTC
	this.repeat_time = repeat_time; // milliseconds between repeats
	this.announce_string = announce_string;
	
//	this.repeat_time = this.repeat_days * 86400000;
	
	//Calculate a few in advance
	this.futures = [this.next_time, new Date (this.next_time.valueOf() + this.repeat_time) ];
	this.futures.push(new Date(this.next_time.valueOf() + this.repeat_time * 2));
	this.futures.push(new Date(this.next_time.valueOf() + this.repeat_time * 3));
	this.futures.push(new Date(this.next_time.valueOf() + this.repeat_time * 4));
}

Timer.prototype.advance = function() {
	//Returns the time that should be old but it doesn't check to make sure
	this.futures.push(new Date(this.next_time.valueOf() + this.repeat_time * 4));
	return this.futures.shift();
}
module.export Timer;
