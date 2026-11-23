/* Reiter „Projektplan“: Vorgangstabelle und Gantt-Diagramm (Administratoren und HO PM, nur Serverbetrieb). */
let ganttProjectId=null, ganttDoc=null, ganttLoading=false, ganttError='', ganttMessage='', ganttZoom='week', ganttSel=null, ganttView=null, ganttScrollToday=false, ganttSaveText='', ganttDrag=null, ganttShowBase=true, ganttShowCritical=false, ganttCustomer=false, ganttFull=false, ganttNative=false, ganttScale=1, ganttWheel=0;
const ganttScales=[0.5,0.75,1,1.5,2,3,4];
const ganttCollapsed=new Set(), ganttRowH=34, ganttBarH=18, ganttPx={day:28,week:8,month:3}, ganttHead={upper:20,lower:22,gates:18};
const ganttMonths=['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
let ganttQueue=Promise.resolve(), ganttBlocked=false;

function ganttUrl(id){return appRoot.dataset.ganttUrl.replace('PROJECT_ID',encodeURIComponent(id))}
function ganttProject(){return state.projects.find(p=>p.id===ganttProjectId)}
function ganttRerender(){
 const box=document.querySelector('.kapa-gantt-scroll'), position=box?[box.scrollLeft,box.scrollTop]:null;
 render();
 const next=document.querySelector('.kapa-gantt-scroll');
 if(next&&position){next.scrollLeft=position[0];next.scrollTop=position[1]}
}
function ganttLoad(){
 const id=ganttProjectId; ganttLoading=true; ganttError='';
 fetch(ganttUrl(id)).then(async r=>{
  if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.error||(r.status===403?'Der Projektplan ist nur für Administratoren und HO PM sichtbar.':'Der Projektplan konnte nicht geladen werden.'))}
  return r.json()
 }).then(doc=>{
  if(id!==ganttProjectId)return;
  if(!doc||doc.projectId!==id||!Array.isArray(doc.tasks))throw Error('Der Projektplan konnte nicht gelesen werden.');
  doc.tasks.forEach(task=>{task.links=task.links||[]});
  ganttDoc=doc; ganttSel=null; ganttScrollToday=true; ganttSaveText='';
 }).catch(error=>{if(id===ganttProjectId)ganttError=error.message}).finally(()=>{ganttLoading=false;if(page==='gantt')ganttRerender()});
}
function ganttSelectProject(id){ganttProjectId=id;ganttDoc=null;ganttSel=null;ganttMessage='';ganttError='';ganttCollapsed.clear();ganttRerender()}
function ganttReload(){ganttDoc=null;ganttMessage='';ganttError='';ganttBlocked=false;ganttRerender()}

function ganttSetStatus(text){ganttSaveText=text;const el=document.querySelector('#ganttStatus');if(el)el.textContent=text}
function ganttSave(){
 const doc=ganttDoc, snapshot=JSON.stringify({projectId:doc.projectId,tasks:doc.tasks,baseline:doc.baseline||undefined});
 ganttSetStatus('Speichert …');
 ganttQueue=ganttQueue.then(async()=>{
  if(ganttBlocked)return;
  const data=JSON.parse(snapshot); data._revision=doc._revision||0;
  const r=await fetch(ganttUrl(doc.projectId),{method:'PUT',headers:{'Content-Type':'application/json','X-Kapa-Token':writeToken},body:JSON.stringify(data)});
  if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(e.error||'Speichern fehlgeschlagen')}
  doc._revision=(await r.json()).revision; ganttSetStatus('Gespeichert');
 }).catch(error=>{ganttBlocked=true;ganttSetStatus('Nicht gespeichert');alert('Nicht gespeichert: '+error.message+' Bitte die Seite neu laden.')});
}
function ganttCommit(result){
 if(result.error){ganttMessage=result.error;ganttRerender();return false}
 ganttDoc.tasks=result.tasks; ganttMessage=''; ganttSave(); ganttRerender(); return true;
}
function ganttIndex(){return ganttDoc?ganttDoc.tasks.findIndex(task=>task.id===ganttSel):-1}

