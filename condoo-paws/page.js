(() => {
  const media = window.pawsMedia;
  if (!media) return;
  const safeUrl = value => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const url = new URL(value, location.href);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };
  document.querySelectorAll('[data-photo]').forEach(figure => {
    const data = media.photos?.[figure.dataset.photo];
    const src = safeUrl(data?.src);
    if (!src) return;
    const image = new Image();
    image.alt = data.alt || '';
    image.loading = 'eager';
    image.decoding = 'async';
    const wrapper = document.createElement('div');
    wrapper.className = 'p-uploaded-photo';
    wrapper.append(image);
    // Keep an authored fallback available if the future image cannot be loaded.
    image.addEventListener('load', () => figure.querySelector('.p-photo-placeholder')?.replaceWith(wrapper), { once: true });
    image.src = src;
  });
  const videos = [...document.querySelectorAll('[data-video] video')];
  videos.forEach(video => {
    const message = video.closest('[data-video]').querySelector('.p-video-error');
    video.addEventListener('play', () => {
      videos.forEach(other => { if (other !== video) other.pause(); });
    });
    const showError = () => { if (message) message.hidden = false; };
    video.addEventListener('error', showError);
    video.querySelector('source:last-of-type')?.addEventListener('error', showError);
    video.addEventListener('loadeddata', () => { if (message) message.hidden = true; });
  });
})();
