/* Projektplan ↔ Stundenplanung: Phasenstunden (Gates) im Gantt, Aufteilung auf Unterpunkte und Rückschreiben des
   Stundenverlaufs in die Stundenplanung. Rechnet mit KapaGantt (Termine), KapaHours (Stundenplanung) und sapPhaseData (Ist). */
let ganttHoursUnit='h', ganttHoursOpen=true, ganttExportHours=false;
const ganttHoursFmt=value=>Number(value).toLocaleString('de-AT',{maximumFractionDigits:1});

/* Gate-Fenster der Phasen für den Terminplan: Anfang = Gate-Termin, Ende = Tag vor dem nächsten Gate (beide eingeschlossen). */
function ganttPhaseWindows(project){
 return phases.map((name,i)=>({start:project.dates[i],end:KapaGantt.iso(Math.max(KapaGantt.num(project.dates[i]),KapaGantt.num(project.dates[i+1])-1))}));
}

/* Stunden und Ist einer Gate-Phase aus der Stundenplanung. budget = aufteilbares PL-Basisbudget der Phase. */
function ganttPhaseInfo(project,phase){
 const base=KapaHours.sources(project).find(row=>row.id===`phase-${phase}`), data=sapPhaseData(project,phase);
 return {budget:base?base.budget:0,change:data.change,plPlan:data.plPlan,qvpPlan:data.qvpPlan,hasActual:data.hasActual,actual:data.actual,plActual:data.plActual,qvpActual:data.qvpActual};
}
/* Je Phase: Phasenvorgang (at, −1 wenn nicht im Plan), Stundenplanung (info), zugeteilte Stunden und Tagesverlauf. */
function ganttPhaseModel(tasks,rows,project){
 const hours=KapaGantt.rollup(tasks,rows), list=[];
 for(let phase=0;phase<phases.length;phase++){
  const at=tasks.findIndex(task=>task.phase===phase), info=ganttPhaseInfo(project,phase);
  if(at<0){list.push({phase,at:-1,info,allocated:0,rest:info.budget,result:null});continue}
  const result=KapaGantt.phaseDaily(tasks,rows,at,project.dates[phase],project.dates[phase+1],info.budget);
  list.push({phase,at,info,allocated:hours[at],rest:info.budget-hours[at],result});
 }
 return {hours,list,byTask:new Map(list.filter(entry=>entry.at>=0).map(entry=>[entry.at,entry]))};
}
/* Vergleich Projektplan ↔ Stundenplanung: none (nichts verteilt), blocked (nicht übernehmbar), synced, differs. */
function ganttHoursStatus(model,project){
 const used=model.list.filter(entry=>entry.at>=0&&entry.allocated>0);
 if(!used.length)return {state:'none',text:'Noch keine Stunden auf Vorgänge verteilt.'};
 const bad=used.find(entry=>!entry.result.ok);
 if(bad){
  const r=bad.result, why=r.over?`${phases[bad.phase]}: ${ganttHoursFmt(-r.rest)} h mehr als das Phasenbudget zugeteilt`:r.outside?`${phases[bad.phase]}: ${ganttHoursFmt(r.outside)} h liegen auf Tagen außerhalb der Phase`:`${phases[bad.phase]}: Die Phase hat keine Arbeitstage`;
  return {state:'blocked',text:`Nicht übernehmbar – ${why}.`};
 }
 const base=KapaHours.materialize(project).dailyBase;
 const differs=used.some(entry=>{
  const from=project.dates[entry.phase], to=project.dates[entry.phase+1], daily=entry.result.daily;
  const dates=new Set([...Object.keys(daily),...Object.keys(base).filter(date=>date>=from&&date<to)]);
  return [...dates].some(date=>(daily[date]||0)!==(base[date]||0));
 });
 return differs?{state:'differs',text:'Die Stundenplanung weicht vom Projektplan ab.'}:{state:'synced',text:'Die Stundenplanung entspricht dem Projektplan.'};
}
function ganttApplyHours(){
 const project=ganttProject(), tasks=ganttDoc.tasks, schedule=KapaGantt.schedule(tasks);
 if(!project||schedule.error)return;
 const model=ganttPhaseModel(tasks,schedule.rows,project), status=ganttHoursStatus(model,project);
 if(status.state==='none'||status.state==='blocked')return alert(status.state==='none'?'Bitte zuerst Stunden auf Vorgänge verteilen.':status.text);
 const used=model.list.filter(entry=>entry.at>=0&&entry.allocated>0);
 if(!confirm(`Der Stundenverlauf der Phasen ${used.map(entry=>phases[entry.phase]).join(', ')} wird in die Stundenplanung übernommen und ersetzt dort die bisherige Verteilung dieser Phasen.\n\nStunden, die noch nicht auf Vorgänge verteilt sind, werden gleichmäßig über die Phase gelegt. Phasen ohne zugeteilte Stunden und Planwertänderungen bleiben unverändert. Fortfahren?`))return;
 const rows=KapaHours.sources(project);
 for(const entry of used){
  const row=rows.find(item=>item.id===`phase-${entry.phase}`);
  if(!row)return alert('Die Phase ist in der Stundenplanung nicht vorhanden.');
  row.daily={...entry.result.daily};
  if(KapaHours.rowTotal(row)!==row.budget)return alert(`Der Stundenverlauf von ${phases[entry.phase]} ergibt nicht das Phasenbudget. Bitte die Stunden prüfen.`);
 }
 project.hourPlan=KapaHours.snapshot(rows,KapaHours.defaultGranularity(project));
 delete project.weights;
 ganttMessage=''; persist();
}
function ganttDistribute(phase){
 const project=ganttProject(), at=ganttDoc.tasks.findIndex(task=>task.phase===phase);
 if(!project||at<0)return;
 ganttCommit(KapaGantt.distributeRest(ganttDoc.tasks,at,ganttPhaseInfo(project,phase).budget));
}
function ganttEnsurePhases(){
 const project=ganttProject(); if(project)ganttCommit(KapaGantt.ensurePhases(ganttDoc.tasks,phases,project.dates,uid));
}
function ganttSetHoursUnit(unit){ganttHoursUnit=unit==='pct'?'pct':'h';ganttRerender()}