/* ---------------------------------------------------------------- Bearbeiten über die Tabelle */
function ganttEdit(kind,i,el){
 const tasks=ganttDoc.tasks, value=el.value, fn={name:KapaGantt.setName,duration:KapaGantt.setDuration,start:KapaGantt.setStart,end:KapaGantt.setEnd,percent:KapaGantt.setPercent,links:KapaGantt.setLinks}[kind];
 if(fn)ganttCommit(fn(tasks,i,value));
}
function ganttSelect(id){
 ganttSel=id;
 document.querySelectorAll('.kapa-gantt [data-task]').forEach(node=>node.classList.toggle('is-selected',node.dataset.task===id));
}
function ganttAdd(kind){
 const i=ganttIndex(), p=ganttProject(), today=KapaGantt.iso(KapaGantt.nextWork(KapaGantt.num(new Date().toISOString().slice(0,10))));
 const id=uid(), name=kind==='milestone'?'Neuer Meilenstein':'Neuer Vorgang';
 if(ganttCommit(KapaGantt.add(ganttDoc.tasks,i<0?null:i,kind,id,today,name)))ganttSelect(id);
}
function ganttFromGates(){
 const p=ganttProject(); if(!p)return;
 const tasks=KapaGantt.fromGates(p.dates,phases,uid);
 ganttCommit({tasks});
}
function ganttAct(action){
 const i=ganttIndex(), tasks=ganttDoc.tasks;
 if(i<0){ganttMessage='Bitte zuerst einen Vorgang in der Tabelle auswählen.';return ganttRerender()}
 if(action==='delete'){
  const count=KapaGantt.subtreeEnd(tasks,i)-i;
  if(!confirm(count>1?`„${tasks[i].name}“ mit ${count-1} Unterpunkten löschen?`:`„${tasks[i].name}“ löschen?`))return;
  ganttSel=null; return ganttCommit(KapaGantt.remove(tasks,i));
 }
 ganttCommit({indent:KapaGantt.indent,outdent:KapaGantt.outdent}[action]?.(tasks,i)||KapaGantt.move(tasks,i,action==='up'?-1:1));
}
function ganttSaveBaseline(){
 const result=KapaGantt.schedule(ganttDoc.tasks);
 if(result.error||!ganttDoc.tasks.length)return;
 if(ganttDoc.baseline&&!confirm(`Der Basisplan vom ${fmt(ganttDoc.baseline.savedAt)} wird mit den aktuellen Terminen überschrieben. Fortfahren?`))return;
 ganttDoc.baseline=KapaGantt.snapshot(result.rows,today); ganttShowBase=true; ganttMessage=''; ganttSave(); ganttRerender();
}
function ganttDeleteBaseline(){
 if(!ganttDoc.baseline||!confirm('Basisplan löschen?'))return;
 delete ganttDoc.baseline; ganttSave(); ganttRerender();
}
function ganttSetOption(kind,checked){if(kind==='base')ganttShowBase=checked;else if(kind==='customer')ganttCustomer=checked;else ganttShowCritical=checked;ganttRerender()}
function ganttSetInternal(i,checked){ganttCommit(KapaGantt.setInternal(ganttDoc.tasks,i,checked))}
function ganttExportModel(format){
 const project=ganttProject(), tasks=ganttDoc.tasks, view=ganttView, rows=view.rows;
 const number=new Map(view.visible.map((i,at)=>[i,at+1])), index=new Map(tasks.map((task,i)=>[task.id,i]));
 const outRows=view.visible.map(i=>{
  const row=rows[i], task=tasks[i], base=view.baseline?.tasks?.[row.id];
  const predecessors=task.links.filter(link=>number.has(index.get(link.from))).map(link=>`${number.get(index.get(link.from))}${link.type==='FS'?'':KapaGantt.DE[link.type]}${link.lagDays?(link.lagDays>0?'+':'')+link.lagDays:''}`).join('; ');
  const out={nr:number.get(i),level:row.level,name:task.name,kind:row.summary?'summary':row.milestone?'milestone':'task',start:KapaGantt.iso(row.start),end:KapaGantt.iso(row.end),duration:row.duration,percent:row.percent,predecessors};
  if(base){out.baselineStart=base.start;out.baselineEnd=base.end;out.variance=KapaGantt.variance(view.baseline,row)}
  if(view.crit){out.slack=view.crit.slack[i];out.critical=view.crit.critical[i]}
  return out;
 });
 const links=[];
 tasks.forEach((task,to)=>{if(number.has(to))task.links.forEach(link=>{const from=index.get(link.from);if(number.has(from))links.push({from:number.get(from),to:number.get(to),type:link.type,lag:link.lagDays||0,critical:!!view.crit?.links.has(`${to}:${from}`)})})});
 return {format,projectName:project.name,projectNumber:project.number||'',createdAt:today,options:{baseline:!!view.baseline,critical:!!view.crit,customer:ganttCustomer},rows:outRows,links,gates:project.dates.map((date,i)=>({label:gates[i].replace('Gate ','G'),date}))};
}
async function ganttExport(format){
 ganttMenuClose();
 if(!ganttView||!ganttView.visible.length)return alert('Es gibt keine sichtbaren Vorgänge zum Exportieren.');
 const internal=ganttDoc.tasks.filter(task=>task.internal).length;
 if(!ganttCustomer&&internal&&!confirm(`Der Plan enthält ${internal} interne Vorgänge, die im Export enthalten wären. Für Kunden bitte zuerst „Kundenansicht“ einschalten. Trotzdem exportieren?`))return;
 ganttSetStatus('Export wird erstellt …');
 try{
  const response=await fetch(ganttUrl(ganttDoc.projectId)+'/export',{method:'POST',headers:{'Content-Type':'application/json','X-Kapa-Token':writeToken},body:JSON.stringify(ganttExportModel(format))});
  if(!response.ok){const e=await response.json().catch(()=>({}));throw Error(e.error||'Der Export konnte nicht erstellt werden.')}
  const blob=await response.blob(), link=document.createElement('a'), name=/filename="([^"]+)"/.exec(response.headers.get('Content-Disposition')||'')?.[1]||`Projektplan.${format}`;
  link.href=URL.createObjectURL(blob); link.download=name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(link.href),10000);
  ganttSetStatus('Export erstellt');
 }catch(error){ganttSetStatus('');alert('Export fehlgeschlagen: '+error.message)}
}
function ganttMenu(){return document.querySelector('#ganttExportMenu')}
function ganttMenuClose(){const menu=ganttMenu();if(menu)menu.open=false}
function ganttClass(){return ganttFull?'panel kapa-gantt is-full':'panel kapa-gantt'}
function ganttToggleFull(){
 ganttFull=!ganttFull;
 if(ganttFull){const request=document.documentElement.requestFullscreen?.();if(request)request.then(()=>{ganttNative=true}).catch(()=>{})}
 else ganttLeaveNative();
 ganttRerender();
}
function ganttLeaveNative(){if(ganttNative&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});ganttNative=false}
document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&ganttNative){ganttNative=false;if(ganttFull){ganttFull=false;if(page==='gantt')ganttRerender()}}});
function ganttScaleTo(next,clientX){
 if(next===ganttScale||!ganttView)return;
 const box=document.querySelector('.kapa-gantt-scroll'), tableWidth=box?.querySelector('.kapa-gantt-table')?.offsetWidth||0;
 let anchor=null;
 if(box){const offset=clientX===undefined?tableWidth+(box.clientWidth-tableWidth)/2:clientX-box.getBoundingClientRect().left;anchor={offset,day:(box.scrollLeft+offset-tableWidth)/ganttView.px}}
 ganttScale=next; ganttRerender();
 const after=document.querySelector('.kapa-gantt-scroll');
 if(after&&anchor&&ganttView)after.scrollLeft=Math.max(0,anchor.day*ganttView.px+tableWidth-anchor.offset);
}
function ganttScaleStep(direction,clientX){
 const at=ganttScales.indexOf(ganttScale);
 ganttScaleTo(ganttScales[Math.min(Math.max(at+direction,0),ganttScales.length-1)],clientX);
}
document.addEventListener('wheel',event=>{
 if(!(event.ctrlKey||event.metaKey)||page!=='gantt'||!ganttView||!event.target.closest?.('.kapa-gantt-chart'))return;
 event.preventDefault(); ganttWheel+=event.deltaY;
 if(Math.abs(ganttWheel)<40)return;
 const direction=ganttWheel<0?1:-1; ganttWheel=0; ganttScaleStep(direction,event.clientX);
},{passive:false});
function ganttSyncHeader(){
 if(ganttFull&&page!=='gantt'){ganttFull=false;ganttLeaveNative()}
 document.body.classList.toggle('kapa-gantt-fullscreen',ganttFull&&page==='gantt');
 const menu=ganttMenu(); if(!menu)return;
 menu.hidden=page!=='gantt'||!ganttDoc?.tasks?.length;
 if(menu.hidden)menu.open=false;
}
document.addEventListener('click',event=>{const menu=ganttMenu();if(menu?.open&&!menu.contains(event.target))menu.open=false});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const menu=ganttMenu();if(menu?.open){menu.open=false;menu.querySelector('summary')?.focus()}else if(ganttFull&&page==='gantt'&&!ganttDrag)ganttToggleFull()}});
function ganttToggle(id){ganttCollapsed.has(id)?ganttCollapsed.delete(id):ganttCollapsed.add(id);ganttRerender()}
function ganttCollapseAll(collapse){
 ganttCollapsed.clear();
 if(collapse){const {children}=KapaGantt.structure(ganttDoc.tasks);ganttDoc.tasks.forEach((task,i)=>{if(children[i].length)ganttCollapsed.add(task.id)})}
 ganttRerender();
}
function ganttSetZoom(zoom){ganttZoom=zoom;ganttScrollToday=false;ganttRerender()}
function ganttRemoveLink(to,fromId){
 const tasks=ganttDoc.tasks, source=tasks.find(task=>task.id===fromId);
 if(!confirm(`Verknüpfung von „${source?.name||'Vorgang'}“ zu „${tasks[to].name}“ entfernen?`))return;
 ganttCommit(KapaGantt.removeLink(tasks,to,fromId));
}
function ganttGoToday(){
 const box=document.querySelector('.kapa-gantt-scroll'); if(!box||!ganttView)return;
 box.scrollLeft=Math.max(0,ganttX(KapaGantt.num(today))-(box.clientWidth-(box.querySelector('.kapa-gantt-table')?.offsetWidth||0))/2);
}

