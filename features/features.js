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
