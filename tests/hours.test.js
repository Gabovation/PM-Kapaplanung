import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const nodes=new Map(), alerts=[];
function node(selector) {
  if(!nodes.has(selector)) nodes.set(selector,{dataset:{apiUrl:'/api/data',importUrl:'/api/prepare-import',writeToken:'test'},classList:{toggle(){}},showModal(){},close(){},scrollLeft:0});
  return nodes.get(selector);
}
const context=vm.createContext({document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},location:{hash:''},window:{addEventListener(){}},fetch:()=>new Promise(()=>{}),alert:text=>alerts.push(text),console});
for(const path of ['hours.js','capacity.js','capacity-view.js','plan.js','fine-editor.js']) vm.runInContext(fs.readFileSync('static/app/'+path,'utf8'),context);
const run=script=>vm.runInContext(script,context);
assert.equal(run("JSON.stringify(KapaHours.phaseBudgets({budget:12,percent:[20,45,0,35]}))"),'[3,5,0,4]');
run(`init(); persist=()=>{}; const p={id:'p',name:'Test',number:'P1',budget:800,percent:[20,20,20,40],dates:['2026-01-01','2026-04-01','2026-07-01','2027-01-01','2027-07-01'],weights:{},changes:[]};state.projects=[p];editHours('p');`);
assert.match(node('#dialogContent').innerHTML,/Stundenplanung von links nach rechts/);
assert.match(node('#dialogContent').innerHTML,/type="number"/);
assert.match(node('#dialogContent').innerHTML,/<svg/);
assert.doesNotMatch(node('#dialogContent').innerHTML,/Gewicht/);
assert.equal(node('#fineSave').disabled,false);
const original=run('JSON.stringify(KapaHours.materialize(p).daily)');
run("setFineGranularity('month');");
assert.equal(run('fineDraft.granularity'),'month');
const january=run("KapaHours.periodTotal(fineDraft.rows[0],KapaHours.periods(p,'month')[0])");
context.entered={value:String(january+10),removeAttribute(){},setAttribute(){},setCustomValidity(){}};
run('changeFineHours(0,0,entered);');
assert.equal(node('#fineSave').disabled,true);
assert.equal(run('KapaHours.rowTotal(fineDraft.rows[0])'),170);
run('balanceFineRow(0);');
assert.equal(run('KapaHours.rowTotal(fineDraft.rows[0])'),160);
assert.equal(run("KapaHours.periodTotal(fineDraft.rows[0],KapaHours.periods(p,'month')[0])"),january+10);
assert.equal(node('#fineSave').disabled,false);
const daysBeforeSwitch=run('JSON.stringify(fineDraft.rows.map(row=>row.daily))');
run("setFineGranularity('week');setFineGranularity('month');");
assert.equal(run('JSON.stringify(fineDraft.rows.map(row=>row.daily))'),daysBeforeSwitch);
run('saveFineHours();');
assert.equal(run('p.hourPlan.granularity'),'month');
assert.equal(run('p.weights'),undefined);
assert.notEqual(run('JSON.stringify(KapaHours.materialize(p).daily)'),original);
assert.equal(run('schedule(p).reduce((total,row)=>total+row.total,0)'),800);

run(`const change={id:'c1',hours:101,date:'2026-08-15',note:'Test'};
 const changed={...p,changes:[change]};changed.hourPlan=KapaHours.reconcile(changed);
 const without=KapaHours.materialize(p),withChange=KapaHours.materialize(changed);`);
assert.equal(run('Object.values(withChange.dailyChange).reduce((a,b)=>a+b,0)'),101);
assert.equal(run("Object.keys(withChange.dailyChange).some(day=>day<'2026-08-15')"),false);
assert.equal(run('JSON.stringify(withChange.dailyBase)'),run('JSON.stringify(without.dailyBase)'));
assert.equal(run('Object.values(withChange.daily).reduce((a,b)=>a+b,0)'),901);

run(`const resized={...p,budget:803,dates:['2026-02-01','2026-05-01','2026-08-01','2027-02-01','2027-08-01']};resized.hourPlan=KapaHours.reconcile(resized);`);
assert.equal(run('Object.values(KapaHours.materialize(resized).daily).reduce((a,b)=>a+b,0)'),803);
assert.equal(run("KapaHours.sources(resized).every(row=>Object.keys(row.daily).every(day=>day>=row.start&&day<row.end)&&KapaHours.rowTotal(row)===row.budget)"),true);

run(`const edge={budget:101,percent:[20,20,20,40],dates:['2026-03-28','2026-04-02','2026-04-07','2026-04-12','2026-04-17'],weights:{},changes:[]};
 const edgeRows=KapaHours.sources(edge);const months=KapaHours.summary(edgeRows,KapaHours.periods(edge,'month'));`);
assert.equal(run('months.reduce((sum,p)=>sum+p.total,0)'),101);
assert.equal(run('KapaHours.sources(edge).reduce((sum,row)=>sum+KapaHours.rowTotal(row),0)'),101);
assert.equal(run("Object.keys(KapaHours.materialize(edge).daily).some(day=>day<'2026-03-28'||day>='2026-04-17')"),false);

run("editHours('p');");
context.entered.value='1.5';
run('changeFineHours(0,0,entered);');
assert.equal(node('#fineSave').disabled,true);
assert.equal(run('fineDraft.invalid.size'),1);
context.entered.value='0';
run('changeFineHours(0,0,entered);');
assert.equal(run('fineDraft.invalid.size'),0);
run('balanceFineRow(0);');
assert.equal(node('#fineSave').disabled,false);

// An over-budget edited period cannot silently be reduced by the balancing action.
run(`const locked={start:'2026-01-01',end:'2026-01-03',budget:10,daily:{'2026-01-01':20}};`);
assert.throws(()=>run("KapaHours.balance(locked,new Set(['2026-01-01']))"),/überschreiten/);
assert.equal(run("locked.daily['2026-01-01']"),20);
console.log('Absolute Stunden: Wochen/Monate, Live-Diagramm, exakte Budgets, geschützte Eingaben, Gate-Grenzen, Änderungen und Umschalten geprüft.');
