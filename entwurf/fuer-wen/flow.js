// Flow-Player: spielt pro Zielgruppe 5 Szenen nacheinander ab (Motion-Grafik im App-Fenster)
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DUR = 3600; // ms pro Szene

  document.querySelectorAll('.fp').forEach(fp => {
    const steps = [...fp.querySelectorAll('.fp-step')];
    const scenes = [...fp.querySelectorAll('.fp-scene')];
    const toggle = fp.querySelector('.fp-toggle');
    fp.style.setProperty('--dur', DUR + 'ms');
    let i = 0, timer = null, visible = false, hover = false, userPaused = reduce;
    if (reduce) fp.classList.add('static');

    const countUp = (scene) => scene.querySelectorAll('[data-count]').forEach(el => {
      const end = +el.dataset.count, fmt = n => n.toLocaleString('de-DE');
      if (reduce) { el.textContent = fmt(end); return; }
      const t0 = performance.now(), d = 1200;
      const tick = (t) => { const p = Math.min(1, (t - t0) / d); el.textContent = fmt(Math.round(end * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });

    const show = (n) => {
      i = (n + scenes.length) % scenes.length;
      scenes.forEach((s, k) => {
        if (k === i) { s.classList.remove('on'); void s.offsetWidth; s.classList.add('on'); s.removeAttribute('aria-hidden'); countUp(s); }
        else { s.classList.remove('on'); s.setAttribute('aria-hidden', 'true'); }
      });
      steps.forEach((b, k) => {
        b.classList.toggle('done', k < i);
        b.classList.remove('on'); if (k === i) { void b.offsetWidth; b.classList.add('on'); }
        b.setAttribute('aria-current', k === i ? 'step' : 'false');
      });
    };

    const running = () => visible && !hover && !userPaused;
    const schedule = () => {
      clearTimeout(timer);
      fp.classList.toggle('paused', !running() && !reduce);
      if (running()) timer = setTimeout(() => { show(i + 1); schedule(); }, DUR);
    };
    const updateToggle = () => { if (toggle) toggle.textContent = userPaused ? '▶ Abspielen' : '❚❚ Pause'; };

    steps.forEach((b, k) => b.addEventListener('click', () => { show(k); schedule(); }));
    // Pause nur bei echter Maus (nicht beim Antippen am Handy) oder Tastatur-Fokus
    fp.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hover = true; schedule(); } });
    fp.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hover = false; if (running()) show(i); schedule(); } });
    fp.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) { hover = true; schedule(); } });
    fp.addEventListener('focusout', () => { if (hover && !fp.matches(':hover')) { hover = false; schedule(); } });
    if (toggle) toggle.addEventListener('click', () => { userPaused = !userPaused; fp.classList.toggle('static', false); updateToggle(); if (!userPaused) show(i); schedule(); });

    new IntersectionObserver(([e]) => {
      const was = visible; visible = e.isIntersecting;
      if (visible && !was && !userPaused) show(0);
      schedule();
    }, { threshold: .45 }).observe(fp);

    show(0); updateToggle(); schedule();
  });
})();
