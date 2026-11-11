/* Project-specific composition of the UI kit's table, segmented controls and chart recipe. */
let fineDraft = null;
let detailGranularity = null;

function grainSelector(name, selected, action) {
  return `<div class="pt-segmented" role="group" aria-label="Planungsraster">${[['week','Wochen'],['month','Monate']].map(([value,label])=>
    `<label class="pt-segmented__option"><input class="pt-segmented__input" type="radio" name="${name}" value="${value}" ${selected===value?'checked':''} onchange="${action}(this.value)"><span class="pt-segmented__label">${label}</span></label>`).join('')}</div>`;
}

function gateMarkerLayout(project, columns) {
  if(!project) return [];
  const width=192+96*columns.length, laneEnds=[];
  return KapaHours.milestones(project,columns).map(marker=>{
    const x=192+96*marker.position, labelX=Math.max(232,Math.min(width-40,x));
    let lane=laneEnds.findIndex(end=>labelX-40>=end+6);
    if(lane<0) lane=laneEnds.length;
    laneEnds[lane]=labelX+40;
    return {...marker,x,labelX,lane,labelY:18+lane*32};
  });
}

function hoursChart(rows, columns, chartId, project=null) {
  const data=KapaHours.summary(rows,columns), labelWidth=192, periodWidth=96, width=labelWidth+periodWidth*columns.length;
  const markers=gateMarkerLayout(project,columns);
  const top=markers.length?54+Math.max(...markers.map(marker=>marker.lane))*32:30, bottom=top+142, ceiling=Math.max(4,Math.ceil(Math.max(0,...data.map(item=>item.total))/4)*4);
  const y=value=>bottom-(bottom-top)*value/ceiling;
  const grid=Array.from({length:5},(_,i)=>{
    const value=ceiling*i/4, at=y(value);
    return `<line x1="${labelWidth}" y1="${at}" x2="${width}" y2="${at}"/><text x="${labelWidth-12}" y="${at+4}" text-anchor="end">${value.toLocaleString('de-AT')} h</text>`;
  }).join('');
  const bars=data.map((item,index)=>{
    const x=labelWidth+(index+.5)*periodWidth;
    return `<g><title>${esc(item.title)}: Basis ${item.base} h, Planwertänderung ${item.change} h, Gesamt ${item.total} h</title>
      <rect class="kapa-hours-base" x="${x-15}" y="${y(item.base)}" width="30" height="${bottom-y(item.base)}"/>
      <rect class="kapa-hours-change" x="${x-15}" y="${y(item.total)}" width="30" height="${y(item.base)-y(item.total)}"/>
      <circle class="kapa-hours-point" cx="${x}" cy="${y(item.total)}" r="3"/>
      <text class="kapa-hours-reading" x="${x}" y="${Math.max(14,y(item.total)-9)}" text-anchor="middle">${item.total}</text></g>`;
  }).join('');
  const points=data.map((item,index)=>`${labelWidth+(index+.5)*periodWidth},${y(item.total)}`).join(' ');
  const gateLines=markers.map(marker=>`<path class="kapa-gate-line" d="M${marker.labelX},${marker.labelY+18} L${marker.x},${top-8} V${bottom}"/>`).join('');
  const gateLabels=markers.map(marker=>{
    const point=Math.min(width-5,marker.x);
    return `<g class="kapa-gate-marker"><title>${marker.name} · ${fmt(marker.date)}</title><rect x="${marker.labelX-40}" y="${marker.labelY-13}" width="80" height="30"/>
      <text x="${marker.labelX}" y="${marker.labelY}" text-anchor="middle"><tspan>${marker.short}</tspan><tspan class="kapa-gate-date" x="${marker.labelX}" dy="13">${fmt(marker.date)}</tspan></text>
      <path class="kapa-gate-diamond" d="M${point},${top-13} l5,5 -5,5 -5,-5 Z"/></g>`;
  }).join('');
  return `<svg class="kapa-hours-chart" viewBox="0 0 ${width} ${bottom+24}" role="img" aria-labelledby="${chartId}-title ${chartId}-description">
    <title id="${chartId}-title">Stundenverlauf von links nach rechts</title>
    <desc id="${chartId}-description">Basisstunden und Planwertänderungen als gestapelte Balken, Gesamtstunden als Linie. Gates sind datumsgenau mit Meilenstein und Datum markiert. Die genauen Stunden stehen in der Tabelle darunter.</desc>
    ${gateLines}<g class="kapa-hours-grid">${grid}</g><polyline class="kapa-hours-line" points="${points}"/>${bars}${gateLabels}</svg>`;
}

