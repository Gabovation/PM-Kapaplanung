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
function sapProjectData(project) {
  const rows = sapRows().filter(row => { const matches=sapMatches(row); return matches.length===1 && matches[0].id===project.id; });
  if (!rows.length) return null;
  const cutoff=rows.reduce((d,r)=>r.date>d?r.date:d,''), actual=rows.reduce((n,r)=>n+r.hours,0);
  const pl=KapaHours.materialize(project).daily;
  const qvp=KapaHours.materialize({...project,budget:Number(project.qvpBudget)||0,percent:project.qvpPercent??project.percent,changes:[],hourPlan:undefined,weights:undefined}).daily;
  const plannedThrough=Object.entries(pl).concat(Object.entries(qvp)).reduce((n,[d,h])=>n+(d<=cutoff?h:0),0);
  const remaining=Object.entries(pl).concat(Object.entries(qvp)).reduce((n,[d,h])=>n+(d>cutoff?h:0),0);
  return {actual, cutoff, plannedThrough, remaining, projected:actual+remaining,budget:projectTotal(project)};
}
function sapSettings(){
 const rows=sapRows(), unmatched=rows.filter(row=>sapMatches(row).length!==1);
 return `<section class="panel"><span class="section-kicker">ISTABGLEICH</span><h2>SAP-Stunden</h2><p class="muted">SAP-Excel exportieren und hier einlesen. Die Buchungen werden anhand des PSP-Elements dem Projekt zugeordnet.</p><div class="kapa-backup-actions"><button class="secondary" onclick="document.querySelector('#sapFile').click()">SAP-Excel auswählen</button><input id="sapFile" type="file" accept=".xlsx" hidden onchange="previewSap(this)"></div><p class="quiet">${rows.length?`${rows.length} Buchungen gespeichert · ${unmatched.length} ohne eindeutige Projektzuordnung.`:'Noch keine SAP-Buchungen importiert.'}</p></section>`;
}
function showSapUnmatched(){
 const rows=sapRows().filter(r=>sapMatches(r).length!==1);
 const content=rows.slice(0,100).map(r=>`<tr><td>${fmt(r.date)}</td><td>${esc(r.psp||'Kein PSP')}</td><td>${sapFormat(r.hours)} h</td><td>${esc(r.name)}</td></tr>`).join('');
 openModal('Nicht zugeordnete SAP-Buchungen',`<p>Diese Buchungen z?hlen nicht zu einem Projekt. Bei fehlendem oder mehrdeutigem Projekt kann die Projektnummer in der Planung gepr?ft werden.</p><div class="tablewrap"><table><thead><tr><th>Datum</th><th>PSP-Element</th><th>Stunden</th><th>Person</th></tr></thead><tbody>${content}</tbody></table></div>${rows.length>100?'<p>Die ersten 100 Buchungen werden angezeigt.</p>':''}`,`<button class="secondary" onclick="closeModal()">Schlie?en</button>`);
}
async function previewSap(input){
 const file=input.files[0];input.value='';if(!file)return;
 try {
  let data=new FormData();data.append('file',file);
  const response=await fetch(appRoot.dataset.sapUrl,{method:'POST',headers:{'X-Kapa-Token':writeToken},body:data});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Import konnte nicht gelesen werden.');
  const rows=result.rows, dates=rows.map(r=>r.date).sort(), groups=new Set(rows.map(r=>JSON.stringify([r.personnelNumber,r.date]))), unmatched=rows.filter(r=>sapMatches(r).length!==1);
  const replaced=sapRows().filter(r=>groups.has(JSON.stringify([r.personnelNumber,r.date]))).length;
  if(sapRows().length-replaced+rows.length>10000)throw Error('Die Planung darf h?chstens 10.000 SAP-Buchungen enthalten.');
  sapPending=rows;
  openModal('SAP-Import prüfen',`<p><strong>${rows.length} Buchungen</strong> vom ${fmt(dates[0])} bis ${fmt(dates[dates.length-1])} · ${unmatched.length} ohne eindeutige Projektzuordnung.</p><p>Für die ${groups.size} enthaltenen Kombinationen aus Personalnummer und Datum werden ${replaced} bisherige Buchungen ersetzt. Pro Person und Datum muss der Export alle Buchungen enthalten. Andere Daten bleiben erhalten.</p><p class="quiet">Zeilen ohne PSP oder ohne passendes beziehungsweise eindeutiges Projekt bleiben gespeichert und werden nicht in Projektsummen eingerechnet. Identische Zeilen innerhalb der Datei bleiben erhalten.</p>${unmatched.length?`<details><summary>Nicht zugeordnete Buchungen anzeigen (${unmatched.length})</summary><div class="tablewrap"><table><thead><tr><th>Datum</th><th>PSP-Element</th><th>Stunden</th></tr></thead><tbody>${unmatched.slice(0,100).map(r=>`<tr><td>${fmt(r.date)}</td><td>${esc(r.psp||'Kein PSP')}</td><td>${sapFormat(r.hours)} h</td></tr>`).join('')}</tbody></table>${unmatched.length>100?'<p>Die ersten 100 Buchungen werden angezeigt.</p>':''}</div></details>`:''}`,`<button class="secondary" onclick="closeModal()">Abbrechen</button><button class="primary" onclick="applySap()">Import übernehmen</button>`,'form');
 } catch(e){alert('SAP-Import: '+e.message)}
}
function applySap(){
 if(!sapPending)return;
 const groups=new Set(sapPending.map(r=>JSON.stringify([r.personnelNumber,r.date])));
 state.sapActuals=sapRows().filter(r=>!groups.has(JSON.stringify([r.personnelNumber,r.date]))).concat(sapPending);
 sapPending=null;closeModal();persist();
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
 return `<section class="panel"><span class="section-kicker">SAP-ISTABGLEICH</span><h2>Plan und Ist</h2><p>Stand der letzten Projektbuchung: ${fmt(d.cutoff)} · Importierte Abteilungen zusammen · Gesamtbudget PL und QVP</p><div class="phasegrid"><div><span class="quiet">Ist-Stunden</span><h2>${sapFormat(d.actual)} h</h2></div><div><span class="quiet">Plan bis Stichtag</span><h2>${sapFormat(d.plannedThrough)} h</h2></div><div><span class="quiet">Verbleibender Plan</span><h2>${sapFormat(d.remaining)} h</h2></div><div><span class="quiet">Hochrechnung / Budget</span><h2>${sapFormat(d.projected)} / ${sapFormat(d.budget)} h</h2></div></div>${d.projected>d.budget?'<div class="notice">Das Budget wird voraussichtlich überschritten. Planwertänderung prüfen.</div>':''}<p class="quiet">Restbudget nach importiertem Ist: ${sapFormat(d.budget-d.actual)} h. Hochrechnung = importiertes Ist plus Plan nach dem Stichtag. Nur bei vollständigen, aktuellen Exporten aller Beteiligten aussagekräftig.</p></section>`;
}
