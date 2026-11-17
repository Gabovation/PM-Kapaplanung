import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const context=vm.createContext({console,Date,Number,Set,JSON});
for(const file of ['hours.js','sap.js']) vm.runInContext(fs.readFileSync('static/app/'+file,'utf8'),context);
const run=code=>vm.runInContext(code,context);
run(`let state={projects:[{id:'p',number:'10-02763',budget:100,qvpBudget:0,percent:[100,0,0,0],dates:['2026-01-01','2026-02-01','2026-03-01','2026-04-01','2026-05-01'],changes:[]}],sapActuals:[{personnelNumber:'1',date:'2026-01-15',projectNumber:'10-02763',hours:80},{personnelNumber:'2',date:'2026-01-15',projectNumber:'10-02763',hours:10}]};
function projectTotal(p){return p.budget+(p.qvpBudget||0)}
function closeModal(){} function persist(){} function openModal(){} function esc(v){return String(v)} function fmt(v){return v} function totals(p){return p.budget+(p.changes||[]).reduce((a,c)=>a+c.hours,0)} `);
assert.equal(run('sapProjectData(state.projects[0]).actual'),90);
assert.ok(run('sapProjectData(state.projects[0]).projected > 100'));
run(`sapPending=[{personnelNumber:'1',date:'2026-01-15',projectNumber:'10-02763',hours:3},{personnelNumber:'1',date:'2026-01-15',projectNumber:'10-02763',hours:3}];applySap()`);
assert.equal(run('state.sapActuals.length'),3);
assert.equal(run('sapProjectData(state.projects[0]).actual'),16);
run(`state.projects.push({...state.projects[0],id:'duplicate'})`);
assert.equal(run('sapProjectData(state.projects[0])'),null);
console.log('SAP: Hochrechnung, Austausch je Person/Datum, identische Zeilen und Mehrdeutigkeiten geprüft.');

run(`state.projects=[{id:'legacy',number:'41-22-030'}]; state.sapActuals=[{psp:'41-22-030-00-00-99',projectNumber:'41-22-030-00',department:'99',hours:1}]`);
assert.equal(run('sapMatches(state.sapActuals[0])[0].id'),'legacy');
run(`state.projects.push({id:'wrong',number:'41-22-030-00'})`);
assert.equal(run('sapMatches(state.sapActuals[0]).length'),1);

run(`state.projects=[{id:'p',number:'10-02763'}]; state.sapActuals=[{personnelNumber:'1',date:'2026-01-15',projectNumber:'10-02763',hours:5},{personnelNumber:'1',date:'2026-02-03',projectNumber:'10-02763',hours:7}]`);
assert.equal(run(`sapActualFor(state.projects[0],{start:'2026-01-01',end:'2026-02-01'})`),5);
assert.equal(run(`sapPeriodLocked(state.projects[0],{start:'2026-01-01',end:'2026-02-01'})`),true);
assert.equal(run(`sapPeriodLocked(state.projects[0],{start:'2026-02-01',end:'2026-03-01'})`),false);
assert.equal(run(`sapPeriodLocked({id:'none',number:'x'},{start:'2026-01-01',end:'2026-02-01'})`),false);
console.log('SAP: Ist je Zeitraum und Sperre bereits gebuchter Zeiträume geprüft.');

run(`state.projects=[{id:'p',number:'10-02763',budget:100,qvpBudget:50,percent:[100,0,0,0],dates:['2026-01-01','2026-02-01','2026-03-01','2026-04-01','2026-05-01'],changes:[]}];
function totals(p){return p.budget+(p.changes||[]).reduce((a,c)=>a+c.hours,0)}
state.sapDepartments={qvp:['41']};
state.sapActuals=[{psp:'10-02763-000-99',projectNumber:'10-02763',department:'99',date:'2026-01-10',hours:30},{psp:'10-02763-000-41',projectNumber:'10-02763',department:'41',date:'2026-01-12',hours:5}]`);
assert.equal(run(`sapProjectData(state.projects[0],'pl').actual`),30);
assert.equal(run(`sapProjectData(state.projects[0],'qvp').actual`),5);
assert.equal(run(`sapProjectData(state.projects[0],'qvp').budget`),50);
assert.equal(run(`sapProjectData(state.projects[0],'all').actual`),35);
assert.equal(run(`sapPhaseData(state.projects[0],0).qvpActual`),5);
console.log('SAP: PL/QVP-Trennung und Phasenwerte geprüft.');

run(`state.sapDepartments={qvp:['41']};state.projects=[{id:'b',name:'B',number:'10-02763',budget:300,qvpBudget:0,percent:[100,0,0,0],dates:['2026-01-01','2026-02-01','2026-03-01','2026-04-01','2026-05-01'],changes:[]}];
const through=Object.entries(KapaHours.materialize(state.projects[0]).daily).reduce((n,[d,h])=>n+(d<='2026-01-15'?h:0),0);
state.sapActuals=[{personnelNumber:'1',date:'2026-01-15',psp:'10-02763-000-99',projectNumber:'10-02763',department:'99',hours:through-50}]`);
assert.equal(run('sapBalanceInfo(state.projects[0]).delta'),50);
assert.equal(run(`sapBalanceApply(state.projects[0],'spread')`),null);
assert.equal(run('sapBalanceInfo(state.projects[0]).delta'),0);
assert.equal(run('Object.values(KapaHours.materialize(state.projects[0]).dailyAdjust).reduce((a,b)=>a+b,0)'),50);
console.log('SAP: Istabgleich auf die Restlaufzeit geprüft.');
