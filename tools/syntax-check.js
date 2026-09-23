#!/usr/bin/env node
// Syntax check for all front-end + function JS (cheap CI lint).
// Runs `node --check` on every .js file under js/, tools/ and functions/.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function walk(dir, out) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (_) { return; }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === '.git' || e.name === 'vendor') continue;
            walk(full, out);
        } else if (e.isFile() && e.name.endsWith('.js')) {
            out.push(full);
        }
    }
}

const targets = [];
for (const d of ['js', 'tools', 'functions']) walk(d, targets);
targets.sort();

let errors = 0;
for (const file of targets) {
    const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (res.status !== 0) {
        errors++;
        console.log('\x1b[31mSYNTAX ERROR\x1b[0m ' + file);
        if (res.stderr) console.log(res.stderr.trimEnd());
    } else if (!process.argv.includes('--ci')) {
        console.log('\x1b[32mok\x1b[0m ' + file);
    }
}

console.log('\n' + (errors ? '\x1b[31m' : '\x1b[32m') +
    (errors ? errors + ' file(s) with syntax errors' : 'Syntax OK: ' + targets.length + ' files') +
    '\x1b[0m');
process.exit(errors ? 1 : 0);
