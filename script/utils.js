"use strict";

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function randInt(rng, min, maxInclusive) {
    return min + (rng.generate() * (maxInclusive - min + 1) | 0);
}

function choice(rng, arr) {
    return arr[randInt(rng, 0, arr.length - 1)];
}

function formatTime(sec) {
    sec = Math.max(0, sec);
    return String(Math.ceil(sec));
}

module.exports = {
    clamp,
    lerp,
    randInt,
    choice,
    formatTime
};
