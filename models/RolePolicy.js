const mongoose = require('mongoose');

// Permissions the super admin saved for a role. A role without a document uses the defaults
// in lib/permissions.js. Each entry maps "resource.action" to own | team | all.
// Stored as a list, not a keyed map: the permission names contain a dot, which a map key cannot.
const rolePolicySchema = new mongoose.Schema({
    role: { type: String, required: true, unique: true },
    entries: { type: [{ key: { type: String, required: true }, scope: { type: String, enum: ['own', 'team', 'all'], required: true }, _id: false }], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true, optimisticConcurrency: true, strict: true });

// { "customers.view": "team", ... } <-> [{ key, scope }]
rolePolicySchema.statics.toEntries = (grants) => Object.entries(grants || {}).map(([key, scope]) => ({ key, scope }));
rolePolicySchema.statics.toGrants = (doc) => {
    if (doc && Array.isArray(doc.entries) && doc.entries.length) return Object.fromEntries(doc.entries.map((e) => [e.key, e.scope]));
    // an older document shape, kept readable
    const g = doc && doc.grants;
    if (!g) return {};
    return g instanceof Map ? Object.fromEntries(g) : g;
};

module.exports = mongoose.model('RolePolicy', rolePolicySchema);
