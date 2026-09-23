'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../js/admin-score-audit.js'), 'utf8');
const now = Date.now();
const localDay = date => { const d = new Date(date); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); };
const elements = {
    'sa-date': {value:localDay(now),dataset:{}},
    'sa-search': {value:'Иванов Иван'},
    'sa-results': {innerHTML:'',textContent:''}
};
const events = { id1:{id:'id1',at:now,roundId:'r1',playerId:'p1',playerName:'Иван Иванов',hole:4,oldScore:4,newScore:5,action:'corrected',kind:'score',actorType:'qr',actorLabel:'QR-доступ (личность не подтверждена)'} };
const read = [];
const window = { currentLang:'ru', db:{ref: key => ({once: async () => { read.push(key); return {val:() => events}; }})} };
vm.runInNewContext(source, {window,document:{getElementById: id => elements[id]},Date,Promise});
(async () => {
    window.saLoad();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert(read.length >= 1);
    assert(elements['sa-results'].innerHTML.includes('Иван Иванов'), 'search finds surname and first name regardless of order');
    assert(elements['sa-results'].innerHTML.includes('QR-доступ'));
    elements['sa-search'].value = 'Петров';
    window.saFilter();
    assert(elements['sa-results'].innerHTML.includes('действий не найдено'));
    console.log('Admin score audit: date, surname search and QR label passed');
})().catch(err => { console.error(err); process.exitCode = 1; });