/* ---------------------------------------------------------------- Zeitachse */
function ganttX(day){return (day-ganttView.rangeStart)*ganttView.px}
function ganttIsoWeek(n){
 const weekday=(((n+3)%7)+7)%7, thursday=n-weekday+3, year=new Date(thursday*86400000).getUTCFullYear();
 return Math.floor((thursday-Date.UTC(year,0,1)/86400000)/7)+1;
}
function ganttBuildView(rows,project,tasks){
 const px=ganttPx[ganttZoom]*ganttScale, gateDays=project.dates.map(KapaGantt.num), todayDay=KapaGantt.num(today);
 const away=ganttCustomer?KapaGantt.customerHidden(tasks,rows):new Set();
 const hidden=id=>{if(away.has(id))return true;for(let p=rows[id].parent;p!==null;p=rows[p].parent)if(ganttCollapsed.has(rows[p].id))return true;return false};
 const visible=rows.map((row,i)=>i).filter(i=>!hidden(i)), position=new Map(visible.map((i,at)=>[i,at]));
 const crit=ganttShowCritical?KapaGantt.criticalPath(tasks,rows):null, baseline=ganttShowBase&&ganttDoc.baseline?ganttDoc.baseline:null;
 const days=visible.flatMap(i=>{const base=baseline?.tasks?.[rows[i].id];return [rows[i].start,rows[i].end].concat(base?[KapaGantt.num(base.start),KapaGantt.num(base.end)]:[])}).concat(gateDays,[todayDay]);
 let first=Math.min(...days)-7, last=Math.max(...days)+28;
 first-=(((first+3)%7)+7)%7;
 if((last-first)*px<900)last=first+Math.ceil(900/px);
 return {rows,px,rangeStart:first,rangeEnd:last,visible,position,gateDays,crit,baseline,hiddenCount:away.size,width:(last-first)*px,height:visible.length*ganttRowH};
}
function ganttHeader(view){
 const {px,rangeStart,rangeEnd}=view, h=ganttHead, total=h.upper+h.lower+h.gates, upper=[], lower=[];
 const x=day=>(day-rangeStart)*px, utc=day=>new Date(day*86400000);
 const segments=(key,label)=>{const out=[];let from=rangeStart;for(let day=rangeStart;day<rangeEnd;day++){if(day===rangeEnd-1||key(day+1)!==key(day)){out.push({from,to:day+1,label:label(day)});from=day+1}}return out};
 const monthKey=day=>utc(day).getUTCFullYear()*12+utc(day).getUTCMonth(), yearKey=day=>utc(day).getUTCFullYear();
 if(ganttZoom==='month'){
  upper.push(...segments(yearKey,day=>String(yearKey(day))));
  lower.push(...segments(monthKey,day=>ganttMonths[utc(day).getUTCMonth()]));
 }else{
  upper.push(...segments(monthKey,day=>utc(day).toLocaleDateString('de-AT',{month:'long',year:'numeric',timeZone:'UTC'})));
  if(ganttZoom==='day')for(let day=rangeStart;day<rangeEnd;day++)lower.push({from:day,to:day+1,label:String(utc(day).getUTCDate()),weekend:!KapaGantt.isWork(day)});
  else for(let day=rangeStart;day<rangeEnd;day+=7)lower.push({from:day,to:day+7,label:String(ganttIsoWeek(day))});
 }
 const band=(items,y,height)=>items.map(item=>{
  const left=x(item.from), width=x(item.to)-left;
  return `<rect class="kapa-gantt-band ${item.weekend?'is-weekend':''}" x="${left}" y="${y}" width="${width}" height="${height}"/><text class="kapa-gantt-label" x="${left+width/2}" y="${y+height/2+4}" text-anchor="middle">${esc(width<26&&item.label.length>3?'':item.label)}</text>`;
 }).join('');
 const marks=view.gateDays.map((day,i)=>`<g><title>${esc(gates[i])} · ${fmt(KapaGantt.iso(day))}</title><path class="kapa-gantt-gate" d="M${x(day)} ${h.upper+h.lower+2} l6 7 l-6 7 l-6 -7 z"/><text class="kapa-gantt-gate-label" x="${x(day)+9}" y="${h.upper+h.lower+13}">${esc(gates[i].replace('Gate ','G'))}</text></g>`).join('');
 return `<svg class="kapa-gantt-head" width="${view.width}" height="${total}" role="presentation">${band(upper,0,h.upper)}${band(lower,h.upper,h.lower)}${marks}</svg>`;
}

