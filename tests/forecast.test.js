import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const nodes=new Map();
const document={querySelector:selector=>{
  if(!nodes.has(selector)) nodes.set(selector,{dataset:{},classList:{toggle(){}},showModal(){},close(){}});
  return nodes.get(selector);
},querySelectorAll:()=>[],addEventListener(){}};
const context=vm.createContext({document,window:{addEventListener(){}},location:{hash:''},fetch:()=>new Promise(()=>{}),console});
for(const file of ['hours.js','capacity.js','capacity-view.js','plan.js','fine-editor.js']) vm.runInContext(fs.readFileSync('static/app/'+file,'utf8'),context);
const run=script=>vm.runInContext(script,context);

run(`const project={id:'p1',person:'a',budget:64,percent:[100,0,0,0],dates:['2026-11-09','2026-11-16','2026-11-23','2026-11-30','2026-12-07'],weights:{},changes:[]};
 state={fte:40,roles:[],people:[{id:'a',name:'Person A',fte:100},{id:'b',name:'Person B',fte:100}],projects:[project]};
 const forecast=KapaCapacity.build(state,'2026-11-09','week',12);`);
assert.equal(run('forecast.team[0].ratio'),80);
assert.equal(run('forecast.team[0].peak'),160);
assert.equal(run('forecast.affectedPeople'),1);
assert.equal(run('forecast.firstBottleneck.person.id'),'a');
assert.equal(run('forecast.people[0].cells[0].load'),64);
assert.equal(run('forecast.people[0].cells[0].capacity'),40);
assert.equal(run('forecast.people[1].cells[0].ratio'),0);
assert.match(run('capacityForecast(forecast)'),/160 %/);
assert.match(run('capacityForecast(forecast)'),/Erster Engpass/);
assert.match(run('capacityForecast(forecast)'),/Höchste Einzelauslastung/);
assert.match(run('capacityForecast(forecast)'),/1 überlastet/);
assert.match(run('capacityForecast(forecast)'),/aria-expanded="false"/);
run("expandedForecastRoles.add('')");
assert.match(run('capacityForecast(forecast)'),/is-overloaded/);

run(`const second={...project,id:'p2',budget:16};const combined=KapaCapacity.build({...state,projects:[project,second]},'2026-11-09','week',1);`);
assert.equal(run('combined.people[0].cells[0].load'),80);
assert.equal(run('combined.team[0].ratio'),100);
assert.equal(run('combined.team[0].peak'),200);

// The team thresholds are inclusive and use the unrounded ratio.
for(const [value,level] of [[0,'normal'],[84.999,'normal'],[85,'warning'],[99.999,'warning'],[100,'critical'],[Infinity,'critical']]) {
  assert.equal(run(`teamCapacityLevel(${value})`),level);
}
assert.match(run('capacityForecast(combined)'),/class="kapa-team-critical"[^>]*>100 %/);

// Status contributions share the same team-capacity denominator and do not change total load.
run(`const wonProject={...project,status:'Gewonnen',budget:24};
 const expectedProject={...project,id:'expected',status:'Erwartet',budget:16};
 const mixed=KapaCapacity.build({...state,projects:[wonProject,expectedProject]},'2026-11-09','week',1);
 const mixedMonth=KapaCapacity.build({...state,projects:[wonProject,expectedProject]},'2026-11-01','month',1);`);
assert.equal(run('mixed.team[0].load'),40);
assert.equal(run('mixed.team[0].wonLoad'),24);
assert.equal(run('mixed.team[0].expectedLoad'),16);
assert.equal(run('mixed.team[0].wonRatio'),30);
assert.equal(run('mixed.team[0].expectedRatio'),20);
assert.equal(run('mixed.team[0].combinedRatio'),50);
assert.equal(run('mixed.people[0].cells[0].wonLoad'),24);
assert.equal(run('mixed.people[0].cells[0].expectedLoad'),16);
assert.equal(run('mixedMonth.team[0].wonLoad'),24);
assert.equal(run('mixedMonth.team[0].expectedLoad'),16);
assert.match(run('capacityForecast(mixed)'),/Gewonnen \+ erwartet/);
assert.doesNotMatch(run('capacityForecast(mixed)'),/Team gesamt \(inkl\. weiterer Status\)/);
assert.doesNotMatch(run('forecastChart(mixed)'),/class="kapa-capacity-team"/);
assert.match(run('forecastChart(mixed)'),/gewonnen \+ erwartet 40 h \(50 %\)/);
assert.match(run('capacityForecast(mixed)'),/Gewonnen: 24 h · Erwartet: 16 h/);
run(`const unknown=KapaCapacity.build({...state,projects:[{...project,status:'Offen'}]},'2026-11-09','week',1);`);
assert.equal(run('unknown.team[0].load'),64);
assert.equal(run('unknown.team[0].wonLoad + unknown.team[0].expectedLoad'),0);
assert.equal(run('unknown.team[0].combinedRatio'),0);
assert.match(run('capacityForecast(unknown)'),/Team gesamt \(inkl\. weiterer Status\)/);
assert.match(run('forecastChart(unknown)'),/class="kapa-capacity-team"/);
run(`const onlyWon=KapaCapacity.build({...state,projects:[wonProject]},'2026-11-09','week',1);
const onlyExpected=KapaCapacity.build({...state,projects:[expectedProject]},'2026-11-09','week',1);`);
assert.equal(run('onlyWon.team[0].combinedRatio'),run('onlyWon.team[0].wonRatio'));
assert.equal(run('onlyExpected.team[0].wonRatio'),0);
assert.equal(run('onlyExpected.team[0].combinedRatio'),20);
assert.match(run("projectStatusBadge({status:'Erwartet'})"),/pt-status--warning.*Erwartet/);
assert.match(run("projectStatusBadge({status:'Gewonnen'})"),/pt-status--success.*Gewonnen/);

