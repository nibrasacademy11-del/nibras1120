const Counter = require('../models/Counter');

// Formats of the numbers the system hands out. Changing a prefix only affects new numbers.
const SERIES = {
    customer: { prefix: 'NB-', pad: 6 },
    receipt: { prefix: 'RC-', pad: 7 },
    certificate: { prefix: 'NC-', pad: 7 }
};

function formatNumber(series, seq) {
    const s = SERIES[series];
    if (!s) throw new Error(`Unknown number series: ${series}`);
    return `${s.prefix}${String(seq).padStart(s.pad, '0')}`;
}

async function nextNumber(series, { session } = {}) {
    if (!SERIES[series]) throw new Error(`Unknown number series: ${series}`);
    const counter = await Counter.findOneAndUpdate(
        { _id: series },
        { $inc: { seq: 1 } },
        { upsert: true, new: true, session }
    );
    return { seq: counter.seq, number: formatNumber(series, counter.seq) };
}

module.exports = { SERIES, formatNumber, nextNumber };
