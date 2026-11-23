import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const context = vm.createContext({console});
vm.runInContext(fs.readFileSync('static/app/gantt.js', 'utf8') + '\nglobalThis.KapaGantt = KapaGantt;', context);
const G = context.KapaGantt;
const task = (id, level, start, durationDays, extra = {}) => ({id, name: id, type: durationDays === 0 ? 'milestone' : 'task', level, start, durationDays, percent: 0, note: '', links: [], snet: null, ...extra});
const rows = tasks => G.schedule(tasks).rows;
const day = n => G.iso(n);

// 2026-05-04 ist ein Montag.
const mon = G.num('2026-05-04');
assert.ok(G.isWork(mon) && !G.isWork(mon + 5));
assert.equal(G.addWork(mon + 4, 1), mon + 7);
assert.equal(G.workBetween(mon, mon + 7), 5);

const a = task('a', 0, '2026-05-04', 5);
const after = (type, lag, duration) => rows([a, task('b', 0, '2026-05-04', duration, {links: [{from: 'a', type, lagDays: lag}]})])[1];
assert.equal(day(rows([a])[0].end), '2026-05-08');
assert.equal(day(after('FS', 0, 3).start), '2026-05-11');
assert.equal(day(after('FS', 2, 3).start), '2026-05-13');
assert.equal(day(after('SS', 1, 3).start), '2026-05-05');
assert.equal(day(after('FF', 0, 3).end), '2026-05-08');
assert.equal(day(after('SF', 0, 2).end), '2026-05-04');
assert.equal(day(rows([task('w', 0, '2026-05-09', 2)])[0].start), '2026-05-11');

const summary = rows([task('s', 0, '2026-05-04', 1), task('c1', 1, '2026-05-04', 2, {percent: 100}), task('c2', 1, '2026-05-06', 6, {percent: 50})]);
assert.ok(summary[0].summary);
assert.equal(day(summary[0].end), '2026-05-13');
assert.equal(summary[0].percent, 63);

const b = task('b', 0, '2026-05-04', 3, {links: [{from: 'a', type: 'FS', lagDays: 0}]});
assert.match(G.addLink([a, b], 1, 0, 'FS').error, /Zirkel/);
assert.ok(G.addLink([a, b], 0, 1, 'FS').error);
assert.ok(G.addLink([task('p', 0, '2026-05-04', 1), task('k', 1, '2026-05-04', 2)], 1, 0, 'FS').error);
assert.ok(G.validate([task('m', 0, '2026-05-04', 0), task('c', 1, '2026-05-04', 1)]));

const list = [task('a', 0, '2026-05-04', 1), task('b', 0, '2026-05-04', 1), task('b1', 1, '2026-05-04', 1), task('c', 0, '2026-05-04', 1)];
assert.equal(G.move(list, 1, 1).tasks.map(item => item.id).join(), 'a,c,b,b1');
assert.equal(G.move(list, 3, -1).tasks.map(item => item.id).join(), 'a,c,b,b1');
assert.ok(G.move(list, 0, -1).error);
assert.equal(G.remove(list, 1).tasks.map(item => item.id).join(), 'a,c');
assert.equal(G.setDuration([a], 0, '0').tasks[0].type, 'milestone');
assert.equal(G.setEnd([a], 0, '2026-05-12').tasks[0].durationDays, 7);
assert.equal(G.setLinks([a, b, task('c', 0, '2026-05-04', 2)], 2, '1AA+1; 2EE-1').tasks[2].links[1].type, 'FF');
assert.equal(G.formatLinks(G.setLinks([a, b, task('c', 0, '2026-05-04', 2)], 2, '1AA+1; 2EE-1').tasks, 2), '1AA+1; 2EE-1');
assert.ok(G.setLinks([a, b], 0, '2').error);
