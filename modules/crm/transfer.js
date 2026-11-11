const Customer = require('../../models/Customer');
const Task = require('../../models/Task');
const User = require('../../models/User');
const audit = require('../../lib/audit');
const { teamOf } = require('../../lib/teams');
const { addEvent, notify } = require('./service');

// Moving customers between employees. The old owner stays in ownerHistory with the dates,
// so reports for past periods still credit the right person.

function closeAndOpen(customer, toUserId, toTeam, byUserId, reason) {
    const now = new Date();
    const open = (customer.ownerHistory || []).find((h) => !h.to);
    if (open) open.to = now;
    customer.ownerHistory.push({ owner: toUserId, team: toTeam, from: now, by: byUserId, reason });
    customer.owner = toUserId;
    customer.team = toTeam;
}

async function transferCustomer(req, customer, toUserId, reason) {
    const fromUserId = customer.owner;
    const toTeam = await teamOf(toUserId);
    const target = await User.findById(toUserId).select('name');
    closeAndOpen(customer, toUserId, toTeam, req.user.id, reason);
    await customer.save();
    // Open follow-ups for this customer go with the file
    const tasks = await Task.updateMany(
        { customer: customer._id, status: 'open', assignee: fromUserId || { $exists: true } },
        { $set: { assignee: toUserId, team: toTeam } }
    );
    await addEvent(req, customer._id, 'transferred', `Transferred to ${target ? target.name : toUserId}`, {
        meta: { from: fromUserId ? String(fromUserId) : null, to: String(toUserId), reason, tasks: tasks.modifiedCount }
    });
    await audit.record(req, {
        action: 'customer.transferred', resource: 'customers', resourceId: customer._id,
        summary: `${customer.customerNo} → ${target ? target.name : toUserId}`, reason,
        changes: { owner: { from: fromUserId ? String(fromUserId) : null, to: String(toUserId) } }
    });
    await notify(toUserId, {
        type: 'customer_assigned',
        titleAr: `تم إسناد العميل ${customer.customerNo} إليك`,
        titleEn: `Customer ${customer.customerNo} was assigned to you`,
        bodyAr: customer.nameAr,
        bodyEn: customer.nameEn || customer.nameAr,
        link: `/customers/${customer._id}`
    });
}

// Every customer and open task of one employee to another (used when an employee leaves)
async function transferAllFrom(req, { from, to, reason }) {
    const toTeam = await teamOf(to);
    const customers = await Customer.find({ owner: from, status: { $ne: 'merged' } });
    for (const c of customers) {
        closeAndOpen(c, to, toTeam, req.user.id, reason);
        await c.save();
        await addEvent(req, c._id, 'transferred', 'Transferred with the files of a departing employee', { meta: { from: String(from), to: String(to), reason } });
    }
    const tasks = await Task.updateMany({ assignee: from, status: 'open' }, { $set: { assignee: to, team: toTeam } });
    const Enrollment = require('../../models/Enrollment');
    const Complaint = require('../../models/Complaint');
    const enrollments = await Enrollment.find({ owner: from, status: { $in: ['active', 'on_hold'] } });
    for (const e of enrollments) {
        const open = e.ownerHistory.find((h) => !h.to);
        if (open) open.to = new Date();
        e.ownerHistory.push({ owner: to, team: toTeam, from: new Date(), by: req.user.id, reason });
        e.owner = to;
        e.team = toTeam;
        await e.save();
    }
    const complaints = await Complaint.updateMany({ assignee: from, status: { $in: ['open', 'in_progress'] } }, { $set: { assignee: to, team: toTeam } });
    if (customers.length || tasks.modifiedCount || enrollments.length || complaints.modifiedCount) {
        await notify(to, {
            type: 'customer_assigned',
            titleAr: `تم إسناد ${customers.length} عميل و${tasks.modifiedCount} مهمة إليك`,
            titleEn: `${customers.length} customers and ${tasks.modifiedCount} tasks were assigned to you`,
            link: '/customers?mine=1'
        });
    }
    return { customers: customers.length, tasks: tasks.modifiedCount, enrollments: enrollments.length, complaints: complaints.modifiedCount };
}

module.exports = { transferCustomer, transferAllFrom };
