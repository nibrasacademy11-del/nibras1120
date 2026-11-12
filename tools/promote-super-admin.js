// Makes an account the academy's owner (the super_admin role, shown as "المالك"): the only role
// that edits role permissions and hands out the admin roles. Runs on the server only.
//
//   node tools/promote-super-admin.js info@nibras-ac.com --primary [--dry-run] [--production]
//
//   --primary   also marks the account as the PRIMARY owner, protected in the portal: nobody can
//               change its role, email or two-factor, disable it, sign it out or delete it there.
//               Only one account is the primary owner; the mark moves from any other account.
//   --create "Full name"
//               when no account has this email, creates it WITHOUT a usable password (a random one
//               that nobody knows). The owner then sets their password with "Forgot password".
//               An existing account is never duplicated; its data and password are kept.
//   --dry-run   shows what would change without writing.
//
// It uses MONGO_URI from the environment (.env.development first, like server.js; --production
// uses .env). Try --dry-run first.

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const devEnv = path.join(__dirname, '..', '.env.development');
require('dotenv').config({ path: fs.existsSync(devEnv) && !process.argv.includes('--production') ? devEnv : path.join(__dirname, '..', '.env'), quiet: true });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Session = require('../models/Session');
const AuditLog = require('../models/AuditLog');

function argAfter(flag) {
    const i = process.argv.indexOf(flag);
    return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null;
}

async function main() {
    const email = String(process.argv[2] || '').trim().toLowerCase();
    const dryRun = process.argv.includes('--dry-run');
    const primary = process.argv.includes('--primary');
    const createName = argAfter('--create');
    if (!email || email.startsWith('--') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        console.error('Usage: node tools/promote-super-admin.js <email> [--primary] [--create "Full name"] [--dry-run] [--production]');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name}`);

    let user = await User.findOne({ email });
    const created = !user;
    if (!user) {
        if (!createName) throw new Error(`No account with email ${email}. Add --create "Full name" to create it without a password.`);
        console.log(`No account with ${email}: ${dryRun ? 'would create' : 'creating'} "${createName}" without a usable password.`);
        if (dryRun) return;
        // A random password nobody sees: the owner sets their own through "Forgot password"
        user = new User({ name: createName.trim().slice(0, 120), email, role: 'super_admin', password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12) });
    } else {
        console.log(`Account: ${user.name} <${user.email}>, role: ${user.role}, status: ${user.status}, primary owner: ${!!user.isPrimaryOwner}`);
    }

    const others = primary ? await User.find({ isPrimaryOwner: true, _id: { $ne: user._id } }).select('email') : [];
    const roleChange = user.role !== 'super_admin';
    const needsActive = user.status !== 'active';
    const markChange = primary && !user.isPrimaryOwner;
    if (!created && !roleChange && !markChange && !needsActive && !others.length) {
        console.log('Already set. Nothing to do.');
        return;
    }
    if (dryRun) {
        if (roleChange) console.log(`Dry run: would set the role to super_admin (owner), from ${user.role}, and sign the account out everywhere.`);
        if (needsActive) console.log('Dry run: would re-activate the account.');
        if (markChange) console.log('Dry run: would mark it as the primary owner.');
        for (const o of others) console.log(`Dry run: would remove the primary owner mark from ${o.email}.`);
        return;
    }

    const from = user.role;
    user.role = 'super_admin';
    user.status = 'active';
    if (primary) user.isPrimaryOwner = true;
    if (roleChange) user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    if (roleChange) await Session.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date(), revokedReason: 'role_changed' });
    if (others.length) await User.updateMany({ _id: { $in: others.map((o) => o._id) } }, { $set: { isPrimaryOwner: false } });

    await AuditLog.create({
        action: created ? 'user.owner_created' : 'user.role_changed',
        resource: 'users',
        resourceId: String(user._id),
        summary: `${created ? 'Created' : 'Set'} ${user.email} as ${primary ? 'the primary owner' : 'an owner'} from the server command line`,
        changes: { role: { from: created ? null : from, to: 'super_admin' }, ...(primary ? { isPrimaryOwner: { from: !markChange, to: true } } : {}) },
        meta: others.length ? { primaryMarkRemovedFrom: others.map((o) => o.email) } : undefined
    });
    console.log(created
        ? `Done. The account was created without a password: open the sign-in page, choose "Forgot password" and enter ${email}.`
        : 'Done. Sign in again to use the owner role.');
}

main()
    .catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