function hoursLegend() {
  return `<div class="kapa-hours-legend" aria-label="Diagrammlegende"><span><i class="kapa-hours-base" aria-hidden="true"></i>Basisstunden</span><span><i class="kapa-hours-change" aria-hidden="true"></i>Planwertänderung</span><span><i class="kapa-hours-line-key" aria-hidden="true"></i>Gesamtverlauf</span></div>`;
}

function hoursTimeline(rows, columns, editable=false, project=null) {
  const data=KapaHours.summary(rows,columns);
  return `<div class="kapa-timeline-scroll" role="region" aria-label="Stundenplanung von links nach rechts, horizontal scrollbar" tabindex="0">
    <div class="kapa-timeline" style="--kapa-period-count:${columns.length}">
      <div ${editable?'id="fineChart"':''}>${hoursChart(rows,columns,editable?'fine-hours':'project-hours',project)}</div>
      <table class="pt-table kapa-hours-table"><caption class="pt-visually-hidden">${editable?'Ganze Stunden pro Zeitraum bearbeiten':'Geplante Stunden pro Zeitraum'}</caption>
      <colgroup><col class="kapa-hours-label-column">${columns.map(()=>'<col class="kapa-hours-period-column">').join('')}</colgroup>
      <thead><tr><th scope="col">${editable?'Stunden je Phase':'Phase'}</th>${columns.map(period=>`<th scope="col" title="${esc(period.title)}">${esc(period.label)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row,rowIndex)=>`<tr class="${row.kind==='change'?'kapa-source-change':''}"><th scope="row"><strong>${esc(row.label)}</strong><span class="sub">Budget: ${row.budget} h</span>${editable?`<span id="fine-row-${rowIndex}" class="pt-status"></span><button class="pt-button pt-button--subtle" type="button" onclick="balanceFineRow(${rowIndex})">Ausgleichen</button>`:''}</th>
        ${columns.map((period,columnIndex)=>{
          const active=KapaHours.activeDays(row,period).length>0, value=KapaHours.periodTotal(row,period);
          if(!editable) return `<td>${active?value+' h':'—'}</td>`;
          return `<td>${active?`<input class="pt-input" type="number" min="0" max="1000000" step="1" value="${value}" aria-label="${esc(row.label)} · ${esc(period.title)} · Stunden" oninput="changeFineHours(${rowIndex},${columnIndex},this)">`:'<span aria-label="Außerhalb der Phase">—</span>'}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">Gesamtstunden</th>${data.map((item,index)=>`<td ${editable?`id="fine-total-${index}"`:''}><strong>${item.total} h</strong></td>`).join('')}</tr></tfoot>
      </table>
    </div></div>`;
}

function projectHoursSection(project) {
  const granularity=detailGranularity||KapaHours.defaultGranularity(project);
  const rows=KapaHours.sources(project), columns=KapaHours.periods(project,granularity);
  return `<section class="panel"><div class="panelhead"><div><span class="section-kicker">FEINPLANUNG</span><h2>PL-Stundenverlauf</h2></div><div class="actions">${grainSelector('project-grain',granularity,'setProjectGranularity')}<button class="secondary" onclick="editHours('${project.id}')">Verlauf bearbeiten</button></div></div>
  ${hoursLegend()}${hoursTimeline(rows,columns,false,project)}</section>`;
}

function setProjectGranularity(granularity) { detailGranularity=granularity; render(); }

function fineBody() {
  const project=state.projects.find(item=>item.id===fineDraft.projectId);
  const columns=KapaHours.periods(project,fineDraft.granularity);
  return `<div class="kapa-fine-toolbar">${grainSelector('fine-grain',fineDraft.granularity,'setFineGranularity')}<span id="fine-summary" role="status" aria-live="polite"></span></div>
    <p class="pt-field__help">Ganze Stunden direkt eingeben. „Ausgleichen“ verteilt die Reststunden auf noch unbearbeitete Zeiträume derselben Phase. Jede Phase muss ihr Budget erreichen.</p>
    ${hoursLegend()}${hoursTimeline(fineDraft.rows,columns,true,project)}`;
}

function editHours(projectId) {
  const project=state.projects.find(item=>item.id===projectId);
  fineDraft={projectId,granularity:detailGranularity||KapaHours.defaultGranularity(project),rows:KapaHours.sources(project),protectedDays:new Map(),invalid:new Set()};
  openModal('Stundenverlauf planen',fineBody(),`<button class="secondary" onclick="closeModal()">Abbrechen</button><button id="fineSave" class="primary" onclick="saveFineHours()">Verlauf speichern</button>`);
  updateFineSummary();
}

function setFineGranularity(granularity) {
  if(fineDraft.invalid.size) {
    alert('Bitte die ungültigen Stundenwerte zuerst korrigieren.');
    document.querySelectorAll('input[name="fine-grain"]').forEach(input=>input.checked=input.value===fineDraft.granularity);
    return;
  }
  fineDraft.granularity=granularity;
  $('#dialogContent').innerHTML=fineBody();
  updateFineSummary();
}

function changeFineHours(rowIndex, columnIndex, input) {
  const project=state.projects.find(item=>item.id===fineDraft.projectId), row=fineDraft.rows[rowIndex];
  const period=KapaHours.periods(project,fineDraft.granularity)[columnIndex], cell=`${rowIndex}:${columnIndex}`;
  const hours=input.value.trim()===''?NaN:Number(input.value);
  try {
    const protectedDays=KapaHours.editPeriod(row,period,hours);
    if(!fineDraft.protectedDays.has(row.id)) fineDraft.protectedDays.set(row.id,new Set());
    protectedDays.forEach(date=>fineDraft.protectedDays.get(row.id).add(date));
    fineDraft.invalid.delete(cell);
    input.removeAttribute('aria-invalid');
    input.setCustomValidity('');
  } catch(error) {
    fineDraft.invalid.add(cell);
    input.setAttribute('aria-invalid','true');
    input.setCustomValidity(error.message);
  }
  updateFineSummary();
}

function updateFineSummary() {
  const project=state.projects.find(item=>item.id===fineDraft.projectId), columns=KapaHours.periods(project,fineDraft.granularity);
  const data=KapaHours.summary(fineDraft.rows,columns);
  let unmatched=0;
  fineDraft.rows.forEach((row,index)=>{
    const hours=KapaHours.rowTotal(row), rest=row.budget-hours, status=$(`#fine-row-${index}`);
    if(rest) unmatched++;
    status.className=`pt-status pt-status--${rest?'warning':'success'}`;
    status.textContent=rest>0?`${rest} h offen`:rest<0?`${-rest} h zu viel`:'Budget verteilt';
  });
  data.forEach((item,index)=>$(`#fine-total-${index}`).textContent=item.total+' h');
  const total=data.reduce((sum,item)=>sum+item.total,0);
  $('#fine-summary').textContent=`${total} / ${totals(project)} h${fineDraft.invalid.size?' · Ungültige Eingabe':unmatched?` · ${unmatched} Phasen noch nicht abgeglichen`:' · Vollständig verteilt'}`;
  $('#fineSave').disabled=Boolean(unmatched||fineDraft.invalid.size);
  $('#fineChart').innerHTML=hoursChart(fineDraft.rows,columns,'fine-hours',project);
}

function balanceFineRow(rowIndex) {
  if(fineDraft.invalid.size) return alert('Bitte zuerst die ungültigen Stundenwerte korrigieren.');
  const row=fineDraft.rows[rowIndex];
  try { KapaHours.balance(row,fineDraft.protectedDays.get(row.id)||new Set()); }
  catch(error) { return alert(error.message); }
  const scroll=$('#dialogContent .kapa-timeline-scroll').scrollLeft;
  $('#dialogContent').innerHTML=fineBody();
  $('#dialogContent .kapa-timeline-scroll').scrollLeft=scroll;
  updateFineSummary();
}

function saveFineHours() {
  if(fineDraft.invalid.size || fineDraft.rows.some(row=>KapaHours.rowTotal(row)!==row.budget)) return alert('Bitte die Stunden jeder Phase zuerst vollständig ausgleichen.');
  const project=state.projects.find(item=>item.id===fineDraft.projectId);
  project.hourPlan=KapaHours.snapshot(fineDraft.rows,fineDraft.granularity);
  delete project.weights;
  detailGranularity=fineDraft.granularity;
  fineDraft=null;
  closeModal();
  persist();
}
