const Employee = require('../models/Employee');
const Team = require('../models/Team');

// Teams a user belongs to or leads. Team-scoped permissions cover the records of these teams.
async function teamIdsFor(userId) {
    const [emp, led] = await Promise.all([
        Employee.findOne({ user: userId, status: 'active' }).select('team').lean(),
        Team.find({ leader: userId, active: true }).select('_id').lean()
    ]);
    const ids = new Set(led.map((t) => String(t._id)));
    if (emp && emp.team) ids.add(String(emp.team));
    return [...ids];
}

// The team a record should belong to when it is given to this owner
async function teamOf(userId) {
    if (!userId) return null;
    const emp = await Employee.findOne({ user: userId }).select('team').lean();
    return emp && emp.team ? emp.team : null;
}

module.exports = { teamIdsFor, teamOf };
