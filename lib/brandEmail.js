// Emails in the academy's identity: maroon header, ivory background, gold accents.
// Every value is escaped; links are given by the caller.

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function brandedEmail({ heading, lines = [], highlight = '', button = null, secondary = null, noteEn = '', footer = '' }) {
    const body = lines.filter(Boolean).map((l) => `<p style="margin:0 0 6px">${esc(l)}</p>`).join('');
    const btn = button ? `<p style="margin:18px 0 8px"><a href="${esc(button.url)}" style="display:inline-block;background:#5a020e;color:#fff;text-decoration:none;padding:10px 22px;border-radius:8px">${esc(button.label)}</a></p>` : '';
    const sec = secondary ? `<p style="margin:0 0 12px;font-size:13px"><a href="${esc(secondary.url)}" style="color:#8a6420">${esc(secondary.label)}</a></p>` : '';
    return `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#fbf7f0;font-family:Tahoma,Arial,sans-serif;color:#2a2023">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #eadfce">
<tr><td style="background:#5a020e;color:#fff;padding:14px 24px;font-size:18px;font-weight:bold"><img src="cid:nibras-logo" width="44" height="44" alt="Nibras" style="vertical-align:middle;margin-inline-end:10px;border:0;border-radius:50%;background:#fff">أكاديمية نبراس <span style="color:#e0bc72">·</span> Nibras Academy</td></tr>
<tr><td style="padding:24px;line-height:1.8">
<p style="margin:0 0 10px;font-size:16px"><strong>${esc(heading)}</strong></p>
${body}
${highlight ? `<p style="margin:8px 0;font-size:17px;color:#5a020e"><strong>${esc(highlight)}</strong></p>` : ''}
${btn}${sec}
${noteEn ? `<p style="margin:12px 0 0;color:#6b5e63;font-size:13px" dir="ltr">${esc(noteEn)}</p>` : ''}
</td></tr>
${footer ? `<tr><td style="background:#f8efdc;color:#8a6420;padding:12px 24px;font-size:12px">${esc(footer)}</td></tr>` : ''}
</table></td></tr></table></body></html>`;
}

module.exports = { brandedEmail, esc };
