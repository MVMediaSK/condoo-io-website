// Gebühren: Guthaben-Rechner (E-Mails 0,0012 €, Speicher 0,05 €/GB, 10 € Guthaben; BF-Vergleich mit 20 € bis 30.11.2026)
(function () {
  const gm = document.getElementById('gc-m'), gs = document.getElementById('gc-s');
  if (!gm || !gs) return;
  const $ = id => document.getElementById(id);
  const GB = [0, 1, 2, 5, 10, 20, 30, 50, 75, 100, 150, 200];
  const CREDIT = 10, BF = 20;
  const bfRow = document.querySelector('.gc-bar.bf');
  const bfActive = () => bfRow && !bfRow.hidden && Date.now() < Date.parse(bfRow.dataset.bis);
  const nf = n => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const cover = (v, c) => v > c ? nf(v - c) + ' zahlst Du selbst' : 'Komplett gedeckt, ' + nf(c - v) + ' übrig';
  function calc() {
    const m = +gm.value, s = GB[+gs.value], v = m * 0.0012 + s * 0.05, pay = Math.max(0, v - CREDIT);
    $('gc-mo').textContent = m.toLocaleString('de-DE');
    $('gc-so').textContent = s;
    gs.setAttribute('aria-valuetext', s + ' GB');
    const vv = $('gc-v'), pp = $('gc-p');
    vv.textContent = pay > 0 ? nf(v) + ' − 10,00 €' : nf(v);
    vv.classList.toggle('n', pay > 0);
    pp.textContent = nf(pay);
    pp.classList.toggle('z', pay === 0);
    $('gc-b10').style.width = Math.min(100, v / CREDIT * 100) + '%';
    $('gc-t10').textContent = cover(v, CREDIT);
    $('gc-b20').style.width = Math.min(100, v / BF * 100) + '%';
    $('gc-t20').textContent = cover(v, BF);
    const sp = Math.min(v, BF) - Math.min(v, CREDIT);
    $('gc-n').textContent = bfActive() && sp > 0
      ? 'Mit dem Black-Friday-Guthaben sparst Du in diesem Beispiel ' + nf(sp) + ' im Monat.'
      : 'Bei reinem E-Mail-Versand deckt Dein Guthaben bis zu 8.333 E-Mails im Monat.';
  }
  if (bfRow && Date.now() >= Date.parse(bfRow.dataset.bis)) bfRow.hidden = true;
  gm.addEventListener('input', calc);
  gs.addEventListener('input', calc);
  calc();
})();
