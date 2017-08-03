// Timer Class

// Constructor
var Timer = function(in_object) {
    //sanitize inputs
    if (typeof in_object !== 'object') {
        console.log("I did not receive an object as input");
        process.exit(1);
    }
    if (typeof in_object.area === 'undefined') {
        console.log("Received undefined input for area, exiting");
        process.exit(1);
    }
    this.area = in_object.area;
    if (typeof in_object.sub_area !== 'undefined') {
        this.sub_area = in_object.sub_area;
    }
    this.seed_time = new Date(in_object.seed_time); //milliseconds since epoch, UTC
    if (typeof this.seed_time != 'object') {
        console.log("Date provided did not parse for " + this.area);
        process.exit(1);
    }
    if ((typeof in_object.repeat_time === 'undefined') || in_object.repeat_time < 60000) {
        console.log("repeat time is either too short or didn't exist.");
        process.exit(1);
    }
    this.repeat_time = in_object.repeat_time; // milliseconds between repeats
    if ((typeof in_object.announce_string === 'undefined') || in_object.announce_string === "") {
        in_object.announce_string = "This is a default string because the timer was not set up properly";
    }
    this.announce_string = in_object.announce_string;
    if ((typeof in_object.demand_string === 'undefined') || in_object.demand_string === "") {
        in_object.demand_string = in_object.announce_string;
    }
    this.demand_string = in_object.demand_string;
    if (typeof in_object.announce_offset === 'undefined') {
        in_object.announce_offset = 0;
    }
    this.announce_offset = in_object.announce_offset;
    this.timeout;
    this.interval;
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

Timer.prototype.getSubArea = function () {
    return this.sub_area;
}

Timer.prototype.getAnnounce = function() {
    return this.announce_string;
}

Timer.prototype.getDemand = function() {
    return this.demand_string ;
}

Timer.prototype.getAnnounceOffset = function () {
    return this.announce_offset;
}

Timer.prototype.getRepeat = function() {
    return this.repeat_time;
}

Timer.prototype.getTimeout = function() {
    return this.timeout;
}

Timer.prototype.setTimeout = function(timeout) {
    if (typeof timeout.ref() === "object") {
        if (typeof this.timeout === "object" && typeof this.timeout.ref() === "object") {
            this.stopTimeout();
        }
        this.timeout = timeout;
    }
}

Timer.prototype.stopTimeout = function () {
    if (typeof this.timeout.ref() === "object") {
        clearTimeout(this.timeout);
    }
}

Timer.prototype.getInterval = function() {
    return this.interval;
}

Timer.prototype.setInterval = function(interval) {
    if (typeof interval.ref() === "object") {
        if (typeof this.interval === "object" && typeof this.interval.ref() === "object") {
            this.stopInterval();
        }
        this.interval = interval;
    }
}

Timer.prototype.stopInterval = function () {
    if (typeof this.interval.ref() === "object") {
        clearInterval(this.interval);
    }
}

module.exports = Timer;
