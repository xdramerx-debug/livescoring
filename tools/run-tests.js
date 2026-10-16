#!/usr/bin/env node
// Test runner for tools/test-*.js
// ------------------------------------------------------------
// Each tools/test-*.js file is a standalone Node script that exits with a
// non-zero code on failure (the existing tests use their own eq/check
// helpers). This runner discovers them, runs them, and reports a summary.
//
// Usage:  node tools/run-tests.js [--ci] [--jobs=N] [--serial]
//   --ci      compact output (no per-test pass lines) for CI logs
//   --jobs=N  how many test files to run at once (default: CPU count, cap 8)
//   --serial  force the old one-by-one behaviour (useful when debugging a
//             single failing test or when the machine is already loaded)
//
// Why parallel: the suite is 67+ independent Node processes with no shared
// state (each builds its own vm sandbox / jsdom). Measured before this change:
// 54 s wall vs 55 s user — i.e. strictly single-core. A pool over
// os.availableParallelism() cuts the wall time several times over, which matters
// because both GitHub workflows run the suite (ci.yml and browser-check.yml).
//
// Output stays deterministic: per-test output is buffered and printed in
// alphabetical file order, exactly as the serial runner did, so logs don't
// interleave and diffs between runs are stable.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const TOOLS_DIR = __dirname;
const CI = process.argv.includes('--ci');
const SERIAL = process.argv.includes('--serial');

function parseJobs() {
    for (const a of process.argv) {
        const m = /^--jobs=(\d+)$/.exec(a);
        if (m) return Math.max(1, parseInt(m[1], 10));
    }
    let cpus = 1;
    try {
        cpus = (typeof os.availableParallelism === 'function')
            ? os.availableParallelism()
            : (os.cpus() || []).length || 1;
    } catch (e) { cpus = 1; }
    return Math.max(1, Math.min(8, cpus));
}
const JOBS = SERIAL ? 1 : parseJobs();

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

function runOne(file) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, ['--require', BOOTSTRAP, file], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '', stderr = '';
        child.stdout.on('data', (d) => { stdout += d; });
        child.stderr.on('data', (d) => { stderr += d; });
        child.on('error', (err) => {
            resolve({ file, status: -1, stdout, stderr: stderr + '\n' + String(err && err.message || err) });
        });
        child.on('close', (code) => resolve({ file, status: code, stdout, stderr }));
    });
}

(async function main() {
    const startedAt = Date.now();
    const results = new Array(files.length);
    let next = 0;
    let done = 0;

    async function worker() {
        let idx = next++;
        while (idx < files.length) {
            results[idx] = await runOne(files[idx]);
            done++;
            if (!CI) {
                // Прогресс — одной строкой: при параллельном запуске порядок
                // завершения не совпадает с алфавитным, поэтому здесь только
                // счётчик, а итоги печатаются упорядоченно ниже.
                process.stdout.write('\r  … ' + done + '/' + files.length);
            }
            idx = next++;
        }
    }

    const pool = [];
    for (let i = 0; i < Math.min(JOBS, files.length); i++) pool.push(worker());
    await Promise.all(pool);
    if (!CI) process.stdout.write('\r\x1b[2K');

    let passed = 0, failed = 0;
    const failures = [];
    for (const r of results) {
        const name = path.basename(r.file);
        const okRun = r.status === 0;
        if (okRun) {
            passed++;
            if (!CI) console.log('  \x1b[32m✓\x1b[0m ' + name);
        } else {
            failed++;
            failures.push({ name, status: r.status, stderr: r.stderr, stdout: r.stdout });
            console.log('  \x1b[31m✗\x1b[0m ' + name + ' (exit ' + r.status + ')');
        }
        if (!CI && !okRun && r.stdout) {
            // Echo the failing test's own output for diagnosis.
            console.log(r.stdout.trimEnd());
        }
    }

    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log('\n' + (failed ? '\x1b[31m' : '\x1b[32m') +
        'Tests: ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total' +
        '\x1b[0m' + '  (' + secs + ' s, jobs=' + JOBS + ')');

    if (failed) {
        console.log('\nFailures:');
        for (const f of failures) {
            console.log('  - ' + f.name + (f.stderr ? '\n' + f.stderr.trimEnd() : ''));
        }
        process.exit(1);
    }
})();
