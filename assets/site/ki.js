// KI-Website-Builder: Demo „Prompt → Website → Code“
(function () {
  const demo = document.getElementById('ki-demo');
  if (!demo) return;
  const promptEl = document.getElementById('ki-prompt');
  const full = promptEl.textContent;
  const reply = document.getElementById('ki-reply');
  const plan = [...demo.querySelectorAll('.ki-plan li')];
  const blocks = [...demo.querySelectorAll('.ks')];
  const tabs = [...demo.querySelectorAll('.ki-tabs button')];
  const setView = v => { demo.classList.toggle('code', v === 'code'); tabs.forEach(t => t.classList.toggle('on', t.dataset.view === v)); };
  let manual = false;
  tabs.forEach(t => t.addEventListener('click', () => { manual = true; demo.classList.add('done'); setView(t.dataset.view); }));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) { demo.classList.add('done'); return; }
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function play() {
    while (!manual) {
      demo.classList.remove('done'); setView('visual');
      [reply, ...plan, ...blocks].forEach(e => e.classList.remove('in'));
      promptEl.textContent = '';
      for (let i = 1; i <= full.length && !manual; i++) { promptEl.textContent = full.slice(0, i); await wait(28); }
      await wait(350); reply.classList.add('in');
      for (const li of plan) { await wait(260); li.classList.add('in'); }
      for (const b of blocks) { await wait(520); b.classList.add('in'); }
      await wait(1600); if (manual) break; setView('code');
      await wait(3600); if (manual) break; setView('visual');
      await wait(2600);
    }
  }
  new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { o.disconnect(); play(); } }, { threshold: .35 }).observe(demo);
})();