// A later overload must be reported even when the first selected period is free.
run(`const future={...project,dates:['2026-11-23','2026-11-30','2026-12-07','2026-12-14','2026-12-21']};
 const later=KapaCapacity.build({...state,projects:[future]},'2026-11-09','week',12);`);
assert.equal(run('later.firstBottleneck.periodIndex'),2);
assert.equal(run('later.team[0].load'),0);
assert.equal(run('later.team[2].load'),64);

// Compare exact ratios; a small overload must not disappear by rounding to 100.
run(`const december={...project,budget:61,dates:['2026-12-01','2027-01-01','2027-02-01','2027-03-01','2027-04-01']};
 const partTime=KapaCapacity.build({...state,people:[{id:'a',name:'Teilzeit',fte:33}],projects:[december]},'2026-12-01','month',1);`);
assert.ok(Math.abs(run('partTime.people[0].cells[0].capacity')-60.72)<1e-9);
assert.equal(run('partTime.people[0].cells[0].overloaded'),true);
assert.equal(run('Math.round(partTime.people[0].cells[0].ratio)'),100);
assert.equal(run('KapaCapacity.percent(partTime.people[0].cells[0].ratio)'),'100,5');

run(`const missing=KapaCapacity.build({...state,projects:[{...project,person:''}]},'2026-11-09','week',12);`);
assert.equal(run('missing.unassigned'),64);
assert.equal(run('missing.team[0].load'),0);
assert.match(run('capacityForecast(missing)'),/keiner vorhandenen Person zugewiesen/);
run(`const zero=KapaCapacity.build({...state,people:[{id:'a',name:'Ohne Kapazität',fte:0}]},'2026-11-09','week',12);`);
assert.equal(run('zero.team[0].peak'),Infinity);
assert.equal(run('zero.affectedPeople'),1);
assert.doesNotMatch(run('forecastChart(zero)'),/NaN|Infinity/);
assert.match(run('forecastChart(zero)'),/∞/);
run(`const empty=KapaCapacity.build({...state,people:[],projects:[]},'2026-11-09','week',12);`);
assert.match(run('capacityForecast(empty)'),/Personen mit FTE anlegen/);

// Gates stay at the same calendar boundary in either raster, including the exclusive end.
run(`const gateWeeks=KapaHours.periods(project,'week'),gateMonths=KapaHours.periods(project,'month');
 const weekGates=KapaHours.milestones(project,gateWeeks),monthGates=KapaHours.milestones(project,gateMonths);`);
assert.equal(run('weekGates.length'),5);
assert.equal(run('weekGates[4].position'),4);
assert.equal(run('monthGates[4].name'),'Gate 8');
assert.equal(run('monthGates[4].date'),'2026-12-07');
const chart=run("hoursChart(KapaHours.sources(project),gateWeeks,'test-gates',project)");
for(const gate of [3,5,6,7,8]) assert.match(chart,new RegExp('Gate '+gate));
assert.match(chart,/07\.12\.26/);

run(`const tight={...project,dates:['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13']};
 const labels=gateMarkerLayout(tight,KapaHours.periods(tight,'week'));`);
assert.equal(run('labels.length'),5);
assert.equal(run('new Set(labels.map(marker=>marker.lane)).size'),5);
run(`const dst={...project,dates:['2026-03-28','2026-03-30','2026-04-01','2026-04-02','2026-04-03']};
 const dstGates=KapaHours.milestones(dst,KapaHours.periods(dst,'week'));`);
assert.ok(Math.abs(run('dstGates[0].position')-5/7)<1e-9);

