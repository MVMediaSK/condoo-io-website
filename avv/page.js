(() => {
  const toc = document.querySelector('.avv-sidebar details');
  const mobile = window.matchMedia('(max-width: 760px)');
  const setToc = () => { toc.open = !mobile.matches; };
  setToc();
  mobile.addEventListener('change', setToc);
  document.querySelector('.avv-print').addEventListener('click', () => window.print());
  const links = [...document.querySelectorAll('.avv-sidebar nav a')];
  links.forEach(link => link.addEventListener('click', () => {
    if (mobile.matches) toc.open = false;
  }));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        links.forEach(link => {
          if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
          else link.removeAttribute('aria-current');
        });
      });
    }, {rootMargin: '-5% 0px -70% 0px', threshold: 0});
    document.querySelectorAll('.avv-chapter').forEach(section => observer.observe(section));
  }
})();
