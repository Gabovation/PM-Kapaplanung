/* SAP records are snapshots per employee and booking date, not individual booking IDs. */
let sapPending = null;
const sapFormat = n => Number(n).toLocaleString('de-AT',{maximumFractionDigits:2});
const sapRows = () => Array.isArray(state.sapActuals) ? state.sapActuals : [];
function sapMatches(row) {
  const legacy = typeof row.psp === 'string' && row.psp.trim().match(/^([0-9]{2}-[0-9]{2}-[0-9]{3})-[0-9]{2}-[0-9]{2}-([0-9]{2})$/);
  const number = legacy ? legacy[1] : row.projectNumber;
  if (!number) return [];
  return state.projects.filter(p => String(p.number).trim().toLowerCase() === number.trim().toLowerCase());
}
function sapProjectRows(project) {
  return sapRows().filter(row => { const matches=sapMatches(row); return matches.length===1 && matches[0].id===project.id; });
}
function sapActualFor(project, period) {
  return sapProjectRows(project).filter(row=>row.date>=period.start&&row.date<period.end).reduce((n,row)=>n+row.hours,0);
}
/* Periods that end on or before the last booking date are covered by SAP actuals and no longer planned. */
function sapPeriodLocked(project, period) {
  const rows=sapProjectRows(project);
  return rows.length>0 && period.end<=rows.reduce((d,r)=>r.date>d?r.date:d,'');
}
let sapView = 'all';
const SAP_LEGACY = /^([0-9]{2}-[0-9]{2}-[0-9]{3})-[0-9]{2}-[0-9]{2}-([0-9]{2})$/;
const sapQvpCodes = () => Array.isArray(state.sapDepartments?.qvp) ? state.sapDepartments.qvp : [];
function sapDept(row) {
  const legacy = typeof row.psp === 'string' && row.psp.trim().match(SAP_LEGACY);
  return String(legacy ? legacy[2] : row.department ?? '');
}
/* QVP is defined by department codes in the settings; every other department counts as PL. */
const sapIsQvp = row => sapQvpCodes().includes(sapDept(row));
const sapSplit = () => sapQvpCodes().length > 0;
function sapSetView(value) { sapView = ['all','pl','qvp'].includes(value) ? value : 'all'; render(); }
function sapDailyPlans(project) {
  const plan = KapaHours.materialize(project);
  const qvp = KapaHours.materialize({...project,budget:Number(project.qvpBudget)||0,percent:project.qvpPercent??project.percent,changes:[],hourPlan:undefined,weights:undefined}).daily;
  return {pl:plan.daily, change:plan.dailyChange, qvp};
}
const sapSum = (daily, test) => Object.entries(daily).reduce((n,[d,h]) => n + (test(d) ? h : 0), 0);
function sapProjectData(project, view = sapSplit() ? sapView : 'all') {
  const all = sapProjectRows(project);
  if (!all.length) return null;
  const rows = view === 'qvp' ? all.filter(sapIsQvp) : view === 'pl' ? all.filter(row => !sapIsQvp(row)) : all;
  const cutoff = all.reduce((d,r) => r.date>d ? r.date : d, ''), actual = rows.reduce((n,r) => n + r.hours, 0);
  const plans = sapDailyPlans(project);
  const daily = view === 'qvp' ? [plans.qvp] : view === 'pl' ? [plans.pl] : [plans.pl, plans.qvp];
  const plannedThrough = daily.reduce((n,d) => n + sapSum(d, date => date <= cutoff), 0);
  const remaining = daily.reduce((n,d) => n + sapSum(d, date => date > cutoff), 0);
  const budget = view === 'qvp' ? (Number(project.qvpBudget)||0) : view === 'pl' ? totals(project) : projectTotal(project);
  return {actual, cutoff, plannedThrough, remaining, projected:actual+remaining, budget, view};
}
/* Ist/Plan and plan changes for one gate phase; used by the budget distribution on the project page. */
function sapPhaseData(project, index) {
  const from = project.dates[index], to = project.dates[index+1], inPhase = date => date >= from && date < to;
  const plans = sapDailyPlans(project), all = sapProjectRows(project), rows = all.filter(row => inPhase(row.date));
  const plPlan = sapSum(plans.pl, inPhase), qvpPlan = sapSum(plans.qvp, inPhase), hours = list => list.reduce((n,r) => n + r.hours, 0);
  return {hasActual:all.length>0, plPlan, qvpPlan, plan:plPlan+qvpPlan, change:sapSum(plans.change, inPhase),
    actual:hours(rows), plActual:hours(rows.filter(r => !sapIsQvp(r))), qvpActual:hours(rows.filter(sapIsQvp))};
}
function sapPhaseInfo(project, index) {
  const d = sapPhaseData(project, index), lines = [];
  if (d.change) lines.push(`<div class="sub">Planwertänderung + ${sapFormat(d.change)} h</div>`);
  if (d.hasActual) {
    lines.push(`<div class="${d.actual>d.plan?'kapa-sap-over':''}"><strong>Ist ${sapFormat(d.actual)} / Plan ${sapFormat(d.plan)} h</strong></div>`);
    if (sapSplit()) lines.push(`<div class="sub">PL ${sapFormat(d.plActual)} / ${sapFormat(d.plPlan)} h · QVP ${sapFormat(d.qvpActual)} / ${sapFormat(d.qvpPlan)} h</div>`);
  }
  return lines.length ? `<div class="kapa-phase-actual">${lines.join('')}</div>` : '';
}
function sapViewSelector() {
  if (!sapSplit()) return '<p class="quiet">Für eine getrennte Ansicht PL / QVP die Abteilungen unter Einstellungen → SAP-Stunden dem QVP zuordnen.</p>';
  return `<div class="pt-segmented" role="group" aria-label="Ansicht">${[['all','PL + QVP'],['pl','Nur PL'],['qvp','Nur QVP']].map(([value,label]) => `<label class="pt-segmented__option"><input class="pt-segmented__input" type="radio" name="sap-view" value="${value}" ${sapView===value?'checked':''} onchange="sapSetView(this.value)"><span class="pt-segmented__label">${label}</span></label>`).join('')}</div>`;
}
const SAP_CODE = /^[0-9A-Za-z]{1,10}$/;
const sapDepartmentNames = () => state.sapDepartments?.names && typeof state.sapDepartments.names === 'object' ? state.sapDepartments.names : {};
/* All departments found in the imported bookings plus the ones added by hand. */
function sapDepartmentList() {
  const list = new Map(), entry = code => { if (!list.has(code)) list.set(code, {code, count:0, hours:0}); return list.get(code); };
  sapRows().forEach(row => { const code = sapDept(row); if (code) { const item = entry(code); item.count++; item.hours += row.hours; } });
  Object.keys(sapDepartmentNames()).concat(sapQvpCodes()).forEach(entry);
  return [...list.values()].map(item => ({...item, name:sapDepartmentNames()[item.code]||'', qvp:sapQvpCodes().includes(item.code)}))
    .sort((a,b) => a.code.localeCompare(b.code, 'de', {numeric:true}));
}
function sapStoreDepartments(qvp, names) {
  state.sapDepartments = {qvp:[...new Set(qvp)], names};
  if (!state.sapDepartments.qvp.length) sapView = 'all';
  persist();
}
function sapDepartmentTable() {
  const list = sapDepartmentList(), field = (code, part) => `sapDept-${part}-${code}`;
  const rows = list.map(item => `<tr><td><strong>${esc(item.code)}</strong></td>
    <td><input class="pt-input" id="${field(item.code,'name')}" value="${esc(item.name)}" maxlength="100" placeholder="z. B. Projektmanagement" aria-label="Bezeichnung Abteilung ${esc(item.code)}"></td>
    <td><select class="pt-select" id="${field(item.code,'role')}" aria-label="Zuordnung Abteilung ${esc(item.code)}"><option value="pl" ${item.qvp?'':'selected'}>PL</option><option value="qvp" ${item.qvp?'selected':''}>QVP</option></select></td>
    <td>${item.count} · ${sapFormat(item.hours)} h</td>
    <td><div class="kapa-user-actions"><button class="secondary" onclick="saveSapDepartment('${esc(item.code)}')">Speichern</button><button class="danger" onclick="deleteSapDepartment('${esc(item.code)}')">Löschen</button></div></td></tr>`).join('');
  return `<div class="kapa-sap-departments"><h3>Abteilungen</h3><p class="quiet">Die Abteilung steht in den letzten Stellen des PSP-Elements (z. B. 99 = Projektmanagement). Die Zuordnung bestimmt, ob Stunden als PL oder QVP zählen.</p>
    <div class="tablewrap"><table class="pt-table"><thead><tr><th scope="col">Code</th><th scope="col">Bezeichnung</th><th scope="col">Zuordnung</th><th scope="col">Buchungen · Stunden</th><th scope="col">Aktionen</th></tr></thead><tbody>${rows}
    <tr><td><input class="pt-input" id="sapNewCode" maxlength="10" placeholder="Code" aria-label="Neuer Abteilungscode"></td><td><input class="pt-input" id="sapNewName" maxlength="100" placeholder="Bezeichnung (optional)" aria-label="Bezeichnung der neuen Abteilung"></td>
    <td><select class="pt-select" id="sapNewRole" aria-label="Zuordnung der neuen Abteilung"><option value="pl">PL</option><option value="qvp">QVP</option></select></td><td></td><td><button class="secondary" onclick="addSapDepartment()">Hinzufügen</button></td></tr></tbody></table></div>${list.length?'':'<p class="quiet">Noch keine Abteilungen vorhanden. Sie erscheinen nach dem SAP-Import oder können hier angelegt werden.</p>'}</div>`;
}
function saveSapDepartment(code) {
  const name = document.getElementById(`sapDept-name-${code}`).value.trim(), role = document.getElementById(`sapDept-role-${code}`).value;
  sapStoreDepartments(sapQvpCodes().filter(item => item !== code).concat(role === 'qvp' ? [code] : []), {...sapDepartmentNames(), [code]:name});
}
function addSapDepartment() {
  const code = $('#sapNewCode').value.trim(), name = $('#sapNewName').value.trim();
  if (!SAP_CODE.test(code)) return alert('Bitte einen Abteilungscode aus Ziffern oder Buchstaben (höchstens 10 Zeichen) eingeben.');
  if (sapDepartmentList().some(item => item.code === code)) return alert('Diese Abteilung existiert bereits.');
  sapStoreDepartments(sapQvpCodes().concat($('#sapNewRole').value === 'qvp' ? [code] : []), {...sapDepartmentNames(), [code]:name});
}
function deleteSapDepartment(code) {
  const bookings = sapRows().filter(row => sapDept(row) === code);
  const hours = bookings.reduce((n,row) => n + row.hours, 0);
  const text = bookings.length ? `Abteilung ${code} löschen? Dabei werden auch ${bookings.length} SAP-Buchungen (${sapFormat(hours)} h) dieser Abteilung entfernt. Sie lassen sich durch einen erneuten Import wiederherstellen.` : `Abteilung ${code} löschen?`;
  if (!confirm(text)) return;
  if (bookings.length) state.sapActuals = sapRows().filter(row => sapDept(row) !== code);
  const names = {...sapDepartmentNames()};
  delete names[code];
  sapStoreDepartments(sapQvpCodes().filter(item => item !== code), names);
}
/* SAP balance: hours that were used less or more than planned up to the cut-off are carried to the remaining
   project timeline. The balance is stored per project as signed whole hours per day (project.sapBalance). */