run('offset=0;render=()=>{};focusForecastPeriod(3);');
assert.equal(run('offset'),3);
run("mode='week';setForecastCount('26');");
assert.equal(run('forecastCounts.week'),26);
run(`const longProject={...project,dates:['2026-11-09','2027-02-01','2027-03-01','2027-04-01','2027-05-03']};
const horizon=forecastHorizon(date('2026-11-09'),'week',12,[longProject]);
const longForecast=KapaCapacity.build({...state,projects:[longProject]},date('2026-11-09'),'week',horizon.count);`);
assert.equal(run('horizon.count'),25);
assert.equal(run('longForecast.columns[24].start'),'2027-04-26');
assert.match(run('capacityForecast(longForecast)'),/kapa-timeline-scroll/);
assert.doesNotMatch(run('capacityForecast(longForecast)'),/forecast-position|shiftForecast/);
assert.equal(run("forecastHorizon(date('2026-11-09'),'week',52,[project]).count"),52);
assert.equal(run("forecastHorizon(date('2026-11-01'),'month',12,[{dates:['','','','','2028-01-01']}]).count"),14);
assert.equal(run("forecastHorizon(date('2026-11-09'),'week',12,[{dates:['','','','','2050-01-01']}]).truncated"),true);
assert.equal(run("forecastHorizon(date('2026-11-09'),'week',12,[{dates:['','','','','2050-01-01']}]).count"),600);
assert.equal(run("KapaCapacity.periods('2026-11-09','week',600).length"),600);
assert.match(run('capacityForecast(longForecast,true)'),/Spätere Projekte sind nicht enthalten/);
run("mode='month';setForecastCount('24');");
assert.equal(run('forecastCounts.month'),24);

// Groups and filters use the sum of the selected persons' hours and FTE capacities.
run(`mode='week';forecastFilter={type:'all',id:''};expandedForecastRoles.clear();
 state={fte:40,roles:[{id:'pl',name:'Projektleiter'},{id:'qvp',name:'QVP'},{id:'empty',name:'Noch leer'}],
 people:[{id:'a',name:'Anna',roleId:'pl',fte:100},{id:'b',name:'Berta',roleId:'pl',fte:100},{id:'q',name:'Quentin',roleId:'qvp',fte:50}],
 projects:[{...project,status:'Gewonnen',qvpPerson:'q',qvpBudget:8}]};
 const groupsForecast=KapaCapacity.build(state,'2026-11-09','week',2);`);
assert.match(run('capacityForecast(groupsForecast)'),/Projektleiter/);
assert.match(run('capacityForecast(groupsForecast)'),/QVP/);
assert.match(run('capacityForecast(groupsForecast)'),/1 überlastet/);
assert.doesNotMatch(run('capacityForecast(groupsForecast)'),/<strong>Anna<\/strong>/);
assert.match(run('overview()'),/data-person-id="a"/);
run("toggleForecastRole('pl')");
assert.match(run('capacityForecast(groupsForecast)'),/<strong>Anna<\/strong>/);
assert.match(run('capacityForecast(groupsForecast)'),/aria-expanded="true"/);
run("setForecastFilter('role:pl')");
assert.equal(run('scopedForecast(groupsForecast).people.length'),2);
assert.equal(run('scopedForecast(groupsForecast).team[0].ratio'),80);
assert.equal(run('scopedForecast(groupsForecast).team[0].peak'),160);
assert.equal(run('scopedForecast(groupsForecast).affectedPeople'),1);
assert.doesNotMatch(run('capacityForecast(groupsForecast)'),/<strong>Quentin<\/strong>/);
run(`const weightedForecast=KapaCapacity.build({...state,people:state.people.map(p=>p.id==='b'?{...p,fte:50}:p)},'2026-11-09','week',2);
 const weightedRole=KapaCapacity.scope(weightedForecast,['a','b']);
 const monthlyRole=KapaCapacity.scope(KapaCapacity.build(state,'2026-11-01','month',1),['a','b']);`);
assert.equal(run('weightedRole.team[0].capacity'),60);
assert.ok(Math.abs(run('weightedRole.team[0].ratio')-64/60*100)<1e-9);
assert.equal(run('monthlyRole.team[0].load'),64);
assert.equal(run('monthlyRole.team[0].capacity'),336);
run("setForecastFilter('role:qvp')");
assert.equal(run('scopedForecast(groupsForecast).team[0].load'),8);
assert.equal(run('scopedForecast(groupsForecast).team[0].capacity'),20);
assert.equal(run('scopedForecast(groupsForecast).team[0].ratio'),40);
assert.equal(run('scopedForecast(groupsForecast).affectedPeople'),0);
assert.doesNotMatch(run('capacityForecast(groupsForecast)'),/1 überlastet/);
run("setForecastFilter('role:empty')");
assert.match(run('capacityForecast(groupsForecast)'),/Für diese Auswahl sind keine Personen vorhanden/);
run("selectForecastPerson('b')");
assert.equal(run('scopedForecast(groupsForecast).people.length'),1);
assert.equal(run('scopedForecast(groupsForecast).team[0].ratio'),0);
assert.match(run('capacityForecast(groupsForecast)'),/Person: Berta/);
assert.doesNotMatch(run('forecastChart(scopedForecast(groupsForecast))'),/Anna|Quentin/);
run("setForecastFilter('all')");
assert.equal(run('scopedForecast(groupsForecast).people.length'),3);
run("selectForecastPerson('b');state.people=state.people.filter(p=>p.id!=='b');scopedForecast(groupsForecast)");
assert.equal(run('forecastFilter.type'),'all');
console.log('Vorschau und Gates: verdeckte Einzelengpässe, Zukunft, FTE, Monatskapazität, fehlende Zuordnung, Nullkapazität, Meilensteine und Rasterwechsel geprüft.');
