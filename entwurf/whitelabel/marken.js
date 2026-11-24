// Whitelabel: dieselbe Plattform wechselt zwischen fiktiven Beispielmarken
(function () {
  const box = document.getElementById('brandswap');
  if (!box) return;
  const brands = [
    { name: 'Muster CRM', ini: 'M', url: 'app.deine-marke.de', claim: 'Dein Vertrieb. Deine Marke.', b: '#1F3A5F', b2: '#2BA3A0' },
    { name: 'Praxis Muster', ini: 'P', url: 'portal.deine-praxis.at', claim: 'Mehr Zeit für Deine Patienten.', b: '#2F7D5B', b2: '#E08A2E' },
    { name: 'Studio Beispiel', ini: 'S', url: 'cockpit.dein-studio.ch', claim: 'Kreativ arbeiten, klar verkaufen.', b: '#5B3FA8', b2: '#E2557A' }
  ];
  const dots = [...box.querySelectorAll('.bs-dots i')];
  let i = 0, timer, visible = false;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const apply = (k) => {
    const br = brands[k];
    box.classList.add('swap');
    setTimeout(() => {
      box.style.setProperty('--b', br.b); box.style.setProperty('--b2', br.b2);
      box.querySelector('[data-name]').textContent = br.name;
      box.querySelector('[data-ini]').textContent = br.ini;
      box.querySelector('[data-url]').textContent = br.url;
      box.querySelector('[data-claim]').textContent = br.claim;
      dots.forEach((d, n) => d.classList.toggle('on', n === k));
      box.classList.remove('swap');
    }, reduce ? 0 : 300);
  };
  const tick = () => { i = (i + 1) % brands.length; apply(i); };
  const run = () => { clearInterval(timer); if (visible && !reduce) timer = setInterval(tick, 2800); };
  apply(0);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); }, { threshold: .4 }).observe(box);
  box.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') clearInterval(timer); });
  box.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') run(); });
})();
