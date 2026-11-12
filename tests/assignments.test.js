import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const nodes=new Map(), alerts=[];
const document={querySelector:selector=>{
 if(!nodes.has(selector))nodes.set(selector,{dataset:{},classList:{toggle(){}},showModal(){},close(){}});
 return nodes.get(selector);
},querySelectorAll:()=>[],addEventListener(){}};
const context=vm.createContext({document,window:{addEventListener(){}},location:{hash:''},fetch:()=>new Promise(()=>{}),alert:message=>alerts.push(message),console});
for(const file of ['hours.js','capacity.js','capacity-view.js','plan.js','fine-editor.js']) vm.runInContext(fs.readFileSync('static/app/'+file,'utf8'),context);
const run=source=>vm.runInContext(source,context);
run(`state={fte:40,favorite:[100,0,0,0],roles:[{id:'project-manager',name:'Projektleiter'},{id:'qvp',name:'QVP'}],people:[
 {id:'a',name:'Anna',roleId:'project-manager',fte:100},{id:'b',name:'Berta',roleId:'project-manager',fte:100},{id:'q',name:'Quentin',roleId:'qvp',fte:100}],projects:[]};
 const project={id:'p',name:'Beispiel',number:'11',status:'Gewonnen',person:'a',budget:7,percent:[100,0,0,0],dates:['2026-11-09','2026-11-16','2026-11-23','2026-11-30','2026-12-07'],weights:{},changes:[]};
 state.projects=[project];render=()=>{};persist=()=>{};closeModal=()=>{};`);

// Existing single-lead projects continue to allocate all their original hours.
run(`const legacy=KapaCapacity.build(state,'2026-11-09','week',1);`);
assert.equal(run('legacy.people[0].cells[0].load'),7);
assert.equal(run('legacy.team[0].load'),7);

run(`project.secondPerson='b';project.leadPercent=50;project.qvpPerson='q';project.qvpBudget=5;
 const split=KapaCapacity.build(state,'2026-11-09','week',1);
 const splitMonth=KapaCapacity.build(state,'2026-11-01','month',1);`);
assert.equal(run('split.people[0].cells[0].load'),4);
assert.equal(run('split.people[1].cells[0].load'),3);
assert.equal(run('split.people[2].cells[0].load'),5);
assert.equal(run('split.team[0].load'),12);
assert.equal(run('split.team[0].wonLoad'),12);
assert.equal(run('splitMonth.team[0].load'),12);
assert.equal(run('projectTotal(project)'),12);
assert.match(run('overview()'),/PL: 7 h · QVP: 5 h/);
assert.match(run('portfolioTable()'),/<th scope="col">PL<\/th><th scope="col">QVP<\/th>/);
assert.match(run('portfolioTable()'),/Anna \(50 %\).*Berta \(50 %\)/);
assert.match(run('portfolioTable()'),/Quentin/);

// Missing QVP is reported as unassigned rather than being dropped or given to the leads.
run(`const missingQvp=KapaCapacity.build({...state,projects:[{...project,qvpPerson:''}]},'2026-11-09','week',1);`);
assert.equal(run('missingQvp.unassigned'),5);
assert.equal(run('missingQvp.team[0].load'),7);

// Split stays exact in whole hours when a plan-value change adds more PL work.
run(`const changed={...project,leadPercent:60,changes:[{id:'extra',date:'2026-11-09',hours:3}]};
const changedForecast=KapaCapacity.build({...state,projects:[changed]},'2026-11-09','week',4);`);
assert.equal(run('changedForecast.people[0].cells.reduce((n,c)=>n+c.load,0)'),6);
assert.equal(run('changedForecast.people[1].cells.reduce((n,c)=>n+c.load,0)'),4);
assert.equal(run('changedForecast.people[2].cells.reduce((n,c)=>n+c.load,0)'),5);
assert.equal(run('changedForecast.team.reduce((n,c)=>n+c.load,0)'),15);

// The project dialog preserves prior data and prevents the same person being selected twice.
run("editProject('p')");
let html=nodes.get('#dialogContent').innerHTML;
assert.match(html,/Projektleiter 2/);
assert.match(html,/PL-Stunden/);
assert.match(html,/QVP-Stunden/);
const form=document.querySelector('#projectForm');
form.reportValidity=()=>true;
form.elements={name:{value:'Beispiel'},number:{value:'11'},status:{value:'Gewonnen'},person:{value:'a'},secondPerson:{value:'a'},leadPercent:{value:'60'},qvpPerson:{value:'q'},qvpBudget:{value:'5'},budget:{value:'7'}};
['2026-11-09','2026-11-16','2026-11-23','2026-11-30','2026-12-07'].forEach((value,index)=>form.elements['date'+index]={value});
[100,0,0,0].forEach((value,index)=>form.elements['pct'+index]={value:String(value)});
run("submitProject('p')");
assert.equal(alerts.length,1);
assert.equal(run('project.leadPercent'),50);
form.elements.secondPerson.value='b';
run("submitProject('p')");
assert.equal(run('project.leadPercent'),60);
assert.equal(run('project.qvpBudget'),5);
assert.equal(run('project.secondPerson'),'b');
form.elements.secondPerson.value='';
form.elements.leadPercent.value='37';
run("submitProject('p')");
assert.equal(run('project.leadPercent'),100);
run("editProject('p')");
html=nodes.get('#dialogContent').innerHTML;
assert.match(html,/name="leadPercent"[^>]*value="100"[^>]*readonly/);
const input=document.querySelector('#leadPercent'), second=document.querySelector('#secondPerson');
Object.assign(input,{value:'100',readOnly:true,dataset:{previousSplit:'50'}});
second.value='b';run('updateLeadSplit()');
assert.equal(input.value,'50');assert.equal(input.readOnly,false);
input.value='65';second.value='';run('updateLeadSplit()');
assert.equal(input.value,'100');assert.equal(input.readOnly,true);
second.value='b';run('updateLeadSplit()');
assert.equal(input.value,'65');assert.equal(input.readOnly,false);
assert.equal(run("typeof applyFavorite"),'function');
console.log('Zuweisungen: PL-Split, Rundung, QVP-Budget, Bestandsdaten und Validierung geprüft.');