/* Stundenzelle in der Vorgangstabelle. Nur Vorgänge innerhalb einer Phase tragen Stunden. */
function ganttHoursCell(view,tasks,rows,i){
 const row=rows[i], n=i+1;
 if(row.milestone)return '<td></td>';
 const owner=KapaGantt.phaseOf(tasks,i), entry=owner===null?null:view.phase.byTask.get(owner);
 if(!entry)return '<td><span class="kapa-gantt-readonly quiet" title="Stunden gibt es nur innerhalb einer Gate-Phase">–</span></td>';
 const hours=view.phase.hours[i], budget=entry.info.budget, pct=value=>budget?ganttHoursFmt(value*100/budget)+' %':'–';
 if(row.summary){
  if(i===owner){
   const over=hours>budget;
   return `<td><span class="kapa-gantt-readonly ${over?'kapa-gantt-critical-text':''}" title="Zugeteilt / Phasenbudget">${ganttHoursUnit==='pct'?pct(hours)+' / 100 %':`${ganttHoursFmt(hours)} / ${ganttHoursFmt(budget)} h`}</span></td>`;
  }
  return `<td><span class="kapa-gantt-readonly">${ganttHoursUnit==='pct'?pct(hours):ganttHoursFmt(hours)+' h'}</span></td>`;
 }
 const value=ganttHoursUnit==='pct'?(budget?ganttHoursFmt(hours*100/budget):''):hours;
 return `<td>${ganttCell('hours',i,value,ganttHoursUnit==='pct'?`Anteil von Vorgang ${n} an der Phase in Prozent`:`Stunden von Vorgang ${n}`,'inputmode="decimal"')}</td>`;
}

