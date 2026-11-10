// Mongoose plugin for financial records: they can never be deleted, and once saved only the
// listed fields (status, approval and void details) may change. Corrections are new records.

const DELETE_OPS = ['deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndRemove'];
const UPDATE_OPS = ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace'];

function protectRecords(schema, { mutable = [] } = {}) {
    const allowed = new Set([...mutable, 'updatedAt', '__v']);
    const reject = (msg) => {
        throw new Error(msg);
    };

    for (const op of DELETE_OPS) {
        schema.pre(op, function () {
            reject('Financial records cannot be deleted.');
        });
    }
    for (const op of UPDATE_OPS) {
        schema.pre(op, function () {
            const update = this.getUpdate() || {};
            const touched = [];
            for (const [k, v] of Object.entries(update)) {
                if (k.startsWith('$')) touched.push(...Object.keys(v || {}));
                else touched.push(k);
            }
            const bad = touched.map((p) => p.split('.')[0]).filter((p) => !allowed.has(p));
            if (op === 'replaceOne' || op === 'findOneAndReplace' || bad.length) {
                reject(`Financial record fields cannot be changed: ${bad.join(', ') || 'replace'}`);
            }
        });
    }
    schema.pre('save', function () {
        if (this.isNew) return;
        const bad = this.modifiedPaths().map((p) => p.split('.')[0]).filter((p) => !allowed.has(p));
        if (bad.length) reject(`Financial record fields cannot be changed: ${[...new Set(bad)].join(', ')}`);
    });
}

module.exports = protectRecords;
