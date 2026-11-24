// condooOS Startseiten-Entwurf: Navigation, Kundenakte-Animation, 8→1, Videos
document.documentElement.classList.add('js');
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Navigation
  const nav = document.querySelector('.nav');
  const links = document.getElementById('nav');
  const toggle = document.querySelector('.nav-toggle');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', open);
    toggle.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
    links.classList.toggle('open', open);
  });

  // Hero-Dashboard: ein Morgen in condooOS (Zahlen zählen hoch, Hinweise erscheinen, Deal wandert zu „Gewonnen“)
  const dash = document.getElementById('dash');
  if (dash) {
    const $ = id => document.getElementById(id);
    const fmt = (n, eur) => n.toLocaleString('de-DE');
    const setNum = (el, n) => { el.textContent = fmt(n); el.dataset.to = n; };
    const count = (el, to, ms = 900) => {
      const from = Math.round(to * .72), t0 = performance.now();
      const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    };
    const toast = (c, on = true) => dash.querySelector('.db-toast.' + c).classList.toggle('in', on);
    const anna = $('card-anna'), won = $('col-won');
    // Datum und Gruß passen sich dem Besucher an
    const now = new Date(), h = now.getHours();
    dash.querySelector('.db-date').textContent = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    dash.querySelector('.db-hello').firstChild.textContent = (h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend') + ', Marco';
    const winDeal = animate => {
      const first = anna.getBoundingClientRect();
      won.insertBefore(anna, won.querySelector('.db-card'));
      const tag = anna.querySelector('.db-tag');
      tag.className = 'db-tag t-won'; tag.textContent = '✓ Gewonnen';
      anna.classList.add('won');
      $('n-ges').textContent = '1'; $('n-won').textContent = '2';
      if (animate) {
        const last = anna.getBoundingClientRect();
        anna.animate([{ transform: `translate(${first.left - last.left}px,${first.top - last.top}px)` }, { transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.2,.7,.2,1)' });
        anna.classList.add('flash');
        count($('k-rev'), 13680, 700);
      } else setNum($('k-rev'), 13680);
    };
    const newLead = () => { $('card-new').classList.add('in'); $('n-neu').textContent = '3'; setNum($('k-contacts'), 249); };
    if (reduce) { dash.classList.add('go'); newLead(); winDeal(false); toast('t3'); }
    else {
      let started = false;
      const run = () => {
        if (started) return; started = true;
        dash.classList.add('go');
        dash.querySelectorAll('[data-to]').forEach(el => count(el, +el.dataset.to));
        setTimeout(() => { toast('t1'); newLead(); }, 1300);
        setTimeout(() => { toast('t2'); anna.classList.add('flash'); }, 2900);
        setTimeout(() => { toast('t1', false); anna.classList.remove('flash'); winDeal(true); toast('t3'); }, 4600);
        setTimeout(() => toast('t2', false), 7200);
      };
      new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { run(); o.disconnect(); } }, { threshold: .35 }).observe(dash);
    }
  }

  // 8 Tools → 1 System
  const merge = document.querySelector('.merge-visual');
  if (merge) new IntersectionObserver((e, o) => {
    if (e[0].isIntersecting) { setTimeout(() => merge.classList.add('merged'), reduce ? 0 : 400); o.disconnect(); }
  }, { threshold: .5 }).observe(merge);

  // Promo-Video (45 s)
  const promo = document.getElementById('promo');
  const frame = promo && promo.closest('.promo-frame');
  const playBtn = frame && frame.querySelector('.promo-play');
  if (playBtn) {
    playBtn.addEventListener('click', () => { frame.classList.add('playing'); promo.play(); });
    promo.addEventListener('play', () => frame.classList.add('playing'));
  }

  // Ganzer Film (1:54) im Dialog
  const dlg = document.getElementById('film');
  if (!dlg) return;
  const film = dlg.querySelector('video');
  const openFilm = (ev) => {
    if (typeof dlg.showModal !== 'function') return; // Fallback: Link öffnet MP4
    ev.preventDefault();
    if (!film.src) film.src = film.dataset.src;
    if (promo) promo.pause();
    dlg.showModal(); film.play().catch(() => {});
  };
  document.querySelectorAll('#film-open, #film-open-2').forEach(a => a.addEventListener('click', openFilm));
  const closeFilm = () => { film.pause(); dlg.close(); };
  dlg.querySelector('.film-x').addEventListener('click', closeFilm);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeFilm(); });
  dlg.addEventListener('close', () => film.pause());
})();

// Black-Friday-Ticket: Countdown + nach Ablauf automatisch ausblenden
document.querySelectorAll('[data-bis]').forEach(el => {
  if (Date.now() >= Date.parse(el.dataset.bis)) { el.hidden = true; return; }
  const cd = el.querySelector('[data-cd]');
  if (!cd || !el.dataset.ende) return;
  const ende = Date.parse(el.dataset.ende), z = n => String(n).padStart(2, '0');
  const tick = () => {
    const ms = ende - Date.now();
    if (ms <= 0) { el.hidden = true; return; }
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    cd.textContent = (d ? d + (d === 1 ? ' Tag ' : ' Tagen ') : '') + z(h) + ':' + z(m) + ':' + z(s % 60);
    cd.setAttribute('datetime', el.dataset.ende);
  };
  tick();
  setInterval(tick, 1000);
});
