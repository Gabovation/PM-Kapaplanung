/* Forecast chart and per-person utilisation matrix, composed from existing UI-kit surfaces. */
const forecastCounts={week:12,month:12};

function forecastGrainSelector() {
  return `<div class="pt-segmented" role="group" aria-label="Zeitraster der Übersicht">${[['week','Woche'],['month','Monat']].map(([value,label])=>`<label class="pt-segmented__option"><input class="pt-segmented__input" type="radio" name="overview-grain" value="${value}" ${mode===value?'checked':''} onchange="setMode(this.value)"><span class="pt-segmented__label">${label}</span></label>`).join('')}</div>`;
}

function teamCapacityLevel(value) {
  return value>=100?'critical':value>=85?'warning':'normal';
}

function forecastHorizon(start, granularity, minimum, projects) {
  const base=granularity==='week'?monday(start):new Date(start.getFullYear(),start.getMonth(),1);
  const utcDay=d=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000;
  const ends=projects.map(project=>project.dates?.[4]).filter(validGateDate).map(value=>addDays(date(value),-1));
  const last=Math.max(-1,...ends.map(end=>granularity==='week'?Math.floor((utcDay(end)-utcDay(base))/7):(end.getFullYear()-base.getFullYear())*12+end.getMonth()-base.getMonth()));
  const requested=Math.max(minimum,last+1);
  return {count:Math.min(600,requested),truncated:requested>600};
}

function forecastChart(model) {
  const width=192+96*model.columns.length, left=192, top=24, bottom=196;
  const finite=model.team.flatMap(period=>[period.ratio,period.peak]).filter(Number.isFinite);
  const ceiling=Math.max(125,Math.ceil(Math.max(100,...finite)/25)*25), y=value=>bottom-(bottom-top)*Math.min(Number.isFinite(value)?value:ceiling,ceiling)/ceiling;
  const grid=Array.from({length:5},(_,index)=>{
    const value=ceiling*index/4, at=y(value);
    return `<line x1="${left}" y1="${at}" x2="${width}" y2="${at}"/><text x="${left-12}" y="${at+4}" text-anchor="end">${KapaCapacity.percent(value)} %</text>`;
  }).join('');
  const teamPoints=model.team.map((period,index)=>`${left+(index+.5)*96},${y(period.ratio)}`).join(' ');
  const peakPoints=model.team.map((period,index)=>`${left+(index+.5)*96},${y(period.peak)}`).join(' ');
  const wonPoints=model.team.map((period,index)=>`${left+(index+.5)*96},${y(period.wonRatio)}`).join(' ');
  const combinedPoints=model.team.map((period,index)=>`${left+(index+.5)*96},${y(period.combinedRatio)}`).join(' ');
  const showTeam=model.team.some(period=>period.load-period.wonLoad-period.expectedLoad>1e-9);
  const points=model.team.map((period,index)=>{
    const x=left+(index+.5)*96, peakY=y(period.peak), title=`${period.title}: Gewonnen ${period.wonLoad} h (${KapaCapacity.percent(period.wonRatio)} % der Teamkapazität), gewonnen + erwartet ${period.wonLoad+period.expectedLoad} h (${KapaCapacity.percent(period.combinedRatio)} %); davon erwartet ${period.expectedLoad} h; Team gesamt ${KapaCapacity.percent(period.ratio)} %; höchste Person ${period.peakPerson?.name||'—'} ${KapaCapacity.percent(period.peak)} %`;
    return `<g class="kapa-capacity-point" role="button" tabindex="0" aria-label="${esc(title)}. Zeitraum anzeigen" onclick="focusForecastPeriod(${index})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();focusForecastPeriod(${index})}"><title>${esc(title)}</title>
      <circle class="${showTeam?'kapa-capacity-team-point':'kapa-capacity-combined-point'}" cx="${x}" cy="${y(showTeam?period.ratio:period.combinedRatio)}" r="4"/>
      <path class="${period.overloadedPeople?'kapa-capacity-over':'kapa-capacity-peak-point'}" d="M${x},${peakY-5} l5,5 -5,5 -5,-5 Z"/>
      ${period.overloadedPeople?`<text class="kapa-capacity-over-label" x="${x}" y="${Math.max(14,peakY-10)}" text-anchor="middle">${KapaCapacity.percent(period.peak)} %</text>`:''}</g>`;
  }).join('');
  return `<svg class="kapa-hours-chart" viewBox="0 0 ${width} 220" role="img" aria-labelledby="forecast-chart-title forecast-chart-description">
    <title id="forecast-chart-title">Kapazitätsvorschau</title><desc id="forecast-chart-description">Gewonnene Projekte und gewonnene plus erwartete Projekte als Anteil der Teamkapazität sowie höchste Einzelauslastung je Zeitraum. Bei weiteren Status erscheint zusätzlich die gesamte Teamauslastung. Die gestrichelte Grenzlinie markiert 100 Prozent Kapazität. Überschreitungen sind mit Prozentwert und in der Personenmatrix gekennzeichnet.</desc>
    <rect class="kapa-capacity-over-band" x="${left}" y="${top}" width="${width-left}" height="${y(100)-top}"/>
    <g class="kapa-hours-grid">${grid}</g><path class="kapa-capacity-limit" d="M${left},${y(100)} H${width}"/>
    ${showTeam?`<polyline class="kapa-capacity-team" points="${teamPoints}"/>`:''}<polyline class="kapa-capacity-peak" points="${peakPoints}"/><polyline class="kapa-capacity-won" points="${wonPoints}"/><polyline class="kapa-capacity-combined" points="${combinedPoints}"/>${points}</svg>`;
}

