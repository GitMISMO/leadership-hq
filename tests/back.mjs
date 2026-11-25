// The browser's Back button (CN-033, Nov 25, 2026), like Summit HQ's check 31: two menu pages and Back
// returns to the first, Forward goes again, Back closes a record's panel and stays on the page, a panel
// closed with its Close button leaves no step behind, unsaved changes are asked about first, and no page errors.
// Runs tests/app.html (the same code as index.html without the sign-in) as if on resources.mismo.org, with
// /assets/back.js served from the live copy (MISMO_BACK can point at a local copy to try a change first).
import { chromium } from 'playwright';
import fs from 'node:fs';
const ORIGIN = 'https://resources.mismo.org';
let BACK = '';
if (process.env.MISMO_BACK) BACK = fs.readFileSync(process.env.MISMO_BACK, 'utf8');
else { const r = await fetch(ORIGIN + '/assets/back.js'); if (!r.ok) { console.log('FAIL could not fetch the live /assets/back.js (' + r.status + ')'); process.exit(1); } BACK = await r.text(); }
const APP = fs.readFileSync('tests/app.html', 'utf8');

const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.route('**/*', r => {
  const u = r.request().url();
  if (u.startsWith(ORIGIN + '/assets/back.js')) return r.fulfill({ contentType: 'application/javascript', body: BACK });
  if (u.startsWith(ORIGIN + '/leadership-hq/')) return r.fulfill({ contentType: 'text/html', body: APP });
  if (u.startsWith(ORIGIN + '/assets/')) return r.fulfill({ status: 404, body: '' });
  if (u.startsWith(ORIGIN)) return r.abort();
  return r.continue();
});
await p.addInitScript(() => { const store = {}; window.claude = { use: async k => k === 'db' ? { collection: c => ({ onSnapshot: cb => cb({ docs: [] }), doc: id => ({ set: async d => { store[c + '/' + id] = d; }, delete: async () => { delete store[c + '/' + id]; } }) }) } : null }; });
await p.goto(ORIGIN + '/leadership-hq/'); await p.waitForTimeout(2000);

let bad = 0; const ok = (name, cond, info) => { console.log(cond ? 'ok  ' : 'FAIL', name + (cond || !info ? '' : ': ' + JSON.stringify(info))); if (!cond) bad++; };
const state = () => p.evaluate(() => ({ tab: (document.querySelector('.hq nav button[data-hq][aria-current]') || {}).dataset?.hq || '',
  pane: document.getElementById('pane').classList.contains('open'), helper: !!window.MismoBack }));
const go = async tab => { await p.click('.hq nav button[data-hq="' + tab + '"]'); await p.waitForTimeout(1200); };
const back = async () => { await p.evaluate(() => history.back()); await p.waitForTimeout(1200); };

let st = await state();
ok('the shared Back helper (/assets/back.js) loaded', st.helper, st);
const start = st.tab;
ok('Leadership HQ opens where it always opens (Leadership Roster)', start === 'roster', st);
await go('board'); await go('noms');
st = await state(); ok('Nominations opened', st.tab === 'noms', st);
await back(); st = await state(); ok('Back from Nominations lands on the Board of Directors', st.tab === 'board', st);
await back(); st = await state(); ok('Back again lands on the Leadership Roster', st.tab === start, st);
await p.evaluate(() => history.forward()); await p.waitForTimeout(1200);
st = await state(); ok('Forward goes to the Board of Directors again', st.tab === 'board', st);

/* a record's panel: Back closes it first and stays on the page */
await go('roster');
await p.evaluate(() => { SUB.roster = 'aof'; S.leaders = { 'lb-1': { id: 'lb-1', gtype: 'aof', group: 'Test Area', position: 'Chair', name: 'Pat Back', company: 'Example Bank', status: 'active' } }; renderRoster(); });
await p.click('#page-roster [data-ld="lb-1"]'); await p.waitForTimeout(1000);
st = await state(); ok('a leader opened in the right-hand panel', st.pane && st.tab === 'roster', st);
await back(); st = await state(); ok('Back closes the panel and stays on the Leadership Roster', !st.pane && st.tab === 'roster', st);
await back(); st = await state(); ok('Back after the panel goes to the page before (Board of Directors)', !st.pane && st.tab === 'board', st);

/* closing the panel with its Close button leaves no step behind */
await go('roster');
await p.click('#page-roster [data-ld="lb-1"]'); await p.waitForTimeout(1000);
st = await state(); ok('the leader opened again', st.pane, st);
await p.click('#pane-x'); await p.waitForTimeout(800);
ok('Close shut the panel', !(await state()).pane);
await back(); st = await state(); ok('after Close, Back goes straight to the page before (Board of Directors)', !st.pane && st.tab === 'board', st);

/* unsaved changes: Back asks first, as Close does, and keeps the panel */
await go('roster');
await p.click('#page-roster [data-ld="lb-1"]'); await p.waitForTimeout(1000);
await p.evaluate(() => { const i = document.querySelector('#pane-body input:not([type=checkbox]):not([type=radio])'); i.value += ' x'; i.dispatchEvent(new Event('input', { bubbles: true })); });
await back(); st = await state();
const warned = await p.evaluate(() => /aren't saved/.test(document.getElementById('pf-msg').textContent));
ok('with unsaved changes, Back keeps the panel open and asks first', st.pane && warned && st.tab === 'roster', st);
await p.waitForTimeout(500); await back(); st = await state();
ok('a second Back leaves the panel without saving, as a second Close does, and stays on the page', !st.pane && st.tab === 'roster', st);
await back(); st = await state(); ok('then Back goes to the page before (Board of Directors)', !st.pane && st.tab === 'board', st);

if (errs.length) { console.log('FAIL page errors: ' + errs.join(' | ')); bad++; }
await b.close(); console.log(bad ? bad + ' failed' : 'All Back button tests passed'); process.exit(bad ? 1 : 0);
