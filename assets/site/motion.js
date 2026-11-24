// condooOS – Scroll-Animationen für alle Seiten
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;
  const root = document.documentElement;
  root.classList.add('mo');
  const skip = el => el.closest('.db, .fp, .win, .bf-ticket, .nav, .foot, .logo-viewport, dialog');
  const pending = new Set();
  const show = t => {
    if (t.classList.contains('rv')) t.classList.add('in');
    (t._rvKids || []).forEach(k => k.classList.add('in'));
    io.unobserve(t); pending.delete(t);
  };
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) show(e.target); }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
  const watch = el => { pending.add(el); io.observe(el); };
  // Sicherheitsnetz: was beim schnellen Scrollen/Springen übersprungen wurde, wird sofort gezeigt
  const sweep = () => pending.forEach(t => { if (t.getBoundingClientRect().top < innerHeight * .94) show(t); });
  const mark = (el, cls = [], delay = 0) => {
    if (!el || el.classList.contains('rv') || skip(el)) return;
    el.classList.add('rv', ...cls);
    if (delay) el.style.setProperty('--rd', delay + 's');
    // Aufgedeckte Überschriften sind anfangs komplett verdeckt → über den Elternblock auslösen
    if (cls.includes('rv-h') && el.parentElement) {
      const p = el.parentElement; (p._rvKids = p._rvKids || []).push(el); watch(p);
    } else watch(el);
  };
  const stagger = (sel, cls = [], step = .08, max = 8) => document.querySelectorAll(sel).forEach(box => {
    [...box.children].forEach((c, i) => mark(c, cls, Math.min(i, max) * step));
  });
  const all = (sel, cls, delay) => document.querySelectorAll(sel).forEach(el => mark(el, cls, delay));

  window.condooReveal = function scan(scope = document) {
    const q = s => scope.querySelectorAll(s);
    // Hero (Startseite) und Seitenkopf: baut sich beim Laden Stück für Stück auf
    q('.hero-title, .hero-side').forEach((box, b) => [...box.children].forEach((c, i) => mark(c, c.matches('h1') ? ['rv-h'] : [], .1 + b * .25 + i * .12)));
    q('.page-hero .wrap, .page-hero .ph-grid > div').forEach(box => [...box.children].forEach((c, i) => {
      if (c.matches('.ph-grid')) return;
      mark(c, c.matches('h1') ? ['rv-h'] : c.matches('.win, .hub, .formula, .cl-stats, figure, img') ? ['rv-z'] : [], .08 + i * .1);
    }));
    // Überschriften-Blöcke
    q('.sec-head, .f-group-head, .final-in, .gc-head').forEach(box => [...box.children].forEach((c, i) => mark(c, c.matches('h2, .h2') ? ['rv-h'] : [], i * .1)));
    q('main .h2, .final h2').forEach(h => mark(h, ['rv-h']));
    // Zweispaltige Abschnitte: links / rechts hereinfliegen
    q('.split, .story, .place, .promise, .eu-grid, .merge-grid, .founder-grid, .price-grid, .faq-grid, .calc, .gc-in').forEach(g => {
      const kids = [...g.children];
      kids.forEach((c, i) => mark(c, [kids.length === 2 ? (i ? 'rv-r' : 'rv-l') : 'rv-z'], i * .12));
    });
    // Funktionen: Text von der Seite, Fenster kippt auf
    q('.feat').forEach((f, n) => {
      const [copy, vis] = f.children;
      const even = getComputedStyle(copy).order === '2';
      mark(copy, [even ? 'rv-r' : 'rv-l']);
      if (vis) { f.classList.add('rv-persp'); mark(vis, ['rv-t'], .12); }
    });
    // Karten-Raster: nacheinander
    q('.hl-doi, .bento, .cards2, .cards3, .eu-facts, .extras, .extras3, .fee-tables, .groups, .help3, .pains, .partners, .people-grid, .personas, .photos, .roles, .seats, .steps3, .team-grid, .vids, .week, .ghost, .cl-stats, .formula, .who-rows, .pp-grid, .faq-list, .doi-steps').forEach(g => {
      [...g.children].forEach((c, i) => { mark(c, ['rv-z'], Math.min(i, 8) * .08); if (c.matches('.tile, .extra, .partner, .fee-table, .step3, .persona, .role, .pp, .hl-card, .help3 > *')) c.classList.add('lift'); });
    });
    // Einzelne größere Elemente
    q('main .win, .gc-fig, .hl-tbl-wrap, .hl-route, .hl-legend-row, .hl-src, .contact-band, .doi, .fp, .meet, .note, .cl-day, .promo-frame, .merge-visual, .db-wrap ~ .logos').forEach(el => {
      if (el.matches('.win') && el.closest('.feat, .page-hero, .rv')) return;
      mark(el, el.matches('.cl-day') ? [] : ['rv-z']);
    });
  };
  window.condooReveal();

  // Zahlen zählen hoch, sobald sie sichtbar werden (z. B. „1.000+“)
  const nums = document.querySelectorAll('.pp-n, .cl-stats b, [data-countup]');
  const cio = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; cio.unobserve(e.target);
    const el = e.target, m = el.textContent.match(/^(\D*)([\d.]+)(.*)$/s);
    if (!m || /\d\.\s|\d{1,2}\.\s?[A-Za-zä]/.test(el.textContent)) return; // Datumsangaben nicht zählen
    const to = parseInt(m[2].replace(/\./g, ''), 10); if (!to || to < 3) return;
    const t0 = performance.now(), dur = 1200;
    const step = t => { const k = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
      el.textContent = m[1] + v.toLocaleString('de-DE') + m[3]; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), { threshold: .6 });
  nums.forEach(n => cio.observe(n));

  // Fortschrittsleiste + Hero-Dashboard richtet sich beim Scrollen auf
  const bar = document.createElement('div'); bar.className = 'scroll-bar'; bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  const db = document.querySelector('.db');
  if (db) db.classList.add('tilt');
  let ticking = false;
  const onScroll = () => {
    ticking = false;
    sweep();
    const h = root.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
    if (db && innerWidth > 860) {
      const r = db.getBoundingClientRect(), p = Math.max(0, Math.min(1, (innerHeight - r.top) / (innerHeight * .9)));
      db.style.transform = `rotateX(${(1 - p) * 12}deg) scale(${.94 + p * .06})`;
    } else if (db) db.style.transform = '';
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  addEventListener('resize', onScroll);
  addEventListener('hashchange', () => setTimeout(sweep, 50));
  addEventListener('load', sweep);
  onScroll();
})();
