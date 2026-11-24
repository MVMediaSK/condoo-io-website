(() => {
  const mock = document.querySelector('.d-consent-mock');
  const button = mock.querySelector('.d-demo-button');
  const steps = [...mock.querySelectorAll('.d-consent-steps li')];
  const states = [
    { title: 'Noch nicht bestätigt', text: 'Das Formular ist ausgefüllt. Die Bestätigung steht noch aus.', button: 'Beispiel: Bestätigungsmail senden' },
    { title: 'Bestätigung ausstehend', text: 'Im Beispiel wartet die Bestätigungsmail auf den Klick des Kontakts.', button: 'Beispiel: Bestätigungslink anklicken' },
    { title: 'Einwilligung bestätigt', text: 'Im Beispiel ist die Bestätigung erfasst. Der passende Workflow kann jetzt starten.', button: 'Beispiel erneut ansehen' }
  ];
  let current = 0;
  button.addEventListener('click', () => {
    current = (current + 1) % states.length;
    const state = states[current];
    mock.querySelector('[data-consent-status]').textContent = state.title;
    mock.querySelector('[data-consent-text]').textContent = state.text;
    button.firstChild.textContent = state.button + ' ';
    steps.forEach((step, index) => {
      step.classList.toggle('is-current', index === current);
      step.classList.toggle('is-done', index < current);
    });
    mock.querySelector('.d-demo-live').textContent = state.title + '. ' + state.text;
  });
})();
