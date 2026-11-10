import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const document={querySelector:()=>({dataset:{}}),querySelectorAll:()=>[],addEventListener(){}};
const context=vm.createContext({document,window:{addEventListener(){}},location:{hash:''},fetch:()=>new Promise(()=>{}),console});
for(const file of ['hours.js','capacity.js','capacity-view.js','plan.js','fine-editor.js']) {
  vm.runInContext(fs.readFileSync('static/app/'+file,'utf8'),context);
}
const run=source=>vm.runInContext(source,context);
run(`state={fte:40,roles:[],people:[],projects:[{id:'p1',number:'11-111-111',name:'Testprojekt',status:'Gewonnen',person:'',budget:100,percent:[25,25,25,25],dates:['2026-01-01','2026-02-01','2026-03-01','2026-04-01','2026-05-01'],weights:{},changes:[]}]};selected='p1';`);
const expected='https://polytec.sharepoint.com/sites/m365-pep-11-111-111';
for(const view of ['overview()','projects()','detail()']) {
  const html=run(view);
  assert.ok(html.includes(`href="${expected}"`), `${view}: SharePoint-Link fehlt`);
  assert.match(html,/SharePoint öffnen ↗/);
  assert.match(html,/target="_blank"/);
  assert.match(html,/rel="noopener noreferrer"/);
}

// Path separators and markup from a project number stay inside the single URL component.
const unusual=run(`sharePointLink({number:'A / 17?x=<svg>'})`);
assert.ok(unusual.includes('m365-pep-A%20%2F%2017%3Fx%3D%3Csvg%3E'));
assert.doesNotMatch(unusual,/<svg>/);
assert.equal(run("sharePointLink({number:'   '})"),'');

// A link inside the project card does not also invoke its parent navigation or cancel the link.
let stopped=false, prevented=false;
context.event={stopPropagation(){stopped=true},preventDefault(){prevented=true}};
const link=run("sharePointLink({number:'11-111-111'})");
const handler=link.match(/onclick="([^"]+)"/)[1];
run(handler);
assert.equal(stopped,true);
assert.equal(prevented,false);
console.log('SharePoint-Links: Portfolio, Projektliste, Projektdetail, URL-Kodierung und Klickverhalten geprüft.');
