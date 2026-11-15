const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// Tasks and follow-ups. A follow-up is a task tied to a customer with a due time;
// the daily reminder job notifies the assignee when it is due or overdue.
const taskSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 3000 },
    kind: { type: String, enum: ['task', 'follow_up'], default: 'task', index: true },
    customer: { type: ObjectId, ref: 'Customer', default: null, index: true },
    assignee: { type: ObjectId, ref: 'User', required: true, index: true },   // owner for permission scopes
    team: { type: ObjectId, ref: 'Team', default: null, index: true },
    createdBy: { type: ObjectId, ref: 'User', required: true },
    dueAt: { type: Date, default: null, index: true },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    status: { type: String, enum: ['open', 'done', 'cancelled'], default: 'open', index: true },
    completedAt: { type: Date, default: null },
    completedBy: { type: ObjectId, ref: 'User', default: null },
    result: { type: String, default: '', maxlength: 2000 },
    remindedAt: { type: Date, default: null }
}, { timestamps: true, optimisticConcurrency: true });

taskSchema.index({ assignee: 1, status: 1, dueAt: 1 });

module.exports = mongoose.model('Task', taskSchema);
