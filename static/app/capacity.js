/* Person and team forecasts derived from the same day-level plan as the hour editor. */
const KapaCapacity = (()=>{
  const date=value=>new Date(value+'T12:00:00');
  const key=value=>`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  const add=(value,days)=>{const result=new Date(value);result.setDate(result.getDate()+days);return result;};
  const total=values=>values.reduce((a,b)=>a+b,0);
  function periods(start,granularity,count) {
    if(!['week','month'].includes(granularity)||!Number.isInteger(count)||count<1||count>60) throw Error('Ungültiger Vorschauzeitraum.');
    let current=typeof start==='string'?date(start):new Date(start);
    current=granularity==='week'?add(current,-(current.getDay()+6)%7):new Date(current.getFullYear(),current.getMonth(),1,12);
    const result=[];
    for(let index=0;index<count;index++) {
      const end=granularity==='week'?add(current,7):new Date(current.getFullYear(),current.getMonth()+1,1,12), days=[];
      for(let day=new Date(current);key(day)<key(end);day=add(day,1)) days.push({key:key(day),working:day.getDay()!==0&&day.getDay()!==6});
      const label=current.toLocaleDateString('de-AT',granularity==='week'?{day:'2-digit',month:'2-digit',year:'2-digit'}:{month:'short',year:'numeric'});
      result.push({start:key(current),end:key(end),label,title:granularity==='week'?`Woche ab ${label}`:current.toLocaleDateString('de-AT',{month:'long',year:'numeric'}),days,workingDays:days.filter(day=>day.working).length});
      current=end;
    }
    return result;
  }
  const ratio=(load,capacity)=>capacity>0?(Math.abs(load-capacity)<1e-9?100:load/capacity*100):load>0?Infinity:0;
  function build(state,start,granularity,count=12) {
    const columns=periods(start,granularity,count), loads=new Map(state.people.map(person=>[person.id,{}])), won=new Map(state.people.map(person=>[person.id,{}])), expected=new Map(state.people.map(person=>[person.id,{}])), unassigned={};
    for(const project of state.projects) {
      const target=loads.get(project.person)||unassigned;
      const category=project.status==='Gewonnen'?won.get(project.person):project.status==='Erwartet'?expected.get(project.person):null;
      for(const [day,hours] of Object.entries(KapaHours.materialize(project).daily)) {
        target[day]=(target[day]||0)+hours;
        if(category) category[day]=(category[day]||0)+hours;
      }
    }
    const people=state.people.map(person=>({person,cells:columns.map(period=>{
      const load=total(period.days.map(day=>loads.get(person.id)[day.key]||0)), capacity=Math.max(0,Number(state.fte)||0)*Math.max(0,Number(person.fte)||0)/100*period.workingDays/5;
      const wonLoad=total(period.days.map(day=>won.get(person.id)[day.key]||0)), expectedLoad=total(period.days.map(day=>expected.get(person.id)[day.key]||0));
      return {load,wonLoad,expectedLoad,capacity,ratio:ratio(load,capacity),overloaded:load-capacity>1e-9};
    })}));
    const team=columns.map((period,index)=>{
      const cells=people.map(row=>row.cells[index]), load=total(cells.map(cell=>cell.load)), capacity=total(cells.map(cell=>cell.capacity));
      const peak=people.reduce((current,row)=>!current||row.cells[index].ratio>current.ratio?{...row.cells[index],person:row.person}:current,null);
      const wonLoad=total(cells.map(cell=>cell.wonLoad)), expectedLoad=total(cells.map(cell=>cell.expectedLoad));
      return {...period,load,wonLoad,expectedLoad,wonRatio:ratio(wonLoad,capacity),expectedRatio:ratio(expectedLoad,capacity),capacity,ratio:ratio(load,capacity),peak:peak?.ratio||0,peakPerson:peak?.person,overloadedPeople:people.filter(row=>row.cells[index].overloaded).length,unassigned:total(period.days.map(day=>unassigned[day.key]||0))};
    });
    const firstIndex=team.findIndex(period=>period.overloadedPeople>0);
    return {columns,people,team,firstBottleneck:firstIndex<0?null:{periodIndex:firstIndex,period:team[firstIndex],person:team[firstIndex].peakPerson},
      affectedPeople:people.filter(row=>row.cells.some(cell=>cell.overloaded)).length,unassigned:total(team.map(period=>period.unassigned)),peak:Math.max(0,...team.map(period=>period.peak))};
  }
  function percent(value) { return Number.isFinite(value)?value.toLocaleString('de-AT',{maximumFractionDigits:1}):'∞'; }
  return {build,periods,percent};
})();
