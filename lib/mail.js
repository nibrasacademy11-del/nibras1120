// One place that sends the academy's emails. Without SMTP settings nothing is sent and the
// caller is told so. Outside production, messages can also be kept for checking:
//   MAIL_CAPTURE=1      keeps the last 200 in memory (tests read mail.outbox)
//   MAIL_OUTBOX_DIR=... writes each one as an .html file (the local demo opens them)

const fs = require('fs');
const path = require('path');
const { isMailConfigured, createTransporter } = require('../config/mailer');

const outbox = [];
const production = () => process.env.NODE_ENV === 'production';

// true when the message was kept for checking (never in production)
function keep(message) {
    if (production()) return false;
    let kept = false;
    if (process.env.MAIL_CAPTURE === '1') {
        kept = true;
        outbox.push(message);
        if (outbox.length > 200) outbox.shift();
    }
    const dir = process.env.MAIL_OUTBOX_DIR;
    if (dir) {
        try {
            fs.mkdirSync(dir, { recursive: true });
            const stamp = message.at.toISOString().replace(/[:.]/g, '-');
            const safe = String(message.kind || 'mail').replace(/[^a-z0-9_-]/gi, '');
            fs.writeFileSync(path.join(dir, `${stamp}-${safe}.html`), `<!-- to: ${message.to} | ${message.subject} -->\n${message.html || message.text}`);
            kept = true;
        } catch (e) {
            console.error('Could not keep the email:', e.message);
        }
    }
    return kept;
}

// Returns { sent, kept, reason }. kept: held for checking outside production (counts as delivered
// there). Never throws: an email that fails must not undo the work that triggered it.
// bcc: many people in one message (lecture reminders); each sees only their own address
async function send({ to, bcc, subject, html, text, kind = 'mail', fromName = 'أكاديمية نبراس' }) {
    if (!to && !(bcc && bcc.length)) return { sent: false, reason: 'no_address' };
    const kept = keep({ to: to || process.env.EMAIL_USER || '', bcc, subject, html, text, kind, at: new Date() });
    if (!isMailConfigured()) return { sent: false, kept, reason: 'not_configured' };
    try {
        await createTransporter().sendMail({ from: `"${fromName}" <${process.env.EMAIL_USER}>`, to: to || process.env.EMAIL_USER, bcc, subject, html, text });
        return { sent: true, kept };
    } catch (e) {
        console.error(`Email "${kind}" to ${to} failed:`, e.message);
        return { sent: false, kept, reason: 'failed' };
    }
}

// Reached the person, or was held for checking in a test or the demo
const delivered = (r) => !!(r && (r.sent || r.kept));

module.exports = { send, delivered, outbox, isMailConfigured };
