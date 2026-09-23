#!/usr/bin/env node
// Test runner for tools/test-*.js
// ------------------------------------------------------------
// Each tools/test-*.js file is a standalone Node script that exits with a
// non-zero code on failure (the existing tests use their own eq/check
// helpers). This runner discovers them, runs them, and reports a summary.
//
// Usage:  node tools/run-tests.js [--ci]
//   --ci  : compact output (no per-test pass lines) for CI logs.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TOOLS_DIR = __dirname;
const CI = process.argv.includes('--ci');

// Transparently inject the split-out modules (course-config.js, format.js)
// whenever a test reads js/utils.js, so isolated vm/require loads keep working.
const BOOTSTRAP = path.join(TOOLS_DIR, 'test-bootstrap.js');

const files = fs.readdirSync(TOOLS_DIR)
    .filter((f) => /^test-.*\.js$/.test(f))
    .map((f) => path.join(TOOLS_DIR, f))
    .sort();

if (!files.length) {
    console.error('No test files found in', TOOLS_DIR);
    process.exit(1);
}

let passed = 0;
let failed = 0;
const failures = [];

for (const file of files) {
    const name = path.basename(file);
    const res = spawnSync(process.execPath, ['--require', BOOTSTRAP, file], { encoding: 'utf8' });
    const ok = res.status === 0;
    if (ok) {
        passed++;
        if (!CI) console.log('  \x1b[32m✓\x1b[0m ' + name);
    } else {
        failed++;
        failures.push({ name, status: res.status, stderr: res.stderr, stdout: res.stdout });
        console.log('  \x1b[31m✗\x1b[0m ' + name + ' (exit ' + res.status + ')');
    }
    if (!CI && !ok && res.stdout) {
        // Echo the failing test's own output for diagnosis.
        console.log(res.stdout.trimEnd());
    }
}

console.log('\n' + (failed ? '\x1b[31m' : '\x1b[32m') +
    'Tests: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total' +
    '\x1b[0m');

if (failed) {
    console.log('\nFailures:');
    for (const f of failures) {
        console.log('  - ' + f.name + (f.stderr ? '\n' + f.stderr.trimEnd() : ''));
    }
    process.exit(1);
}
