// Decides how much of a customer file a user may see, and shapes the file accordingly.
// Pure functions: the controllers pass in the grants, the record and any approved access requests.

const { recordInScope, maskIdentifier } = require('./permissions');

const SECTIONS = ['contact', 'identity', 'financial', 'documents', 'notes'];
const FIELDS = { owner: 'owner', team: 'team' };

function inScope(grants, permission, actor, customer) {
    const scope = grants && grants[permission];
    return !!scope && recordInScope(scope, actor, customer, FIELDS);
}

// approvedSections: sections opened by an approved, unexpired access request of this actor
function customerAccess({ actor, grants, customer, approvedSections = [] }) {
    const inFile = inScope(grants, 'customers.view', actor, customer);
    const sections = {};
    for (const s of SECTIONS) {
        sections[s] = (inFile && inScope(grants, `customer_${s}.view`, actor, customer)) || approvedSections.includes(s);
    }
    const level = inFile ? 'full' : approvedSections.length ? 'granted' : 'basic';
    return {
        level,
        inFile,
        sections,
        // The full identity number needs an explicit permission, or an approved request for it
        canRevealIdentity: (inFile && inScope(grants, 'customer_identity.manage', actor, customer)) || approvedSections.includes('identity'),
        canEdit: inScope(grants, 'customers.update', actor, customer),
        canEditSection: Object.fromEntries(SECTIONS.map((s) => [s, inFile && inScope(grants, `customer_${s}.update`, actor, customer)])),
        canAddNote: inFile && (inScope(grants, 'customer_notes.create', actor, customer)),
        canManage: inScope(grants, 'customers.manage', actor, customer),
        canArchive: inScope(grants, 'customers.archive', actor, customer),
        canLookup: !!(grants && grants['customer_lookup.view'])
    };
}

// "Mohamed Ahmed Fathy" → "Mohamed A." for people who only see the basic card
function partialName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return parts[0] || '';
    return `${parts[0]} ${parts[1].charAt(0)}.`;
}

function displayName(customer, access, policy = 'partial') {
    if (access.level !== 'basic' || policy === 'full') return customer.nameAr;
    return partialName(customer.nameAr);
}

const ref = (v) => (v && typeof v === 'object' && v._id ? { id: String(v._id), name: v.name || v.nameAr || '' } : v ? { id: String(v) } : null);

// The basic card anyone with lookup permission may see (16 Nov 2026): the number, the name per
// policy and the employee the customer is with. Nothing else until a request is approved.
function basicCard(customer, access, { namePolicy = 'partial', programs = [] } = {}) {
    const basic = access.level === 'basic';
    return {
        id: String(customer._id),
        customerNo: customer.customerNo,
        name: displayName(customer, access, namePolicy),
        owner: ref(customer.owner),
        team: basic ? undefined : ref(customer.team),
        status: basic ? undefined : customer.status,
        programs: basic ? [] : programs,
        access: access.level
    };
}

function serializeCustomer(customer, access, opts = {}) {
    const out = basicCard(customer, access, opts);
    out.permissions = {
        sections: access.sections,
        canRevealIdentity: access.canRevealIdentity,
        canEdit: access.canEdit,
        canEditSection: access.canEditSection,
        canAddNote: access.canAddNote,
        canManage: access.canManage,
        canArchive: access.canArchive
    };
    if (access.inFile) {
        Object.assign(out, {
            nameAr: customer.nameAr,
            nameEn: customer.nameEn,
            country: customer.country,
            source: customer.source,
            sourceDetail: customer.sourceDetail,
            registeredAt: customer.registeredAt,
            createdBy: ref(customer.createdBy),
            tags: customer.tags || [],
            segment: customer.segment,
            lostReason: customer.lostReason,
            lastContactAt: customer.lastContactAt,
            nextFollowUpAt: customer.nextFollowUpAt,
            archived: customer.archived,
            mergedInto: customer.mergedInto ? String(customer.mergedInto) : null,
            hasPortalAccount: !!customer.user,
            createdAt: customer.createdAt,
            updatedAt: customer.updatedAt,
            __v: customer.__v
        });
    } else if (access.level === 'granted') {
        out.nameAr = customer.nameAr;
        out.nameEn = customer.nameEn;
    }
    if (access.sections.contact) {
        const c = customer.contact || {};
        out.contact = { phone: c.phone, phone2: c.phone2, whatsapp: c.whatsapp, email: c.email, address: c.address, city: c.city };
        out.country = customer.country;
    }
    if (access.sections.identity) {
        const i = customer.identity || {};
        out.identity = {
            nationality: i.nationality,
            nationalId: i.nationalIdLast4 ? maskIdentifier('0000000000' + i.nationalIdLast4, 4) : '',
            passport: i.passportLast4 ? maskIdentifier('000000' + i.passportLast4, 4) : '',
            birthDate: i.birthDate,
            gender: i.gender
        };
    }
    return out;
}

module.exports = { SECTIONS, customerAccess, serializeCustomer, basicCard, partialName, displayName };
