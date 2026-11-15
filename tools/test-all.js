// Runs every test, including the end-to-end ones, against the TEST database in .env.development.
//
//   node tools/test-all.js
//
// Refuses to run if .env.development is missing or points at the same database as .env (the live one).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = (f) => {
    try {
        return (fs.readFileSync(path.join(root, f), 'utf8').match(/^MONGO_URI=(.*)$/m) || [])[1]?.trim() || '';
    } catch {
        return '';
    }
};
const test = read('.env.development');
const live = read('.env');
if (!test) {
    console.error('.env.development with MONGO_URI (a test database) is required. See .env.development.example.');
    process.exit(1);
}
if (test === live) {
    console.error('.env.development points at the live database. Use a separate test database.');
    process.exit(1);
}
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'test/**/*.test.js'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, TEST_MONGO_URI: test }
});
process.exit(r.status ?? 1);