/* ---------------------------------------------------------------- Diagramm */
function ganttAnchor(view,row,side){
 const at=view.position.get(row.index), y=at*ganttRowH+ganttRowH/2;
 if(row.milestone){const cx=ganttX(row.start)+view.px/2;return {x:side==='S'?cx-7:cx+7,y}}
 return {x:side==='S'?ganttX(row.start):ganttX(row.end+1),y};
}
function ganttLinkPath(from,to,sideFrom,sideTo){
 const dirS=sideFrom==='F'?1:-1, dirT=sideTo==='S'?-1:1, e0=from.x+dirS*10, e1=to.x+dirT*10;
 const fits=v=>(v-from.x)*dirS>=10&&(v-to.x)*dirT>=10, v=[e0,e1].find(fits);
 const points=v!==undefined?[[from.x,from.y],[v,from.y],[v,to.y],[to.x,to.y]]
  :(()=>{const ym=to.y>from.y?from.y+ganttRowH/2:from.y-ganttRowH/2;return [[from.x,from.y],[e0,from.y],[e0,ym],[e1,ym],[e1,to.y],[to.x,to.y]]})();
 return 'M'+points.map(p=>p.join(' ')).join(' L');
}
function ganttBody(view,tasks){
 const rows=view.rows, parts=[], h=view.height;
 view.visible.forEach((i,at)=>parts.push(`<rect class="kapa-gantt-rowbg ${at%2?'is-odd':''}" data-task="${esc(rows[i].id)}" x="0" y="${at*ganttRowH}" width="${view.width}" height="${ganttRowH}"/>`));
 if(ganttZoom!=='month')for(let day=view.rangeStart;day<view.rangeEnd;day++)if(!KapaGantt.isWork(day))parts.push(`<rect class="kapa-gantt-weekend" x="${ganttX(day)}" y="0" width="${view.px}" height="${h}"/>`);
 view.gateDays.forEach(day=>parts.push(`<line class="kapa-gantt-gateline" x1="${ganttX(day)}" x2="${ganttX(day)}" y1="0" y2="${h}"/>`));
 const todayX=ganttX(KapaGantt.num(today))+view.px/2;
 parts.push(`<line class="kapa-gantt-today" x1="${todayX}" x2="${todayX}" y1="0" y2="${h}"><title>Heute</title></line>`);
 const links=[];
 tasks.forEach((task,to)=>{
  if(!view.position.has(to))return;
  task.links.forEach(link=>{
   const from=rows.findIndex(row=>row.id===link.from);
   if(from<0||!view.position.has(from))return;
   const sideFrom=link.type[0], sideTo=link.type[1];
   const d=ganttLinkPath(ganttAnchor(view,rows[from],sideFrom),ganttAnchor(view,rows[to],sideTo),sideFrom,sideTo);
   const label=`Verknüpfung ${from+1} ${KapaGantt.DE[link.type]} nach ${to+1}. Klicken zum Entfernen`;
   const critical=view.crit?.links.has(`${to}:${from}`)?' is-critical':'';
   links.push(`<g class="kapa-gantt-linkgroup${critical}" data-task="${esc(rows[to].id)}"><title>${esc(label)}</title><path class="kapa-gantt-link-hit" d="${d}" onclick="ganttRemoveLink(${to},'${esc(link.from)}')"/><path class="kapa-gantt-link" d="${d}" marker-end="url(#kapa-gantt-arrow)"/></g>`);
  });
 });
 const bars=view.visible.map(i=>ganttBar(view,rows[i],tasks[i])).join('');
 return `<svg class="kapa-gantt-body" id="ganttBody" width="${view.width}" height="${h}" role="group" aria-label="Gantt-Diagramm"><defs><marker id="kapa-gantt-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path class="kapa-gantt-arrow" d="M0 0 L8 4 L0 8 z"/></marker></defs>${parts.join('')}${bars}${links.join('')}</svg>`;
}
function ganttBaselineShape(view,row,mid){
 const base=view.baseline?.tasks?.[row.id]; if(!base)return '';
 const start=KapaGantt.num(base.start), end=KapaGantt.num(base.end), title=`<title>Basisplan: ${fmt(base.start)} bis ${fmt(base.end)}</title>`;
 if(row.milestone){const cx=ganttX(start)+view.px/2;return `<path class="kapa-gantt-baseline" d="M${cx} ${mid+8} l5 5 l-5 5 l-5 -5 z">${title}</path>`}
 const x1=ganttX(start), x2=Math.max(ganttX(end+1),x1+4);
 return `<rect class="kapa-gantt-baseline" x="${x1}" y="${mid+(row.summary?11:ganttBarH/2+1)}" width="${x2-x1}" height="4" rx="1">${title}</rect>`;
}
function ganttBar(view,row,task){
 const at=view.position.get(row.index), top=at*ganttRowH, mid=top+ganttRowH/2;
 const name=`Vorgang ${row.index+1}, ${task.name}, ${fmt(KapaGantt.iso(row.start))} bis ${fmt(KapaGantt.iso(row.end))}, ${row.percent} %`;
 const common=`class="kapa-gantt-bar${view.crit?.critical[row.index]?' is-critical':''}" data-task="${esc(row.id)}" data-gantt-bar="${row.index}" tabindex="0" role="button" aria-label="${esc(name)}" onkeydown="ganttBarKey(event,${row.index})"`;
 const connectors=(l,r)=>`<circle class="kapa-gantt-connector" data-gantt-drag="from-start" data-i="${row.index}" cx="${l}" cy="${mid}" r="5"/><circle class="kapa-gantt-connector" data-gantt-drag="from-finish" data-i="${row.index}" cx="${r}" cy="${mid}" r="5"/>`;
 if(row.milestone){
  const cx=ganttX(row.start)+view.px/2;
  return `<g ${common}><title>${esc(name)}</title>${ganttBaselineShape(view,row,mid)}<path class="kapa-gantt-milestone" data-gantt-drag="move" data-i="${row.index}" d="M${cx} ${mid-9} l9 9 l-9 9 l-9 -9 z"/>${connectors(cx-12,cx+12)}</g>`;
 }
 const x1=ganttX(row.start), x2=Math.max(ganttX(row.end+1),x1+6), width=x2-x1;
 if(row.summary){
  return `<g ${common}><title>${esc(name)}</title>${ganttBaselineShape(view,row,mid)}<rect class="kapa-gantt-summary" data-gantt-drag="select" data-i="${row.index}" x="${x1}" y="${mid-5}" width="${width}" height="8" rx="1"/><path class="kapa-gantt-summary" d="M${x1} ${mid+3} h8 l-4 7 z M${x2} ${mid+3} h-8 l4 7 z"/>${connectors(x1-8,x2+8)}</g>`;
 }
 const done=width*row.percent/100;
 return `<g ${common}><title>${esc(name)}</title>${ganttBaselineShape(view,row,mid)}<rect class="kapa-gantt-bar-main" data-gantt-drag="move" data-i="${row.index}" x="${x1}" y="${mid-ganttBarH/2}" width="${width}" height="${ganttBarH}" rx="3"/>`
  +`<rect class="kapa-gantt-bar-progress" x="${x1}" y="${mid-ganttBarH/2+ganttBarH-6}" width="${done}" height="4" rx="1"/>`
  +`<rect class="kapa-gantt-handle" data-gantt-drag="resize" data-i="${row.index}" x="${x2-5}" y="${mid-ganttBarH/2}" width="5" height="${ganttBarH}"/>${connectors(x1-8,x2+8)}</g>`;
}
function ganttBarKey(event,i){
 const step={ArrowLeft:-1,ArrowRight:1}[event.key];
 if(!step||!ganttDoc)return;
 event.preventDefault();
 const row=ganttView.rows[i], result=event.shiftKey&&!row.milestone?KapaGantt.setDurationDays(ganttDoc.tasks,i,row.duration+step):KapaGantt.shiftStart(ganttDoc.tasks,i,step);
 ganttSel=row.id; const id=row.id;
 if(ganttCommit(result)){const node=document.querySelector(`[data-gantt-bar="${ganttDoc.tasks.findIndex(task=>task.id===id)}"]`);node?.focus?.({preventScroll:true})}
}

