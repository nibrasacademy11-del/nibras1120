// PLAN-V2 migration: the academy keeps five roles (owner, team leader, employee, customer service,
// customer). Accounts with a removed role (admin, hr_manager, finance_manager, accountant,
// cms_manager) become "employee", unless a mapping says otherwise. The primary owner and every
// super_admin are never touched. Saved role edits for removed roles are deleted.
// Safe to run again: nothing changes the second time.
//
//   node data/migrations/005-five-roles.js                        dry run, .env.development
//   node data/migrations/005-five-roles.js --apply
//   node data/migrations/005-five-roles.js --production [--apply]      (back up first)
//   ... --map admin=team_leader --map accountant=customer_support      a different new role
//   ... --uri "mongodb://..."                                          a specific database

const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..', '..');
const useProd = process.argv.includes('--production');
const uriArg = (() => { const i = process.argv.indexOf('--uri'); return i > 0 ? process.argv[i + 1] : null; })();
if (!uriArg) {
    const envFile = path.join(root, useProd ? '.env' : '.env.development');
    if (!fs.existsSync(envFile)) {
        console.error(`${path.basename(envFile)} not found.`);
        process.exit(1);
    }
    require('dotenv').config({ path: envFile, quiet: true });
}

const mongoose = require('mongoose');
const User = require('../../models/User');
const RolePolicy = require('../../models/RolePolicy');
const AuditLog = require('../../models/AuditLog');
const Session = require('../../models/Session');

const REMOVED = ['admin', 'hr_manager', 'finance_manager', 'accountant', 'cms_manager'];
const ALLOWED_TARGETS = ['employee', 'team_leader', 'customer_support', 'super_admin'];

function mapping() {
    const map = Object.fromEntries(REMOVED.map((r) => [r, 'employee']));
    process.argv.forEach((a, i) => {
        if (a !== '--map') return;
        const [from, to] = String(process.argv[i + 1] || '').split('=');
        if (!REMOVED.includes(from) || !ALLOWED_TARGETS.includes(to)) {
            console.error(`Bad --map ${process.argv[i + 1]} (from one of ${REMOVED.join(', ')} to one of ${ALLOWED_TARGETS.join(', ')})`);
            process.exit(1);
        }
        map[from] = to;
    });
    return map;
}

async function main() {
    const apply = process.argv.includes('--apply');
    const map = mapping();
    await mongoose.connect(uriArg || process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    console.log(`Database: ${mongoose.connection.host}/${mongoose.connection.name} (${useProd ? 'LIVE' : 'test'})`);
    console.log(apply ? 'Mode: APPLY\n' : 'Mode: dry run\n');

    const users = await User.find({ role: { $in: REMOVED } }).select('name email role status isPrimaryOwner').lean();
    if (!users.length) console.log('No accounts with a removed role.');
    for (const u of users) {
        if (u.isPrimaryOwner) { console.log(`skip (primary owner): ${u.email}`); continue; }
        const to = map[u.role];
        console.log(`${u.email.padEnd(40)} ${u.role.padEnd(16)} -> ${to}${u.status === 'disabled' ? '  (disabled account)' : ''}`);
        if (!apply) continue;
        await User.updateOne({ _id: u._id }, { $set: { role: to }, $inc: { tokenVersion: 1 } });
        await Session.updateMany({ user: u._id, revokedAt: null }, { revokedAt: new Date(), revokedReason: 'role_changed' });
        await AuditLog.create({ action: 'user.role_changed', resource: 'users', resourceId: String(u._id), summary: `Five roles: ${u.email} ${u.role} -> ${to} (migration 005)`, changes: { role: { from: u.role, to } } });
    }
    const policies = await RolePolicy.find({ role: { $in: REMOVED } }).select('role').lean();
    for (const pol of policies) {
        console.log(`saved permissions of removed role ${pol.role}: ${apply ? 'deleted' : 'would delete'}`);
        if (apply) await RolePolicy.deleteOne({ _id: pol._id });
    }
    console.log(apply ? '\nDone. Changed accounts were signed out; they sign in again with their new role.' : '\nDry run only. Add --apply to change.');
}

main()
    .catch((err) => { console.error(err.message); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
