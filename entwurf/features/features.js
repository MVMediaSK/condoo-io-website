// Funktionen: aktiver Bereich in der Sprungleiste + Mini-Kalender
(function () {
  const links = [...document.querySelectorAll('.f-jump a')];
  const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(a => a.classList.remove('on'));
      const a = map.get(e.target.id);
      if (a) { a.classList.add('on'); a.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });

  const cal = document.getElementById('cal-grid');
  if (cal) {
    let h = ['Mo','Di','Mi','Do','Fr','Sa','So'].map(d => `<span class="cd h">${d}</span>`).join('');
    for (let d = 1; d <= 30; d++) h += `<span class="cd${d === 22 ? ' sel' : ''}${[6,7,13,14,20,21,27,28].includes(d) ? ' off' : ''}">${d}</span>`;
    cal.innerHTML = h;
  }
})();