/* ---------------------------------------------------------------- Maus: verschieben, Länge ändern, verknüpfen */
document.addEventListener('pointerdown',event=>{
 const handle=event.target.closest?.('[data-gantt-drag]'), bar=event.target.closest?.('[data-gantt-bar]');
 if(!ganttView||event.button!==0)return;
 if(!handle){if(bar)ganttSelect(ganttView.rows[Number(bar.dataset.ganttBar)].id);return}
 const i=Number(handle.dataset.i), row=ganttView.rows[i], kind=handle.dataset.ganttDrag, group=handle.closest('[data-gantt-bar]');
 if(!row)return;
 event.preventDefault(); ganttSelect(row.id); group?.focus?.({preventScroll:true});
 if(kind==='select')return;
 try{handle.setPointerCapture?.(event.pointerId)}catch{}
 ganttDrag={kind,i,row,x:event.clientX,y:event.clientY,days:0,moved:false,group,main:group?.querySelector('.kapa-gantt-bar-main'),progress:group?.querySelector('.kapa-gantt-bar-progress'),handle:group?.querySelector('.kapa-gantt-handle')};
});
document.addEventListener('pointermove',event=>{
 const drag=ganttDrag; if(!drag)return;
 const dx=event.clientX-drag.x;
 if(Math.abs(dx)+Math.abs(event.clientY-drag.y)>3)drag.moved=true;
 if(drag.kind==='move'){
  drag.days=Math.round(dx/ganttView.px);
  drag.group.setAttribute('transform',`translate(${drag.days*ganttView.px},0)`);
 }else if(drag.kind==='resize'&&drag.main){
  const width=Math.max(6,ganttX(drag.row.end+1)-ganttX(drag.row.start)+dx);
  drag.days=Math.round(dx/ganttView.px);
  drag.main.setAttribute('width',width);
  drag.handle?.setAttribute('x',ganttX(drag.row.start)+width-5);
 }else if(drag.kind==='from-start'||drag.kind==='from-finish'){
  const svg=document.querySelector('#ganttBody'), box=svg.getBoundingClientRect(), side=drag.kind==='from-start'?'S':'F';
  const from=ganttAnchor(ganttView,drag.row,side);
  let path=svg.querySelector('.kapa-gantt-draft');
  if(!path){path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('class','kapa-gantt-draft');svg.appendChild(path)}
  path.setAttribute('d',`M${from.x} ${from.y} L${event.clientX-box.left} ${event.clientY-box.top}`);
 }
});
document.addEventListener('pointerup',event=>{
 const drag=ganttDrag; if(!drag)return; ganttDrag=null;
 const tasks=ganttDoc.tasks, row=drag.row;
 if(drag.kind==='move'){
  if(!drag.moved||!drag.days)return ganttRerender();
  const target=KapaGantt.nextWork(row.start+drag.days);
  ganttCommit(KapaGantt.shiftStart(tasks,drag.i,KapaGantt.workBetween(row.start,target)));
 }else if(drag.kind==='resize'){
  if(!drag.moved||!drag.days)return ganttRerender();
  const end=KapaGantt.prevWork(row.end+drag.days);
  ganttCommit(KapaGantt.setDurationDays(tasks,drag.i,KapaGantt.workBetween(row.start,end)+1));
 }else{
  document.querySelector('.kapa-gantt-draft')?.remove();
  const over=document.elementFromPoint(event.clientX,event.clientY)?.closest?.('[data-gantt-bar]');
  if(!over||!drag.moved)return;
  const target=Number(over.dataset.ganttBar), box=over.getBoundingClientRect(), side=event.clientX<box.left+box.width/2?'S':'F';
  const type=(drag.kind==='from-start'?'S':'F')+side;
  ganttCommit(KapaGantt.addLink(tasks,drag.i,target,type));
 }
});
document.addEventListener('pointercancel',()=>{if(ganttDrag){ganttDrag=null;ganttRerender()}});

