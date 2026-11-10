const $ = s => document.querySelector(s), esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gates=['Gate 3','Gate 5','Gate 6','Gate 7','Gate 8'], phases=['G3 – G5','G5 – G6','G6 – G7','G7 – G8'];
let state, page=['overview','projects','people','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'overview', selected=null, mode='week', offset=0; const appRoot=document.querySelector('#kapa-app'), apiUrl=appRoot.dataset.apiUrl, importUrl=appRoot.dataset.importUrl, writeToken=appRoot.dataset.writeToken; let revision=0;
const today=new Date().toISOString().slice(0,10), uid=()=>Math.random().toString(36).slice(2,10);
const date=s=>new Date(s+'T12:00:00'), iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function monday(d){d=new Date(d);d.setDate(d.getDate()-(d.getDay()+6)%7);return d}
function addDays(d,n){d=new Date(d);d.setDate(d.getDate()+n);return d}
function fmt(s){return date(s).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'2-digit'})}
function allocate(total,weights){let sum=weights.reduce((a,b)=>a+b,0);if(!sum)return weights.map(()=>0);let raw=weights.map(w=>total*w/sum), out=raw.map(Math.floor), left=total-out.reduce((a,b)=>a+b,0);raw.map((v,i)=>({i,r:v-out[i]})).sort((a,b)=>b.r-a.r||a.i-b.i).slice(0,left).forEach(x=>out[x.i]++);return out}
function weeks(p){let a=[];for(let d=monday(date(p.dates[0])),end=date(p.dates[4]);d<end;d=addDays(d,7))a.push(iso(d));return a}
// Allocate each phase independently to overlapping weeks; gate boundaries are exclusive at the end.
function plan(p){return KapaHours.materialize(p)}
function schedule(p){return plan(p).weeks}
function person(id){return state.people.find(x=>x.id===id)}
function validGateDate(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
 const parsed=date(value), [year,month,day]=value.split('-').map(Number);
 return !Number.isNaN(parsed.getTime())&&parsed.getFullYear()===year&&parsed.getMonth()+1===month&&parsed.getDate()===day;
}
function gateStatus(project, onDate=iso(new Date())) {
 const dates=project?.dates;
 if(!Array.isArray(dates)||dates.length!==gates.length||!dates.every(validGateDate)||!validGateDate(onDate)||dates.some((value,index)=>index>0&&value<=dates[index-1])) return {valid:false};
 let current=-1;
 dates.forEach((value,index)=>{if(value<=onDate) current=index});
 return {
   valid:true,
   current:current<0?'Vor Gate 3':current===gates.length-1?'Ab Gate 8':gates[current],
   next:current<gates.length-1?{name:gates[current+1],date:dates[current+1]}:null,
 };
}
function gateStatusView(project) {
 const status=gateStatus(project);
 if(!status.valid) return '<div class="kapa-gate-status quiet">Gate-Termine prüfen</div>';
 const next=status.next?`${esc(status.next.name)} · ${date(status.next.date).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'numeric'})}`:'Kein weiteres Gate';
 return `<div class="kapa-gate-status"><span class="quiet">Gate-Status (Plan):</span><span class="pt-status pt-status--neutral">${esc(status.current)}</span><span class="quiet">Nächstes Gate: <strong>${next}</strong></span></div>`;
}
function sharePointLink(project) {
 const number=String(project.number ?? '').trim();
 if(!number) return '';
 const url='https://polytec.sharepoint.com/sites/m365-pep-'+encodeURIComponent(number);
 return `<a class="pt-link-quiet kapa-project-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="SharePoint-Projektseite zu ${esc(number)} in einem neuen Tab öffnen" onclick="event.stopPropagation()">SharePoint öffnen ↗</a>`;
}
function portfolioTable() {
 const projects=state.projects.slice(0,5);
 if(!projects.length) return '<div class="empty">Noch keine Projekte angelegt.</div>';
 return `<div class="tablewrap" role="region" aria-label="Projektübersicht, horizontal scrollbar" tabindex="0">
   <table class="pt-table kapa-portfolio-table"><caption class="pt-visually-hidden">Projekte im Portfolio</caption>
   <thead><tr><th scope="col">Projekt</th><th scope="col">Status</th><th scope="col">Person</th><th scope="col">Gate-Status (Plan)</th><th scope="col">Nächstes Gate</th><th scope="col">Budget</th></tr></thead>
   <tbody>${projects.map(project=>{
     const gate=gateStatus(project);
     const current=gate.valid?`<span class="pt-status pt-status--neutral">${esc(gate.current)}</span>`:'<span class="quiet">Gate-Termine prüfen</span>';
     const next=gate.valid?(gate.next?`<strong>${esc(gate.next.name)}</strong><div class="sub">${date(gate.next.date).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'numeric'})}</div>`:'Kein weiteres Gate'):'—';
     return `<tr><td><strong>${esc(project.name)}</strong><div class="sub">${esc(project.number)} ${sharePointLink(project)}</div></td><td>${projectStatusBadge(project)}</td><td>${esc(person(project.person)?.name||'Nicht zugewiesen')}</td><td>${current}</td><td>${next}</td><td>${totals(project).toLocaleString('de-AT')} h</td></tr>`;
   }).join('')}</tbody></table></div>`;
}
function projectStatusBadge(project) {
 const kind=project.status==='Gewonnen'?'success':project.status==='Erwartet'?'warning':'neutral';
 return `<span class="pt-status pt-status--${kind}">${esc(project.status||'Status offen')}</span>`;
}
function totals(p){return p.budget+(p.changes||[]).reduce((a,c)=>a+c.hours,0)}
let saveQueue=Promise.resolve(); let saveBlocked=false;
function save(){let snapshot=JSON.stringify(state);saveQueue=saveQueue.then(async()=>{if(saveBlocked)return;let data=JSON.parse(snapshot);data._revision=revision;let r=await fetch(apiUrl,{method:'POST',headers:{'Content-Type':'application/json','X-Kapa-Token':writeToken},body:JSON.stringify(data)});if(!r.ok){let e=await r.json().catch(()=>({}));throw Error(e.error||'Speichern fehlgeschlagen')}revision=(await r.json()).revision}).catch(e=>{saveBlocked=true;alert('Nicht gespeichert: '+e.message+' Bitte Daten sichern und die Anwendung neu laden.')});return saveQueue}
function persist(){save();render()}
function openModal(title, body, footer, size='wide') {
 const modal = $('#modal');
 modal.classList.toggle('pt-dialog--wide', size === 'wide');
 modal.classList.toggle('pt-dialog--form', size === 'form');
 $('#modal-title').textContent = title;
 $('#dialogContent').innerHTML = body;
 $('#dialogActions').innerHTML = footer || '';
 applyKit();
 modal.showModal();
 window.PolytecUI?.enhancePolytecSelects(modal);
}
function closeModal(){$('#modal').close()}
function field(label,name,value,type='text',extra=''){return `<div class="field pt-field"><label class="pt-field__label" for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`}
function init(){state={version:2,fte:40,favorite:[20,20,20,40],roles:[{id:'project-manager',name:'Projektleiter'},{id:'qvp',name:'QVP'}],people:[],projects:[]};render()}
function render(){document.querySelectorAll('.ops-navigation-item,.ops-mobile-navigation__item').forEach(b=>{let active=b.hash==='#'+page;b.classList.toggle('is-active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});$('#title').textContent=({overview:'Übersicht',projects:'Projekte',people:'Personen',settings:'Einstellungen',detail:'Projektplanung'})[page];$('#content').innerHTML=({overview:overview,projects:projects,people:people,settings:settings,detail:detail})[page]();applyKit()}
function currentPeriod(){let d=mode==='week'?addDays(monday(new Date()),offset*7):new Date(new Date().getFullYear(),new Date().getMonth()+offset,1);return d}
function periodLabel(d){return mode==='week'?`${fmt(iso(d))} – ${fmt(iso(addDays(d,6)))}`:d.toLocaleDateString('de-AT',{month:'long',year:'numeric'})}
function capacityRows(forecast=null) {
 const model=forecast||KapaCapacity.build(state,currentPeriod(),mode,1);
 return model.people.map(row=>({u:row.person,load:row.cells[0].load,cap:row.cells[0].capacity,pct:row.cells[0].ratio,overloaded:row.cells[0].overloaded}));
}
function overview(){let horizon=forecastHorizon(currentPeriod(),mode,forecastCounts[mode],state.projects),forecast=KapaCapacity.build(state,currentPeriod(),mode,horizon.count),rows=capacityRows(forecast),over=rows.filter(x=>x.overloaded), sum=state.projects.reduce((a,p)=>a+totals(p),0),d=currentPeriod();return `<div class="hero"><div><h2>Kapazität im Blick</h2><p>Projektübergreifende Auslastung und verfügbare Kapazität</p></div><div class="toolbar">${forecastGrainSelector()}</div></div><div class="grid"><div class="card"><div class="label">Aktive Projekte</div><div class="value">${state.projects.length}</div><div class="caption">in der Planung</div></div><div class="card"><div class="label">Teammitglieder</div><div class="value">${state.people.length}</div><div class="caption">mit hinterlegter Kapazität</div></div><div class="card"><div class="label">Projektbudget</div><div class="value">${sum.toLocaleString('de-AT')} <small>h</small></div><div class="caption">inklusive Planwertänderungen</div></div><div class="card ${over.length?'alert':''}"><div class="label">Überlastet</div><div class="value">${over.length}</div><div class="caption">Personen im gewählten Zeitraum</div></div></div><div class="spacer"></div>${capacityForecast(forecast,horizon.truncated)}<div class="layout"><section class="panel"><div class="panelhead"><div><span class="section-kicker">TEAMÜBERSICHT</span><h2>Auslastung nach Person</h2></div><div class="row"><button class="smallbtn" onclick="shift(-1)">‹</button><b class="quiet nowrap">${periodLabel(d)}</b><button class="smallbtn" onclick="shift(1)">›</button></div></div><div class="tablewrap"><table><thead><tr><th>Person</th><th>Geplant / Kapazität</th><th>Auslastung</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td><div class="person"><span class="avatar">${esc(x.u.name.slice(0,1).toUpperCase())}</span><div><strong>${esc(x.u.name)}</strong><div class="sub">${esc(roleName(x.u.roleId))} · ${x.u.fte} % FTE</div></div></div></td><td>${Math.round(x.load)} / ${Math.round(x.cap)} h</td><td><div class="row"><div class="bar"><span class="${x.overloaded?'over':''}" style="width:${Math.min(x.pct,100)}%"></span></div><b>${KapaCapacity.percent(x.pct)} %</b></div></td><td><span class="pt-status pt-status--${x.overloaded?'danger':'success'}">${x.overloaded?'Überlastet':'Im Rahmen'}</span></td></tr>`).join('')}</tbody></table>${rows.length?'':'<div class="empty">Noch keine Personen angelegt.</div>'}</div></section><section class="panel"><div class="panelhead"><div><span class="section-kicker">PORTFOLIO</span><h2>Projekte</h2></div><button class="link" onclick="go('projects')">Alle ansehen →</button></div>${portfolioTable()}</section></div><div class="spacer"></div><div class="notice">Die Auslastung zeigt Planstunden. SAP-Buchungen und Abwesenheiten sind in dieser Version noch nicht berücksichtigt.</div>`}
function projects(){return `<div class="hero"><div><h2>Projektportfolio</h2><p>${state.projects.length} Projekte in der Planung</p></div></div><div class="projectcards">${state.projects.map(p=>`<article class="card projectcard" onclick="showProject('${p.id}')">${projectStatusBadge(p)}<h3>${esc(p.name)}</h3><div class="muted">${esc(p.number)} ${sharePointLink(p)}</div>${gateStatusView(p)}<div class="bottom"><span>${esc(person(p.person)?.name||'Nicht zugewiesen')}</span><b>${totals(p)} h</b></div><div class="sub">${fmt(p.dates[0])} – ${fmt(p.dates[4])}</div></article>`).join('')||'<div class="panel empty">Noch keine Projekte. Über „Projekt anlegen“ geht es los.</div>'}</div>`}
function people(){return `<div class="hero"><div><h2>Personen und Kapazität</h2><p>Grundlage für die projektübergreifende Auslastung</p></div><button class="primary" onclick="editPerson()">＋ Person anlegen</button></div><section class="panel"><div class="tablewrap"><table><thead><tr><th>Name</th><th>Rolle</th><th>FTE</th><th>Stunden / Woche</th><th></th></tr></thead><tbody>${state.people.map(u=>`<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(roleName(u.roleId))}</td><td>${u.fte} %</td><td>${(state.fte*u.fte/100).toLocaleString('de-AT')} h</td><td><button class="link" onclick="editPerson('${u.id}')">Bearbeiten</button></td></tr>`).join('')}</tbody></table>${state.people.length?'':'<div class="empty">Noch keine Personen angelegt.</div>'}</div></section>`}
function roleName(id) { return state.roles.find(role => role.id === id)?.name || 'Unbekannte Rolle'; }
function roleOptions(selectedId) {
 return state.roles.map(role => `<option value="${esc(role.id)}" ${role.id === selectedId ? 'selected' : ''}>${esc(role.name)}</option>`).join('');
}
function roleSettings() {
 return `<section class="panel" aria-labelledby="roles-heading">
   <div class="panelhead"><h2 id="roles-heading">Rollen</h2><button class="secondary" onclick="editRole()">Rolle hinzufügen</button></div>
   <div class="tablewrap"><table><thead><tr><th>Rolle</th><th>Zugewiesene Personen</th><th></th></tr></thead><tbody>
   ${state.roles.map(role => `<tr><td>${esc(role.name)}</td><td>${state.people.filter(person => person.roleId === role.id).length}</td><td><button class="link" aria-label="Rolle ${esc(role.name)} bearbeiten" onclick="editRole('${role.id}')">Bearbeiten</button></td></tr>`).join('')}
   </tbody></table></div>
 </section>`;
}
function settings(){return `<div class="split"><section class="panel"><h2>Kapazität</h2><p class="muted">Wochenstunden für 100 % FTE</p><div class="row"><input id="fte" type="number" min="1" max="168" value="${state.fte}"><button class="primary" onclick="saveSettings()">Speichern</button></div></section><section class="panel"><h2>Favorit für Gate-Verteilung</h2><p class="muted">Standardwerte für neue oder bestehende Projekte</p><div class="phasegrid">${phases.map((n,i)=>field(n+' (%)','fav'+i,state.favorite[i],'number','min="0" max="100" step="1"')).join('')}</div><div class="spacer"></div><button class="secondary" onclick="saveFavorite()">Favorit speichern</button></section></div><div class="spacer"></div>${roleSettings()}<div class="spacer"></div><section class="panel"><h2>Datensicherung und SAP</h2><p class="muted">Die Planung liegt lokal in planung.json. Eine Sicherung kann als JSON exportiert und wiederhergestellt werden.</p><div class="actions"><button class="secondary" onclick="exportData()">Sicherung exportieren</button><button class="secondary" onclick="$('#restore').click()">Sicherung wiederherstellen</button><input id="restore" type="file" accept="application/json" hidden onchange="restoreData(this)"></div><p class="quiet">SAP-Import und Ist-Stunden sind für einen späteren Ausbauschritt vorgesehen.</p></section>`}
function detail(){let p=state.projects.find(x=>x.id===selected);if(!p)return projects();let sched=schedule(p),ph=KapaHours.phaseBudgets(p),add=(p.changes||[]).reduce((a,c)=>a+c.hours,0);return `<div class="detailtop"><div><button class="link" onclick="go('projects')">← Alle Projekte</button><h2>${esc(p.name)} ${projectStatusBadge(p)}</h2><p class="muted">${esc(p.number)} · ${esc(person(p.person)?.name||'Nicht zugewiesen')} ${sharePointLink(p)}</p>${gateStatusView(p)}</div><div class="actions"><button class="secondary" onclick="editProject('${p.id}')">Bearbeiten</button><button class="primary" onclick="changeBudget('${p.id}')">＋ Planwertänderung</button></div></div><div class="grid"><div class="card"><div class="label">Basisbudget</div><div class="value">${p.budget} h</div></div><div class="card"><div class="label">Planwertänderungen</div><div class="value">+ ${add} h</div></div><div class="card"><div class="label">Gesamtbudget</div><div class="value">${totals(p)} h</div></div><div class="card"><div class="label">Geplant</div><div class="value">${sched.reduce((a,w)=>a+w.total,0)} h</div></div></div><div class="spacer"></div><section class="panel"><div class="panelhead"><div><span class="section-kicker">BUDGETVERTEILUNG</span><h2>Zwischen den Gates</h2></div><span class="quiet">Basisbudget · ${p.percent.reduce((a,b)=>a+b,0)} %</span></div><div class="phasegrid">${phases.map((n,i)=>`<div><span class="quiet">${n}</span><h2>${p.percent[i]} % <span class="quiet">/ ${ph[i]} h</span></h2><div class="sub">${fmt(p.dates[i])} – ${fmt(p.dates[i+1])}</div></div>`).join('')}</div></section><div class="spacer"></div>${projectHoursSection(p)}<div class="spacer"></div><section class="panel"><div class="panelhead"><h2>Planwertänderungen</h2></div>${(p.changes||[]).map(c=>`<div class="panelhead"><div><b>+ ${c.hours} h</b> <span class="quiet">ab ${fmt(c.date)}</span><div class="sub">${esc(c.note||'Keine Bemerkung')}</div></div><button class="link" onclick="removeChange('${p.id}','${c.id}')">Entfernen</button></div>`).join('')||'<div class="quiet">Noch keine Änderungen erfasst.</div>'}</section>`}
function go(p){page=p;location.hash=p;render()}function showProject(id){selected=id;detailGranularity=null;page='detail';render()}function setMode(m){mode=m;offset=0;render()}function shift(n){offset+=n;render()}
function editPerson(id) {
 const person = state.people.find(item => item.id === id) || {name:'',roleId:state.roles[0].id,fte:100};
 const form = `<form id="personForm" class="formgrid" onsubmit="event.preventDefault();submitPerson('${id || ''}')">
   ${field('Name','name',person.name,'text','required maxlength="100"')}
   <div class="field pt-field"><label class="pt-field__label" for="roleId">Rolle</label>
   <select id="roleId" name="roleId" class="pt-select" required aria-describedby="role-help">${roleOptions(person.roleId)}</select>
   <div class="pt-field__help" id="role-help">Rollen kannst du unter Einstellungen verwalten.</div></div>
   ${field('Beschäftigungsgrad (% FTE)','fteValue',person.fte,'number','required min="1" max="100" step="1"')}
 </form>`;
 const actions = `${id ? `<button class="danger" onclick="deletePerson('${id}')">Löschen</button>` : ''}
   <button class="secondary" onclick="closeModal()">Abbrechen</button>
   <button class="primary" type="submit" form="personForm">Speichern</button>`;
 openModal(id ? 'Person bearbeiten' : 'Person anlegen', form, actions, 'form');
}
function submitPerson(id) {
 const form = $('#personForm');
 if (!form.reportValidity()) return;
 const roleId = form.elements.roleId.value;
 if (!state.roles.some(role => role.id === roleId)) return alert('Bitte eine vorhandene Rolle auswählen.');
 const person = {id:id || uid(),name:form.elements.name.value.trim(),roleId,fte:Number(form.elements.fteValue.value)};
 if (!person.name) return alert('Bitte einen Namen eingeben.');
 if (id) Object.assign(state.people.find(item => item.id === id), person);
 else state.people.push(person);
 closeModal();
 persist();
}
function editRole(id) {
 const role = state.roles.find(item => item.id === id);
 if (id && !role) return alert('Die Rolle ist nicht mehr vorhanden. Bitte neu laden.');
 openModal(id ? 'Rolle bearbeiten' : 'Rolle hinzufügen',
   `<form id="roleForm" onsubmit="event.preventDefault();submitRole('${id || ''}')">${field('Bezeichnung','roleName',role?.name || '', 'text','required maxlength="100"')}</form>`,
   `<button class="secondary" onclick="closeModal()">Abbrechen</button><button class="primary" type="submit" form="roleForm">Speichern</button>`, 'form');
}
function submitRole(id) {
 const form = $('#roleForm');
 if (!form.reportValidity()) return;
 const name = form.elements.roleName.value.trim();
 if (!name) return alert('Bitte eine Rollenbezeichnung eingeben.');
 const comparable = value => value.toLocaleLowerCase('de-AT').replaceAll('ß','ss');
 if (state.roles.some(role => role.id !== id && comparable(role.name) === comparable(name))) return alert('Diese Rollenbezeichnung ist bereits vorhanden.');
 if (id) {
   const role = state.roles.find(item => item.id === id);
   if (!role) return alert('Die Rolle ist nicht mehr vorhanden.');
   role.name = name;
 } else {
   if (state.roles.length >= 100) return alert('Es können höchstens 100 Rollen angelegt werden.');
   state.roles.push({id:uid(),name});
 }
 closeModal();
 persist();
}
function deletePerson(id){if(state.projects.some(p=>p.person===id))return alert('Diese Person ist noch einem Projekt zugewiesen. Bitte zuerst die Zuweisung ändern.');if(confirm('Person wirklich löschen?')){state.people=state.people.filter(x=>x.id!==id);closeModal();persist()}}
function editProject(id){let p=state.projects.find(x=>x.id===id)||{name:'',number:'',status:'Gewonnen',person:'',budget:800,percent:[...state.favorite],dates:['2026-01-01','2026-04-01','2026-07-01','2027-01-01','2027-07-01']};openModal(id?'Projekt bearbeiten':'Projekt anlegen',`<form id="projectForm"><div class="formgrid">${field('Projektname','name',p.name,'text','required maxlength="100"')}${field('Projektnummer','number',p.number,'text','required maxlength="60"')}<div class="field pt-field"><label class="pt-field__label" for="status">Status</label><select name="status" id="status"><option ${p.status==='Gewonnen'?'selected':''}>Gewonnen</option><option ${p.status==='Erwartet'?'selected':''}>Erwartet</option></select></div><div class="field pt-field"><label class="pt-field__label" for="person">Verantwortliche Person</label><select name="person" id="person"><option value="">Noch nicht zugewiesen</option>${state.people.map(u=>`<option value="${u.id}" ${p.person===u.id?'selected':''}>${esc(u.name)} · ${esc(roleName(u.roleId))}</option>`).join('')}</select></div>${field('Basisbudget (Stunden)','budget',p.budget,'number','required min="0" max="1000000" step="1"')}</div><div class="spacer"></div><h3>Gate-Termine</h3><p class="quiet">Gate 8 ist das exklusive Projektende. Termine müssen aufsteigend sein. Bestehende Stundenverläufe werden bei geänderten Terminen oder Budgets passend umverteilt.</p><div class="formgrid">${gates.map((g,i)=>field(g,'date'+i,p.dates[i],'date','required')).join('')}</div><div class="spacer"></div><div class="panelhead"><h3>Verteilung des Basisbudgets</h3><button type="button" class="link" onclick="applyFavorite()">★ Favorit anwenden</button></div><div class="phasegrid">${phases.map((g,i)=>field(g+' (%)','pct'+i,p.percent[i],'number','required min="0" max="100" step="1"')).join('')}</div><p class="quiet">Die Summe muss 100 % ergeben.</p></form>`,`<button class="secondary" onclick="closeModal()">Abbrechen</button>${id?`<button class="danger" onclick="deleteProject('${id}')">Löschen</button>`:''}<button class="primary" onclick="submitProject('${id||''}')">Speichern</button>`)}
function applyFavorite(){state.favorite.forEach((n,i)=>$('#pct'+i).value=n)}
function submitProject(id){let f=$('#projectForm');if(!f.reportValidity())return;let dates=gates.map((_,i)=>f.elements['date'+i].value), percent=phases.map((_,i)=>Number(f.elements['pct'+i].value)), name=f.elements.name.value.trim(),number=f.elements.number.value.trim();if(!name||!number)return alert('Bitte Projektname und Projektnummer eingeben.');if(dates.some((d,i)=>i&&d<=dates[i-1]))return alert('Die Gate-Termine müssen streng aufsteigend sein.');if((date(dates[4])-date(dates[0]))/86400000>3653)return alert('Der Planungszeitraum darf höchstens zehn Jahre umfassen.');if(percent.reduce((a,b)=>a+b,0)!==100)return alert('Die Gate-Verteilung muss genau 100 % ergeben.');let old=state.projects.find(x=>x.id===id);if(old?.changes?.some(c=>c.date<dates[0]||c.date>=dates[4]))return alert('Eine Planwertänderung liegt außerhalb der neuen Gate-Termine. Bitte zuerst die Änderung entfernen.');let p={...old,id:id||uid(),name,number,status:f.elements.status.value,person:f.elements.person.value,budget:Number(f.elements.budget.value),dates,percent,weights:old?.weights||{},changes:old?.changes||[]};if(p.hourPlan){p.hourPlan=KapaHours.reconcile(p);delete p.weights;}if(schedule(p).reduce((a,w)=>a+w.total,0)!==totals(p))return alert('Die Stunden konnten für die neuen Gate-Termine nicht vollständig verteilt werden. Bitte die Feinplanung prüfen.');if(id)Object.assign(old,p);else state.projects.push(p);closeModal();selected=p.id;page='detail';persist()}
function deleteProject(id){if(confirm('Projekt und seine gesamte Planung wirklich löschen?')){state.projects=state.projects.filter(p=>p.id!==id);closeModal();page='projects';persist()}}
function changeBudget(id){let p=state.projects.find(x=>x.id===id),d=today<p.dates[0]?p.dates[0]:today>=p.dates[4]?p.dates[0]:today;openModal('Planwertänderung erfassen',`<p class="quiet">Die zusätzlichen Stunden werden ab dem Datum bis Gate 8 entsprechend den verbleibenden Basisstunden verteilt. Vorhandene Belastungsspitzen werden berücksichtigt.</p><form id="changeForm" class="formgrid">${field('Zusätzliche Stunden','hours',100,'number','required min="1" max="1000000" step="1"')}${field('Gültig ab','date',d,'date',`required min="${p.dates[0]}" max="${iso(addDays(date(p.dates[4]),-1))}"`)}${field('Bemerkung','note','','text','maxlength="200"')}</form>`,`<button class="secondary" onclick="closeModal()">Abbrechen</button><button class="primary" onclick="submitChange('${id}')">Hinzufügen</button>`)}
function submitChange(id){let f=$('#changeForm');if(!f.reportValidity())return;let p=state.projects.find(x=>x.id===id),c={id:uid(),hours:Number(f.elements.hours.value),date:f.elements.date.value,note:f.elements.note.value.trim()};let test={...p,hourPlan:KapaHours.reconcile(p),changes:[...(p.changes||[]),c]};if(schedule(test).reduce((a,w)=>a+w.total,0)!==totals(p)+c.hours)return alert('Ab diesem Datum muss bis Gate 8 mindestens ein planbarer Tag verbleiben.');p.changes.push(c);p.hourPlan=KapaHours.reconcile(test);delete p.weights;closeModal();persist()}
function removeChange(id,cid){if(confirm('Planwertänderung wirklich entfernen?')){let p=state.projects.find(x=>x.id===id);p.changes=p.changes.filter(c=>c.id!==cid);if(p.hourPlan)p.hourPlan=KapaHours.reconcile(p);persist()}}
function saveSettings(){let n=Number($('#fte').value);if(!Number.isFinite(n)||n<=0||n>168)return alert('Bitte gültige Wochenstunden zwischen 1 und 168 eingeben.');state.fte=n;persist()}
function saveFavorite(){let a=phases.map((_,i)=>Number($('#fav'+i).value));if(a.some(n=>!Number.isInteger(n)||n<0||n>100)||a.reduce((a,b)=>a+b,0)!==100)return alert('Bitte ganze Prozentwerte mit einer Summe von 100 % eingeben.');state.favorite=a;persist()}
function exportData(){let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));a.download='kapazitaetsplanung-sicherung.json';a.click();URL.revokeObjectURL(a.href)}
async function restoreData(input) {
 const file = input.files[0];
 if (!file) return;
 try {
   const source = JSON.parse(await file.text());
   const response = await fetch(importUrl, {method:'POST',headers:{'Content-Type':'application/json','X-Kapa-Token':writeToken},body:JSON.stringify(source)});
   const prepared = await response.json();
   if (!response.ok) throw Error(prepared.error || 'Die Sicherung konnte nicht gelesen werden.');
   if (!Array.isArray(prepared.favorite) || !Number.isFinite(prepared.fte)) throw Error('Die Datei ist keine gültige Sicherung.');
   if (confirm('Die aktuelle Planung durch die Sicherung ersetzen?')) {
     state = prepared;
     state._revision = revision;
     page = 'overview';
     persist();
   }
 } catch (error) { alert('Wiederherstellen fehlgeschlagen: ' + error.message); }
 input.value = '';
}
function scheduleGateDateRefresh() {
 if(typeof window.setTimeout!=='function') return;
 const now=new Date(), next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,1);
 window.setTimeout(()=>{if(state&&['overview','projects','detail'].includes(page))render();scheduleGateDateRefresh()},next.getTime()-now.getTime());
}
scheduleGateDateRefresh();
$('#newProject').onclick=()=>editProject(); window.addEventListener('hashchange',()=>{let p=location.hash.slice(1);if(['overview','projects','people','settings'].includes(p)){page=p;render()}});document.addEventListener('ops:refresh',e=>{e.preventDefault();location.reload()});
fetch(apiUrl).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{if(data&&data.version===2){state=data;revision=data._revision||0;render()}else if(data===null)init();else throw Error()}).catch(()=>{$('#content').innerHTML='<div class="notice">Die lokalen Daten konnten nicht geladen werden. Bitte Anwendung neu starten und die Datendatei prüfen.</div>'});

function applyKit(){document.querySelectorAll('#kapa-app button,#modal button').forEach(b=>{if(b.classList.contains('pt-button') || b.classList.contains('pt-icon-button'))return;b.classList.add('pt-button');b.classList.add(b.classList.contains('primary')?'pt-button--primary':b.classList.contains('danger')?'pt-button--danger':'pt-button--secondary')});document.querySelectorAll('#kapa-app input,#modal input').forEach(x=>x.classList.add('pt-input'));document.querySelectorAll('#kapa-app select,#modal select').forEach(x=>x.classList.add('pt-select'));document.querySelectorAll('#kapa-app table,#modal table').forEach(x=>x.classList.add('pt-table'));document.querySelectorAll('#kapa-app .tag').forEach(x=>x.classList.add('pt-status','pt-status--neutral'))}