function capacityForecast(model, truncated=false) {
  const unit=mode==='week'?'Wochen':'Monate', counts=mode==='week'?[12,26,52]:[12,24,36];
  const controls=`<label class="pt-field__label" for="forecast-count">Vorschau mindestens</label><select class="pt-select" id="forecast-count" data-pt-search="off" onchange="setForecastCount(this.value)">${counts.map(count=>`<option value="${count}" ${forecastCounts[mode]===count?'selected':''}>${count} ${unit}</option>`).join('')}</select>`;
  const summary=model.firstBottleneck?`<div class="pt-alert pt-alert--warning" role="status"><span><strong>Erster Engpass: ${esc(model.firstBottleneck.period.title)}</strong> · ${esc(model.firstBottleneck.person.name)} · ${KapaCapacity.percent(model.firstBottleneck.period.peak)} %. ${model.affectedPeople} ${model.affectedPeople===1?'Person':'Personen'} im Vorschaufenster überlastet.</span></div>`:
    `<div class="pt-status pt-status--neutral">Keine Überlastung aus zugewiesenen Stunden im Vorschaufenster</div>`;
  const warning=model.unassigned?`<div class="pt-alert pt-alert--warning" role="status"><span>${model.unassigned.toLocaleString('de-AT')} h sind keiner vorhandenen Person zugewiesen und fehlen in der Auslastung.</span></div>`:'';
  const header=`<div class="panelhead"><div><span class="section-kicker">VORAUSSCHAU</span><h2>Kapazität und Engpässe</h2></div><div class="kapa-forecast-controls">${controls}</div></div>`;
  if(!model.people.length) return `<section class="panel kapa-forecast-panel">${header}${warning}<p class="muted">Personen mit FTE anlegen, um zukünftige Engpässe auszuwerten.</p></section>`;
  const width=192+96*model.columns.length, people=[...model.people].sort((a,b)=>Math.max(...b.cells.map(cell=>cell.ratio))-Math.max(...a.cells.map(cell=>cell.ratio)));
  const limitNotice=truncated?`<div class="pt-alert pt-alert--warning">Die Vorschau ist auf 600 ${unit} begrenzt. Spätere Projekte sind nicht enthalten. <label for="forecast-start">Anderen Start wählen:</label> <input id="forecast-start" type="date" value="${esc(model.columns[0].start)}" onchange="setForecastStart(this.value)"></div>`:'';
  const heatmap=`<table class="pt-table kapa-capacity-table"><caption class="pt-visually-hidden">Auslastung je Person und Zeitraum. Werte über 100 Prozent bedeuten Überlastung.</caption><colgroup><col style="width:${192/width*100}%">${model.columns.map(()=>`<col style="width:${96/width*100}%">`).join('')}</colgroup>
    <thead><tr><th scope="col">Person / FTE</th>${model.columns.map(period=>`<th scope="col" title="${esc(period.title)}">${esc(period.label)}</th>`).join('')}</tr></thead>
    <tbody>${people.map(row=>`<tr><th scope="row"><strong>${esc(row.person.name)}</strong><span class="sub">${row.person.fte} % FTE</span></th>${row.cells.map((cell,index)=>{
      const label=`${row.person.name} · ${model.columns[index].title}: ${cell.load.toLocaleString('de-AT')} / ${cell.capacity.toLocaleString('de-AT',{maximumFractionDigits:1})} h · ${KapaCapacity.percent(cell.ratio)} % · Gewonnen: ${cell.wonLoad} h · Erwartet: ${cell.expectedLoad} h${cell.overloaded?' · Überlastet':''}`;
      return `<td><button type="button" class="pt-button pt-button--subtle kapa-capacity-cell ${cell.overloaded?'is-overloaded':cell.load?'is-planned':'is-free'}" title="${esc(label)}" aria-label="${esc(label)}" onclick="focusForecastPeriod(${index})"><span>${cell.overloaded?'! ':''}${KapaCapacity.percent(cell.ratio)} %</span><span class="kapa-capacity-split" aria-hidden="true">G ${cell.wonLoad} h · E ${cell.expectedLoad} h</span></button></td>`;
    }).join('')}</tr>`).join('')}</tbody>
    <tfoot><tr><th scope="row">Team gesamt</th>${model.team.map(period=>{
      const level=teamCapacityLevel(period.ratio), description=level==='critical'?'Ab 100 %':level==='warning'?'Ab 85 %':'Unter 85 %';
      return `<td class="kapa-team-${level}" title="${description}">${KapaCapacity.percent(period.ratio)} % <span class="pt-visually-hidden">(${description})</span></td>`;
    }).join('')}</tr></tfoot></table>`;
  const showTeam=model.team.some(period=>period.load-period.wonLoad-period.expectedLoad>1e-9);
  return `<section class="panel kapa-forecast-panel">${header}${limitNotice}${summary}${warning}<div class="kapa-hours-legend"><span><i class="kapa-capacity-won-key" aria-hidden="true"></i>Gewonnen</span><span><i class="kapa-capacity-combined-key" aria-hidden="true"></i>Gewonnen + erwartet</span>${showTeam?'<span><i class="kapa-capacity-team-key" aria-hidden="true"></i>Team gesamt (inkl. weiterer Status)</span>':''}<span><i class="kapa-capacity-peak-key" aria-hidden="true"></i>Höchste Einzelauslastung</span><span><i class="kapa-capacity-limit-key" aria-hidden="true"></i>100 % Kapazität</span></div>
    <div class="kapa-timeline-scroll kapa-capacity-scroll" role="region" tabindex="0" aria-label="Kapazitätsvorschau und Auslastung je Person, horizontal scrollbar"><div class="kapa-timeline kapa-capacity-timeline" style="--kapa-period-count:${model.columns.length};--kapa-visible-periods:${forecastCounts[mode]}">${forecastChart(model)}${heatmap}</div></div>
    <p class="pt-field__help">Die Vorschau reicht mindestens über den gewählten Zeitraum und bis zum letzten Projektende. Mit dem Balken unter der Tabelle lässt sich der Verlauf horizontal verschieben. Die Engpassmeldung bezieht sich auf den gesamten dargestellten Zeitraum. Die Kurven „Gewonnen“ und „Gewonnen + erwartet“ beziehen sich auf die gesamte Teamkapazität. Ihr Abstand zeigt den Anteil erwarteter Projekte. In der Personenmatrix stehen G für gewonnen und E für erwartet. Beide zählen vollständig zur Gesamtauslastung und Engpassprüfung. „Team gesamt“: Orange ab 85 %, Rot ab 100 %. Zeitraum anklicken, um die Personenübersicht darauf einzustellen. Aktuelle FTE gelten für alle dargestellten Zeiträume; Abwesenheiten sind noch nicht abgezogen.</p></section>`;
}

function setForecastCount(value) {
  const count=Number(value), allowed=mode==='week'?[12,26,52]:[12,24,36];
  if(!allowed.includes(count)) return;
  forecastCounts[mode]=count;
  render();
}
function focusForecastPeriod(index) { offset+=index; render(); }
function setForecastStart(value) {
  if(!validGateDate(value))return;
  const target=date(value), now=new Date(), utcDay=d=>Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())/86400000;
  offset=mode==='week'?Math.floor((utcDay(monday(target))-utcDay(monday(now)))/7):(target.getFullYear()-now.getFullYear())*12+target.getMonth()-now.getMonth();
  render();
}
