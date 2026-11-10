const mongoose = require('mongoose');

// Permissions the super admin saved for a role. A role without a document uses the defaults
// in lib/permissions.js. Grants map "resource.action" to own | team | all.
const rolePolicySchema = new mongoose.Schema({
    role: { type: String, required: true, unique: true },
    grants: { type: Map, of: String, default: {} },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true, optimisticConcurrency: true });

module.exports = mongoose.model('RolePolicy', rolePolicySchema);
