import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const nodes = new Map();
function node(selector) {
  if (!nodes.has(selector)) nodes.set(selector, {
    dataset: {apiUrl:'/api/data', importUrl:'/api/prepare-import', writeToken:'test'},
    classList: {toggle() {}}, showModal() {}, close() {},
  });
  return nodes.get(selector);
}
const alerts = [];
const context = vm.createContext({
  document: {querySelector:node, querySelectorAll:()=>[], addEventListener() {}},
  location: {hash:''}, window:{addEventListener() {}},
  fetch:()=>new Promise(()=>{}), alert:message=>alerts.push(message), console,
});
vm.runInContext(fs.readFileSync('static/app/hours.js','utf8'), context);
vm.runInContext(fs.readFileSync('static/app/capacity.js','utf8'), context);
vm.runInContext(fs.readFileSync('static/app/capacity-view.js','utf8'), context);
vm.runInContext(fs.readFileSync('static/app/plan.js','utf8'), context);
vm.runInContext('init(); persist = () => {}; editPerson();', context);
assert.equal(vm.runInContext('state.version', context), 2);
let html = node('#dialogContent').innerHTML;
assert.match(html, /<select[^>]*name="roleId"/);
assert.match(html, />Projektleiter<\/option>/);
assert.match(html, />QVP<\/option>/);
assert.doesNotMatch(html, /<input[^>]*name="role"/);
assert.ok(node('#dialogActions').innerHTML.indexOf('Abbrechen') < node('#dialogActions').innerHTML.indexOf('Speichern'));
assert.match(node('#dialogActions').innerHTML, /type="submit" form="personForm"/);

node('#personForm').reportValidity = () => true;
node('#personForm').elements = {name:{value:'Test'}, roleId:{value:'qvp'}, fteValue:{value:'50'}};
vm.runInContext('submitPerson();', context);
assert.equal(vm.runInContext('state.people[0].roleId', context), 'qvp');
assert.equal(vm.runInContext('state.people[0].fte', context), 50);

node('#roleForm').reportValidity = () => true;
node('#roleForm').elements = {roleName:{value:'Qualitätsvorausplanung'}};
vm.runInContext("submitRole('qvp');", context);
assert.equal(vm.runInContext("roleName('qvp')", context), 'Qualitätsvorausplanung');
assert.equal(vm.runInContext('state.people[0].roleId', context), 'qvp');
assert.match(vm.runInContext('people()', context), /Qualitätsvorausplanung/);

node('#roleForm').elements.roleName.value = 'Versuchsplanung';
vm.runInContext('submitRole();', context);
assert.equal(vm.runInContext('state.roles.length', context), 3);
const newRoleId = vm.runInContext('state.roles[2].id', context);
assert.ok(newRoleId);
node('#roleForm').elements.roleName.value = '  VERSUCHSPLANUNG  ';
vm.runInContext('submitRole();', context);
assert.equal(vm.runInContext('state.roles.length', context), 3);
assert.equal(alerts.length, 1);
assert.match(vm.runInContext('settings()', context), /Rolle hinzufügen/);
vm.runInContext('editPerson(state.people[0].id);', context);
html = node('#dialogContent').innerHTML;
assert.match(html, /value="qvp" selected/);
assert.match(html, /Qualitätsvorausplanung/);

// Each role has an independent favorite, with the existing favorite as the initial fallback.
node('#favoriteRole').value='qvp';
[0,0,30,70].forEach((value,index)=>node('#fav'+index).value=String(value));
vm.runInContext('saveFavorite()', context);
assert.equal(vm.runInContext("JSON.stringify(favoriteForRole('qvp'))",context),'[0,0,30,70]');
assert.equal(vm.runInContext("JSON.stringify(favoriteForRole('project-manager'))",context),'[20,20,20,40]');
node('#favoriteRole').value='project-manager';
[40,30,20,10].forEach((value,index)=>node('#fav'+index).value=String(value));
vm.runInContext('saveFavorite()', context);
assert.equal(vm.runInContext("JSON.stringify(favoriteForRole('project-manager'))",context),'[40,30,20,10]');
assert.equal(vm.runInContext("JSON.stringify(favoriteForRole('qvp'))",context),'[0,0,30,70]');
assert.equal(vm.runInContext(`JSON.stringify(favoriteForRole('${newRoleId}'))`,context),'[20,20,20,40]');
vm.runInContext("changeFavoriteRole('qvp')",context);
assert.equal(node('#fav2').value,30);
assert.match(vm.runInContext('settings()',context),/id="favoriteRole"/);

// New projects use each role's favorite and manual edits are not overwritten.
vm.runInContext("editProject()",context);
html=node('#dialogContent').innerHTML;
assert.match(html,/Gate-Verteilung PL/);
assert.match(html,/Gate-Verteilung QVP/);
assert.match(html,/name="pct0"[^>]*value="40"/);
assert.match(html,/name="qvpPct2"[^>]*value="30"/);
assert.match(html,/oninput="markFavoriteEdited\('qvp'\)"/);
node('#projectForm').dataset.newProject='true';
node('#qvpPerson').value=vm.runInContext('state.people[0].id',context);
vm.runInContext("applyAutomaticFavorite('qvp')",context);
assert.equal(node('#qvpPct2').value,30);
node('#qvpPct2').value='35';
vm.runInContext("markFavoriteEdited('qvp');applyAutomaticFavorite('qvp')",context);
assert.equal(node('#qvpPct2').value,'35');
vm.runInContext("applyFavorite('qvp')",context);
assert.equal(node('#qvpPct2').value,30);
vm.runInContext(`state.roleFavorites['${newRoleId}']=[10,20,30,40];state.people.push({id:'custom',name:'Custom',roleId:'${newRoleId}',fte:100})`,context);
node('#person').value='custom';
vm.runInContext("applyAutomaticFavorite('pl')",context);
assert.equal(node('#pct0').value,10);
node('#pct0').value='15';
vm.runInContext("markFavoriteEdited('pl');applyAutomaticFavorite('pl')",context);
assert.equal(node('#pct0').value,'15');
node('#projectForm').dataset.newProject='false';
node('#qvpPct2').value='33';
node('#projectForm').dataset.qvpEdited='false';
vm.runInContext("applyAutomaticFavorite('qvp')",context);
assert.equal(node('#qvpPct2').value,'33');
// Role defaults and optional person overrides can be edited without replacing other fields.
node('#roleForm').elements={roleName:{value:'Qualitätsvorausplanung'},roleTarget:{value:'72.5'}};
vm.runInContext("submitRole('qvp')",context);
assert.equal(vm.runInContext("state.roles.find(r=>r.id==='qvp').productivityTarget",context),72.5);
node('#personForm').elements={name:{value:'Test'},roleId:{value:'qvp'},fteValue:{value:'50'},personTarget:{value:'10'}};
vm.runInContext('submitPerson(state.people[0].id)',context);
assert.equal(vm.runInContext('state.people[0].productivityTarget',context),10);
node('#personForm').elements.personTarget.value='';
vm.runInContext('submitPerson(state.people[0].id)',context);
assert.equal(vm.runInContext('state.people[0].productivityTarget',context),null);
console.log('Rollen: Dropdown, Personen-Zuweisung, Umbenennen, Hinzufügen und Dubletten geprüft.');
