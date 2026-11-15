// Protection of the academy's primary owner account. The flag is set only from the server
// (tools/promote-super-admin.js --primary); the portal can never change the role, status, email
// or two-factor of that account, delete it or sign it out, not even from another owner account.
// The owner can still change their own password, two-factor and devices from their security page.
const { HttpError } = require('./http');

const MESSAGE = 'حساب المالك الأساسي محمي ولا يمكن تعديله من البوابة. / The primary owner account is protected and cannot be changed from the portal.';

function isPrimaryOwner(user) {
    return !!(user && user.isPrimaryOwner);
}

// Throws when someone tries one of the protected changes on the primary owner
function assertNotPrimaryOwner(target) {
    if (isPrimaryOwner(target)) throw new HttpError(403, MESSAGE, 'PRIMARY_OWNER');
}

module.exports = { isPrimaryOwner, assertNotPrimaryOwner, MESSAGE };
