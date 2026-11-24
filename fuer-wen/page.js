(() => {
  const events = {
    agency: [
      'Eine Anfrage aus Deiner Kampagne ist eingegangen.',
      'Lenas Anliegen und Kontaktdaten sind direkt zusammen erfasst.',
      'Studio Nord ist Deiner Pipeline zugeordnet. Der nächste Schritt ist klar.',
      'Das Erstgespräch ist geplant. Die Kommunikation bleibt am Kontakt.',
      'Nach dem Gespräch startet Dein vorbereitetes Follow-up.'
    ],
    coach: [
      'Ein Freebie macht Dein Wissen erlebbar.',
      'Nach bestätigter Anmeldung startet Deine Willkommensmail.',
      'Dein Interessent wählt einen passenden Kennenlerntermin.',
      'Die Buchung steht. Bestätigung und Erinnerung greifen ineinander.',
      'Nach der Buchung Deines Angebots geht es im Kurs oder in der Community weiter.'
    ],
    service: [
      'Thomas fragt über das Formular auf Deiner Website an.',
      'Anliegen und Kontaktdaten sind an einem Ort erfasst.',
      'Maria übernimmt. Dein Team sieht, wer den nächsten Schritt macht.',
      'Der Termin ist vereinbart und beim Kontakt dokumentiert.',
      'Die nächste Aufgabe erinnert Dein Team ans Nachfassen.'
    ],
    creator: [
      'Dein Content macht Menschen auf Dein Wissen aufmerksam.',
      'Dein Funnel führt Interessenten durch Dein Angebot.',
      'Nach erfolgreichem Kauf startet der vorbereitete Ablauf.',
      'Dein Kunde bekommt Zugang zu den gebuchten Inhalten.',
      'E-Mails und Community begleiten Deine Kunden auch nach dem Kauf.'
    ]
  };
  document.querySelectorAll('[data-scenario]').forEach(story => {
    const key = story.dataset.scenario;
    const steps = [...story.querySelectorAll('[data-step]')];
    function select(index, announce = true) {
      steps.forEach((step, i) => step.setAttribute('aria-pressed', String(i === index)));
      story.dataset.current = index;
      story.querySelectorAll('[data-stage]').forEach(node => node.classList.toggle('is-current', Number(node.dataset.stage) === index));
      if (announce) {
        story.querySelector('[data-event]').textContent = events[key][index];
        const event = story.querySelector('.a-event');
        event.classList.remove('is-updated');
        void event.offsetWidth;
        event.classList.add('is-updated');
      }
      if (key === 'agency') {
        const lead = document.getElementById('a-agency-lead');
        const columns = [...story.querySelectorAll('.a-pipe-col')];
        const target = index < 3 ? 0 : index === 3 ? 1 : 2;
        columns.forEach((col, i) => col.classList.toggle('has-active', i === target));
        if (lead.parentElement !== columns[target]) {
          columns[target].querySelector('h4').after(lead);
        }
        story.querySelector('[data-lead-label]').textContent = ['Neue Kampagnen-Anfrage','Kontaktdaten erfasst','Nächster Schritt zugeordnet','Erstgespräch geplant','Follow-up vorbereitet'][index];
      }
      if (key === 'service') {
        const activeStage = index === 0 ? 0 : index < 3 ? 1 : 3;
        story.querySelectorAll('[data-stage]').forEach(node => node.classList.toggle('is-current', Number(node.dataset.stage) === activeStage));
        story.querySelector('[data-task]').textContent = ['Anfrage prüfen und zuordnen','Kontaktdaten und Anliegen prüfen','Maria: Rückruf vorbereiten','Beratungstermin durchführen','Thomas zum nächsten Schritt kontaktieren'][index];
      }
      if (key === 'creator') {
        story.querySelector('[data-access]').textContent = index < 2 ? 'Vorschau' : index === 2 ? 'Kauf bestätigt' : 'Zugang freigeschaltet';
      }
    }
    steps.forEach((step, i) => step.addEventListener('click', () => select(i)));
    select(0, false);
  });
  const slots = [...document.querySelectorAll('[data-slot]')];
  slots.forEach(slot => slot.addEventListener('click', () => {
    slots.forEach(item => item.setAttribute('aria-pressed', String(item === slot)));
    document.querySelector('[data-selected-slot]').textContent = slot.dataset.slot;
    document.querySelector('[data-scenario="coach"] [data-event]').textContent = 'Beispieltermin ausgewählt: Donnerstag um ' + slot.dataset.slot + ' Uhr. So einfach kann Terminbuchung sein.';
  }));
  const lessons = ['Deine Idee bekommt Klarheit.', 'Aus Deinem Wissen wird ein Angebot.', 'Bring Deine Idee zu den richtigen Menschen.'];
  const lessonButtons = [...document.querySelectorAll('[data-lesson]')];
  lessonButtons.forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.lesson);
    lessonButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    document.querySelector('[data-lesson-number]').textContent = 'LEKTION 0' + (index + 1);
    document.querySelector('[data-lesson-title]').textContent = lessons[index];
    document.querySelector('.a-video-progress span').style.width = [24, 52, 80][index] + '%';
    document.querySelector('[data-scenario="creator"] [data-event]').textContent = 'Beispiel-Lektion ' + (index + 1) + ': ' + lessons[index];
  }));
})();
