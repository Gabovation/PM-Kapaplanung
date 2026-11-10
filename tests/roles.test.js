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
console.log('Rollen: Dropdown, Personen-Zuweisung, Umbenennen, Hinzufügen und Dubletten geprüft.');
