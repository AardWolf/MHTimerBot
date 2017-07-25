// Timer Class

// Constructor
var Timer = function(area, seed_time, repeat_time, announce_string, demand_string) {
	this.area = area;
	this.seed_time = new Date(seed_time); //milliseconds since epoch, UTC
	this.repeat_time = repeat_time; // milliseconds between repeats
	this.announce_string = announce_string;
    this.demand_string = demand_string;
}

Timer.prototype.getNext = function() {
	var cur_time = Date.now();
//    var test_time = this.seed_time;
//    while (test_time <= cur_time) {
//        test_time.setTime(test_time.valueOf() + this.repeat_time);
//    }
//    return test_time;
	//returns the previous one
    return new Date(cur_time.valueOf() + (this.repeat_time + ((this.seed_time - cur_time.valueOf() ) % this.repeat_time) ));
    
    //Math.floor((cur_time - seed_time) / repeat_time) = num_iterations
    //seed_time + repeat_time * (num_iterations + 1) = next_time
}

Timer.prototype.getArea = function() {
    return this.area;
}

Timer.prototype.getAnnounce = function() {
	return this.announce_string;
}

Timer.prototype.getDemand = function() {
    return this.demand_string ? this.demand_string : this.announce_string;
}

Timer.prototype.getInterval = function() {
	return this.repeat_time;
}

module.exports = Timer;
