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
function projectLeadNames(project) {
 const first=person(project.person)?.name||'Nicht zugewiesen';
 if(!project.secondPerson)return esc(first);
 const share=Number(project.leadPercent), second=person(project.secondPerson)?.name||'Nicht zugewiesen';
 return `${esc(first)} (${share} %) · ${esc(second)} (${100-share} %)`;
}
function projectQvpName(project) { return esc(person(project.qvpPerson)?.name||'Nicht zugewiesen'); }
function projectTotal(project) { return totals(project)+(Number(project.qvpBudget)||0); }
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
   <thead><tr><th scope="col">Projekt</th><th scope="col">Status</th><th scope="col">PL</th><th scope="col">QVP</th><th scope="col">Gate-Status (Plan)</th><th scope="col">Nächstes Gate</th><th scope="col">Budget</th></tr></thead>
   <tbody>${projects.map(project=>{
     const gate=gateStatus(project);
     const current=gate.valid?`<span class="pt-status pt-status--neutral">${esc(gate.current)}</span>`:'<span class="quiet">Gate-Termine prüfen</span>';
     const next=gate.valid?(gate.next?`<strong>${esc(gate.next.name)}</strong><div class="sub">${date(gate.next.date).toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'numeric'})}</div>`:'Kein weiteres Gate'):'—';
     return `<tr><td><strong>${esc(project.name)}</strong><div class="sub">${esc(project.number)} ${sharePointLink(project)}</div></td><td>${projectStatusBadge(project)}</td><td>${projectLeadNames(project)}</td><td>${projectQvpName(project)}</td><td>${current}</td><td>${next}</td><td>${projectTotal(project).toLocaleString('de-AT')} h</td></tr>`;
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
function render(){document.querySelectorAll('.ops-navigation-item,.ops-mobile-navigation__item').forEach(b=>{let active=b.hash==='#'+page;b.classList.toggle('is-active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});$('#title').textContent=({overview:'Übersicht',projects:'Projekte',people:'Personen',settings:'Einstellungen',detail:'Projektplanung'})[page];$('#content').classList.toggle('kapa-overview',page==='overview');$('#content').innerHTML=({overview:overview,projects:projects,people:people,settings:settings,detail:detail})[page]();applyKit()}
function currentPeriod(){let d=mode==='week'?addDays(monday(new Date()),offset*7):new Date(new Date().getFullYear(),new Date().getMonth()+offset,1);return d}
function periodLabel(d){return mode==='week'?`${fmt(iso(d))} – ${fmt(iso(addDays(d,6)))}`:d.toLocaleDateString('de-AT',{month:'long',year:'numeric'})}
function capacityRows(forecast=null) {
 const model=forecast||KapaCapacity.build(state,currentPeriod(),mode,1);
 return model.people.map(row=>({u:row.person,load:row.cells[0].load,cap:row.cells[0].capacity,pct:row.cells[0].ratio,overloaded:row.cells[0].overloaded}));
}
function overview(){let horizon=forecastHorizon(currentPeriod(),mode,forecastCounts[mode],state.projects),forecast=KapaCapacity.build(state,currentPeriod(),mode,horizon.count),rows=capacityRows(forecast),over=rows.filter(x=>x.overloaded), plHours=state.projects.reduce((a,p)=>a+totals(p),0),qvpHours=state.projects.reduce((a,p)=>a+(Number(p.qvpBudget)||0),0),sum=plHours+qvpHours,wonBudget=state.projects.filter(p=>p.status==='Gewonnen').reduce((n,p)=>n+projectTotal(p),0),expectedBudget=state.projects.filter(p=>p.status==='Erwartet').reduce((n,p)=>n+projectTotal(p),0),d=currentPeriod();return `<div class="hero"><div><h2>Kapazität im Blick</h2><p>Projektübergreifende Auslastung und verfügbare Kapazität</p></div><div class="toolbar">${forecastGrainSelector()}</div></div><div class="grid"><div class="card"><div class="label">Aktive Projekte</div><div class="value">${state.projects.length}</div><div class="caption">in der Planung</div></div><div class="card"><div class="label">Teammitglieder</div><div class="value">${state.people.length}</div><div class="caption">mit hinterlegter Kapazität</div></div><div class="card"><div class="label">Projektbudget</div><div class="value">${sum.toLocaleString('de-AT')} <small>h</small></div><div class="caption">PL: ${plHours.toLocaleString('de-AT')} h · QVP: ${qvpHours.toLocaleString('de-AT')} h</div></div><div class="card"><div class="label">Gewonnene Projektstunden</div><div class="value">${wonBudget.toLocaleString('de-AT')} <small>h</small></div><div class="caption">Gesamtbudget · ${periodLabel(d)}: ${(forecast.portfolio[0]?.won||0).toLocaleString('de-AT')} h</div></div><div class="card"><div class="label">Erwartete Projektstunden</div><div class="value">${expectedBudget.toLocaleString('de-AT')} <small>h</small></div><div class="caption">Gesamtbudget · ${periodLabel(d)}: ${(forecast.portfolio[0]?.expected||0).toLocaleString('de-AT')} h</div></div><div class="card ${over.length?'alert':''}"><div class="label">Überlastet</div><div class="value">${over.length}</div><div class="caption">Gesamtes Team im gewählten Zeitraum</div></div></div><div class="spacer"></div>${sapOverview()}<div class="spacer"></div>${capacityForecast(forecast,horizon.truncated)}<div class="layout"><section class="panel"><div class="panelhead"><div><span class="section-kicker">TEAMÜBERSICHT</span><h2>Auslastung nach Person</h2></div><div class="row"><button class="smallbtn" onclick="shift(-1)">‹</button><b class="quiet nowrap">${periodLabel(d)}</b><button class="smallbtn" onclick="shift(1)">›</button></div></div><div class="tablewrap"><table><thead><tr><th>Person</th><th>Geplant / Kapazität</th><th>Auslastung</th><th>Status</th></tr></thead><tbody>${rows.map(x=>`<tr><td><div class="person"><span class="avatar">${esc(x.u.name.slice(0,1).toUpperCase())}</span><div><button type="button" class="pt-button pt-button--subtle kapa-person-select" data-person-id="${esc(x.u.id)}" aria-pressed="${forecastFilter.type==='person'&&forecastFilter.id===x.u.id}" onclick="selectForecastPerson(this.dataset.personId)">${esc(x.u.name)}</button><div class="sub">${esc(roleName(x.u.roleId))} · ${x.u.fte} % FTE</div></div></div></td><td>${Math.round(x.load)} / ${Math.round(x.cap)} h</td><td><div class="row"><div class="bar"><span class="${x.overloaded?'over':''}" style="width:${Math.min(x.pct,100)}%"></span></div><b>${KapaCapacity.percent(x.pct)} %</b></div></td><td><span class="pt-status pt-status--${x.overloaded?'danger':'success'}">${x.overloaded?'Überlastet':'Im Rahmen'}</span></td></tr>`).join('')}</tbody></table>${rows.length?'':'<div class="empty">Noch keine Personen angelegt.</div>'}</div></section><section class="panel"><div class="panelhead"><div><span class="section-kicker">PORTFOLIO</span><h2>Projekte</h2></div><button class="link" onclick="go('projects')">Alle ansehen →</button></div>${portfolioTable()}</section></div><div class="spacer"></div><div class="notice">Die Auslastung zeigt Planstunden. SAP-Buchungen und Abwesenheiten sind in dieser Version noch nicht berücksichtigt.</div>`}
function sortedProjectsByNextGate(projects, onDate=iso(new Date())) {
 return projects.map((project,index)=>({project,index,next:gateStatus(project,onDate).next?.date||null}))
   .sort((a,b)=>a.next&&b.next?a.next.localeCompare(b.next)||a.index-b.index:a.next?-1:b.next?1:a.index-b.index)
   .map(item=>item.project);
}
function projects(){
 const groups=[['Gewonnen',state.projects.filter(p=>p.status==='Gewonnen')],['Erwartet',state.projects.filter(p=>p.status==='Erwartet')],['Weiterer Status',state.projects.filter(p=>p.status!=='Gewonnen'&&p.status!=='Erwartet')]];
 const content=groups.filter(([,items])=>items.length).map(([name,items])=>`<section class="kapa-project-group"><div class="kapa-project-group-heading"><h3>${name}</h3><span class="quiet">${items.length} ${items.length===1?'Projekt':'Projekte'}</span></div><div class="projectcards">${sortedProjectsByNextGate(items).map(p=>`<article class="card projectcard" onclick="showProject('${p.id}')">${projectStatusBadge(p)}<h3>${esc(p.name)}</h3><div class="muted">${esc(p.number)} ${sharePointLink(p)}</div>${gateStatusView(p)}<div class="bottom"><span>PL: ${projectLeadNames(p)}<br>QVP: ${projectQvpName(p)}</span><b>${projectTotal(p)} h</b></div><div class="sub">${fmt(p.dates[0])} – ${fmt(p.dates[4])}</div></article>`).join('')}</div></section>`).join('');
 return `<div class="hero"><div><h2>Projektportfolio</h2><p>${state.projects.length} Projekte in der Planung · sortiert nach nächstem Gate</p></div></div>${content||'<div class="panel empty">Noch keine Projekte. Über „Projekt anlegen“ geht es los.</div>'}`;
}
function people(){return `<div class="hero"><div><h2>Personen und Kapazität</h2><p>Grundlage für die projektübergreifende Auslastung</p></div><button class="primary" onclick="editPerson()">＋ Person anlegen</button></div><section class="panel"><div class="tablewrap"><table><thead><tr><th>Name</th><th>Rolle</th><th>FTE</th><th>Stunden / Woche</th><th></th></tr></thead><tbody>${state.people.map(u=>`<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(roleName(u.roleId))}</td><td>${u.fte} %</td><td>${(state.fte*u.fte/100).toLocaleString('de-AT')} h</td><td><button class="link" onclick="editPerson('${u.id}')">Bearbeiten</button></td></tr>`).join('')}</tbody></table>${state.people.length?'':'<div class="empty">Noch keine Personen angelegt.</div>'}</div></section>`}
function roleName(id) { return state.roles.find(role => role.id === id)?.name || 'Unbekannte Rolle'; }
function roleOptions(selectedId) {
 return state.roles.map(role => `<option value="${esc(role.id)}" ${role.id === selectedId ? 'selected' : ''}>${esc(role.name)}</option>`).join('');
}
function roleSettings() {
 return `<section class="panel" aria-labelledby="roles-heading">
   <div class="panelhead"><h2 id="roles-heading">Rollen</h2><button class="secondary" onclick="editRole()">Rolle hinzufügen</button></div>
   <div class="tablewrap"><table><thead><tr><th>Rolle</th><th>Produktivitätsziel</th><th>Zugewiesene Personen</th><th></th></tr></thead><tbody>
   ${state.roles.map(role => `<tr><td>${esc(role.name)}</td><td>${role.productivityTarget??80} %</td><td>${state.people.filter(person => person.roleId === role.id).length}</td><td><button class="link" aria-label="Rolle ${esc(role.name)} bearbeiten" onclick="editRole('${role.id}')">Bearbeiten</button></td></tr>`).join('')}
   </tbody></table></div>
 </section>`;
}
let favoriteRoleId='';
function favoriteForRole(roleId) {
 const favorite=(state.roleFavorites&&Object.prototype.hasOwnProperty.call(state.roleFavorites,roleId)?state.roleFavorites[roleId]:null)??state.favorite??[20,20,20,40];
 return [...favorite];
}
function favoriteSettings() {
 if(!state.roles.some(role=>role.id===favoriteRoleId)) favoriteRoleId=state.roles[0]?.id||'';
 const favorite=favoriteForRole(favoriteRoleId);
 return `<section class="panel"><h2>Favorit für Gate-Verteilung</h2><p class="muted">Standardwerte je Rolle für neue Projekte</p>
 <div class="kapa-favorite-row"><div class="pt-field"><label class="pt-field__label" for="favoriteRole">Rolle</label><select class="pt-select" id="favoriteRole" onchange="changeFavoriteRole(this.value)">${roleOptions(favoriteRoleId)}</select></div>${phases.map((n,i)=>field(n+' (%)','fav'+i,favorite[i],'number','min="0" max="100" step="1"')).join('')}<button class="secondary" onclick="saveFavorite()">Favorit speichern</button></div></section>`;
}
function changeFavoriteRole(roleId) {
 if(!state.roles.some(role=>role.id===roleId)) return;
 favoriteRoleId=roleId;
 favoriteForRole(roleId).forEach((value,index)=>$('#fav'+index).value=value);
}
function settings(){return `<div class="split">${favoriteSettings()}<section class="panel"><h2>Kapazität</h2><p class="muted">Wochenstunden für 100 % FTE</p><div class="row"><input id="fte" type="number" min="1" max="168" value="${state.fte}"><button class="primary" onclick="saveSettings()">Speichern</button></div></section></div><div class="spacer"></div>${roleSettings()}<div class="spacer"></div>${sapSettings()}<div class="spacer"></div><section class="panel"><span class="section-kicker">DATEN</span><h2>Datensicherung</h2><p class="muted">${appRoot.dataset.passwordUrl ? 'Die Planung wird auf dem Server gespeichert.' : 'Die Planung liegt lokal in planung.json.'} Eine Sicherung kann als JSON exportiert und wiederhergestellt werden.</p><div class="kapa-backup-actions"><button class="secondary" onclick="exportData()">Sicherung exportieren</button><button class="secondary" onclick="$('#restore').click()">Sicherung wiederherstellen</button><input id="restore" type="file" accept="application/json" hidden onchange="restoreData(this)"></div></section>`}
function detail(){let p=state.projects.find(x=>x.id===selected);if(!p)return projects();let ph=KapaHours.phaseBudgets(p),qph=KapaHours.phaseBudgets({...p,budget:Number(p.qvpBudget)||0,percent:p.qvpPercent??p.percent}),add=(p.changes||[]).reduce((a,c)=>a+c.hours,0);return `<div class="detailtop"><div><button class="link" onclick="go('projects')">← Alle Projekte</button><h2>${esc(p.name)} ${projectStatusBadge(p)}</h2><p class="muted">${esc(p.number)} · PL: ${projectLeadNames(p)} · QVP: ${projectQvpName(p)} ${sharePointLink(p)}</p>${gateStatusView(p)}</div><div class="actions"><button class="secondary" onclick="editProject('${p.id}')">Bearbeiten</button><button class="primary" onclick="changeBudget('${p.id}')">＋ PL-Planwertänderung</button></div></div><div class="grid"><div class="card"><div class="label">PL-Basisbudget</div><div class="value">${p.budget} h</div></div><div class="card"><div class="label">PL-Planwertänderungen</div><div class="value">+ ${add} h</div></div><div class="card"><div class="label">QVP-Budget</div><div class="value">${Number(p.qvpBudget)||0} h</div></div><div class="card"><div class="label">Gesamtbudget PL + QVP</div><div class="value">${projectTotal(p)} h</div></div></div><div class="spacer"></div><section class="panel"><div class="panelhead"><div><span class="section-kicker">BUDGETVERTEILUNG</span><h2>Zwischen den Gates</h2></div><span class="quiet">PL- und QVP-Basisbudget</span></div><div class="phasegrid">${phases.map((n,i)=>`<div><span class="quiet">${n}</span><h2>PL ${p.percent[i]} % <span class="quiet">/ ${ph[i]} h</span></h2><div class="sub">QVP ${(p.qvpPercent??p.percent)[i]} % / ${qph[i]} h</div><div class="sub">${fmt(p.dates[i])} – ${fmt(p.dates[i+1])}</div></div>`).join('')}</div></section><div class="spacer"></div>${sapProject(p)}<div class="spacer"></div>${projectHoursSection(p)}<div class="spacer"></div><section class="panel"><div class="panelhead"><h2>PL-Planwertänderungen</h2></div>${(p.changes||[]).map(c=>`<div class="panelhead"><div><b>+ ${c.hours} h</b> <span class="quiet">ab ${fmt(c.date)}</span><div class="sub">${esc(c.note||'Keine Bemerkung')}</div></div><button class="link" onclick="removeChange('${p.id}','${c.id}')">Entfernen</button></div>`).join('')||'<div class="quiet">Noch keine Änderungen erfasst.</div>'}</section>`}
function go(p){page=p;location.hash=p;render()}function showProject(id){selected=id;detailGranularity=null;page='detail';render()}function setMode(m){mode=m;offset=0;render()}function shift(n){offset+=n;render()}
function handleNavigationClick(event) {
 if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
 const link=event.target.closest?.('.ops-navigation-item, .ops-mobile-navigation__item');
 if(!link||link.origin!==location.origin||link.pathname!==location.pathname||link.search!==location.search||(link.target&&link.target!=='_self'))return;
 const destination=link.hash.slice(1);
 if(link.hash===location.hash&&page!==destination&&['overview','projects','people','settings'].includes(destination)) {
  event.preventDefault();
  page=destination;
  render();
 }
}
function editPerson(id) {
 const person = state.people.find(item => item.id === id) || {name:'',roleId:state.roles[0].id,fte:100};
 const form = `<form id="personForm" class="formgrid" onsubmit="event.preventDefault();submitPerson('${id || ''}')">
   ${field('Name','name',person.name,'text','required maxlength="100"')}
   <div class="field pt-field"><label class="pt-field__label" for="roleId">Rolle</label>
   <select id="roleId" name="roleId" class="pt-select" required aria-describedby="role-help">${roleOptions(person.roleId)}</select>
   <div class="pt-field__help" id="role-help">Rollen kannst du unter Einstellungen verwalten.</div></div>
   ${field('Beschäftigungsgrad (% FTE)','fteValue',person.fte,'number','required min="1" max="100" step="1"')}
   <div class="field pt-field"><label class="pt-field__label" for="personTarget">Produktivitätsziel (%)</label><input id="personTarget" name="personTarget" type="number" min="0" max="100" step="any" value="${person.productivityTarget??''}"><div class="pt-field__help">Leer lassen, um das Ziel der Rolle zu übernehmen.</div></div>
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
 const rawTarget=form.elements.personTarget?.value??'', target=rawTarget===''?null:Number(rawTarget);
 if(target!==null&&(!Number.isFinite(target)||target<0||target>100))return alert('Das Produktivitätsziel muss zwischen 0 und 100 % liegen.');
 const person = {id:id || uid(),name:form.elements.name.value.trim(),roleId,fte:Number(form.elements.fteValue.value),productivityTarget:target};
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
   `<form id="roleForm" class="kapa-project-form" onsubmit="event.preventDefault();submitRole('${id || ''}')">${field('Bezeichnung','roleName',role?.name || '', 'text','required maxlength="100"')}${field('Produktivitätsziel (%)','roleTarget',role?.productivityTarget??80,'number','required min="0" max="100" step="any"')}<p class="quiet">Anteil der FTE-Arbeitszeit, der für Projektarbeit vorgesehen ist.</p></form>`,
   `<button class="secondary" onclick="closeModal()">Abbrechen</button><button class="primary" type="submit" form="roleForm">Speichern</button>`, 'form');
}
function submitRole(id) {
 const form = $('#roleForm');
 if (!form.reportValidity()) return;
 const name = form.elements.roleName.value.trim();
 const target=Number(form.elements.roleTarget?.value??80);
 if(!Number.isFinite(target)||target<0||target>100)return alert('Das Produktivitätsziel muss zwischen 0 und 100 % liegen.');
 if (!name) return alert('Bitte eine Rollenbezeichnung eingeben.');
 const comparable = value => value.toLocaleLowerCase('de-AT').replaceAll('ß','ss');
 if (state.roles.some(role => role.id !== id && comparable(role.name) === comparable(name))) return alert('Diese Rollenbezeichnung ist bereits vorhanden.');
 if (id) {
   const role = state.roles.find(item => item.id === id);
   if (!role) return alert('Die Rolle ist nicht mehr vorhanden.');
   role.name = name;
   role.productivityTarget = target;
 } else {
   if (state.roles.length >= 100) return alert('Es können höchstens 100 Rollen angelegt werden.');
   state.roles.push({id:uid(),name,productivityTarget:target});
 }
 closeModal();
 persist();
}
function deletePerson(id){if(state.projects.some(p=>p.person===id||p.secondPerson===id||p.qvpPerson===id))return alert('Diese Person ist noch einem Projekt zugewiesen. Bitte zuerst die Zuweisung ändern.');if(confirm('Person wirklich löschen?')){state.people=state.people.filter(x=>x.id!==id);closeModal();persist()}}
function projectPersonOptions(selectedId, quality=false) {
 return state.people.filter(u=>(quality?u.roleId==='qvp':u.roleId!=='qvp')||u.id===selectedId)
  .map(u=>`<option value="${esc(u.id)}" ${selectedId===u.id?'selected':''}>${esc(u.name)} · ${esc(roleName(u.roleId))}</option>`).join('');
}
function updateLeadSplit() {
 const input=$('#leadPercent'), second=$('#secondPerson'), help=$('#splitHelp');
 if(!second.value){
  if(!input.readOnly) input.dataset.previousSplit=input.value;
  input.value='100';input.readOnly=true;
  help.textContent='Ohne zweiten Projektleiter übernimmt Projektleiter 1 den gesamten PL-Aufwand.';
  return;
 }
 if(input.readOnly){input.value=input.dataset.previousSplit||'50';input.readOnly=false;}
 const value=Number(input.value);
 help.textContent=Number.isInteger(value)&&value>=0&&value<=100?`Projektleiter 2 erhält ${100-value} % der PL-Stunden.`:'Bitte einen Anteil zwischen 0 und 100 % eingeben.';
}
function editProject(id){
 let p=state.projects.find(x=>x.id===id)||{name:'',number:'',status:'Gewonnen',person:'',budget:800,percent:favoriteForRole('project-manager'),qvpPercent:favoriteForRole('qvp'),dates:['2026-01-01','2026-04-01','2026-07-01','2027-01-01','2027-07-01']};
 const split=p.secondPerson?(p.leadPercent??50):100;
 openModal(id?'Projekt bearbeiten':'Projekt anlegen',`<form id="projectForm" class="kapa-project-form" data-new-project="${id?'false':'true'}"><section class="kapa-project-section"><h3>Projektdaten</h3><div class="formgrid">
 ${field('Projektname','name',p.name,'text','required maxlength="100"')}${field('Projektnummer','number',p.number,'text','required maxlength="60"')}
 <div class="field pt-field"><label class="pt-field__label" for="status">Status</label><select name="status" id="status"><option ${p.status==='Gewonnen'?'selected':''}>Gewonnen</option><option ${p.status==='Erwartet'?'selected':''}>Erwartet</option></select></div>
 </div></section><section class="kapa-project-section"><h3>Projektteam</h3><div class="formgrid">
 <div class="field pt-field"><label class="pt-field__label" for="person">Projektleiter 1</label><select name="person" id="person" onchange="applyAutomaticFavorite('pl')"><option value="">Noch nicht zugewiesen</option>${projectPersonOptions(p.person)}</select></div>
 <div class="field pt-field"><label class="pt-field__label" for="secondPerson">Projektleiter 2 (optional)</label><select name="secondPerson" id="secondPerson" onchange="updateLeadSplit()"><option value="">Kein zweiter Projektleiter</option>${projectPersonOptions(p.secondPerson)}</select></div>
 <div class="field pt-field"><label class="pt-field__label" for="leadPercent">Anteil Projektleiter 1 (%)</label><input id="leadPercent" name="leadPercent" type="number" min="0" max="100" step="1" required value="${split}" data-previous-split="${p.secondPerson?split:50}" ${p.secondPerson?'':'readonly'} oninput="updateLeadSplit()" aria-describedby="splitHelp"><div class="pt-field__help" id="splitHelp">${p.secondPerson?`Projektleiter 2 erhält ${100-split} % der PL-Stunden.`:'Ohne zweiten Projektleiter übernimmt Projektleiter 1 den gesamten PL-Aufwand.'}</div></div>
 <div class="field pt-field"><label class="pt-field__label" for="qvpPerson">QVP</label><select name="qvpPerson" id="qvpPerson" onchange="applyAutomaticFavorite('qvp')"><option value="">Noch nicht zugewiesen</option>${projectPersonOptions(p.qvpPerson,true)}</select></div>
 </div></section><section class="kapa-project-section"><h3>Stundenbudget</h3><div class="formgrid">
 ${field('PL-Stunden','budget',p.budget,'number','required min="0" max="1000000" step="1"')}${field('QVP-Stunden','qvpBudget',p.qvpBudget??0,'number','required min="0" max="1000000" step="1"')}
 </div><p class="quiet">QVP-Stunden kommen zu den PL-Stunden hinzu. Planwertänderungen und der bearbeitbare Stundenverlauf gelten für PL.</p></section>
 <section class="kapa-project-section"><h3>Gate-Termine</h3><p class="quiet">Termine aufsteigend eingeben; Gate 8 ist das Projektende. Bestehende Stundenverläufe werden bei Änderungen angepasst.</p><div class="kapa-gate-grid">${gates.map((g,i)=>field(g,'date'+i,p.dates[i],'date','required')).join('')}</div></section>
 <section class="kapa-project-section"><div class="panelhead"><h3>Gate-Verteilung PL</h3><button type="button" class="link" onclick="applyFavorite('pl')">★ PL-Favorit anwenden</button></div><div class="phasegrid">${phases.map((g,i)=>field(g+' (%)','pct'+i,p.percent[i],'number','required min="0" max="100" step="1" oninput="markFavoriteEdited(\'pl\')"')).join('')}</div><p class="quiet">Summe PL: 100 %. Der Favorit richtet sich nach der Rolle von Projektleiter 1.</p></section>
 <section class="kapa-project-section"><div class="panelhead"><h3>Gate-Verteilung QVP</h3><button type="button" class="link" onclick="applyFavorite('qvp')">★ QVP-Favorit anwenden</button></div><div class="phasegrid">${phases.map((g,i)=>field(g+' (%)','qvpPct'+i,(p.qvpPercent??p.percent)[i],'number','required min="0" max="100" step="1" oninput="markFavoriteEdited(\'qvp\')"')).join('')}</div><p class="quiet">Summe QVP: 100 %. Die Verteilung ist unabhängig von PL.</p></section></form>`,`<button class="secondary" onclick="closeModal()">Abbrechen</button>${id?`<button class="danger" onclick="deleteProject('${id}')">Löschen</button>`:''}<button class="primary" onclick="submitProject('${id||''}')">Speichern</button>`);
}
function markFavoriteEdited(kind){$('#projectForm').dataset[kind+'Edited']='true'}
function applyFavorite(kind='pl', mark=true){
 const id=kind==='qvp'?$('#qvpPerson').value:$('#person').value;
 const roleId=person(id)?.roleId||(kind==='qvp'?'qvp':'project-manager'), prefix=kind==='qvp'?'qvpPct':'pct';
 favoriteForRole(roleId).forEach((n,i)=>$('#'+prefix+i).value=n);
 if(mark) markFavoriteEdited(kind);
}
function applyAutomaticFavorite(kind){
 const form=$('#projectForm');
 if(form.dataset.newProject==='true'&&form.dataset[kind+'Edited']!=='true') applyFavorite(kind,false);
}
function submitProject(id){
 let f=$('#projectForm');if(!f.reportValidity())return;
 let dates=gates.map((_,i)=>f.elements['date'+i].value), percent=phases.map((_,i)=>Number(f.elements['pct'+i].value)), qvpPercent=phases.map((_,i)=>Number(f.elements['qvpPct'+i].value)), name=f.elements.name.value.trim(),number=f.elements.number.value.trim();
 const first=f.elements.person.value, second=f.elements.secondPerson.value, qvp=f.elements.qvpPerson.value, leadPercent=second?Number(f.elements.leadPercent.value):100, qvpBudget=Number(f.elements.qvpBudget.value);
 if(!name||!number)return alert('Bitte Projektname und Projektnummer eingeben.');
 if(second&&(!first||first===second||!person(first)||!person(second)))return alert('Bitte zwei unterschiedliche vorhandene Projektleiter auswählen.');
 if(!Number.isInteger(leadPercent)||leadPercent<0||leadPercent>100)return alert('Bitte einen Anteil zwischen 0 und 100 % eingeben.');
 if(!Number.isInteger(qvpBudget)||qvpBudget<0||qvpBudget>1000000||(qvp&&!person(qvp)))return alert('Bitte eine gültige QVP-Person und ein QVP-Budget in ganzen Stunden eingeben.');
 if(dates.some((d,i)=>i&&d<=dates[i-1]))return alert('Die Gate-Termine müssen streng aufsteigend sein.');
 if((date(dates[4])-date(dates[0]))/86400000>3653)return alert('Der Planungszeitraum darf höchstens zehn Jahre umfassen.');
 if(percent.reduce((a,b)=>a+b,0)!==100)return alert('Die Gate-Verteilung muss genau 100 % ergeben.');
 if(qvpPercent.some(value=>!Number.isInteger(value)||value<0||value>100)||qvpPercent.reduce((a,b)=>a+b,0)!==100)return alert('Die QVP-Gate-Verteilung muss genau 100 % ergeben.');
 let old=state.projects.find(x=>x.id===id);
 if(old?.changes?.some(c=>c.date<dates[0]||c.date>=dates[4]))return alert('Eine Planwertänderung liegt außerhalb der neuen Gate-Termine. Bitte zuerst die Änderung entfernen.');
 let p={...old,id:id||uid(),name,number,status:f.elements.status.value,person:first,secondPerson:second,leadPercent,qvpPerson:qvp,qvpBudget,budget:Number(f.elements.budget.value),dates,percent,qvpPercent,weights:old?.weights||{},changes:old?.changes||[]};
 if(p.hourPlan){p.hourPlan=KapaHours.reconcile(p);delete p.weights;}
 if(schedule(p).reduce((a,w)=>a+w.total,0)!==totals(p))return alert('Die Stunden konnten für die neuen Gate-Termine nicht vollständig verteilt werden. Bitte die Feinplanung prüfen.');
 if(id)Object.assign(old,p);else state.projects.push(p);closeModal();selected=p.id;page='detail';persist();
}
function deleteProject(id){if(confirm('Projekt und seine gesamte Planung wirklich löschen?')){state.projects=state.projects.filter(p=>p.id!==id);closeModal();page='projects';persist()}}
function changeBudget(id){let p=state.projects.find(x=>x.id===id),d=today<p.dates[0]?p.dates[0]:today>=p.dates[4]?p.dates[0]:today;openModal('PL-Planwertänderung erfassen',`<p class="quiet">Die zusätzlichen Stunden werden ab dem Datum bis Gate 8 entsprechend den verbleibenden Basisstunden verteilt. Vorhandene Belastungsspitzen werden berücksichtigt.</p><form id="changeForm" class="formgrid">${field('Zusätzliche Stunden','hours',100,'number','required min="1" max="1000000" step="1"')}${field('Gültig ab','date',d,'date',`required min="${p.dates[0]}" max="${iso(addDays(date(p.dates[4]),-1))}"`)}${field('Bemerkung','note','','text','maxlength="200"')}</form>`,`<button class="secondary" onclick="closeModal()">Abbrechen</button><button class="primary" onclick="submitChange('${id}')">Hinzufügen</button>`)}
function submitChange(id){let f=$('#changeForm');if(!f.reportValidity())return;let p=state.projects.find(x=>x.id===id),c={id:uid(),hours:Number(f.elements.hours.value),date:f.elements.date.value,note:f.elements.note.value.trim()};let test={...p,hourPlan:KapaHours.reconcile(p),changes:[...(p.changes||[]),c]};if(schedule(test).reduce((a,w)=>a+w.total,0)!==totals(p)+c.hours)return alert('Ab diesem Datum muss bis Gate 8 mindestens ein planbarer Tag verbleiben.');p.changes.push(c);p.hourPlan=KapaHours.reconcile(test);delete p.weights;closeModal();persist()}
function removeChange(id,cid){if(confirm('Planwertänderung wirklich entfernen?')){let p=state.projects.find(x=>x.id===id);p.changes=p.changes.filter(c=>c.id!==cid);if(p.hourPlan)p.hourPlan=KapaHours.reconcile(p);persist()}}
function saveSettings(){let n=Number($('#fte').value);if(!Number.isFinite(n)||n<=0||n>168)return alert('Bitte gültige Wochenstunden zwischen 1 und 168 eingeben.');state.fte=n;persist()}
function saveFavorite(){let roleId=$('#favoriteRole').value,a=phases.map((_,i)=>Number($('#fav'+i).value));if(!state.roles.some(role=>role.id===roleId))return alert('Bitte eine gültige Rolle auswählen.');if(a.some(n=>!Number.isInteger(n)||n<0||n>100)||a.reduce((a,b)=>a+b,0)!==100)return alert('Bitte ganze Prozentwerte mit einer Summe von 100 % eingeben.');state.roleFavorites=Object.fromEntries(state.roles.map(role=>[role.id,favoriteForRole(role.id)]));state.roleFavorites[roleId]=a;if(roleId==='project-manager')state.favorite=[...a];favoriteRoleId=roleId;persist()}
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
$('#newProject').onclick=()=>editProject(); window.addEventListener('hashchange',()=>{let p=location.hash.slice(1);if(['overview','projects','people','settings'].includes(p)){page=p;render()}});document.addEventListener('click',handleNavigationClick);document.addEventListener('ops:refresh',e=>{e.preventDefault();location.reload()});
fetch(apiUrl).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{if(data&&data.version===2){state=data;revision=data._revision||0;render()}else if(data===null)init();else throw Error()}).catch(()=>{$('#content').innerHTML='<div class="notice">Die lokalen Daten konnten nicht geladen werden. Bitte Anwendung neu starten und die Datendatei prüfen.</div>'});

function applyKit(){document.querySelectorAll('#kapa-app button,#modal button').forEach(b=>{if(b.classList.contains('pt-button') || b.classList.contains('pt-icon-button'))return;b.classList.add('pt-button');b.classList.add(b.classList.contains('primary')?'pt-button--primary':b.classList.contains('danger')?'pt-button--danger':'pt-button--secondary')});document.querySelectorAll('#kapa-app input,#modal input').forEach(x=>x.classList.add('pt-input'));document.querySelectorAll('#kapa-app select,#modal select').forEach(x=>x.classList.add('pt-select'));document.querySelectorAll('#kapa-app table,#modal table').forEach(x=>x.classList.add('pt-table'));document.querySelectorAll('#kapa-app .tag').forEach(x=>x.classList.add('pt-status','pt-status--neutral'))}
