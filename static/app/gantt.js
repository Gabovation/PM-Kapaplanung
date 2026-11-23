/* Terminrechnung des Projektplans (wie MS Project). Termine sind ISO-Kalendertage, gerechnet wird in
   Arbeitstagen (Montag bis Freitag). Die Aufgabenliste ist flach; die Gliederungsebene (level) bestimmt,
   zu welchem Sammelvorgang ein Vorgang gehört. Alle Operationen sind rein und liefern {tasks} oder {error}. */
const KapaGantt = (() => {
  const DAY = 86400000, MAX_TASKS = 500, MAX_LEVEL = 5, MAX_LINKS = 10;
  const DE = {FS:'EA', SS:'AA', FF:'EE', SF:'AE'}, EN = {EA:'FS', AA:'SS', EE:'FF', AE:'SF', FS:'FS', SS:'SS', FF:'FF', SF:'SF'};
  const num = iso => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y, m-1, d) / DAY); };
  const iso = n => new Date(n * DAY).toISOString().slice(0, 10);
  const weekday = n => (((n + 3) % 7) + 7) % 7;
  const isWork = n => weekday(n) < 5;
  const nextWork = n => { while (!isWork(n)) n++; return n; };
  const prevWork = n => { while (!isWork(n)) n--; return n; };
  function addWork(n, count) {
    n = isWork(n) ? n : (count >= 0 ? nextWork(n) : prevWork(n));
    const step = count < 0 ? -1 : 1;
    for (let left = Math.abs(count); left > 0;) { n += step; if (isWork(n)) left--; }
    return n;
  }
  function workBetween(a, b) {
    let count = 0;
    for (let n = a, step = a < b ? 1 : -1; n !== b;) { n += step; if (isWork(n)) count += step; }
    return count;
  }
  const clone = tasks => tasks.map(task => ({...task, links: (task.links || []).map(link => ({...link}))}));

  function structure(tasks) {
    const parents = [], stack = [];
    tasks.forEach((task, index) => {
      stack.length = Math.min(stack.length, task.level);
      parents.push(stack.length ? stack[stack.length-1] : null);
      stack.push(index);
    });
    const children = tasks.map(() => []);
    parents.forEach((parent, index) => { if (parent !== null) children[parent].push(index); });
    return {parents, children};
  }
  const subtreeEnd = (tasks, index) => { let end = index + 1; while (end < tasks.length && tasks[end].level > tasks[index].level) end++; return end; };
  const isAncestor = (parents, ancestor, node) => { for (let p = parents[node]; p !== null; p = parents[p]) if (p === ancestor) return true; return false; };

  /* Strukturprüfung, spiegelt services/gantt.py. */
  function validate(tasks) {
    if (tasks.length > MAX_TASKS) return `Ein Projektplan darf höchstens ${MAX_TASKS} Vorgänge enthalten.`;
    const index = new Map(tasks.map((task, i) => [task.id, i]));
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i], previous = i ? tasks[i-1].level : -1;
      if (task.level < 0 || task.level > MAX_LEVEL) return `Die Gliederung ist auf ${MAX_LEVEL + 1} Ebenen begrenzt.`;
      if (task.level > previous + 1) return 'Die Gliederung überspringt eine Ebene.';
      if (i && tasks[i-1].type === 'milestone' && task.level > previous) return 'Ein Meilenstein kann keine Unterpunkte haben.';
      if ((task.links || []).length > MAX_LINKS) return `Ein Vorgang darf höchstens ${MAX_LINKS} Vorgänger haben.`;
    }
    const {parents, children} = structure(tasks), graph = tasks.map(() => []);
    for (let i = 0; i < tasks.length; i++) {
      const links = tasks[i].links || [];
      if (links.length && children[i].length) return 'Sammelvorgänge können keine Vorgänger haben; ihre Termine ergeben sich aus den Unterpunkten.';
      for (const link of links) {
        const from = index.get(link.from);
        if (from === undefined || from === i) return 'Ungültige Verknüpfung.';
        if (isAncestor(parents, from, i) || isAncestor(parents, i, from)) return 'Ein Vorgang kann nicht mit seinem eigenen Sammelvorgang verknüpft werden.';
        graph[from].push(i);
      }
      if (parents[i] !== null) graph[i].push(parents[i]);
    }
    return order(graph) ? '' : 'Die Verknüpfungen enthalten einen Zirkelbezug.';
  }
  function order(graph) {
    const incoming = graph.map(() => 0);
    graph.forEach(targets => targets.forEach(target => incoming[target]++));
    const queue = [], result = [];
    incoming.forEach((count, i) => { if (!count) queue.push(i); });
    while (queue.length) {
      const node = queue.shift();
      result.push(node);
      graph[node].forEach(target => { if (!--incoming[target]) queue.push(target); });
    }
    return result.length === graph.length ? result : null;
  }

  /* Vorwärtsrechnung: Terminfolge aller vier Verknüpfungsarten mit Pufferzeit, Sammelvorgänge aggregieren. */
  function schedule(tasks) {
    const index = new Map(tasks.map((task, i) => [task.id, i])), {parents, children} = structure(tasks);
    const graph = tasks.map(() => []);
    tasks.forEach((task, i) => {
      (task.links || []).forEach(link => { if (index.has(link.from)) graph[index.get(link.from)].push(i); });
      if (parents[i] !== null) graph[i].push(parents[i]);
    });
    const sequence = order(graph);
    if (!sequence) return {error: 'Die Verknüpfungen enthalten einen Zirkelbezug.', rows: []};
    const rows = new Array(tasks.length);
    for (const i of sequence) {
      const task = tasks[i], kids = children[i];
      if (kids.length) {
        const list = kids.map(k => rows[k]), start = Math.min(...list.map(r => r.start)), end = Math.max(...list.map(r => r.end));
        const weight = list.reduce((n, r) => n + Math.max(r.duration, 1), 0);
        rows[i] = {id: task.id, index: i, level: task.level, summary: true, milestone: false, parent: parents[i], children: kids,
          start, end, duration: workBetween(start, end) + 1, percent: Math.round(list.reduce((n, r) => n + r.percent * Math.max(r.duration, 1), 0) / weight)};
        continue;
      }
      const milestone = task.type === 'milestone', duration = milestone ? 0 : Math.max(1, task.durationDays | 0), links = task.links || [];
      let start = null;
      for (const link of links) {
        const source = rows[index.get(link.from)], lag = link.lagDays || 0;
        let candidate;
        if (milestone) candidate = addWork(link.type === 'FS' || link.type === 'FF' ? source.end : source.start, lag);
        else if (link.type === 'FS') candidate = addWork(source.end, lag + 1);
        else if (link.type === 'SS') candidate = addWork(source.start, lag);
        else candidate = addWork(addWork(link.type === 'FF' ? source.end : source.start, lag), -(duration - 1));
        start = start === null ? candidate : Math.max(start, candidate);
      }
      if (start === null) start = nextWork(num(task.start));
      if (task.snet) start = Math.max(start, nextWork(num(task.snet)));
      rows[i] = {id: task.id, index: i, level: task.level, summary: false, milestone, parent: parents[i], children: [],
        start, end: duration ? addWork(start, duration - 1) : start, duration, percent: Math.min(100, Math.max(0, task.percent | 0)), linked: links.length > 0};
    }
    return {rows, error: ''};
  }
  /* Schreibt die berechneten Anfangstermine zurück, damit ein Vorgang nach dem Entfernen seiner Verknüpfungen stehen bleibt. */
  function normalize(tasks) {
    const result = schedule(tasks);
    if (!result.error) tasks.forEach((task, i) => { if (!result.rows[i].summary) task.start = iso(result.rows[i].start); });
    return result;
  }

  const formatLinks = (tasks, i) => (tasks[i].links || []).map(link => {
    const at = tasks.findIndex(task => task.id === link.from), lag = link.lagDays || 0;
    return `${at + 1}${link.type === 'FS' ? '' : DE[link.type]}${lag ? (lag > 0 ? '+' : '') + lag : ''}`;
  }).join('; ');
  function parseLinks(text, tasks, self) {
    const links = [], seen = new Set();
    for (const part of String(text).split(/[;,]/).map(item => item.trim()).filter(Boolean)) {
      const match = /^(\d+)\s*(EA|AA|EE|AE|FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+)\s*(?:d|t|tage?)?)?$/i.exec(part);
      if (!match) return {error: `„${part}“ ist keine gültige Verknüpfung. Beispiele: 3, 4AA, 5EA+2, 6EE-1.`};
      const at = Number(match[1]) - 1;
      if (at < 0 || at >= tasks.length) return {error: `Vorgang ${match[1]} existiert nicht.`};
      if (at === self) return {error: 'Ein Vorgang kann nicht sein eigener Vorgänger sein.'};
      if (seen.has(at)) return {error: `Vorgang ${match[1]} ist doppelt angegeben.`};
      seen.add(at);
      const lag = match[3] ? (match[3] === '-' ? -1 : 1) * Number(match[4]) : 0;
      if (lag < -365 || lag > 365) return {error: 'Der Zeitabstand darf höchstens 365 Tage betragen.'};
      links.push({from: tasks[at].id, type: match[2] ? EN[match[2].toUpperCase()] : 'FS', lagDays: lag});
    }
    return {links};
  }

  /* Änderungen: immer auf einer Kopie, danach Strukturprüfung und Neuberechnung. */
  function apply(tasks, change) {
    const copy = clone(tasks), message = change(copy);
    if (typeof message === 'string') return {error: message};
    const error = validate(copy);
    if (error) return {error};
    const result = normalize(copy);
    return result.error ? {error: result.error} : {tasks: copy};
  }
  const make = (id, kind, level, start, name) => ({id, name, type: kind, level, start, durationDays: kind === 'milestone' ? 0 : 1, percent: 0, note: '', links: [], snet: null});
  const add = (tasks, after, kind, id, today, name) => apply(tasks, copy => {
    const at = after === null || after < 0 ? copy.length : subtreeEnd(copy, after);
    const level = after === null || after < 0 ? 0 : copy[after].level;
    const rows = schedule(tasks).rows, start = after === null || after < 0 ? today : iso(rows[after].end);
    copy.splice(at, 0, make(id, kind, level, start, name));
  });
  const remove = (tasks, index) => apply(tasks, copy => {
    const gone = new Set(copy.slice(index, subtreeEnd(copy, index)).map(task => task.id));
    copy.splice(index, subtreeEnd(copy, index) - index);
    copy.forEach(task => { task.links = task.links.filter(link => !gone.has(link.from)); });
  });
  const shiftLevel = (tasks, index, delta) => apply(tasks, copy => {
    const end = subtreeEnd(copy, index);
    if (delta > 0 && !index) return 'Der erste Vorgang kann nicht eingerückt werden.';
    if (delta < 0 && !copy[index].level) return 'Der Vorgang steht bereits auf der obersten Ebene.';
    for (let i = index; i < end; i++) copy[i].level += delta;
  });
  const indent = (tasks, index) => shiftLevel(tasks, index, 1);
  const outdent = (tasks, index) => shiftLevel(tasks, index, -1);
  function move(tasks, index, direction) {
    return apply(tasks, copy => {
      const level = copy[index].level, end = subtreeEnd(copy, index);
      if (direction < 0) {
        let target = index - 1;
        while (target >= 0 && copy[target].level > level) target--;
        if (target < 0 || copy[target].level < level) return 'Der Vorgang kann nicht weiter nach oben verschoben werden.';
        copy.splice(target, 0, ...copy.splice(index, end - index));
      } else {
        if (end >= copy.length || copy[end].level < level) return 'Der Vorgang kann nicht weiter nach unten verschoben werden.';
        const nextEnd = subtreeEnd(copy, end), block = copy.splice(index, end - index);
        copy.splice(index + (nextEnd - end), 0, ...block);
      }
    });
  }
  const setName = (tasks, index, name) => apply(tasks, copy => {
    name = String(name).trim();
    if (!name || name.length > 120) return 'Der Name muss 1 bis 120 Zeichen enthalten.';
    copy[index].name = name;
  });
  function setDuration(tasks, index, value) {
    const match = /^\s*(\d+)\s*(?:d|t|tage?)?\s*$/i.exec(String(value));
    if (!match || Number(match[1]) > 3650) return {error: 'Bitte die Dauer in Arbeitstagen als ganze Zahl angeben (0 = Meilenstein).'};
    const days = Number(match[1]);
    return apply(tasks, copy => {
      if (structure(copy).children[index].length) return 'Die Dauer eines Sammelvorgangs ergibt sich aus den Unterpunkten.';
      if (!days && index + 1 < copy.length && copy[index + 1].level > copy[index].level) return 'Ein Meilenstein kann keine Unterpunkte haben.';
      copy[index].type = days ? 'task' : 'milestone';
      copy[index].durationDays = days;
    });
  }
  function setStart(tasks, index, value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return {error: 'Bitte ein gültiges Datum eingeben.'};
    return apply(tasks, copy => {
      if (structure(copy).children[index].length) return 'Der Anfang eines Sammelvorgangs ergibt sich aus den Unterpunkten.';
      if (copy[index].links.length) copy[index].snet = value; else copy[index].start = value;
    });
  }
  function setEnd(tasks, index, value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) return {error: 'Bitte ein gültiges Datum eingeben.'};
    const row = schedule(tasks).rows[index];
    if (row.summary) return {error: 'Das Ende eines Sammelvorgangs ergibt sich aus den Unterpunkten.'};
    const end = prevWork(num(value));
    if (end < row.start) return {error: 'Das Ende liegt vor dem Anfang.'};
    return setDuration(tasks, index, String(row.milestone ? 1 : workBetween(row.start, end) + 1));
  }
  const setPercent = (tasks, index, value) => apply(tasks, copy => {
    const percent = Number(value);
    if (!Number.isInteger(percent) || percent < 0 || percent > 100) return 'Der Fortschritt muss zwischen 0 und 100 % liegen.';
    if (structure(copy).children[index].length) return 'Der Fortschritt eines Sammelvorgangs ergibt sich aus den Unterpunkten.';
    copy[index].percent = percent;
  });
  function setLinks(tasks, index, text) {
    const parsed = parseLinks(text, tasks, index);
    if (parsed.error) return {error: parsed.error};
    return apply(tasks, copy => { copy[index].links = parsed.links; });
  }
  const addLink = (tasks, from, to, type, lag = 0) => apply(tasks, copy => {
    if (from === to) return 'Ein Vorgang kann nicht mit sich selbst verknüpft werden.';
    if (copy[to].links.some(link => link.from === copy[from].id)) return 'Diese Verknüpfung besteht bereits.';
    copy[to].links.push({from: copy[from].id, type, lagDays: lag});
  });
  /* Verschieben per Maus: um Arbeitstage nach vorn oder hinten; bei verknüpften Vorgängen über „Anfang nicht früher als“. */
  function shiftStart(tasks, index, workdays) {
    const row = schedule(tasks).rows[index];
    if (!row || row.summary) return {error: 'Sammelvorgänge werden über ihre Unterpunkte verschoben.'};
    return setStart(tasks, index, iso(addWork(row.start, workdays)));
  }
  function setDurationDays(tasks, index, days) {
    return setDuration(tasks, index, String(Math.max(schedule(tasks).rows[index].milestone ? 0 : 1, days)));
  }
  /* Rückbau einer einzelnen Verknüpfung (Klick auf die Linie). */
  const removeLink = (tasks, to, fromId) => apply(tasks, copy => { copy[to].links = copy[to].links.filter(link => link.from !== fromId); });
  /* Vorlage: je Phase zwischen den Gates ein Vorgang. */
  function fromGates(dates, names, id) {
    const tasks = [];
    names.forEach((name, i) => {
      const start = nextWork(num(dates[i])), end = prevWork(num(dates[i + 1]) - 1);
      const task = make(id(), 'task', 0, iso(start), name);
      task.durationDays = Math.max(1, end >= start ? workBetween(start, end) + 1 : 1);
      tasks.push(task);
    });
    return tasks;
  }
  return {num, iso, isWork, nextWork, prevWork, addWork, workBetween, structure, subtreeEnd, validate, schedule, normalize,
    formatLinks, parseLinks, add, remove, indent, outdent, move, setName, setDuration, setStart, setEnd, setPercent,
    setLinks, addLink, removeLink, shiftStart, setDurationDays, fromGates, DE};
})();
