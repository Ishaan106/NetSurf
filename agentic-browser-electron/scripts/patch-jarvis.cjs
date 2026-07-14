/**
 * Postinstall patch for @jarvis-agent packages.
 *
 * Both @jarvis-agent/core and @jarvis-agent/electron ship with
 * "type": "module" in their package.json, but their "main" entry
 * points are CommonJS files (.cjs.js / .cjs).  When Electron's
 * main process (CommonJS) requires them, Node sees "type":"module"
 * and treats the .js files as ESM, crashing with
 * "require is not defined in ES module scope".
 *
 * This script removes the "type" field so Node falls back to CJS
 * resolution for .js files, which matches the actual file content.
 */
const fs = require('fs');
const path = require('path');

const PACKAGES_TO_PATCH = [
    '@jarvis-agent/core',
    '@jarvis-agent/electron',
];

const PROJECT_ROOT = path.resolve(__dirname, '..');

for (const pkg of PACKAGES_TO_PATCH) {
    const pkgJsonPath = path.join(PROJECT_ROOT, 'node_modules', ...pkg.split('/'), 'package.json');

    if (!fs.existsSync(pkgJsonPath)) {
        console.log(`[patch] Skipping ${pkg} — not installed`);
        continue;
    }

    try {
        const raw = fs.readFileSync(pkgJsonPath, 'utf8');
        const json = JSON.parse(raw);

        if (json.type === 'module') {
            delete json.type;
            fs.writeFileSync(pkgJsonPath, JSON.stringify(json, null, 2) + '\n', 'utf8');
            console.log(`[patch] Removed "type":"module" from ${pkg}/package.json`);
        } else {
            console.log(`[patch] ${pkg} already patched`);
        }
    } catch (err) {
        console.error(`[patch] Failed to patch ${pkg}:`, err.message);
    }
}
