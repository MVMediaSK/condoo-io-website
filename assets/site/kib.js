// condooOS – Mockup „KI Page- & Funnel-Builder“: Prompt → KI baut → Drag & Drop → direkt bearbeiten
(function () {
  const SC = [
    { t: 0, prompt: 'Landingpage für meinen Online-Kurs: hell, modern, mit Preisen.', status: 'KI baut Deine Landingpage …',
      logo: 'Kurswerk', nav: 'Starten', eyebrow: 'Online-Kurs', h: 'Dein Kurs.|Dein Tempo.', h2: 'In 6 Wochen|zum ersten Kunden.', btn: 'Jetzt starten',
      f1: '12 Module', f2: 'Community', f3: 'Zertifikat', quote: 'Endlich verstehe ich mein Marketing.', who: 'Lisa K.', plabel: 'Komplettkurs', price: '297 €', pbtn: 'Kaufen' },
    { t: 1, prompt: 'Website für mein Yoga-Studio in Graz: ruhig, hell, mit Kursplan.', status: 'KI baut Deine Website …',
      logo: 'Atem Studio', nav: 'Buchen', eyebrow: 'Yoga in Graz', h: 'Ankommen.|Durchatmen.', h2: 'Atmen. Ankommen.|Bleiben.', btn: 'Probestunde buchen',
      f1: 'Hatha · Mo', f2: 'Yin · Mi', f3: 'Flow · Sa', quote: 'Mein Lieblingsort in Graz.', who: 'Anna W.', plabel: '10er-Karte', price: '149 €', pbtn: 'Buchen' },
    { t: 2, prompt: 'Funnel für mein Webinar: Anmeldung, Danke-Seite, Angebot.', status: 'KI baut Deinen Funnel · 3 Seiten …',
      logo: 'Wachstum Live', nav: 'Anmelden', eyebrow: 'Live-Webinar · Do 19 Uhr', h: 'Mehr Kunden|in 60 Minuten.', h2: 'Mehr Anfragen.|Weniger Stress.', btn: 'Kostenlos anmelden',
      f1: '1 · Anmeldung', f2: '2 · Danke', f3: '3 · Angebot', quote: 'Das beste Webinar des Jahres.', who: 'Michael B.', plabel: 'Workshop-Bundle', price: '97 €', pbtn: 'Sichern' }
  ];
  const html = s => s.replace('|', '<br>');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('.kib').forEach(root => {
    const $ = s => root.querySelector(s), $$ = s => [...root.querySelectorAll(s)];
    const body = $('.kib-body'), canvas = $('.kib-canvas'), prompt = $('.kib-prompt'), txt = $('.kib-text');
    const types = $$('.kib-types b'), blocks = $$('.kb'), quote = $('.kb-quote'), drop = $('.kb-drop');
    const tile = $('.kib-tile[data-b="stimmen"]'), cursor = $('.kib-cursor'), ghost = $('.kib-ghost'), sel = $('.kib-sel'), badge = $('.kib-badge'), h = $('.kib-h');
    const fill = sc => $$('[data-k]').forEach(el => { const v = sc[el.dataset.k]; if (v != null) el.innerHTML = html(v); });
    if (reduce || !('IntersectionObserver' in window)) { root.classList.add('static'); return; }

    let vis = false;
    new IntersectionObserver(e => { vis = e[0].isIntersecting; }, { threshold: .3 }).observe(root);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // Zeit läuft nur, solange das Mockup sichtbar ist
    const wait = async ms => { let left = ms; while (left > 0) { await sleep(Math.min(60, left)); if (vis && !document.hidden) left -= 60; } };
    const pos = (el, fx = .5, fy = .5) => { const r = el.getBoundingClientRect(), b = body.getBoundingClientRect(); return [r.left - b.left + r.width * fx, r.top - b.top + r.height * fy]; };
    const place = (el, [x, y], jump) => { if (jump) el.classList.add('kib-jump'); el.style.translate = `${x}px ${y}px`; if (jump) { el.offsetWidth; el.classList.remove('kib-jump'); } };
    const ghostAt = ([x, y], jump) => place(ghost, [x - 16, y - 12], jump);
    const fitSel = () => { const r = h.getBoundingClientRect(), b = body.getBoundingClientRect();
      Object.assign(sel.style, { left: r.left - b.left - 5 + 'px', top: r.top - b.top - 4 + 'px', width: r.width + 10 + 'px', height: r.height + 8 + 'px' }); };

    root.classList.add('run');
    async function loop() {
      for (let n = 0; ; n = (n + 1) % SC.length) {
        const sc = SC[n];
        // Zurücksetzen
        blocks.forEach(b => b.classList.remove('in'));
        [drop, sel, badge, ghost, tile].forEach(e => e.classList.remove('on', 'grab'));
        cursor.classList.remove('on', 'down');
        prompt.classList.remove('sent', 'ok', 'ready', 'press');
        types.forEach((t, k) => t.classList.toggle('on', k === sc.t));
        await wait(450);
        fill(sc); txt.textContent = '';
        // 1. Prompt tippen und senden
        await wait(500);
        prompt.classList.add('ready');
        for (let i = 1; i <= sc.prompt.length; i++) { txt.textContent = sc.prompt.slice(0, i); await wait(24); }
        await wait(380); prompt.classList.add('press'); await wait(160); prompt.classList.remove('press', 'ready');
        prompt.classList.add('sent'); txt.textContent = '✦ ' + sc.status;
        // 2. KI baut Block für Block
        canvas.classList.add('building');
        for (const b of blocks) { if (b === quote) continue; await wait(430); b.classList.add('in'); }
        await wait(380); canvas.classList.remove('building');
        prompt.classList.add('ok'); txt.textContent = '✓ Fertig – jetzt frei anpassen';
        // 3. Block aus der Bibliothek ziehen und ablegen
        await wait(650);
        const start = [body.clientWidth - 30, body.clientHeight - 20];
        place(cursor, start, true); cursor.classList.add('on');
        await wait(60); place(cursor, pos(tile, .55, .55));
        await wait(1000);
        cursor.classList.add('down'); tile.classList.add('grab');
        ghostAt(pos(tile, .55, .55), true); ghost.classList.add('on');
        await wait(260);
        const target = pos(drop, .5, .5);
        place(cursor, target); ghostAt(target);
        await wait(520); drop.classList.add('on');
        await wait(520);
        cursor.classList.remove('down'); ghost.classList.remove('on'); tile.classList.remove('grab'); drop.classList.remove('on');
        quote.classList.add('in');
        // 4. Überschrift anklicken und umschreiben
        await wait(800);
        place(cursor, pos(h, .3, .45));
        await wait(950); cursor.classList.add('down'); await wait(140); cursor.classList.remove('down');
        fitSel(); sel.classList.add('on');
        await wait(500);
        for (let i = sc.h.length; i >= 0; i--) { h.innerHTML = html(sc.h.slice(0, i)) || '&nbsp;'; fitSel(); await wait(18); }
        for (let i = 1; i <= sc.h2.length; i++) { h.innerHTML = html(sc.h2.slice(0, i)); fitSel(); await wait(42); }
        await wait(450);
        place(cursor, [body.clientWidth - 40, body.clientHeight * .55]);
        badge.classList.add('on');
        await wait(600); cursor.classList.remove('on');
        await wait(2600);
        sel.classList.remove('on');
      }
    }
    // Erst starten, wenn das Mockup ins Bild kommt
    new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { o.disconnect(); loop(); } }, { threshold: .35 }).observe(root);
  });
})();
