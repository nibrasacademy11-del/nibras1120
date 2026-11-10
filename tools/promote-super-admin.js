// Makes an existing account the super admin, the only role that can edit role permissions
// and hand out the admin roles. Run it once after deploying the management system:
//
//   node tools/promote-super-admin.js owner@example.com
//
// It uses MONGO_URI from the environment (.env.development first, like server.js).
// Add --dry-run to see what would change without writing.

const path = require('path');
const fs = require('fs');
const devEnv = path.join(__dirname, '..', '.env.development');
require('dotenv').config({ path: fs.existsSync(devEnv) && !process.argv.includes('--production') ? devEnv : path.join(__dirname, '..', '.env'), quiet: true });

const mongoose = require('mongoose');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

async function main() {
    const email = String(process.argv[2] || '').trim().toLowerCase();
    const dryRun = process.argv.includes('--dry-run');
    if (!email || email.startsWith('--')) {
        console.error('Usage: node tools/promote-super-admin.js <email> [--dry-run] [--production]');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name}`);

    const user = await User.findOne({ email });
    if (!user) throw new Error(`No account with email ${email}`);
    console.log(`Account: ${user.name} <${user.email}>, current role: ${user.role}`);
    if (user.role === 'super_admin') {
        console.log('Already the super admin. Nothing to do.');
        return;
    }
    if (dryRun) {
        console.log('Dry run: would set role to super_admin and sign the account out everywhere.');
        return;
    }
    const from = user.role;
    user.role = 'super_admin';
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await AuditLog.create({
        action: 'user.role_changed',
        resource: 'users',
        resourceId: String(user._id),
        summary: `Promoted ${user.email} to super admin from the command line`,
        changes: { role: { from, to: 'super_admin' } }
    });
    console.log('Done. Sign in again to use the new role.');
}

main()
    .catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
