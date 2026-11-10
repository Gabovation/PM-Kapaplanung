import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const doc = {querySelector:()=>({dataset:{apiUrl:'/api/data',writeToken:'test'}}), querySelectorAll:()=>[], addEventListener:()=>{}};
const context = vm.createContext({document:doc, location:{hash:''},window:{addEventListener:()=>{}}, fetch:()=>new Promise(()=>{}),console,Date,Math,Number,String,Array,JSON,Promise});
vm.runInContext(fs.readFileSync('static/app/hours.js','utf8'), context);
vm.runInContext(fs.readFileSync('static/app/capacity.js','utf8'), context);
vm.runInContext(fs.readFileSync('static/app/capacity-view.js','utf8'), context);
vm.runInContext(fs.readFileSync('static/app/plan.js','utf8'), context);
const check = vm.runInContext(`(()=>{
 const p={budget:801,percent:[20,20,20,40],dates:['2026-03-30','2026-04-01','2026-04-08','2026-05-01','2026-06-01'],weights:{},changes:[{date:'2026-04-15',hours:101}]};
 const x=plan(p), w=x.weeks, daily=x.daily, sum=a=>a.reduce((x,y)=>x+y,0);
 return {base:sum(w.map(x=>x.base)),change:sum(w.map(x=>x.change)),daily:sum(Object.values(daily)),whole:w.every(x=>Number.isInteger(x.total)),outside:Object.keys(daily).filter(d=>d<p.dates[0]||d>=p.dates[4]),days:Object.values(daily).every(Number.isInteger),mars:Object.entries(daily).filter(([d])=>d.startsWith('2026-03')).reduce((a,[,n])=>a+n,0),april:Object.entries(daily).filter(([d])=>d.startsWith('2026-04')).reduce((a,[,n])=>a+n,0),may:Object.entries(daily).filter(([d])=>d.startsWith('2026-05')).reduce((a,[,n])=>a+n,0)}
})()`, context);
assert.equal(check.base,801);assert.equal(check.change,101);assert.equal(check.daily,902);assert.ok(check.whole && check.days);assert.equal(check.outside.length,0);assert.equal(check.mars+check.april+check.may,902);
const weighted = vm.runInContext(`(()=>{let p={budget:100,percent:[100,0,0,0],dates:['2026-01-05','2026-01-19','2026-01-20','2026-01-21','2026-01-22'],weights:{'2026-01-05':1,'2026-01-12':3},changes:[]};return schedule(p).map(x=>x.base)})()`,context);
assert.equal(weighted[0],25);assert.equal(weighted[1],75);
console.log('Planung: Budgetsummen, ganze Stunden, Gate- und Monatsgrenzen sowie Gewichte geprüft.');