/* ---------------------------------------------------------------- Seite */
function ganttCell(kind,i,value,label,extra=''){
 return `<input class="kapa-gantt-cell" data-kind="${kind}" value="${esc(value)}" aria-label="${esc(label)}" ${extra} onchange="ganttEdit('${kind}',${i},this)">`;
}
function ganttTable(view,tasks){
 const rows=view.rows, {children}=KapaGantt.structure(tasks);
 const body=view.visible.map(i=>{
  const row=rows[i], task=tasks[i], n=i+1, locked=row.summary;
  const toggle=children[i].length?`<button type="button" class="pt-button pt-button--subtle kapa-gantt-toggle" aria-expanded="${!ganttCollapsed.has(task.id)}" aria-label="${ganttCollapsed.has(task.id)?'Aufklappen':'Zuklappen'}: ${esc(task.name)}" onclick="ganttToggle('${esc(task.id)}')">${ganttCollapsed.has(task.id)?'▸':'▾'}</button>`:'<span class="kapa-gantt-toggle-space"></span>';
  const slackCell=view.crit?`<td><span class="kapa-gantt-readonly ${view.crit.critical[i]?'kapa-gantt-critical-text':''}">${view.crit.slack[i]} d</span></td>`:'';
  const variance=view.baseline?KapaGantt.variance(view.baseline,row):null, varianceCell=view.baseline?`<td><span class="kapa-gantt-readonly ${variance>0?'kapa-gantt-critical-text':''}" title="Abweichung des Endes vom Basisplan in Arbeitstagen">${variance===null?'–':(variance>0?'+':'')+variance+' d'}</span></td>`:'';
  const date=(kind,iso)=>locked?`<span class="kapa-gantt-readonly">${fmt(iso)}</span>`:ganttCell(kind,i,iso,`${kind==='start'?'Anfang':'Ende'} von Vorgang ${n}`,'type="date"');
  return `<tr class="${row.summary?'is-summary':''} ${task.internal?'is-internal':''} ${task.id===ganttSel?'is-selected':''}" data-task="${esc(task.id)}" onclick="ganttSelect('${esc(task.id)}')">
   <td class="kapa-gantt-nr">${n}</td>
   <td class="kapa-gantt-name"><div class="kapa-gantt-namebox" style="padding-left:${task.level*1.25}rem">${toggle}${ganttCell('name',i,task.name,`Name von Vorgang ${n}`,'maxlength="120"')}</div></td>
   <td>${locked?`<span class="kapa-gantt-readonly">${row.duration} d</span>`:ganttCell('duration',i,row.duration,`Dauer von Vorgang ${n} in Arbeitstagen`,'inputmode="numeric"')}</td>
   <td>${date('start',KapaGantt.iso(row.start))}</td>
   <td>${date('end',KapaGantt.iso(row.end))}</td>
   <td>${locked?'':ganttCell('links',i,KapaGantt.formatLinks(tasks,i),`Vorgänger von Vorgang ${n}`,'placeholder="z. B. 3EA+2"')}</td>
   <td>${locked?`<span class="kapa-gantt-readonly">${row.percent} %</span>`:ganttCell('percent',i,row.percent,`Fortschritt von Vorgang ${n} in Prozent`,'inputmode="numeric"')}</td>
   <td class="kapa-gantt-center"><input type="checkbox" class="kapa-gantt-internal" ${task.internal?'checked':''} aria-label="Vorgang ${n} intern, für Kunden ausblenden" title="Intern: in Kundenansicht und Export ausgeblendet" onclick="event.stopPropagation()" onchange="ganttSetInternal(${i},this.checked)"></td>${varianceCell}${slackCell}</tr>`;
 }).join('');
 const extra=(view.baseline?1:0)+(view.crit?1:0), widthRem=54.25+extra*4.5;
 return `<table class="kapa-gantt-table" style="width:${widthRem}rem"><colgroup><col style="width:2.75rem"><col style="width:15rem"><col style="width:4.5rem"><col style="width:8.5rem"><col style="width:8.5rem"><col style="width:6.5rem"><col style="width:4.5rem"><col style="width:4rem">${'<col style="width:4.5rem">'.repeat(extra)}</colgroup>
  <thead><tr style="height:${ganttHead.upper+ganttHead.lower+ganttHead.gates}px"><th scope="col">Nr.</th><th scope="col">Vorgang</th><th scope="col">Dauer</th><th scope="col">Anfang</th><th scope="col">Ende</th><th scope="col">Vorgänger</th><th scope="col">%</th><th scope="col">Intern</th>${view.baseline?'<th scope="col">Abw.</th>':''}${view.crit?'<th scope="col">Puffer</th>':''}</tr></thead><tbody>${body}</tbody></table>`;
}
function ganttToolbar(full=false){
 const hasBaseline=!!ganttDoc?.baseline;
 const option=(kind,label,checked)=>`<label class="kapa-gantt-option"><input type="checkbox" ${checked?'checked':''} onchange="ganttSetOption('${kind}',this.checked)"> ${label}</label>`;
 const button=(label,action,extra='')=>`<button type="button" class="secondary" onclick="${action}" ${extra}>${label}</button>`;
 const zoom=`<div class="pt-segmented" role="group" aria-label="Zeitraster">${[['day','Tag'],['week','Woche'],['month','Monat']].map(([value,label])=>`<label class="pt-segmented__option"><input class="pt-segmented__input" type="radio" name="gantt-zoom" value="${value}" ${ganttZoom===value?'checked':''} onchange="ganttSetZoom(this.value)"><span class="pt-segmented__label">${label}</span></label>`).join('')}</div>`;
 const atMin=ganttScale<=ganttScales[0], atMax=ganttScale>=ganttScales[ganttScales.length-1];
 const scale=`<div class="kapa-gantt-scale" role="group" aria-label="Vergrößerung">${button('−','ganttScaleStep(-1)',`aria-label="Verkleinern" title="Verkleinern (Strg + Mausrad)" ${atMin?'disabled':''}`)}${button(Math.round(ganttScale*100)+' %','ganttScaleTo(1)','title="Auf 100 % zurücksetzen" aria-label="Vergrößerung zurücksetzen"')}${button('+','ganttScaleStep(1)',`aria-label="Vergrößern" title="Vergrößern (Strg + Mausrad)" ${atMax?'disabled':''}`)}</div>`;
 const fullExport=ganttFull?`${button('PDF',"ganttExport('pdf')")}${button('Excel',"ganttExport('xlsx')")}${button('MS Project',"ganttExport('xml')")}`:'';
 const fullLabel=ganttFull?'Vollbild beenden (Esc)':'Vollbild';
 const fullButton=`<button type="button" class="pt-icon-button pt-icon-button--subtle kapa-gantt-fullbtn" aria-label="${fullLabel}" title="${fullLabel}" aria-pressed="${ganttFull}" onclick="ganttToggleFull()"><svg class="pt-icon" aria-hidden="true" focusable="false"><use href="#pt-icon-${ganttFull?'close':'expand'}"></use></svg></button>`;
 const projects=[...state.projects].sort((a,b)=>a.name.localeCompare(b.name,'de')).map(p=>`<option value="${esc(p.id)}" ${p.id===ganttProjectId?'selected':''}>${esc(p.number?p.number+' · ':'')}${esc(p.name)}</option>`).join('');
 return `<div class="kapa-gantt-toolbar">${fullButton}<div class="pt-field kapa-gantt-project"><label class="pt-field__label" for="ganttProject">Projekt</label><select id="ganttProject" class="pt-select" data-pt-search="off" onchange="ganttSelectProject(this.value)">${projects}</select></div>
  ${full?`<div class="actions kapa-gantt-actions">${button('＋ Vorgang',"ganttAdd('task')")}${button('◆ Meilenstein',"ganttAdd('milestone')")}${button('← Ausrücken',"ganttAct('outdent')")}${button('Einrücken →',"ganttAct('indent')")}${button('↑ Nach oben',"ganttAct('up')")}${button('↓ Nach unten',"ganttAct('down')")}<button type="button" class="danger" onclick="ganttAct('delete')">Löschen</button></div>
  <div class="actions kapa-gantt-actions">${zoom}${scale}${button('Heute','ganttGoToday()')}${button('Alles zuklappen','ganttCollapseAll(true)')}${button('Alles aufklappen','ganttCollapseAll(false)')}${fullExport}</div>
  <div class="actions kapa-gantt-actions">${button(hasBaseline?'Basisplan überschreiben':'Basisplan speichern','ganttSaveBaseline()')}${hasBaseline?button('Basisplan löschen','ganttDeleteBaseline()'):''}${hasBaseline?option('base','Basisplan anzeigen',ganttShowBase):''}${option('critical','Kritischer Pfad',ganttShowCritical)}${option('customer','Kundenansicht',ganttCustomer)}<span id="ganttStatus" class="quiet" role="status" aria-live="polite">${esc(ganttSaveText)}</span></div>`:''}</div>`;
}
function ganttLegend(){
 const items=[];
 if(ganttCustomer)items.push(`<span><i class="kapa-gantt-key kapa-gantt-key-customer"></i> Kundenansicht: ${ganttView?.hiddenCount||0} interne Zeilen ausgeblendet, Export enthält nur die sichtbaren Zeilen</span>`);
 if(ganttShowCritical)items.push('<span><i class="kapa-gantt-key kapa-gantt-key-critical"></i> Kritischer Pfad (Puffer 0 Arbeitstage)</span>');
 if(ganttShowBase&&ganttDoc.baseline)items.push(`<span><i class="kapa-gantt-key kapa-gantt-key-baseline"></i> Basisplan vom ${fmt(ganttDoc.baseline.savedAt)}</span>`);
 return items.length?`<div class="kapa-gantt-legend" role="note">${items.join('')}</div>`:'';
}
function ganttPage(){
 if(!state.projects.length)return `<div class="notice">Lege zuerst ein Projekt an. Der Projektplan gehört immer zu einem Projekt.</div>`;
 if(!ganttProject()){ganttProjectId=[...state.projects].sort((a,b)=>a.name.localeCompare(b.name,'de'))[0].id;ganttDoc=null}
 if(!ganttDoc&&!ganttLoading&&!ganttError)ganttLoad();
 const project=ganttProject(), hasTasks=!!ganttDoc?.tasks.length, toolbar=ganttToolbar(hasTasks);
 if(ganttError)return `<section class="${ganttClass()}">${toolbar}<div class="pt-alert pt-alert--danger" role="alert"><span>${esc(ganttError)}</span><button type="button" class="secondary" onclick="ganttReload()">Erneut laden</button></div></section>`;
 if(!ganttDoc)return `<section class="${ganttClass()}">${toolbar}<p class="quiet" role="status">Projektplan wird geladen …</p></section>`;
 const tasks=ganttDoc.tasks, result=KapaGantt.schedule(tasks);
 const notice=ganttMessage?`<div class="pt-alert pt-alert--warning" role="alert"><span>${esc(ganttMessage)}</span></div>`:'';
 if(result.error)return `<section class="${ganttClass()}">${toolbar}<div class="pt-alert pt-alert--danger" role="alert">${esc(result.error)}</div></section>`;
 if(!tasks.length){
  ganttView=null;
  return `<section class="${ganttClass()}">${toolbar}${notice}<div class="empty kapa-gantt-empty"><p>Für dieses Projekt gibt es noch keinen Projektplan.</p><div class="actions"><button type="button" class="primary" onclick="ganttAdd('task')">Ersten Vorgang anlegen</button><button type="button" class="secondary" onclick="ganttFromGates()">Phasen aus den Gates übernehmen</button></div></div></section>`;
 }
 ganttView=ganttBuildView(result.rows,project,tasks);
 if(ganttScrollToday){ganttScrollToday=false;setTimeout(ganttGoToday,0)}
 return `<section class="${ganttClass()}">${toolbar}${notice}
  ${ganttFull?'':`<p class="pt-field__help kapa-gantt-help">Vorgänger: Nummer des Vorgangs, optional Art (EA, AA, EE, AE) und Zeitabstand in Arbeitstagen, z. B. <b>3</b>, <b>4AA</b>, <b>5EA+2</b>. Balken verschieben oder am rechten Rand verlängern. Von einem Punkt am Balkenende zu einem anderen Balken ziehen, um zu verknüpfen. Klick auf eine Linie entfernt die Verknüpfung. Mit Strg + Mausrad über dem Diagramm wird gezoomt.</p>`}
  ${ganttLegend()}
  <div class="kapa-gantt-scroll" role="region" tabindex="0" aria-label="Projektplan, horizontal und vertikal scrollbar"><div class="kapa-gantt-grid">${ganttTable(ganttView,tasks)}<div class="kapa-gantt-chart">${ganttHeader(ganttView)}${ganttBody(ganttView,tasks)}</div></div></div></section>`;
}