/* Übersicht je Gate-Phase unter der Toolbar. */
function ganttHoursPanel(view,project){
 const model=view.phase, status=ganttHoursStatus(model,project), showQvp=Number(project.qvpBudget)>0||model.list.some(entry=>entry.info.qvpPlan>0);
 const unit=`<div class="pt-segmented" role="group" aria-label="Eingabe der Stunden">${[['h','Stunden'],['pct','% der Phase']].map(([value,label])=>`<label class="pt-segmented__option"><input class="pt-segmented__input" type="radio" name="gantt-hours-unit" value="${value}" ${ganttHoursUnit===value?'checked':''} onchange="ganttSetHoursUnit(this.value)"><span class="pt-segmented__label">${label}</span></label>`).join('')}</div>`;
 const missing=model.list.some(entry=>entry.at<0);
 const lines=model.list.map(entry=>{
  const info=entry.info, name=phases[entry.phase], window=ganttPhaseWindows(project)[entry.phase], period=`${fmt(window.start)} – ${fmt(window.end)}`;
  if(entry.at<0)return `<tr><th scope="row">${esc(name)}</th><td>${period}</td><td>${ganttHoursFmt(info.budget)} h</td><td colspan="${showQvp?6:5}" class="quiet">Kein Phasenvorgang im Projektplan.</td></tr>`;
  const r=entry.result, over=entry.rest<0, plan=info.plPlan+info.qvpPlan;
  const notes=[r.outside?`${ganttHoursFmt(r.outside)} h liegen auf Tagen außerhalb der Phase`:'',r.over?'Phasenbudget überschritten':''].filter(Boolean).join(' · ');
  const actual=info.hasActual?`<span class="${info.actual>plan?'kapa-gantt-critical-text':''}">${ganttHoursFmt(info.actual)} h</span>${sapSplit()?`<div class="sub">PL ${ganttHoursFmt(info.plActual)} · QVP ${ganttHoursFmt(info.qvpActual)} h</div>`:''}`:'–';
  return `<tr><th scope="row">${esc(name)}</th><td>${period}</td><td>${ganttHoursFmt(info.budget)} h</td>
   <td><span class="${over?'kapa-gantt-critical-text':''}">${ganttHoursFmt(entry.allocated)} h</span></td>
   <td><span class="${over?'kapa-gantt-critical-text':''}">${over?'−':''}${ganttHoursFmt(Math.abs(entry.rest))} h</span>${notes?`<div class="sub kapa-gantt-critical-text">${esc(notes)}</div>`:''}</td>
   <td>${ganttHoursFmt(info.plPlan)} h${info.change?`<div class="sub">inkl. ${info.change>0?'+':''}${ganttHoursFmt(info.change)} h Planwertänderung</div>`:''}</td>
   ${showQvp?`<td>${ganttHoursFmt(info.qvpPlan)} h</td>`:''}<td>${actual}</td>
   <td><button type="button" class="secondary" onclick="ganttDistribute(${entry.phase})" ${entry.rest>0?'':'disabled'} title="Reststunden nach Dauer auf die Vorgänge dieser Phase verteilen">Rest verteilen</button></td></tr>`;
 }).join('');
 return `<details class="kapa-gantt-hours" ${ganttHoursOpen?'open':''} ontoggle="ganttHoursOpen=this.open">
  <summary>Stunden je Gate-Phase</summary>
  <div class="kapa-gantt-hours-body">
   <div class="actions kapa-gantt-actions">${unit}<button type="button" class="primary" onclick="ganttApplyHours()" ${status.state==='none'||status.state==='blocked'?'disabled':''} title="Verteilt die Stunden der Vorgänge auf deren Arbeitstage und ersetzt die Stundenverteilung der Phasen in der Stundenplanung">Stundenverlauf in die Stundenplanung übernehmen</button>${missing?'<button type="button" class="secondary" onclick="ganttEnsurePhases()">Fehlende Phasen ergänzen</button>':''}<span class="kapa-gantt-hours-status is-${status.state}" role="status">${esc(status.text)}</span></div>
   <div class="kapa-gantt-hours-scroll"><table class="kapa-gantt-hourtable"><thead><tr><th scope="col">Phase</th><th scope="col">Zeitraum</th><th scope="col">Budget PL</th><th scope="col">Zugeteilt</th><th scope="col">Rest</th><th scope="col">Plan PL</th>${showQvp?'<th scope="col">Plan QVP</th>':''}<th scope="col">Ist (SAP)</th><th scope="col"><span class="pt-visually-hidden">Aktion</span></th></tr></thead><tbody>${lines}</tbody></table></div>
   <p class="pt-field__help">Das Budget je Phase kommt aus der Stundenplanung (Projektbudget × Gate-Verteilung). Aufgeteilt wird das PL-Budget; Planwertänderungen, QVP und SAP-Ist werden zum Vergleich angezeigt.</p>
  </div></details>`;
}
