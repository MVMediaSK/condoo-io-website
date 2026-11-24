// Preise: Zahlweise-Schalter und Projekt-Rechner
(function () {
  const set = (sel, txt) => document.querySelectorAll(sel).forEach(el => { el.textContent = txt; });
  const buttons = [...document.querySelectorAll('[data-billing]')];
  const update = (period) => {
    const year = period === 'year';
    buttons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.billing === period)));
    set('[data-amount]', year ? '970 €' : '97 €');
    set('[data-period]', year ? '/ Jahr' : '/ Monat');
    set('[data-saving]', year ? '194 € pro Jahr sparen · entspricht 80,83 € / Monat' : 'Flexible monatliche Zahlung · monatlich kündbar');
    set('[data-trial]', year ? '10 Tage entdecken. Danach 970 € / Jahr zzgl. USt., jährlich abgerechnet.' : '10 Tage entdecken. Danach 97 € / Monat zzgl. USt.');
    set('[data-final]', year ? '10 Tage kostenlos testen. Danach 970 € / Jahr zzgl. USt. · kündbar zum Ende des Abojahres' : '10 Tage kostenlos testen. Danach 97 € / Monat zzgl. USt. · monatlich kündbar');
  };
  buttons.forEach(b => b.addEventListener('click', () => update(b.dataset.billing)));

  const range = document.getElementById('projekte');
  if (!range) return;
  const out = document.getElementById('projekte-out');
  const rows = document.getElementById('calc-rows');
  const sum = document.getElementById('calc-sum');
  const reg_ = document.getElementById('calc-reg');
  const eur = n => n.toLocaleString('de-DE') + ' €';
  const names = ['Dein erstes Business', 'Deine zweite Marke', 'Dein nächstes Projekt'];
  const calc = () => {
    const n = +range.value;
    out.textContent = n;
    let html = '';
    for (let i = 0; i < Math.min(n, 3); i++) {
      html += `<li><span>${names[i]}</span><span class="mono">${i === 0 ? '97 €' : '33 €'}</span></li>`;
    }
    if (n > 3) html += `<li><span>${n - 3} weitere${n - 3 === 1 ? 's' : ''} Projekt${n - 3 === 1 ? '' : 'e'}</span><span class="mono">${n - 3} × 33 €</span></li>`;
    rows.innerHTML = html;
    const pay = 97 + 33 * (n - 1), reg = 97 * n;
    sum.textContent = eur(pay);
    reg_.textContent = eur(reg);
    reg_.hidden = n < 2;
    sum.setAttribute('aria-label', n < 2 ? eur(pay) : eur(pay) + ' statt regulär ' + eur(reg));
  };
  range.addEventListener('input', calc);
  calc();
})();
