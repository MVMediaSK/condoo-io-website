// Changelog: Daten stehen als JSON in #cl-data / #cl-meta (befüllt von entwurf/_changelog_sync.py)
(function () {
  const list = document.getElementById('cl-list');
  if (!list) return;
  let DATA = [], META = {};
  try {
    DATA = JSON.parse(document.getElementById('cl-data').textContent);
    META = JSON.parse(document.getElementById('cl-meta').textContent);
  } catch (e) { DATA = []; }
  if (!DATA.length) { list.innerHTML = '<p class="cl-empty">Gerade sind keine Einträge verfügbar.</p>'; return; }

  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const state = { q: '', m: 'all' };
  if (/^#\d{4}-\d{2}$/.test(location.hash)) state.m = location.hash.slice(1);

  const parse = d => { const p = d.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  const mKey = d => d.slice(0, 7);
  const mLabel = k => MONTHS[+k.slice(5) - 1] + ' ' + k.slice(0, 4);
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hl = (s, q) => {
    const e = esc(s);
    if (!q) return e;
    const r = new RegExp('(' + esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return e.replace(r, '<mark>$1</mark>');
  };
  const nf = n => Number(n).toLocaleString('de-DE');
  const fmt = d => { const t = parse(d); return t.getDate() + '. ' + MONTHS[t.getMonth()] + ' ' + t.getFullYear(); };

  const monthKeys = [];
  DATA.forEach(x => { const k = mKey(x.d); if (!monthKeys.includes(k)) monthKeys.push(k); });
  if (state.m !== 'all' && !monthKeys.includes(state.m)) state.m = 'all';
  const total = DATA.reduce((a, x) => a + x.s.length, 0);

  // Kennzahlen
  const stats = [];
  if (META.total) stats.push(['Updates seit Start', nf(META.total)]);
  stats.push(['Tage zusammengefasst', nf(DATA.length)]);
  stats.push(['Zeitraum', fmt(DATA[DATA.length - 1].d).replace(/ \d{4}$/, '') + ' – ' + fmt(DATA[0].d)]);
  if (META.updated) stats.push(['Zuletzt aktualisiert', META.updated]);
  document.getElementById('cl-stats').innerHTML = stats.map(s => '<div><small class="mono">' + s[0] + '</small><b>' + s[1] + '</b></div>').join('');

  // Monatsfilter
  const mEl = document.getElementById('cl-months');
  const btn = (k, label) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.dataset.k = k;
    b.addEventListener('click', () => {
      state.m = k;
      history.replaceState(null, '', k === 'all' ? location.pathname : '#' + k);
      render();
      window.scrollTo({ top: list.getBoundingClientRect().top + scrollY - 150 > scrollY ? scrollY : list.getBoundingClientRect().top + scrollY - 150 });
    });
    mEl.appendChild(b);
  };
  btn('all', 'Alle');
  monthKeys.forEach(k => btn(k, MONTHS[+k.slice(5) - 1]));

  let t;
  document.getElementById('cl-q').addEventListener('input', e => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = e.target.value.trim(); render(); }, 120);
  });

  function render() {
    [...mEl.children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === state.m)));
    const q = state.q.toLowerCase(), out = [], idx = {};
    let n = 0, curM = null;
    DATA.forEach(x => {
      const mk = mKey(x.d);
      if (state.m !== 'all' && mk !== state.m) return;
      const secs = x.s.map(s => {
        if (!q || s.t.toLowerCase().includes(q)) return s;
        const ps = s.p.filter(p => p.toLowerCase().includes(q));
        return ps.length ? { t: s.t, p: ps } : null;
      }).filter(Boolean);
      if (!secs.length) return;
      n += secs.length;
      if (mk !== curM) { curM = mk; out.push('<h2 class="cl-month">' + mLabel(mk) + '</h2>'); }
      (idx[mk] = idx[mk] || []).push(x.d);
      const d = parse(x.d);
      out.push('<article class="cl-day" id="d-' + x.d + '"><div class="cl-date"><b>' + d.getDate() + '.</b><small>' + WD[d.getDay()] + '</small><small class="mono">' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear() + '</small></div><div class="cl-topics">' +
        secs.map(s => {
          const isNew = /\(neu\)/i.test(s.t), title = s.t.replace(/\s*\(neu\)/i, '');
          return '<section class="cl-topic"><h3>' + hl(title, state.q) + (isNew ? '<span class="cl-new">Neu</span>' : '') + '</h3>' + s.p.map(p => '<p>' + hl(p, state.q) + '</p>').join('') + '</section>';
        }).join('') + '</div></article>');
    });
    list.innerHTML = out.length ? out.join('') : '<p class="cl-empty">Keine Änderungen gefunden. Versuch es mit einem anderen Suchbegriff.</p>';
    document.getElementById('cl-count').textContent = n + ' von ' + total + ' Themen';
    document.getElementById('cl-index').innerHTML = Object.keys(idx).map(mk =>
      '<div><div class="cl-index-m mono">' + mLabel(mk) + '</div><ul>' + idx[mk].map(d => {
        const t = parse(d);
        return '<li><a href="#d-' + d + '" data-day="' + d + '">' + t.getDate() + '. ' + MONTHS[t.getMonth()].slice(0, 3) + ' · ' + WD[t.getDay()].slice(0, 2) + '</a></li>';
      }).join('') + '</ul></div>').join('');
  }
  document.getElementById('cl-index').addEventListener('click', e => {
    const a = e.target.closest('a[data-day]');
    if (!a) return;
    e.preventDefault();
    const el = document.getElementById('d-' + a.dataset.day);
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 150, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
  render();
})();
