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

  // Kundenakte: Ereignisse laufen nacheinander ein
  const stage = document.getElementById('stage');
  const items = [...document.querySelectorAll('#timeline li')];
  const status = document.getElementById('deal-status');
  const finish = () => { stage.classList.add('done'); status.textContent = 'Gewonnen'; };
  if (reduce) { items.forEach(li => li.classList.add('in')); finish(); }
  else {
    let started = false;
    const run = () => {
      if (started) return; started = true;
      items.forEach((li, i) => setTimeout(() => {
        li.classList.add('in');
        if (i === items.length - 1) setTimeout(finish, 350);
      }, 350 + i * 520));
    };
    new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { run(); o.disconnect(); } }, { threshold: .3 }).observe(stage);
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
