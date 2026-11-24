(() => {
  const toc = document.querySelector('.legal-sidebar details');
  const mobile = matchMedia('(max-width: 760px)');
  const resize = () => { toc.open = !mobile.matches; };
  resize();
  mobile.addEventListener('change', resize);
  document.querySelector('.legal-print').addEventListener('click', () => window.print());
  const links = [...document.querySelectorAll('.legal-sidebar nav a')];
  links.forEach(link => link.addEventListener('click', () => { if (mobile.matches) toc.open = false; }));
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      links.forEach(link => {
        if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }), {rootMargin: '-5% 0px -70% 0px', threshold: 0});
    document.querySelectorAll('.legal-chapter').forEach(section => observer.observe(section));
  }
})();
