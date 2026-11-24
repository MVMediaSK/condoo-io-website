(() => {
  const section = document.querySelector('.customer-trust');
  if (!section) return;
  const button = section.querySelector('.customer-logo-toggle');
  button.hidden = false;
  button.addEventListener('click', () => {
    const paused = section.classList.toggle('is-paused');
    button.setAttribute('aria-pressed', String(paused));
    button.setAttribute('aria-label', paused ? 'Logo-Animation fortsetzen' : 'Logo-Animation pausieren');
    button.querySelector('.customer-toggle-icon').textContent = paused ? '▷' : 'Ⅱ';
    button.querySelector('.customer-toggle-label').textContent = paused ? 'Fortsetzen' : 'Pausieren';
  });
})();
