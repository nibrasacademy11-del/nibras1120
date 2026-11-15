// The hourly jobs on the server (Hostinger VPS): follow-up reminders, lecture reminders (the day
// before and an hour before), Zoom attendance and recordings, due certificates, and installment
// reminders. They run inside the app, at 5 minutes past every hour; every job sends each thing
// once, so a restart or a second run never repeats a message. JOBS=off turns them off.

const HOUR = 60 * 60 * 1000;
const state = { enabled: false, running: false, lastStart: null, lastEnd: null, lastResult: null, lastError: '' };
let timer = null;

async function runOnce() {
    if (state.running) return null;
    state.running = true;
    state.lastStart = new Date();
    try {
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) await require('../config/db')();
        state.lastResult = await require('../modules/crm/homeController').runJobs();
        state.lastError = '';
        return state.lastResult;
    } catch (err) {
        state.lastError = String((err && err.message) || err).slice(0, 300);
        require('./errorLog').logError({ source: 'jobs', error: err, route: 'scheduler', status: 500 });
        return null;
    } finally {
        state.running = false;
        state.lastEnd = new Date();
    }
}

// Milliseconds until the next hh:05
function untilNext(now = new Date()) {
    const next = new Date(now);
    next.setMinutes(5, 0, 0);
    if (next <= now) next.setTime(next.getTime() + HOUR);
    return next - now;
}

function start() {
    if (String(process.env.JOBS || '').toLowerCase() === 'off' || timer) return;
    state.enabled = true;
    const tick = () => {
        runOnce();
        timer = setTimeout(tick, untilNext());
    };
    // the first run two minutes after a start (after a deploy, nothing waits a whole hour)
    timer = setTimeout(tick, Math.min(2 * 60 * 1000, untilNext()));
    timer.unref?.();
}

function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    state.enabled = false;
}

const status = () => ({ ...state });

module.exports = { start, stop, runOnce, status, untilNext };
