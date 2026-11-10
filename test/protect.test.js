const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const protectRecords = require('../lib/protectRecords');

// No database: the guards must refuse before anything is sent
const schema = new mongoose.Schema({ amount: Number, status: String, note: String });
schema.plugin(protectRecords, { mutable: ['status'] });
const Rec = mongoose.model('ProtectTestRecord', schema);

test('deletes are always refused', async () => {
    await assert.rejects(Rec.deleteOne({ _id: new mongoose.Types.ObjectId() }), /cannot be deleted/);
    await assert.rejects(Rec.deleteMany({}), /cannot be deleted/);
    await assert.rejects(Rec.findOneAndDelete({}), /cannot be deleted/);
});

test('updates may only touch the allowed fields', async () => {
    await assert.rejects(Rec.updateOne({}, { $set: { amount: 5 } }), /amount/);
    await assert.rejects(Rec.updateMany({}, { amount: 5 }), /amount/);
    await assert.rejects(Rec.findOneAndUpdate({}, { $inc: { amount: 1 }, $set: { status: 'x' } }), /amount/);
    await assert.rejects(Rec.replaceOne({}, { amount: 1 }), /cannot be changed/);
});

test('saving an existing record checks the changed paths', async () => {
    const doc = Rec.hydrate({ _id: new mongoose.Types.ObjectId(), amount: 10, status: 'a', note: '' });
    doc.amount = 11;
    await assert.rejects(doc.validate().then(() => doc.$__schema.s.hooks.execPre('save', doc, [])), /amount/);
});
