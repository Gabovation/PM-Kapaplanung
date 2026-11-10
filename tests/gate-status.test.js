import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const RealDate=Date;
class TestDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : ['2026-11-10T12:00:00'])); }
  static now() { return new RealDate('2026-11-10T12:00:00').getTime(); }
}
const document={querySelector:()=>({dataset:{}}),querySelectorAll:()=>[],addEventListener(){}};
const context=vm.createContext({Date:TestDate,document,window:{addEventListener(){}},location:{hash:''},fetch:()=>new Promise(()=>{}),console});
for(const file of ['hours.js','capacity.js','capacity-view.js','plan.js','fine-editor.js']) vm.runInContext(fs.readFileSync('static/app/'+file,'utf8'),context);
const run=source=>vm.runInContext(source,context);
run(`const project={id:'p1',number:'11-111-111',name:'Testprojekt',status:'Gewonnen',person:'',budget:800,percent:[20,20,20,40],dates:['2026-01-01','2026-04-01','2026-07-01','2027-01-01','2027-07-01'],weights:{},changes:[]};`);
const status=date=>run(`gateStatus(project, '${date}')`);
assert.equal(status('2025-12-31').current,'Vor Gate 3');
assert.equal(status('2025-12-31').next.name,'Gate 3');
assert.equal(status('2025-12-31').next.date,'2026-01-01');
assert.equal(status('2026-01-01').current,'Gate 3');
assert.equal(status('2026-01-01').next.name,'Gate 5');
assert.equal(status('2026-04-01').current,'Gate 5');
assert.equal(status('2026-11-10').current,'Gate 6');
assert.equal(status('2026-11-10').next.name,'Gate 7');
assert.equal(status('2026-11-10').next.date,'2027-01-01');
assert.equal(status('2026-12-31').current,'Gate 6');
assert.equal(status('2027-01-01').current,'Gate 7');
assert.equal(status('2027-07-01').current,'Ab Gate 8');
assert.equal(status('2027-07-01').next,null);
assert.equal(status('2029-01-01').next,null);
assert.equal(run("gateStatus({...project,dates:['2026-02-30','2026-04-01','2026-07-01','2027-01-01','2027-07-01']},'2026-11-10').valid"),false);
assert.equal(run("gateStatus({...project,dates:['2026-04-01','2026-01-01','2026-07-01','2027-01-01','2027-07-01']},'2026-11-10').valid"),false);
assert.equal(run("gateStatus({...project,dates:[]},'2026-11-10').valid"),false);
assert.match(run('gateStatusView({...project,dates:[]})'),/Gate-Termine prüfen/);

run(`state={fte:40,roles:[],people:[],projects:[project]};selected='p1';`);
for(const view of ['overview()','projects()','detail()']) {
  const html=run(view);
  assert.match(html,/Gate-Status \(Plan\):?/);
  assert.match(html,/Gate 6/);
  assert.match(html,/Nächstes Gate:?/);
  assert.match(html,/Gate 7(?:<[^>]+>)*(?: · )?(?:<[^>]+>)*01\.01\.2027/);
}
assert.match(run("gateStatusView({...project,dates:['2025-01-01','2025-02-01','2025-03-01','2025-04-01','2025-05-01']})"),/Kein weiteres Gate/);
console.log('Gate-Status: Plantermine, Grenztage, fehlende Termine und Anzeige in den Projektansichten geprüft.');
