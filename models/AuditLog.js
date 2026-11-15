const mongoose = require('mongoose');

// Append-only record of everything that happens in the system.
// Entries can be added and read, never changed or removed through the application.
const auditLogSchema = new mongoose.Schema({
    at: { type: Date, default: Date.now, index: true },
    actor: {
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
        name: String,
        role: String
    },
    action: { type: String, required: true, index: true },      // e.g. user.role_changed, auth.login
    resource: { type: String, required: true, index: true },    // e.g. users, customers, payments
    resourceId: { type: String, index: true },
    summary: { type: String, default: '' },
    reason: { type: String, default: '' },
    changes: { type: mongoose.Schema.Types.Mixed, default: undefined }, // { field: { from, to } }
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
    ip: String,
    userAgent: String
}, { versionKey: false });

auditLogSchema.index({ resource: 1, resourceId: 1, at: -1 });

const blocked = function () {
    throw new Error('Audit log entries cannot be changed or deleted.');
};
for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace',
    'deleteOne', 'deleteMany', 'findOneAndDelete']) {
    auditLogSchema.pre(op, blocked);
}
auditLogSchema.pre('save', function () {
    if (!this.isNew) throw new Error('Audit log entries cannot be changed.');
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
