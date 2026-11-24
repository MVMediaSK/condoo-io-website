// One Complete plan, with a monthly or annual billing period.
(() => {
  const choice = document.querySelector('.billing-choice');
  if (!choice) return;
  const buttons = [...choice.querySelectorAll('[data-billing]')];
  const setText = (selector, value) => {
    document.querySelectorAll(selector).forEach(element => { element.textContent = value; });
  };
  function updateBilling(period) {
    const yearly = period === 'year';
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.billing === period)));
    setText('[data-complete-amount]', yearly ? '970' : '97');
    setText('[data-complete-period]', yearly ? '/ Jahr' : '/ Monat');
    setText('[data-complete-terms]', yearly ? 'zzgl. USt. · jährliche Zahlung' : 'zzgl. USt. · monatlich kündbar');
    setText('[data-complete-saving]', yearly ? '194 € pro Jahr sparen · entspricht 80,83 € / Monat.' : 'Flexible monatliche Zahlung.');
    setText('[data-complete-trial]', yearly ? 'Danach 970 € / Jahr zzgl. USt., jährlich abgerechnet.' : 'Danach 97 € / Monat zzgl. USt.');
    setText('[data-complete-final]', yearly ? 'Danach 970 € / Jahr zzgl. USt. · kündbar zum Ende des Abojahres' : 'Danach 97 € / Monat zzgl. USt. · monatlich kündbar');
  }
  buttons.forEach(button => button.addEventListener('click', () => updateBilling(button.dataset.billing)));
  choice.hidden = false;
})();
