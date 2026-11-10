const fieldCrypto = require('./fieldCrypto');
const { verifyTotp, hashRecoveryCode } = require('./totp');

// Checks a 6-digit app code or a one-time recovery code against a user document that was loaded
// with its twoFactor fields. On success the user is updated in memory (call save afterwards).
// Returns 'totp', 'recovery' or null.
function checkSecondFactor(user, code) {
    const tf = user.twoFactor || {};
    if (!tf.enabled || !tf.secretEnc) return null;
    const value = String(code || '').trim();

    if (/^\d{6}$/.test(value.replace(/\s/g, ''))) {
        const step = verifyTotp(fieldCrypto.decrypt(tf.secretEnc), value, { lastStep: tf.lastStep ?? -1 });
        if (step === null) return null;
        user.twoFactor.lastStep = step;
        return 'totp';
    }

    const hash = hashRecoveryCode(value);
    const idx = (tf.recoveryCodes || []).indexOf(hash);
    if (idx === -1) return null;
    user.twoFactor.recoveryCodes.splice(idx, 1);
    return 'recovery';
}

module.exports = { checkSecondFactor };
