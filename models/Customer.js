const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const SOURCES = ['website', 'facebook', 'instagram', 'tiktok', 'whatsapp', 'phone', 'referral', 'walk_in', 'corporate', 'event', 'other'];
const STATUSES = ['lead', 'interested', 'customer', 'lost', 'inactive', 'merged'];

const ownershipSchema = new mongoose.Schema({
    owner: { type: ObjectId, ref: 'User' },
    team: { type: ObjectId, ref: 'Team', default: null },
    from: { type: Date, required: true },
    to: { type: Date, default: null },
    by: { type: ObjectId, ref: 'User' },
    reason: String
}, { _id: false });

// One file per customer. Identity numbers are stored encrypted, with a keyed hash for exact search
// and the last four digits for the masked display. A customer can hold many enrollments (phase 2).
const customerSchema = new mongoose.Schema({
    customerNo: { type: String, required: true, unique: true },         // NB-000001, shown to people
    internalId: { type: String, required: true, unique: true },         // never changes, for integrations
    nameAr: { type: String, required: true, trim: true, maxlength: 200 },
    nameEn: { type: String, default: '', trim: true, maxlength: 200 },

    identity: {
        nationality: { type: String, default: '', maxlength: 80 },
        nationalIdEnc: { type: String, default: '' },
        nationalIdIdx: { type: String, default: '', index: true },
        nationalIdLast4: { type: String, default: '' },
        passportEnc: { type: String, default: '' },
        passportIdx: { type: String, default: '', index: true },
        passportLast4: { type: String, default: '' },
        birthDate: { type: Date, default: null },
        gender: { type: String, enum: ['', 'male', 'female'], default: '' }
    },

    contact: {
        phone: { type: String, default: '', maxlength: 30 },
        phoneNorm: { type: String, default: '', index: true },          // digits only, for duplicate checks
        phone2: { type: String, default: '', maxlength: 30 },
        whatsapp: { type: String, default: '', maxlength: 30 },
        email: { type: String, default: '', lowercase: true, trim: true, maxlength: 200, index: true },
        address: { type: String, default: '', maxlength: 400 },
        city: { type: String, default: '', maxlength: 80 }
    },
    country: { type: String, default: '', maxlength: 80, index: true },

    source: { type: String, enum: SOURCES, default: 'other', index: true },
    sourceDetail: { type: String, default: '', maxlength: 200 },
    registeredAt: { type: Date, default: Date.now, index: true },
    createdBy: { type: ObjectId, ref: 'User', default: null },
    owner: { type: ObjectId, ref: 'User', default: null, index: true },  // the employee responsible for the whole file
    team: { type: ObjectId, ref: 'Team', default: null, index: true },
    ownerHistory: [ownershipSchema],

    status: { type: String, enum: STATUSES, default: 'lead', index: true },
    lostReason: { type: String, default: '', maxlength: 300 },
    tags: [{ type: String, trim: true, maxlength: 40 }],
    segment: { type: String, default: '', maxlength: 60, index: true },

    user: { type: ObjectId, ref: 'User', default: null, index: true },   // the customer's own portal account
    lastContactAt: { type: Date, default: null, index: true },
    nextFollowUpAt: { type: Date, default: null, index: true },

    archived: { type: Boolean, default: false, index: true },
    mergedInto: { type: ObjectId, ref: 'Customer', default: null },
    legacy: { type: mongoose.Schema.Types.Mixed, default: undefined }    // where a migrated record came from
}, { timestamps: true, optimisticConcurrency: true });

customerSchema.index({ nameAr: 'text', nameEn: 'text' });

customerSchema.statics.SOURCES = SOURCES;
customerSchema.statics.STATUSES = STATUSES;

module.exports = mongoose.model('Customer', customerSchema);
