/* Domain calculation for absolute hour plans. Dates are local calendar dates, ends exclusive. */
const KapaHours = (() => {
  const day = value => new Date(value + 'T12:00:00');
  const key = value => `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  const next = (value, count=1) => { const result = new Date(value); result.setDate(result.getDate()+count); return result; };
  const monday = value => next(value, -(value.getDay()+6)%7);
  const sum = values => values.reduce((a,b)=>a+b,0);
  function dates(start, end) { const result=[]; for(let d=day(start);key(d)<end;d=next(d)) result.push(key(d)); return result; }
  function allocate(total, weights) {
    const denominator=sum(weights);
    if (!denominator) return weights.map(()=>0);
    const raw=weights.map(weight=>total*weight/denominator), result=raw.map(Math.floor);
    raw.map((value,index)=>({index,remainder:value-result[index]})).sort((a,b)=>b.remainder-a.remainder||a.index-b.index)
      .slice(0,total-sum(result)).forEach(item=>result[item.index]++);
    return result;
  }
  function distribute(total, days, weights) {
    if (!days.length) return {};
    const active=weights && sum(weights)>0 ? weights : days.map(()=>1);
    return Object.fromEntries(allocate(total,active).flatMap((hours,index)=>hours ? [[days[index],hours]] : []));
  }
  function phaseBudgets(project) {
    const products=project.percent.map(value=>project.budget*value), result=products.map(value=>Math.floor(value/100));
    products.map((value,index)=>({index,remainder:value%100})).sort((a,b)=>b.remainder-a.remainder||a.index-b.index)
      .slice(0,project.budget-sum(result)).forEach(item=>result[item.index]++);
    return result;
  }
  function definitions(project) {
    const budgets=phaseBudgets(project);
    return [...budgets.map((budget,index)=>({id:`phase-${index}`,kind:'base',label:['G3 – G5','G5 – G6','G6 – G7','G7 – G8'][index],start:project.dates[index],end:project.dates[index+1],budget})),
      ...(project.changes||[]).map((change,index)=>({id:`change-${change.id}`,kind:'change',label:`Planwertänderung ${index+1}`,note:change.note||'',start:change.date,end:project.dates[4],budget:change.hours}))];
  }
  function legacyDaily(project, source) {
    const start=monday(day(source.start)), weeks=[];
    for(let date=start;key(date)<source.end;date=next(date,7)) weeks.push(key(date));
    const active=weeks.map(week=>dates(week,key(next(day(week),7))).filter(date=>date>=source.start&&date<source.end));
    const amounts=allocate(source.budget,active.map((days,index)=>days.length*Number(project.weights?.[weeks[index]]??1)));
    return Object.assign({},...active.map((days,index)=>distribute(amounts[index],days)));
  }
  function sources(project) {
    const resolved=[];
    for(const source of definitions(project)) {
      const saved=project.hourPlan?.sources?.[source.id], active=dates(source.start,source.end);
      let daily;
      if (saved && saved.start===source.start && saved.end===source.end && saved.budget===source.budget) daily={...saved.daily};
      else if (saved) daily=distribute(source.budget,active,active.map(date=>saved.daily[date]||0));
      else if (source.kind==='change' && project.hourPlan) {
        daily=distribute(source.budget,active,active.map(date=>sum(resolved.filter(row=>row.kind==='base').map(row=>row.daily[date]||0))));
      } else daily=legacyDaily(project,source);
      resolved.push({...source,daily});
    }
    return resolved;
  }
  function snapshot(rows, granularity='week') {
    return {version:1,granularity,sources:Object.fromEntries(rows.map(row=>[row.id,{start:row.start,end:row.end,budget:row.budget,daily:{...row.daily}}]))};
  }
  function defaultGranularity(project) { return project.hourPlan?.granularity || ((day(project.dates[4])-day(project.dates[0]))/86400000>180?'month':'week'); }
  function reconcile(project) { return snapshot(sources(project),defaultGranularity(project)); }
  function materialize(project) {
    const rows=sources(project), daily={}, dailyBase={}, dailyChange={};
    for(const row of rows) for(const [date,hours] of Object.entries(row.daily)) {
      daily[date]=(daily[date]||0)+hours;
      const target=row.kind==='base'?dailyBase:dailyChange;
      target[date]=(target[date]||0)+hours;
    }
    const weeks=[];
    for(let d=monday(day(project.dates[0]));key(d)<project.dates[4];d=next(d,7)) {
      const active=dates(key(d),key(next(d,7))), base=sum(active.map(date=>dailyBase[date]||0)), change=sum(active.map(date=>dailyChange[date]||0));
      weeks.push({week:key(d),base,change,total:base+change});
    }
    return {weeks,daily,dailyBase,dailyChange,sources:rows};
  }
  function periods(project, granularity) {
    const result=[], start=day(project.dates[0]);
    let current=granularity==='week'?monday(start):new Date(start.getFullYear(),start.getMonth(),1,12);
    for(;key(current)<project.dates[4];) {
      const end=granularity==='week'?next(current,7):new Date(current.getFullYear(),current.getMonth()+1,1,12);
      const caption=granularity==='week'?current.toLocaleDateString('de-AT',{day:'2-digit',month:'2-digit',year:'2-digit'}):current.toLocaleDateString('de-AT',{month:'short',year:'numeric'});
      result.push({key:key(current),start:key(current),end:key(end),label:caption,title:granularity==='week'?`Woche ab ${caption}`:current.toLocaleDateString('de-AT',{month:'long',year:'numeric'})});
      current=end;
    }
    return result;
  }
  const rowTotal = row => sum(Object.values(row.daily));
  const periodTotal = (row, period) => sum(Object.entries(row.daily).filter(([date])=>date>=period.start&&date<period.end).map(([,hours])=>hours));
  const activeDays = (row, period) => dates(row.start,row.end).filter(date=>date>=period.start&&date<period.end);
  function editPeriod(row, period, hours) {
    if (!Number.isSafeInteger(hours)||hours<0||hours>1000000) throw Error('Bitte ganze Stunden zwischen 0 und 1.000.000 eingeben.');
    const active=activeDays(row,period);
    if (!active.length) throw Error('Dieser Zeitraum liegt außerhalb der Gate-Phase.');
    const daily=distribute(hours,active,active.map(date=>row.daily[date]||0));
    active.forEach(date=>delete row.daily[date]);
    Object.assign(row.daily,daily);
    return active;
  }
  function balance(row, protectedDays) {
    const difference=row.budget-rowTotal(row);
    if (!difference) return;
    const candidates=dates(row.start,row.end).filter(date=>!protectedDays.has(date));
    if (!candidates.length) throw Error('Alle Zeiträume dieser Phase wurden bearbeitet. Bitte die Stunden direkt korrigieren.');
    const available=sum(candidates.map(date=>row.daily[date]||0));
    if (difference<0 && available < -difference) throw Error('Die eingegebenen Stunden überschreiten das Phasenbudget. Bitte einen bearbeiteten Wert reduzieren.');
    const allocation=distribute(Math.abs(difference),candidates,candidates.map(date=>row.daily[date]||0));
    for(const date of candidates) {
      const hours=(row.daily[date]||0)+(difference>0?1:-1)*(allocation[date]||0);
      if(hours) row.daily[date]=hours; else delete row.daily[date];
    }
  }
  function summary(rows, columns) {
    return columns.map(period=>{
      const base=sum(rows.filter(row=>row.kind==='base').map(row=>periodTotal(row,period)));
      const change=sum(rows.filter(row=>row.kind==='change').map(row=>periodTotal(row,period)));
      return {...period,base,change,total:base+change};
    });
  }
  return {phaseBudgets,sources,snapshot,reconcile,defaultGranularity,materialize,periods,rowTotal,periodTotal,activeDays,editPeriod,balance,summary};
})();
