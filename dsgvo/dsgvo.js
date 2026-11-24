// DSGVO: interaktive Double-Opt-in-Illustration (es werden keine E-Mails versendet)
(function () {
  const box = document.querySelector('.doi');
  if (!box) return;
  const btn = box.querySelector('[data-doi-btn]');
  const steps = [...box.querySelectorAll('.doi-steps li')];
  const states = [
    { title: 'Noch nicht bestätigt', text: 'Das Formular ist ausgefüllt. Die Bestätigung steht noch aus.', button: 'Beispiel: Bestätigungsmail senden →' },
    { title: 'Bestätigung ausstehend', text: 'Im Beispiel wartet die Bestätigungsmail auf den Klick des Kontakts.', button: 'Beispiel: Bestätigungslink anklicken →' },
    { title: 'Einwilligung bestätigt', text: 'Im Beispiel ist die Bestätigung erfasst. Der passende Workflow kann jetzt starten.', button: 'Beispiel erneut ansehen ↺' }
  ];
  let cur = 0;
  btn.addEventListener('click', () => {
    cur = (cur + 1) % states.length;
    const s = states[cur];
    box.dataset.state = cur;
    box.querySelector('[data-doi-status]').textContent = s.title;
    box.querySelector('[data-doi-text]').textContent = s.text;
    btn.textContent = s.button;
    steps.forEach((li, k) => { li.classList.toggle('cur', k === cur && cur !== 2); li.classList.toggle('done', k < cur || cur === 2 && k === 2); });
    box.querySelector('[data-doi-live]').textContent = s.title + '. ' + s.text;
  });
})();
