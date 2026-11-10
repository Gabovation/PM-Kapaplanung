import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const handlers={};
const document={querySelector:()=>({dataset:{}}),querySelectorAll:()=>[],addEventListener:(name,handler)=>{handlers[name]=handler;}};
const location={hash:'#overview',origin:'http://localhost:54343',pathname:'/',search:''};
const context=vm.createContext({document,location,window:{addEventListener(){}},fetch:()=>new Promise(()=>{}),console});
for(const file of ['hours.js','capacity.js','capacity-view.js','plan.js','fine-editor.js']) vm.runInContext(fs.readFileSync('static/app/'+file,'utf8'),context);
const run=source=>vm.runInContext(source,context);
run('let renders=0;render=()=>{renders++};');

function click(hash, options={}) {
  const link={hash,origin:location.origin,pathname:location.pathname,search:location.search,target:'',...options.link};
  let prevented=false;
  const event={button:0,target:{closest:()=>link},preventDefault(){prevented=true;},...options.event};
  handlers.click(event);
  return prevented;
}

// Creating/opening a project changes the internal page but leaves the previous hash intact.
for(const destination of ['overview','projects','people','settings']) {
  location.hash='#'+destination;
  run("page='detail'");
  assert.equal(click(location.hash),true);
  assert.equal(run('page'),destination);
}
assert.equal(run('renders'),4);

// Normal browser navigation and modifier clicks remain untouched.
run("page='detail'");
assert.equal(click('#settings',{event:{ctrlKey:true}}),false);
assert.equal(run('page'),'detail');
assert.equal(click('#settings',{link:{origin:'https://example.com'}}),false);
assert.equal(click('#settings',{link:{target:'_blank'}}),false);
assert.equal(click('#settings',{event:{button:1}}),false);
assert.equal(click('#projects'),false);
assert.equal(run('page'),'detail');
console.log('Navigation: gleicher Hash nach Projektdetail und reguläre Browserklicks geprüft.');