const sapUtcDay = value => Date.UTC(...value.split('-').map((part,index) => Number(part) - (index===1?1:0)));
const sapDayKey = ms => new Date(ms).toISOString().slice(0,10);
const sapNextDay = value => sapDayKey(sapUtcDay(value) + 86400000);
function sapDays(from, to) {
  const days = [];
  for (let ms = sapUtcDay(from); sapDayKey(ms) < to; ms += 86400000) days.push(sapDayKey(ms));
  return days;
}
function sapAllocate(total, weights) {
  const sum = weights.reduce((a,b) => a+b, 0);
  if (!sum) return weights.map(() => 0);
  const raw = weights.map(weight => total*weight/sum), out = raw.map(Math.floor);
  raw.map((value,index) => ({index,remainder:value-out[index]})).sort((a,b) => b.remainder-a.remainder||a.index-b.index)
    .slice(0, total-out.reduce((a,b) => a+b, 0)).forEach(item => out[item.index]++);
  return out;
}
/* delta > 0: hours left over for the remaining timeline; delta < 0: hours missing for it. */
function sapBalanceInfo(project) {
  const all = sapProjectRows(project);
  if (!all.length) return null;
  const split = sapSplit();
  if (!split && Number(project.qvpBudget) > 0) return {eligible:false, reason:'Für die Trennung von PL und QVP bitte zuerst die QVP-Abteilungscodes unter Einstellungen hinterlegen.'};
  const rows = split ? all.filter(row => !sapIsQvp(row)) : all;
  const cutoff = all.reduce((d,r) => r.date>d ? r.date : d, ''), actual = rows.reduce((n,r) => n + r.hours, 0);
  const firstFuture = sapNextDay(cutoff) < project.dates[0] ? project.dates[0] : sapNextDay(cutoff);
  if (firstFuture >= project.dates[4]) return {eligible:false, cutoff, actual, reason:'Der letzte SAP-Buchungstag liegt am Ende des Projekts. Es gibt keine Restlaufzeit mehr.'};
  const daily = KapaHours.materialize(project).daily;
  const future = Object.entries(daily).reduce((n,[d,h]) => n + (d>=firstFuture&&d<project.dates[4] ? h : 0), 0);
  const plannedThrough = Object.entries(daily).reduce((n,[d,h]) => n + (d<=cutoff ? h : 0), 0);
  return {eligible:true, cutoff, firstFuture, actual, plannedThrough, future, delta:Math.round((totals(project)-actual)-future)};
}
function sapBalanceApply(project, mode) {
  const info = sapBalanceInfo(project);
  if (!info?.eligible || !info.delta) return 'Es ist kein Abgleich nötig.';
  if ((mode==='spread') !== (info.delta>0)) return 'Diese Auswahl passt nicht zur Differenz.';
  const amount = Math.abs(info.delta), daily = KapaHours.materialize(project).daily;
  const days = sapDays(info.firstFuture, project.dates[4]);
  let weights = days.map(d => daily[d]||0);
  if (mode==='reduce' && amount > weights.reduce((a,b) => a+b, 0)) return 'Die Restlaufzeit hat nicht genug geplante Stunden für diese Kürzung.';
  if (!weights.some(Boolean)) weights = days.map(() => 1);
  const shares = sapAllocate(amount, weights), balance = {...(project.sapBalance?.daily||{})}, sign = mode==='spread' ? 1 : -1;
  days.forEach((d,i) => { if (shares[i]) { const value = (balance[d]||0) + sign*shares[i]; if (value) balance[d] = value; else delete balance[d]; } });
  project.sapBalance = {cutoff:info.cutoff, daily:balance};
  return null;
}
/* A Planwertänderung needs approval and its size is not known yet, so it is only flagged, never booked. */
function sapBalanceFlagChange(project, info) {
  project.changePending = {date:new Date().toISOString().slice(0,10), cutoff:info.cutoff, hours:Math.abs(info.delta)};
  return null;
}
function sapClearPendingChange(id) {
  const project = state.projects.find(p => p.id === id);
  if (!project || !confirm('Hinweis „Planwertänderung in Planung“ entfernen?')) return;
  delete project.changePending;
  persist();
}
function sapBalanceRow(project) {
  const days = Object.keys(project.sapBalance?.daily||{}).sort();
  if (!days.length) return null;
  const daily = {...project.sapBalance.daily};
  return {id:'sap-balance', kind:'balance', label:'SAP-Istabgleich', budget:Object.values(daily).reduce((a,b) => a+b, 0), start:days[0], end:sapNextDay(days[days.length-1]), daily};
}
function sapBalanceOptions(info) {
  const amount = sapFormat(Math.abs(info.delta));
  if (info.delta > 0) return [['spread',`Auf die Restlaufzeit verteilen (+${amount} h)`],['skip','Nicht übernehmen']];
  const options = [['skip','Noch nichts ändern'],['change',`Planwertänderung vormerken (Mehrbedarf ca. ${amount} h, noch nicht gebucht)`]];
  if (Math.abs(info.delta) <= info.future) options.push(['reduce',`Von der Restlaufzeit abziehen (−${amount} h)`]);
  return options;
}
function sapBalanceDialog(ids, quiet=false) {
  const items = ids.map(id => state.projects.find(p => p.id===id)).filter(Boolean).map(project => ({project, info:sapBalanceInfo(project)}));
  const open = items.filter(item => item.info?.eligible && item.info.delta);
  if (!open.length) {
    if (!quiet) alert(items[0]?.info?.reason || 'Ist und Plan sind abgeglichen. Es ist keine Verschiebung nötig.');
    return false;
  }
  const rows = open.map(({project,info}) => `<tr><td><strong>${esc(project.name)}</strong><div class="sub">${esc(project.number)} · Stand ${fmt(info.cutoff)}</div></td>
    <td>${sapFormat(info.actual)} h</td><td>${sapFormat(info.plannedThrough)} h</td>
    <td><strong class="${info.delta<0?'kapa-sap-over':''}">${info.delta>0?'+':'−'}${sapFormat(Math.abs(info.delta))} h</strong><div class="sub">${info.delta>0?'weniger gebraucht':'mehr gebraucht'}</div></td>
    <td><select class="pt-select" data-sap-balance="${esc(project.id)}" aria-label="Vorgehen für ${esc(project.name)}">${sapBalanceOptions(info).map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select></td></tr>`).join('');
  openModal('SAP-Istabgleich', `<p>Das importierte Ist (PL) weicht vom Plan bis zum Stichtag ab. Die Differenz kann auf die restliche Projektlaufzeit im Verhältnis der geplanten Stunden verteilt werden.</p>
    <div class="tablewrap"><table class="pt-table"><thead><tr><th>Projekt</th><th>Ist</th><th>Plan bis Stichtag</th><th>Differenz</th><th>Vorgehen</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="quiet">„Vormerken“ ändert den Plan nicht: Am Projekt erscheint nur der Hinweis „Planwertänderung in Planung“, bis die Änderung genehmigt und mit Stunden erfasst ist. „Abziehen“ lässt das Budget unverändert und kürzt die Restlaufzeit.</p>`,
    `<button class="secondary" onclick="closeModal()">Später entscheiden</button><button class="primary" onclick="applySapBalance()">Übernehmen</button>`, 'wide');
  return true;
}
function applySapBalance() {
  const errors = [];
  document.querySelectorAll('[data-sap-balance]').forEach(select => {
    const project = state.projects.find(p => p.id === select.dataset.sapBalance), mode = select.value;
    if (!project || mode === 'skip') return;
    const info = sapBalanceInfo(project);
    const error = mode === 'change' ? (info?.eligible ? sapBalanceFlagChange(project, info) : 'Kein Abgleich möglich.') : sapBalanceApply(project, mode);
    if (error) errors.push(`${project.name}: ${error}`);
  });
  closeModal();
  persist();
  if (errors.length) alert('Nicht alle Abgleiche konnten übernommen werden:\n' + errors.join('\n'));
}
function sapPendingNotice(project) {
  const pending = project.changePending;
  if (!pending) return '';
  return `<div class="notice kapa-sap-balance"><span><strong>Planwertänderung in Planung.</strong> Vorgemerkt am ${fmt(pending.date)} wegen eines Mehrbedarfs von ca. ${sapFormat(pending.hours)} h (Stand SAP ${fmt(pending.cutoff)}). Die Stunden sind noch nicht im Plan.</span><span class="kapa-sap-actions"><button class="secondary" onclick="changeBudget('${esc(project.id)}')">Planwertänderung erfassen</button><button class="secondary" onclick="sapClearPendingChange('${esc(project.id)}')">Hinweis entfernen</button></span></div>`;
}
function sapBalanceNotice(project) {
  const info = sapBalanceInfo(project);
  if (!info) return sapPendingNotice(project);
  const pending = sapPendingNotice(project);
  if (!info.eligible) return pending + (info.reason ? `<p class="quiet">${esc(info.reason)}</p>` : '');
  if (!info.delta) return pending + '<p class="quiet">Ist und Plan sind abgeglichen: Die Restlaufzeit enthält genau das verbleibende Budget.</p>';
  return pending + `<div class="notice kapa-sap-balance"><span>${info.delta>0?`Das Ist (PL) liegt ${sapFormat(info.delta)} h unter dem Plan.`:`Das Ist (PL) liegt ${sapFormat(-info.delta)} h über dem Plan.`} Die Restlaufzeit ist noch nicht angepasst.</span><button class="secondary" onclick="sapBalanceDialog(['${esc(project.id)}'])">Istabgleich durchführen</button></div>`;
}
function sapSettings(){
 const rows=sapRows(), unmatched=rows.filter(row=>sapMatches(row).length!==1);
 return `<section class="panel"><span class="section-kicker">ISTABGLEICH</span><h2>SAP-Stunden</h2><p class="muted">SAP-Excel exportieren und hier einlesen. Die Buchungen werden anhand des PSP-Elements dem Projekt zugeordnet.</p><div class="kapa-backup-actions"><button class="secondary" onclick="document.querySelector('#sapFile').click()">SAP-Excel auswählen</button><input id="sapFile" type="file" accept=".xlsx" hidden onchange="previewSap(this)"></div>${sapDepartmentTable()}<p class="quiet">${rows.length?`${rows.length} Buchungen gespeichert · ${unmatched.length} ohne eindeutige Projektzuordnung.`:'Noch keine SAP-Buchungen importiert.'}</p></section>`;
}
function showSapUnmatched(){
 const rows=sapRows().filter(r=>sapMatches(r).length!==1);
 const content=rows.slice(0,100).map(r=>`<tr><td>${fmt(r.date)}</td><td>${esc(r.psp||'Kein PSP')}</td><td>${sapFormat(r.hours)} h</td><td>${esc(r.name)}</td></tr>`).join('');
 openModal('Nicht zugeordnete SAP-Buchungen',`<p>Diese Buchungen zählen nicht zu einem Projekt. Bei fehlendem oder mehrdeutigem Projekt kann die Projektnummer in der Planung geprüft werden.</p><div class="tablewrap"><table><thead><tr><th>Datum</th><th>PSP-Element</th><th>Stunden</th><th>Person</th></tr></thead><tbody>${content}</tbody></table></div>${rows.length>100?'<p>Die ersten 100 Buchungen werden angezeigt.</p>':''}`,`<button class="secondary" onclick="closeModal()">Schließen</button>`);
}
async function previewSap(input){
 const file=input.files[0];input.value='';if(!file)return;
 try {
  let data=new FormData();data.append('file',file);
  const response=await fetch(appRoot.dataset.sapUrl,{method:'POST',headers:{'X-Kapa-Token':writeToken},body:data});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Import konnte nicht gelesen werden.');
  const rows=result.rows, dates=rows.map(r=>r.date).sort(), groups=new Set(rows.map(r=>JSON.stringify([r.personnelNumber,r.date]))), unmatched=rows.filter(r=>sapMatches(r).length!==1);
  const replaced=sapRows().filter(r=>groups.has(JSON.stringify([r.personnelNumber,r.date]))).length;
  if(sapRows().length-replaced+rows.length>10000)throw Error('Die Planung darf höchstens 10.000 SAP-Buchungen enthalten.');
  sapPending=rows;
  openModal('SAP-Import prüfen',`<p><strong>${rows.length} Buchungen</strong> vom ${fmt(dates[0])} bis ${fmt(dates[dates.length-1])} · ${unmatched.length} ohne eindeutige Projektzuordnung.</p><p>Für die ${groups.size} enthaltenen Kombinationen aus Personalnummer und Datum werden ${replaced} bisherige Buchungen ersetzt. Pro Person und Datum muss der Export alle Buchungen enthalten. Andere Daten bleiben erhalten.</p><p class="quiet">Zeilen ohne PSP oder ohne passendes beziehungsweise eindeutiges Projekt bleiben gespeichert und werden nicht in Projektsummen eingerechnet. Identische Zeilen innerhalb der Datei bleiben erhalten.</p>${unmatched.length?`<details><summary>Nicht zugeordnete Buchungen anzeigen (${unmatched.length})</summary><div class="tablewrap"><table><thead><tr><th>Datum</th><th>PSP-Element</th><th>Stunden</th></tr></thead><tbody>${unmatched.slice(0,100).map(r=>`<tr><td>${fmt(r.date)}</td><td>${esc(r.psp||'Kein PSP')}</td><td>${sapFormat(r.hours)} h</td></tr>`).join('')}</tbody></table>${unmatched.length>100?'<p>Die ersten 100 Buchungen werden angezeigt.</p>':''}</div></details>`:''}`,`<button class="secondary" onclick="closeModal()">Abbrechen</button><button class="primary" onclick="applySap()">Import übernehmen</button>`,'form');
 } catch(e){alert('SAP-Import: '+e.message)}
}
function applySap(){
 if(!sapPending)return;
 const groups=new Set(sapPending.map(r=>JSON.stringify([r.personnelNumber,r.date])));
 const touched=[...new Set(sapPending.flatMap(row=>sapMatches(row).length===1?[sapMatches(row)[0].id]:[]))];
 state.sapActuals=sapRows().filter(r=>!groups.has(JSON.stringify([r.personnelNumber,r.date]))).concat(sapPending);
 sapPending=null;closeModal();persist();
 sapBalanceDialog(touched,true);
}
function sapOverview(){
 const rows=sapRows();if(!rows.length)return '';
 const problems=state.projects.map(p=>({p,d:sapProjectData(p)})).filter(x=>x.d&&x.d.projected>x.d.budget);
 const unmatched=rows.filter(r=>sapMatches(r).length!==1);
 return `<section class="panel"><span class="section-kicker">SAP-ISTABGLEICH</span><h2>Projektbudget im Blick</h2><p class="muted">Hochrechnung: importiertes Ist plus verbleibender Plan ab dem letzten Buchungsdatum des Projekts. Sie ist nur aussagekräftig, wenn die Exporte für alle Beteiligten vollständig und aktuell sind.</p>${problems.length?`<div class="notice">${problems.length} ${problems.length===1?'Projekt überschreitet':'Projekte überschreiten'} voraussichtlich das Gesamtbudget. Planwertänderung prüfen.</div><ul>${problems.map(({p,d})=>`<li>${esc(p.name)}: ${sapFormat(d.projected)} h prognostiziert / ${sapFormat(d.budget)} h Budget · Stand ${fmt(d.cutoff)}</li>`).join('')}</ul>`:'<div class="quiet">Bei den Projekten mit importierten Stunden liegt die Hochrechnung nicht über dem Gesamtbudget.</div>'}${unmatched.length?`<p class="quiet">${unmatched.length} Buchungen sind keinem Projekt eindeutig zugeordnet und nicht in der Hochrechnung enthalten.</p>`:''}</section>`;
}
function sapProject(project){
 const d=sapProjectData(project);
 if(!d)return `<section class="panel"><span class="section-kicker">SAP-ISTABGLEICH</span><h2>Plan und Ist</h2><p class="quiet">Für dieses Projekt liegen keine eindeutig zugeordneten SAP-Buchungen vor.</p></section>`;
 return `<section class="panel"><span class="section-kicker">SAP-ISTABGLEICH</span><h2>Plan und Ist</h2><div class="panelhead"><p>Stand der letzten Projektbuchung: ${fmt(d.cutoff)} · ${d.view==='pl'?'Nur PL · PL-Budget inkl. Planwertänderungen':d.view==='qvp'?'Nur QVP · QVP-Budget':'PL und QVP zusammen · Gesamtbudget PL und QVP'}</p>${sapViewSelector()}</div><div class="phasegrid"><div><span class="quiet">Ist-Stunden</span><h2>${sapFormat(d.actual)} h</h2></div><div><span class="quiet">Plan bis Stichtag</span><h2>${sapFormat(d.plannedThrough)} h</h2></div><div><span class="quiet">Verbleibender Plan</span><h2>${sapFormat(d.remaining)} h</h2></div><div><span class="quiet">Hochrechnung / Budget</span><h2>${sapFormat(d.projected)} / ${sapFormat(d.budget)} h</h2></div></div>${d.projected>d.budget?'<div class="notice">Das Budget wird voraussichtlich überschritten. Planwertänderung prüfen.</div>':''}${sapBalanceNotice(project)}<p class="quiet">Restbudget nach importiertem Ist: ${sapFormat(d.budget-d.actual)} h. Hochrechnung = importiertes Ist plus Plan nach dem Stichtag. Nur bei vollständigen, aktuellen Exporten aller Beteiligten aussagekräftig.</p></section>`;
}
