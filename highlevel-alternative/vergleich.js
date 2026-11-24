// Vergleichsseite: Compliance-Check hakt Punkt für Punkt ab
(function () {
  const box = document.getElementById('hl-check');
  if (!box) return;
  const rows = [...box.querySelectorAll('li')];
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { rows.forEach(r => r.classList.add('in')); return; }
  new IntersectionObserver((e, o) => {
    if (!e[0].isIntersecting) return; o.disconnect();
    rows.forEach((r, i) => setTimeout(() => r.classList.add('in'), 500 + i * 260));
  }, { threshold: .4 }).observe(box);
})();
