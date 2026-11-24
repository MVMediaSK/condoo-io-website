(() => {
  const replyButton = document.querySelector('.w-reply-button');
  replyButton.addEventListener('click', () => {
    const open = replyButton.getAttribute('aria-expanded') !== 'true';
    replyButton.setAttribute('aria-expanded', String(open));
    document.getElementById('w-community-reply').hidden = !open;
  });
  const tabs = [...document.querySelectorAll('[data-help]')];
  function selectHelp(index, focus = false) {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(index === i));
      tab.tabIndex = index === i ? 0 : -1;
      document.getElementById(tab.getAttribute('aria-controls')).hidden = index !== i;
    });
    if (focus) tabs[index].focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectHelp(index));
    tab.addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        selectHelp(event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + 1) % tabs.length, true);
      }
    });
  });
  const search = document.getElementById('w-article-search');
  const articles = [...document.querySelectorAll('[data-article]')];
  search.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase('de');
    let count = 0;
    articles.forEach(article => {
      const matches = article.dataset.article.toLocaleLowerCase('de').includes(query);
      article.hidden = !matches;
      if (matches) count++;
    });
    document.getElementById('w-no-articles').hidden = count !== 0;
    document.getElementById('w-search-status').textContent = count + ' Beispielartikel';
  });
  const samples = {
    lead: {label:'DEIN WISSEN. IHR ERSTER SCHRITT.', title:'Eine gute Idee.<br>Ein klarer Start.', copy:'Dein Workbook für den nächsten Schritt.', cta:'Workbook entdecken ↗'},
    webinar: {label:'DEIN WISSEN. LIVE GETEILT.', title:'Ein Thema.<br>Neue Möglichkeiten.', copy:'Dein Webinar für Menschen, die weiterkommen wollen.', cta:'Dein Webinar entdecken ↗'},
    sales: {label:'DEIN ANGEBOT. IHR NÄCHSTER SCHRITT.', title:'Zeit für das,<br>was Dich weiterbringt.', copy:'Mach aus Interesse eine klare Entscheidung.', cta:'Angebot entdecken ↗'}
  };
  const templateButtons = [...document.querySelectorAll('[data-template]')];
  templateButtons.forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.template;
    const sample = samples[key];
    templateButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    document.getElementById('w-template-label').textContent = sample.label;
    document.getElementById('w-template-title').innerHTML = sample.title;
    document.getElementById('w-template-copy').textContent = sample.copy;
    document.getElementById('w-template-cta').textContent = sample.cta;
    const preview = document.getElementById('w-template-preview');
    preview.dataset.style = key;
    preview.classList.remove('is-changing');
    void preview.offsetWidth;
    preview.classList.add('is-changing');
  }));
})();
