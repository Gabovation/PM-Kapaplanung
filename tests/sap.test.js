import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const context=vm.createContext({console,Date,Number,Set,JSON});
for(const file of ['hours.js','sap.js']) vm.runInContext(fs.readFileSync('static/app/'+file,'utf8'),context);
const run=code=>vm.runInContext(code,context);
run(`let state={projects:[{id:'p',number:'10-02763',budget:100,qvpBudget:0,percent:[100,0,0,0],dates:['2026-01-01','2026-02-01','2026-03-01','2026-04-01','2026-05-01'],changes:[]}],sapActuals:[{personnelNumber:'1',date:'2026-01-15',projectNumber:'10-02763',hours:80},{personnelNumber:'2',date:'2026-01-15',projectNumber:'10-02763',hours:10}]};
function projectTotal(p){return p.budget+(p.qvpBudget||0)}
function closeModal(){} function persist(){} `);
assert.equal(run('sapProjectData(state.projects[0]).actual'),90);
assert.ok(run('sapProjectData(state.projects[0]).projected > 100'));
run(`sapPending=[{personnelNumber:'1',date:'2026-01-15',projectNumber:'10-02763',hours:3},{personnelNumber:'1',date:'2026-01-15',projectNumber:'10-02763',hours:3}];applySap()`);
assert.equal(run('state.sapActuals.length'),3);
assert.equal(run('sapProjectData(state.projects[0]).actual'),16);
run(`state.projects.push({...state.projects[0],id:'duplicate'})`);
assert.equal(run('sapProjectData(state.projects[0])'),null);
console.log('SAP: Hochrechnung, Austausch je Person/Datum, identische Zeilen und Mehrdeutigkeiten geprüft.');
