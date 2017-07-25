// Timer Class

// Constructor
var Timer = function(in_object) {
    //sanitize inputs
    if (typeof in_object !== 'object') {
        console.log("I did not receive an object as input");
        process.exit(1);
    }
    if (typeof in_object.area == 'undefined') {
        console.log("Received undefined input for area, exiting");
        process.exit(1);
    }
    this.area = in_object.area;
    this.seed_time = new Date(in_object.seed_time); //milliseconds since epoch, UTC
    if (typeof this.seed_time != 'object') {
        console.log("Date provided did not parse for " + this.area);
        process.exit(1);
    }
    if ((typeof in_object.repeat_time == 'undefined') || in_object.repeat_time < 60000) {
        console.log("repeat time is either too short or didn't exist.");
        process.exit(1);
    }
    this.repeat_time = in_object.repeat_time; // milliseconds between repeats
    if ((typeof in_object.announce_string == 'undefined') || in_object.announce_string === "") {
        in_object.announce_string = "This is a default string because the timer was not set up properly";
    }
    this.announce_string = in_object.announce_string;
    if ((typeof in_object.demand_string == 'undefined') || in_object.demand_string === "") {
        in_object.demand_string = in_object.announce_string;
    }
    this.demand_string = in_object.demand_string;
    if (typeof in_object.demand_offset == 'undefined') {
        in_object.demand_offset = 0;
    }
    this.demand_offset = in_object.demand_offset;
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
    return this.demand_string ;
}

Timer.prototype.getDemandOffset = function () {
    return this.demand_offset;
}

Timer.prototype.getInterval = function() {
    return this.repeat_time;
}

module.exports = Timer;
