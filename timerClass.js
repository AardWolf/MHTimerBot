// Timer Class

// Constructor
var Timer = function(area, seed_time, repeat_time, announce_string) {
	this.area = area;
	this.seed_time = new Date(seed_time); //milliseconds since epoch, UTC
	this.repeat_time = repeat_time; // milliseconds between repeats
	this.announce_string = announce_string;
}

Timer.prototype.getNext = function() {
	var cur_time = Date.now();
//    var test_time = this.seed_time;
//    while (test_time <= cur_time) {
//        test_time.setTime(test_time.valueOf() + this.repeat_time);
//        test_time = new Date(test_time.valueOf() + this.repeat_time);
//    }
//    return test_time;
	//returns the previous one
    
    //Math.floor((cur_time - seed_time) / repeat_time) = num_iterations
    //seed_time + repeat_time * (num_iterations + 1) = next_time
    return new Date(this.seed_time + this.repeat_time * Math.ceil((cur_time.valueOf() - this.seed_time.valueOf()) / this.repeat_time));
    
//  return new Date(this.repeat_time - ((cur_time.valueOf() - this.seed_time.valueOf()) & this.repeat_time) + cur_time.valueOf());
//	return new Date(cur_time.valueOf() + Math.abs(((this.seed_time.valueOf() - cur_time.valueOf()) % this.repeat_time)) + this.repeat_time);  //division is numer of whole elapsed iterations, modulus is ms until next
//	return new Date(cur_time.valueOf() + Math.abs(((this.seed_time.valueOf() - cur_time.valueOf()) % this.repeat_time)));  //division is numer of whole elapsed iterations, modulus is ms until next
//	return new Date(cur_time + (Math.abs(this.seed_time.valueOf() - cur_time) % this.repeat_time));  //division is numer of whole elapsed iterations, modulus is ms until next
}

Timer.prototype.getArea = function() {
    return this.area;
}

Timer.prototype.getAnnounce = function() {
	return this.announce_string;
}

Timer.prototype.getInterval = function() {
	return this.repeat_time;
}

module.exports = Timer;
