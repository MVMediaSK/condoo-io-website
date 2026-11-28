// Kontaktformular: Thema aus dem Link übernehmen, prüfen, an /api/kontakt.php senden
(function () {
  const f = document.getElementById('kt-form'); if (!f) return;
  const t0 = Date.now(), q = new URLSearchParams(location.search);
  const thema = f.elements.thema, von = f.querySelector('.kt-von'), msg = f.elements.nachricht;
  const err = f.querySelector('.kt-err'), btn = f.querySelector('.kt-send'), done = document.querySelector('.kt-done');
  const PH = {
    frage: 'Was möchtest Du wissen?',
    umzug: 'Welche Bereiche nutzt Du heute (z. B. Funnels, CRM, Automationen, Kurse)?',
    reseller: 'Erzähl uns kurz von Deinem Business und Deinen Kunden.',
    whitelabel: 'Wie soll Deine eigene Software-Marke aussehen?',
    affiliate: 'Deine Frage zum Affiliate-Programm.',
    accounts: 'Wie viele weitere Accounts brauchst Du und für welche Projekte?',
    avv: 'Deine Frage zu Datenschutz oder AVV.',
    support: 'Was klappt nicht? Je genauer, desto schneller können wir helfen.',
    sonstiges: 'Deine Nachricht an uns.'
  };
  const sync = () => { von.hidden = thema.value !== 'umzug'; msg.placeholder = PH[thema.value] || PH.frage; };
  if (q.get('thema') && PH[q.get('thema')]) thema.value = q.get('thema');
  if (q.get('von')) { const s = f.elements.software; [...s.options].forEach(o => { if (o.text.toLowerCase() === q.get('von').toLowerCase()) s.value = o.value || o.text; }); }
  thema.addEventListener('change', sync); sync();

  const show = html => { err.innerHTML = html; err.hidden = false; };
  f.addEventListener('input', e => e.target.classList.remove('bad'));
  f.addEventListener('submit', async e => {
    e.preventDefault(); err.hidden = true;
    const need = [f.elements.vorname, f.elements.email, msg];
    const bad = need.filter(el => !el.value.trim() || (el.type === 'email' && !el.checkValidity()));
    need.forEach(el => el.classList.toggle('bad', bad.includes(el)));
    if (bad.length) { show(bad.includes(f.elements.email) && f.elements.email.value ? 'Bitte prüf Deine E-Mail-Adresse.' : 'Bitte fülle die markierten Felder aus.'); bad[0].focus(); return; }
    const data = Object.fromEntries(new FormData(f));
    data.dauer = Date.now() - t0; data.seite = document.referrer ? new URL(document.referrer).pathname : '';
    btn.disabled = true; btn.firstChild.textContent = 'Wird gesendet … ';
    try {
      const r = await fetch(f.dataset.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.fehler || r.status);
      document.querySelector('.kt-name').textContent = data.vorname ? ', ' + data.vorname.trim() : '';
      f.hidden = true; done.hidden = false; done.focus();
    } catch (x) {
      show('Das hat leider nicht geklappt. Bitte versuch es gleich noch einmal oder schreib uns direkt an <a href="mailto:kontakt@condoo.systems">kontakt@condoo.systems</a>.');
      btn.disabled = false; btn.firstChild.textContent = 'Nachricht senden ';
    }
  });
})();
