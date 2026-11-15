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

// Every team of the departments this user works in (their own team's department, and the
// departments of the teams they lead): the "department" scope covers these teams
async function departmentTeamIdsFor(userId) {
    const Team = require('../models/Team');
    const [emp, led] = await Promise.all([
        Employee.findOne({ user: userId, status: 'active' }).select('team department').populate('team', 'department').lean(),
        Team.find({ leader: userId, active: true }).select('department').lean()
    ]);
    const deps = new Set(led.map((t) => String(t.department || '')).filter(Boolean));
    if (emp && emp.department) deps.add(String(emp.department));
    if (emp && emp.team && emp.team.department) deps.add(String(emp.team.department));
    if (!deps.size) return teamIdsFor(userId);
    const teams = await Team.find({ department: { $in: [...deps] }, active: true }).select('_id').lean();
    const ids = new Set(teams.map((t) => String(t._id)));
    for (const t of await teamIdsFor(userId)) ids.add(t);
    return [...ids];
}

module.exports = { teamIdsFor, teamOf, departmentTeamIdsFor };
