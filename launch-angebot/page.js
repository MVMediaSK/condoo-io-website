// Launch price stays at 85 EUR net monthly while the booked plan is active.
(() => {
  const mount = document.querySelector('.checkout-mount');
  if (!mount || mount.dataset.plan === 'complete-monthly') return;
  const titles = {
    'complete-ltd': 'Complete LTD – Funnelpay Checkout',
    'reseller-ltd': 'Reseller10 LTD – Funnelpay Checkout'
  };
  const prepareFrame = () => {
    const frame = mount.querySelector('iframe');
    if (!frame) return false;
    // Fixed CSS viewport prevents a resize feedback loop. Keep all fields accessible.
    frame.setAttribute('scrolling', 'yes');
    frame.setAttribute('title', titles[mount.dataset.plan] || 'condooOS Checkout');
    return true;
  };
  if (prepareFrame()) return;
  const observer = new MutationObserver(() => {
    if (prepareFrame()) observer.disconnect();
  });
  observer.observe(mount, { childList: true, subtree: true });
})();
