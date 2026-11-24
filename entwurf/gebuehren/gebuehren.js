// Gebühren: E-Mail-Rechner (0,0012 € pro E-Mail, 10 € Guthaben)
(function () {
  const r = document.getElementById('mails');
  if (!r) return;
  const PRICE = 0.0012, CREDIT = 10;
  const eur = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const num = n => n.toLocaleString('de-DE');
  const max = +r.max * PRICE; // Kosten am Reglerende
  const update = () => {
    const n = +r.value, cost = n * PRICE, used = Math.min(cost, CREDIT), extra = Math.max(0, cost - CREDIT);
    document.getElementById('mails-out').textContent = num(n);
    document.getElementById('used').textContent = eur(used);
    document.getElementById('extra').textContent = eur(extra);
    document.getElementById('over-label').textContent = extra > 0 ? 'Mehrverbrauch: ' + eur(extra) : 'Kein Mehrverbrauch';
    document.getElementById('bar-in').style.width = (used / max * 100) + '%';
    document.getElementById('bar-over').style.width = (extra / max * 100) + '%';
  };
  r.addEventListener('input', update);
  update();
})();
