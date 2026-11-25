// Funktionen: Sprungleiste (aktiver Bereich, sauberes Springen) + Mini-Kalender
(function () {
  const bar = document.querySelector('.f-jump');
  const list = bar && bar.querySelector('ul');
  const links = [...document.querySelectorAll('.f-jump a')];
  const sections = links.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let locked = false, stopTimer; // während eines Klick-Sprungs nicht dazwischenfunken

  // Höhe von Menü + Leiste, damit Überschriften nicht darunter verschwinden
  const offset = () => (document.querySelector('.nav')?.offsetHeight || 0) + (bar?.offsetHeight || 0) + 16;

  // Nur die Leiste waagerecht verschieben – niemals die Seite
  const showInBar = (a) => {
    if (!list || list.scrollWidth <= list.clientWidth) return;
    const left = a.offsetLeft - (list.clientWidth - a.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' });
  };

  const setActive = (id) => {
    links.forEach(a => {
      const on = a.getAttribute('href') === '#' + id;
      a.classList.toggle('on', on);
      if (on) { a.setAttribute('aria-current', 'true'); showInBar(a); } else a.removeAttribute('aria-current');
    });
  };

  // Aktiven Bereich aus der Scrollposition bestimmen (ruhig, ohne Flackern)
  let ticking = false;
  const update = () => {
    ticking = false;
    if (locked) return;
    const line = offset() + 2;
    // Bereich gilt als aktiv, sobald seine Überschrift die Leiste erreicht
    let current = '';
    sections.forEach(s => { const h = s.querySelector('.f-group-head') || s; if (h.getBoundingClientRect().top <= line) current = s.id; });
    const active = links.find(a => a.classList.contains('on'));
    if (current && (!active || active.getAttribute('href') !== '#' + current)) setActive(current);
    if (!current && active) { links.forEach(a => { a.classList.remove('on'); a.removeAttribute('aria-current'); }); }
  };
  window.addEventListener('scroll', () => {
    if (locked) { clearTimeout(stopTimer); stopTimer = setTimeout(() => { locked = false; update(); }, 150); return; }
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });

  // Klick: selbst springen, mit korrektem Abstand
  links.forEach(a => a.addEventListener('click', (e) => {
    const target = document.getElementById(a.getAttribute('href').slice(1));
    if (!target) return;
    e.preventDefault();
    const head = target.querySelector('.f-group-head') || target;
    const y = head.getBoundingClientRect().top + window.scrollY - offset();
    setActive(target.id);
    locked = Math.abs(y - window.scrollY) > 2;
    clearTimeout(stopTimer); stopTimer = setTimeout(() => { locked = false; update(); }, 1500);
    window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
    history.replaceState(null, '', '#' + target.id);
  }));

  // Direkter Aufruf mit #anker (z. B. von der Startseite): sauber ausrichten
  const alignToHash = () => {
    const t = location.hash && document.getElementById(location.hash.slice(1));
    if (!t || !sections.includes(t)) return;
    requestAnimationFrame(() => { const h = t.querySelector('.f-group-head') || t; window.scrollTo({ top: h.getBoundingClientRect().top + window.scrollY - offset() }); });
  };
  alignToHash();
  window.addEventListener('hashchange', alignToHash);
  update();

  // Mini-Kalender
  const cal = document.getElementById('cal-grid');
  if (cal) {
    let h = ['Mo','Di','Mi','Do','Fr','Sa','So'].map(d => `<span class="cd h">${d}</span>`).join('');
    for (let d = 1; d <= 30; d++) h += `<span class="cd${d === 22 ? ' sel' : ''}${[6,7,13,14,20,21,27,28].includes(d) ? ' off' : ''}">${d}</span>`;
    cal.innerHTML = h;
  }
})();

// Funktionen: Jedes Mockup spielt sich ab, sobald es ins Bild kommt – und erneut, wenn man zurückscrollt
(function () {
  const wins = [...document.querySelectorAll('.feat .win[data-fx]')];
  if (!wins.length || matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('fxon');

  const ATOM = '.row-b, .kpi, .fb-field, .bubble, .mk-h, .mk-c, .mini-inbox li, .chan-strip span, .fn, .fl, .fbr, .slot, .mc-d, .cd, .mt, .portal-nav > *, .spark i, .wb-chat p, .wb-poll, .wb-cta, .wb-tabs, .wb-video, .wb-controls, .fb-swatches, .bar';
  const SLOW = '.bubble, .wb-chat p, .fn, .fbr';
  const timers = new Map();
  const later = (w, fn, ms) => { const t = setTimeout(fn, ms); timers.get(w).push(() => clearTimeout(t)); };
  const every = (w, fn, ms) => { const t = setInterval(fn, ms); timers.get(w).push(() => clearInterval(t)); };
  const qa = (w, s) => [...w.querySelectorAll(s)];

  // Zahlen zählen hoch (deutsches Format, Datumsangaben bleiben stehen)
  const countUp = (w, el, delay) => {
    const node = [...el.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.textContent));
    if (!node) return;
    const orig = node._orig || (node._orig = node.textContent);
    if (/\d\.\s*[A-Za-zÄÖÜäöü]/.test(orig)) return;
    const m = orig.match(/^(\D*?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(.*)$/s);
    if (!m) return;
    const dec = m[3] ? m[3].length : 0, to = parseFloat(m[2].replace(/\./g, '') + (dec ? '.' + m[3] : ''));
    const fmt = v => m[1] + v.toLocaleString('de-DE', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[4];
    node.textContent = fmt(0);
    later(w, () => {
      const t0 = performance.now(), dur = 1400;
      const step = t => { if (!w.classList.contains('fxplay')) return; const k = Math.min(1, (t - t0) / dur);
        node.textContent = k < 1 ? fmt(to * (1 - Math.pow(1 - k, 3))) : orig; if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }, delay * 1000);
  };

  // Text/Status wechselt nach kurzer Zeit
  const swap = (w, el, text, cls, ms) => {
    if (!el) return;
    el._o = el._o || { h: el.innerHTML, c: el.className };
    el.classList.add('fx-swap');
    later(w, () => { el.innerHTML = text; el.className = el._o.c + ' fx-swap sw ' + cls; el.classList.remove('o'); }, ms);
    timers.get(w).push(() => { el.innerHTML = el._o.h; el.className = el._o.c + ' fx-swap'; });
  };

  // Karte wandert per FLIP durch die Pipeline
  const flip = (el, move) => {
    const a = el.getBoundingClientRect(); move(); const b = el.getBoundingClientRect();
    el.style.transition = 'none'; el.style.transform = `translate(${a.left - b.left}px,${a.top - b.top}px)`;
    el.offsetWidth; el.style.transition = 'transform .7s cubic-bezier(.2,.7,.2,1),background .4s,border-color .4s'; el.style.transform = '';
  };

  const SPECIAL = {
    form: w => {
      const f = w.querySelector('.fb-field > span'); if (!f) return;
      const o = f.textContent; f.innerHTML = '&nbsp;'; let i = 0;
      later(w, () => every(w, () => { if (i < o.length) f.textContent = o.slice(0, ++i); }, 140), 900);
      timers.get(w).push(() => { f.textContent = o; });
    },
    subs: w => swap(w, w.querySelector('.pill-s.o'), '✓ Bezahlt', 'g', 3200),
    tickets: w => swap(w, w.querySelector('.row-b:nth-child(2) > span:last-child .pill-s'), '✓ Gelöst', 'g', 3000),
    reviews: w => swap(w, w.querySelector('.pill-s.o'), '✓ Beantwortet', 'g', 3200),
    pipeline: w => {
      const cols = qa(w, '.mini-kanban > div'), card = cols[0] && cols[0].querySelectorAll('.mk-c')[1];
      if (!card) return;
      const home = cols[0], count = () => cols.forEach(c => { const i = c.querySelector('.mk-h i'); if (i) i.textContent = c.querySelectorAll('.mk-c').length; });
      let s = 0;
      every(w, () => { s = (s + 1) % 3;
        flip(card, () => { (s === 0 ? home : cols[s]).appendChild(card); card.classList.toggle('won', s === 2); card.classList.toggle('hl', s === 1); });
        count(); }, 2600);
      timers.get(w).push(() => { card.style.transform = ''; card.classList.remove('won', 'hl'); home.appendChild(card); count(); });
    },
    inbox: w => {
      const chips = qa(w, '.chan-strip span'), items = qa(w, '.mini-inbox li'); let i = 0;
      every(w, () => { chips.forEach((c, k) => c.classList.toggle('cur', k === i % chips.length)); i++; }, 650);
      timers.get(w).push(() => chips.forEach(c => c.classList.remove('cur')));
    },
    broadcast: w => {
      const chips = qa(w, '.chan-strip span').slice(0, 3); let i = 0;
      every(w, () => { chips.forEach((c, k) => c.classList.toggle('cur', k === i % 3)); i++; }, 900);
      timers.get(w).push(() => chips.forEach(c => c.classList.remove('cur')));
    },
    portal: w => {
      const nav = qa(w, '.portal-nav > *').slice(0, 5); let i = 0;
      later(w, () => { w.classList.add('cyc'); every(w, () => { nav.forEach((n, k) => n.classList.toggle('cur', k === i % nav.length)); i++; }, 1100); }, 1800);
      timers.get(w).push(() => { w.classList.remove('cyc'); nav.forEach(n => n.classList.remove('cur')); });
    },
    meet: w => {
      const tiles = qa(w, '.mt'), pill = w.querySelector('.pill-s.o'); let i = 0, sec = 24 * 60 + 10;
      const o = pill && pill.textContent;
      every(w, () => { tiles.forEach((t, k) => t.classList.toggle('spk', k === i % tiles.length)); i++; }, 1500);
      if (pill) every(w, () => { sec++; pill.textContent = `● Läuft · ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }, 1000);
      timers.get(w).push(() => { tiles.forEach(t => t.classList.remove('spk')); if (pill) pill.textContent = o; });
    },
    course: w => {
      const t = [...w.querySelectorAll('.mono')].find(m => /\d\d:\d\d \//.test(m.textContent)); if (!t) return;
      const o = t.textContent; let sec = 8 * 60 + 24;
      every(w, () => { sec++; t.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')} / 18:00`; }, 1000);
      timers.get(w).push(() => { t.textContent = o; });
    },
    webinar: w => {
      const live = w.querySelector('.wb-live'), o = live && live.textContent; let n = 128;
      if (live) every(w, () => { n += Math.random() < .6 ? 1 : 0; live.textContent = `● Live · ${n}`; }, 1700);
      timers.get(w).push(() => { if (live) live.textContent = o; });
    }
  };
  const POP = { form: '.fb-opts b', checkout: '.pill-s.g', invoice: '.pill-s.g', crm: '.av-lg', cal: '.cd.sel, .slot.sel', social: '.row-b .pill-s',
    agent: '.pill-s.g, .row-b > b', chat: '.pill-s.g', community: '.av', tickets: '.pill-s.o', media: '.row-b .pill-s', flow: '.win-bar .pill-s', broadcast: '.win-bar .pill-s' };
  const PULSE = { checkout: '[style*="dashed"]', cal: '.slot.sel', pipeline: '.mk-c.hl', report: '.spark i:last-child' };
  const SHINE = { form: '.win-body .pill-s[style*="display:block"]', checkout: '.win-body .pill-s[style*="display:block"]', webinar: '.wb-cta span', portal: '.portal-nav b' };

  // Vorbereitung: Elemente in DOM-Reihenfolge sammeln und Verzögerungen setzen
  const collect = (box, out) => [...box.children].forEach(c => {
    if (c.matches(ATOM)) out.push(c); else if (c.querySelector(ATOM)) collect(c, out); else out.push(c);
  });
  wins.forEach(w => {
    const fx = w.dataset.fx, body = w.querySelector('.win-body');
    w.classList.add('fxw'); timers.set(w, []);
    if (!body) return;
    const atoms = []; collect(body, atoms);
    let d = .15;
    atoms.forEach(a => {
      a.classList.add('fx-a');
      if (a.matches('.bubble.me')) a.classList.add('fx-me');
      if (a.matches('.portal-nav > *, .mini-inbox li')) a.classList.add('fx-side');
      a.style.setProperty('--fd', d.toFixed(2) + 's');
      d += a.matches(SLOW) ? .5 : a.matches('.cd') ? .012 : a.matches('.spark i') ? .05 : .08;
    });
    w._end = d;
    qa(w, '.fl').forEach((f, k) => f.style.setProperty('--k', k));
    qa(w, '.fn').forEach((f, k) => f.style.setProperty('--k', Math.min(k, 3)));
    if (POP[fx]) qa(w, POP[fx]).forEach((e, k) => { e.classList.add('fx-pop'); e.style.setProperty('--fp', (Math.min(d, 2.2) + k * .12).toFixed(2) + 's'); });
    if (PULSE[fx]) qa(w, PULSE[fx]).forEach(e => { e.classList.add('fx-pulse'); e.style.setProperty('--fp', Math.min(d + .4, 2.6).toFixed(2) + 's'); });
    if (SHINE[fx]) qa(w, SHINE[fx]).forEach(e => e.classList.add('fx-shine'));
    if (fx === 'course') qa(w, '[style*="aspect-ratio"]').forEach(e => e.classList.add('fx-play'));
    if (fx === 'reviews') qa(w, 'p').forEach(p => { if (/^★+$/.test(p.textContent.trim())) { p.innerHTML = `<span class="fx-stars">${[...p.textContent.trim()].map((s, k) => `<span style="--k:${k}">${s}</span>`).join('')}</span>`; } });
  });

  const start = w => {
    w.classList.remove('fxplay'); w.offsetWidth; w.classList.add('fxplay');
    const fx = w.dataset.fx;
    if (/^(subs|broadcast|report|reviews)$/.test(fx)) qa(w, fx === 'reviews' ? 'p[style*="44px"]' : '.kpi b').forEach((b, k) => countUp(w, b, .4 + k * .15));
    if (SPECIAL[fx]) SPECIAL[fx](w);
    // Endlosschleife: aufbauen, kurz stehen lassen, ausblenden, von vorn
    const cycle = Math.max(w._end + 2.6, 6) * 1000 + 2500;
    later(w, () => {
      w.classList.add('fxout');
      setTimeout(() => { if (!w._vis || !w.classList.contains('fxplay')) return; stop(w); start(w); }, 450);
    }, cycle);
  };
  const stop = w => { (timers.get(w) || []).splice(0).forEach(f => f()); w.classList.remove('fxplay', 'fxout'); };
  // Start, wenn ein Drittel sichtbar ist · Stopp (und später neu), wenn es ganz aus dem Bild ist
  const io = new IntersectionObserver(es => es.forEach(e => {
    const w = e.target; w._vis = e.isIntersecting;
    if (e.intersectionRatio >= .3 && !w.classList.contains('fxplay')) start(w);
    else if (!e.isIntersecting && w.classList.contains('fxplay')) stop(w);
  }), { threshold: [0, .3] });
  wins.forEach(w => io.observe(w));
})();
