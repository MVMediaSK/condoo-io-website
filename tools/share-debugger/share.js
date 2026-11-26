// condooOS Tools – Social Share Debugger
// Die Seite wird über /api/share.php abgerufen (Browser dürfen fremde Seiten nicht direkt auslesen).
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const form = $('#sd-form'), input = $('#sd-url'), go = $('#sd-go'), errBox = $('#sd-error'), status = $('#sd-status'), out = $('#sd-out'), copied = $('#sd-copied');
  let running = false, lastUrl = '';

  // ───────── Bausteine ─────────
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c instanceof Node ? c : document.createTextNode(String(c))); }
    return e;
  }
  const ICON = { ok: '✓', warn: '!', bad: '✕', info: 'i', neutral: '–' };
  const badge = (k, t) => el('span', { class: 'dc-badge dc-' + k }, el('span', { 'aria-hidden': 'true' }, ICON[k]), t);
  async function copy(text, what, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const t = el('textarea', { class: 'dc-sr' }); t.value = text; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch (x) { } t.remove(); }
    const old = btn.textContent; btn.textContent = 'Kopiert'; btn.classList.add('done'); copied.textContent = what + ' kopiert';
    setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); copied.textContent = ''; }, 1600);
  }
  const copyBtn = (text, what, label = 'Kopieren', cls = 'dc-copy') => el('button', { type: 'button', class: cls, 'aria-label': label === 'Kopieren' ? what + ' kopieren' : null, onclick: e => copy(text, what, e.currentTarget) }, label);
  const valueBox = (text, what) => el('div', { class: 'dc-value' }, el('code', { text }), copyBtn(text, what));
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  const kb = n => n == null ? null : n < 1024 ? n + ' Byte' : n < 1048576 ? (n / 1024).toLocaleString('de-DE', { maximumFractionDigits: 0 }) + ' KB' : (n / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' MB';
  const FORMAT = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP', 'image/gif': 'GIF', 'image/avif': 'AVIF', 'image/svg+xml': 'SVG', 'image/bmp': 'BMP' };
  const norm = u => { try { const x = new URL(u); x.hash = ''; let s = x.protocol + '//' + x.hostname.toLowerCase() + (x.port ? ':' + x.port : '') + x.pathname.replace(/\/+$/, '') + x.search; return s; } catch (e) { return u; } };
  const variant = u => { try { const x = new URL(u); x.searchParams.set('v', '2'); return x.toString(); } catch (e) { return u + (u.includes('?') ? '&' : '?') + 'v=2'; } };

  // ───────── Eingabe ─────────
  function prepare(raw) {
    let s = raw.trim();
    if (!s) return { err: 'Bitte gib die Adresse der Seite ein, z. B. https://deine-website.de.' };
    if (/\s/.test(s)) return { err: 'Die Adresse darf keine Leerzeichen enthalten.' };
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
    let u; try { u = new URL(s); } catch (e) { return { err: 'Diese Adresse ist ungültig.' }; }
    if (!/^https?:$/.test(u.protocol)) return { err: 'Bitte gib eine Adresse mit http:// oder https:// ein.' };
    if (u.username || u.password) return { err: 'Die Adresse enthält Zugangsdaten. Bitte entferne sie.' };
    if (!u.hostname.includes('.')) return { err: 'Bitte gib eine vollständige Adresse ein, z. B. https://deine-website.de.' };
    return { url: u.toString() };
  }

  // ───────── Hinweise mit nächstem Schritt ─────────
  function hints(d) {
    const h = [], add = (k, t, s) => h.push({ k, t, s });
    const D = d.daten, B = d.bild, title = D.titel, desc = D.beschreibung;
    if (!title) add('bad', 'Deine Seite hat keinen Titel.', 'Ergänze im <head> ein og:title, z. B. <meta property="og:title" content="Dein Seitentitel">.');
    else if (title.quelle !== 'og:title') add('info', `Der Titel stammt aus ${title.quelle}, nicht aus og:title.`, 'Ergänze og:title, damit Du den Titel für geteilte Links gezielt festlegst.');
    if (!desc) add('warn', 'Es fehlt eine Beschreibung.', 'Ergänze og:description mit ein bis zwei Sätzen, etwa 110 bis 155 Zeichen.');
    else if (desc.quelle !== 'og:description') add('info', `Die Beschreibung stammt aus ${desc.quelle}, nicht aus og:description.`, 'Ergänze og:description, damit Du den Text für geteilte Links gezielt festlegst.');
    if (title && title.wert.length > 60) add('info', `Dein Titel hat ${title.wert.length} Zeichen und wird in den Vorschauen voraussichtlich abgeschnitten.`, 'Kürze ihn auf etwa 60 Zeichen und stell das Wichtigste nach vorn.');
    if (desc && desc.wert.length > 155) add('info', `Deine Beschreibung hat ${desc.wert.length} Zeichen und wird voraussichtlich abgeschnitten.`, 'Kürze sie auf etwa 110 bis 155 Zeichen.');
    if (!D.bild) add('bad', 'Es ist kein Vorschaubild hinterlegt. Ohne Bild wirkt Dein Link klein und unauffällig.', 'Ergänze og:image mit der vollständigen Adresse eines Bildes – ideal 1200 × 630 Pixel als JPG oder PNG.');
    else {
      if (!/^og:image/.test(D.bild.quelle)) add('info', `Das Bild stammt aus ${D.bild.quelle}, nicht aus og:image.`, 'Ergänze og:image – Facebook, LinkedIn und WhatsApp lesen vor allem diese Angabe.');
      if (D.bild.roh && !/^https?:\/\//i.test(D.bild.roh)) add('info', 'og:image ist als relative Adresse angegeben.', 'Trag die Bildadresse vollständig mit https:// ein. Nicht jede Plattform ergänzt relative Adressen zuverlässig.');
      if (/^http:\/\//i.test(D.bild.wert)) add('warn', 'Das Vorschaubild wird über http:// statt https:// geladen.', 'Stell die Bildadresse auf https:// um, sonst blockieren manche Apps das Bild.');
      if (B && !B.ok) add('bad', 'Dein Vorschaubild ist nicht erreichbar. ' + (B.text || ''), 'Lade es erneut hoch und prüfe, ob die neue Bildadresse öffentlich geöffnet werden kann.');
      if (B && B.ok) {
        if (B.format === 'image/svg+xml') add('bad', 'Das Vorschaubild ist eine SVG-Datei. Facebook, LinkedIn und WhatsApp zeigen SVG nicht als Vorschau.', 'Exportiere das Bild als JPG oder PNG und trag die neue Adresse in og:image ein.');
        if (B.breite && B.hoehe) {
          if (B.breite < 200 || B.hoehe < 200) add('bad', `Das Bild ist mit ${B.breite} × ${B.hoehe} Pixel zu klein. Facebook zeigt Bilder unter 200 × 200 Pixel nicht an.`, 'Verwende ein Bild mit 1200 × 630 Pixel.');
          else if (B.breite < 1200) add('info', `Das Bild hat ${B.breite} × ${B.hoehe} Pixel. Für große, scharfe Vorschauen sind 1200 × 630 Pixel empfohlen.`, 'Lade das Bild in höherer Auflösung hoch – unter einem neuen Dateinamen.');
          const r = B.breite / B.hoehe;
          if (r < 1.5 || r > 2.3) add('info', `Das Seitenverhältnis (${B.breite} × ${B.hoehe}) weicht vom üblichen Querformat 1,91 : 1 ab. Die Plattformen schneiden das Bild deshalb zu.`, 'Leg wichtige Inhalte wie Text oder Logo in die Bildmitte oder nutze direkt 1200 × 630 Pixel.');
          const dw = +D.bild_breite_angabe, dh = +D.bild_hoehe_angabe;
          if (dw && dh && (dw !== B.breite || dh !== B.hoehe)) add('info', `og:image:width/height nennen ${dw} × ${dh} Pixel, das Bild hat aber ${B.breite} × ${B.hoehe}.`, 'Passe og:image:width und og:image:height an die echten Maße an oder entferne die Angaben.');
        }
        const bytes = B.bytes != null ? B.bytes : B.bytes_angabe;
        if (B.zu_gross || bytes > 8388608) add('bad', 'Das Bild ist größer als 8 MB. Facebook lädt so große Vorschaubilder nicht.', 'Komprimiere das Bild (z. B. als JPG mit 80 % Qualität) und lade es unter neuem Namen hoch.');
        else if (bytes > 5242880) add('warn', `Das Bild ist ${kb(bytes)} groß. LinkedIn akzeptiert höchstens 5 MB.`, 'Komprimiere das Bild und lade es unter neuem Namen hoch.');
        else if (bytes > 307200) add('info', `Das Bild ist ${kb(bytes)} groß. WhatsApp zeigt große Bilder erfahrungsgemäß manchmal nur klein oder gar nicht an.`, 'Halte das Vorschaubild möglichst unter 300 KB, z. B. als komprimiertes JPG.');
      }
    }
    if (D.og_url && norm(D.og_url.wert) !== norm(d.ziel_url)) add('warn', `og:url zeigt auf eine andere Adresse (${D.og_url.wert}). Plattformen laden die Vorschau dann von dort.`, `Setze og:url auf die Adresse dieser Seite: ${d.ziel_url}`);
    if (d.weiterleitungen.length) add('info', `Die Adresse leitet ${d.weiterleitungen.length === 1 ? 'einmal' : d.weiterleitungen.length + '-mal'} weiter.`, 'Teile am besten direkt die endgültige Ziel-URL – das spart den Plattformen einen Umweg.');
    if (d.zu_gross) add('info', 'Die Seite ist größer als 2 MB. Es wurde nur der Anfang ausgelesen.', 'Stell die Vorschau-Angaben (og:…) möglichst weit oben in den <head>.');
    const order = { bad: 0, warn: 1, info: 2 };
    return h.sort((a, b) => order[a.k] - order[b.k]);
  }

  // ───────── Vorschauen (nachempfunden, ohne Plattform-Logos) ─────────
  function img(B, url, cls) {
    const box = el('div', { class: 'sd-img ' + (cls || '') });
    const ph = text => box.replaceChildren(el('span', { class: 'sd-ph' }, text));
    if (!url) { ph('Kein Vorschaubild'); return box; }
    if (B && !B.ok) { ph('Bild nicht erreichbar'); return box; }
    if (B && B.format === 'image/svg+xml') { ph('SVG wird nicht angezeigt'); return box; }
    const i = el('img', { src: url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', decoding: 'async' });
    i.addEventListener('error', () => ph('Bild nicht ladbar'));
    box.append(i); return box;
  }
  function previews(d) {
    const D = d.daten, B = d.bild, t = D.titel ? D.titel.wert : '', desc = D.beschreibung ? D.beschreibung.wert : '', im = D.bild ? D.bild.wert : null;
    const dom = host((D.og_url && D.og_url.wert) || d.ziel_url), small = B && B.ok && B.breite && B.breite < 400;
    const fb = el('div', { class: 'sd-fb' }, img(B, im, small ? 'sd-sq' : ''), el('div', { class: 'sd-fb-t' },
      el('p', { class: 'sd-dom', text: dom.toUpperCase() }), el('p', { class: 'sd-tt c2', text: t || '(kein Titel)' }), desc ? el('p', { class: 'sd-ds c1', text: desc }) : null));
    const li = el('div', { class: 'sd-li' }, img(B, im, small ? 'sd-sq' : ''), el('div', { class: 'sd-li-t' },
      el('p', { class: 'sd-tt c2', text: t || '(kein Titel)' }), el('p', { class: 'sd-dom', text: dom })));
    const wa = el('div', { class: 'sd-wa' }, el('div', { class: 'sd-bubble' },
      el('div', { class: 'sd-wa-card' + (small || !im ? ' sd-wa-row' : '') }, im ? img(B, im, small ? 'sd-thumb' : '') : null,
        el('div', { class: 'sd-wa-t' }, el('p', { class: 'sd-tt c2', text: t || '(kein Titel)' }), desc ? el('p', { class: 'sd-ds c2', text: desc }) : null, el('p', { class: 'sd-dom', text: dom }))),
      el('p', { class: 'sd-wa-link', text: d.ziel_url }), el('span', { class: 'sd-wa-time', 'aria-hidden': 'true' }, '12:34 ✓✓')));
    const P = [['facebook', 'Facebook', fb, 'Desktop-Feed: Domain, Titel und eine Zeile Beschreibung.'], ['linkedin', 'LinkedIn', li, 'Feed: Titel und Domain – eine Beschreibung zeigt LinkedIn meist nicht.'], ['whatsapp', 'WhatsApp', wa, 'Chat: Vorschau über dem Link. Kleine Bilder erscheinen als Miniatur.']];
    const tabs = el('div', { class: 'dc-tabs sd-tabs', role: 'tablist', 'aria-label': 'Plattform-Vorschau' });
    const grid = el('div', { class: 'sd-prev' });
    P.forEach(([id, name, node, cap], i) => {
      const tab = el('button', { type: 'button', role: 'tab', id: 'sd-tab-' + id, 'aria-controls': 'sd-p-' + id, 'aria-selected': i === 0 ? 'true' : 'false', tabindex: i === 0 ? '0' : '-1' }, name);
      tabs.append(tab);
      grid.append(el('section', { class: 'sd-panel' + (i === 0 ? ' on' : ''), id: 'sd-p-' + id, role: 'tabpanel', 'aria-labelledby': 'sd-tab-' + id },
        el('h3', { class: 'sd-pname', text: name }), node, el('p', { class: 'sd-cap', text: cap })));
    });
    const pick = (i, focus) => { [...tabs.children].forEach((b, j) => { b.setAttribute('aria-selected', j === i); b.tabIndex = j === i ? 0 : -1; if (j === i && focus) b.focus(); }); [...grid.children].forEach((p, j) => p.classList.toggle('on', j === i)); };
    [...tabs.children].forEach((b, i) => {
      b.addEventListener('click', () => pick(i));
      b.addEventListener('keydown', e => { const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (k) { e.preventDefault(); pick((i + k + 3) % 3, true); } });
    });
    return el('div', { class: 'sd-prev-wrap' }, el('p', { class: 'sd-label' }, badge('info', 'Vorschau'), ' Auf Basis der aktuell gefundenen Seitendaten. Die echte Darstellung kann je nach Plattform, App-Version und Cache abweichen.'), tabs, grid);
  }

  // ───────── Ergebnis ─────────
  function urlBlock(d) {
    const moved = d.weiterleitungen && d.weiterleitungen.length;
    return el('div', { class: 'dc-card sd-urls' },
      el('dl', { class: 'dc-dl dc-dl-wide' },
        el('dt', { text: 'Eingegebene URL' }), el('dd', null, el('code', { class: 'sd-code', text: d.start_url })),
        moved ? [el('dt', { text: 'Weiterleitungen' }), el('dd', null, el('ol', { class: 'sd-hops' }, d.weiterleitungen.map(w => el('li', null, el('span', { class: 'dc-arrow', text: w.status }), ' ', el('code', { class: 'sd-code', text: w.url })))))] : null,
        el('dt', { text: 'Endgültige Ziel-URL' }), el('dd', null, valueBox(d.ziel_url || d.start_url, 'Ziel-URL')),
        d.status ? [el('dt', { text: 'Antwort' }), el('dd', { text: `HTTP ${d.status}` + (d.content_type ? ' · ' + d.content_type.split(';')[0] : '') })] : null));
  }
  function dataTable(d) {
    const D = d.daten, B = d.bild;
    const row = (k, v, src, copyable) => [el('dt', { text: k }), el('dd', null, v ? (copyable ? valueBox(v, k) : el('span', { class: 'sd-v', text: v })) : el('span', { class: 'sd-miss', text: 'nicht vorhanden' }), src ? el('span', { class: 'sd-src', text: 'Quelle: ' + src }) : null)];
    const bytes = B ? (B.bytes != null ? B.bytes : B.bytes_angabe) : null;
    return el('details', { class: 'dc-card sd-data', open: true }, el('summary', null, 'Gefundene Seitendaten'),
      el('dl', { class: 'dc-dl dc-dl-wide' },
        row('Titel', D.titel && D.titel.wert, D.titel && D.titel.quelle),
        row('Beschreibung', D.beschreibung && D.beschreibung.wert, D.beschreibung && D.beschreibung.quelle),
        row('Vorschaubild', D.bild && D.bild.wert, D.bild && D.bild.quelle, true),
        D.bild ? [el('dt', { text: 'Bild-Prüfung' }), el('dd', null, B && B.ok ? badge('ok', 'Erreichbar') : badge('bad', 'Nicht erreichbar'), ' ',
          el('span', { class: 'sd-v', text: B ? [B.format && (FORMAT[B.format] || B.format), B.breite && `${B.breite} × ${B.hoehe} px`, kb(bytes), !B.ok && B.text].filter(Boolean).join(' · ') : '' }))] : null,
        row('og:url', D.og_url && D.og_url.wert, null, true),
        row('Seitenname', D.seitenname && D.seitenname.wert, D.seitenname && D.seitenname.quelle),
        row('Typ', D.typ && D.typ.wert, D.typ && 'og:type'),
        D.canonical ? row('Canonical', D.canonical, '<link rel="canonical">', true) : null,
        D.bild_alt ? row('Bild-Alternativtext', D.bild_alt.wert, D.bild_alt.quelle) : null));
  }
  function refreshSection(d) {
    const u = d.ziel_url, v = variant(u);
    const link = (href, text) => el('a', { class: 'dc-btn sd-btn', href, target: '_blank', rel: 'noopener noreferrer' }, text, el('span', { class: 'dc-sr' }, ' (öffnet in neuem Tab)'), el('span', { 'aria-hidden': 'true' }, ' ↗'));
    return el('section', { class: 'sd-refresh', 'aria-labelledby': 'sd-ref-h' },
      el('h2', { id: 'sd-ref-h', text: 'Wird noch das alte Bild angezeigt?' }),
      el('p', { class: 'dc-sub-info' }, 'Facebook, LinkedIn und WhatsApp speichern Vorschauen zwischen. „Erneut prüfen“ lädt hier nur die Daten Deiner Website neu – die Vorschau-Caches der Plattformen aktualisierst Du über deren eigene Werkzeuge:'),
      el('div', { class: 'sd-ref-url' }, el('code', { text: u }), copyBtn(u, 'URL', 'URL kopieren', 'dc-again')),
      el('div', { class: 'dc-cards sd-ref-cards' },
        el('article', { class: 'dc-card' }, el('h3', { text: 'Facebook' }),
          el('p', null, 'Öffne den Sharing Debugger, gib dort die Seiten-URL ein und klick auf „Scrape Again“. Danach zeigt Facebook bei neuen Shares die aktuelle Vorschau.'),
          el('div', { class: 'sd-actions' }, link('https://developers.facebook.com/tools/debug/?q=' + encodeURIComponent(u), 'Facebook Sharing Debugger öffnen'), copyBtn(u, 'URL', 'URL kopieren', 'dc-again'))),
        el('article', { class: 'dc-card' }, el('h3', { text: 'LinkedIn' }),
          el('p', null, 'Der Post Inspector liest Deine Seite neu ein – für alle künftigen Shares. Bereits veröffentlichte Beiträge behalten ihre alte Vorschau.'),
          el('div', { class: 'sd-actions' }, link('https://www.linkedin.com/post-inspector/inspect/' + encodeURIComponent(u), 'LinkedIn Post Inspector öffnen'), copyBtn(u, 'URL', 'URL kopieren', 'dc-again'))),
        el('article', { class: 'dc-card' }, el('h3', { text: 'WhatsApp' }),
          el('p', null, 'Füge den Link in einen Chat ein und warte kurz, bis über dem Eingabefeld die Vorschau erscheint – prüfe sie, bevor Du sendest. Erscheint weiter das alte Bild, teile versuchsweise eine Linkvariante:'),
          el('div', { class: 'sd-ref-url' }, el('code', { text: v }), copyBtn(v, 'Linkvariante', 'Variante kopieren', 'dc-again')),
          el('p', { class: 'dc-sub-info' }, u.includes('?') ? 'Weil Deine URL schon Parameter enthält, wird &v=2 angehängt.' : 'Die Variante hängt ?v=2 an. Enthält eine URL schon Parameter, nimm &v=2.'),
          el('div', { class: 'sd-actions' }, copyBtn(u, 'URL', 'URL kopieren', 'dc-again')))),
      el('div', { class: 'dc-summary dc-s-ok sd-tip' }, el('p', { class: 'dc-sum-t', text: 'Tipp zum Bildwechsel' }),
        el('p', null, 'Lade das neue Bild unter einem neuen Dateinamen hoch, z. B. share-v2.jpg, und trag diese Adresse in og:image ein. Die Seitenadresse kannst Du beibehalten – der neue Dateiname sorgt dafür, dass die Plattformen das Bild wirklich neu laden.')));
  }
  const NEXT = {
    dns: 'Prüfe die Schreibweise der Domain und ob sie registriert ist.', timeout: 'Versuch es in ein paar Minuten erneut. Antwortet die Seite dauerhaft langsam, kann auch Facebook die Vorschau oft nicht laden.',
    verbindung: 'Prüfe, ob die Website online ist und ob die Adresse stimmt.', ssl: 'Erneuere oder repariere das SSL-Zertifikat Deiner Website – ohne gültiges Zertifikat laden viele Plattformen keine Vorschau.',
    privat: 'Gib die öffentliche Adresse Deiner Website ein.', ungueltig: 'Korrigiere die Adresse, z. B. https://deine-website.de.', kein_html: 'Gib die Adresse einer Webseite ein, nicht die einer Datei.',
    weiterleitungen: 'Prüfe die Weiterleitungen Deiner Website, z. B. in der .htaccess oder bei Deinem Hoster.', limit: 'Warte ein paar Minuten und prüfe dann erneut.',
    http: null
  };
  function failCard(d) {
    const blocked = d.fehler === 'http' && (d.status === 403 || d.status === 401);
    const next = d.fehler === 'http' ? (blocked ? 'Prüfe die Vorschau direkt im Facebook Sharing Debugger. Wenn auch Facebook nichts lädt, gib in Deiner Firewall oder Deinem Sicherheitsdienst Crawler wie „facebookexternalhit“ und „LinkedInBot“ frei.' : d.status === 404 ? 'Prüfe, ob die Adresse stimmt und die Seite veröffentlicht ist.' : 'Prüfe, ob die Seite im Browser normal lädt, und versuch es dann erneut.') : NEXT[d.fehler] || 'Versuch es noch einmal.';
    return el('div', null,
      el('div', { class: 'dc-card sd-fail' }, el('div', { class: 'dc-chead' }, el('h3', { text: blocked ? 'Abruf blockiert' : 'Seite konnte nicht abgerufen werden' }), badge(blocked ? 'warn' : 'bad', blocked ? 'Blockiert' : 'Abruf fehlgeschlagen')),
        el('p', { class: 'dc-note dc-note-bad', text: d.text }), el('p', { class: 'dc-note' }, el('b', null, 'Nächster Schritt: '), next),
        el('p', { class: 'dc-sub-info' }, 'Weil die Seite nicht gelesen werden konnte, lassen sich Titel, Beschreibung und Vorschaubild nicht prüfen. Das heißt nicht, dass sie fehlen.')),
      d.start_url ? urlBlock(d) : null);
  }
  function render(d) {
    const top = el('div', { class: 'dc-rhead' }, el('div', null, el('p', { class: 'dc-eyebrow', text: 'Social Share Debugger' }), el('h2', { text: host(d.ziel_url || d.start_url || d.eingabe) })),
      el('button', { type: 'button', class: 'dc-again', onclick: () => run(lastUrl) }, '↻ Erneut prüfen'));
    if (!d.ok) return el('div', null, top, failCard(d));
    const H = hints(d);
    const hintBox = el('section', { class: 'dc-card sd-hints', 'aria-labelledby': 'sd-h-h' },
      el('div', { class: 'dc-chead' }, el('h3', { id: 'sd-h-h', text: 'Hinweise' }),
        H.some(x => x.k === 'bad') ? badge('bad', 'Handlungsbedarf') : H.some(x => x.k === 'warn') ? badge('warn', 'Mit Hinweisen') : badge('ok', 'Alles Wichtige vorhanden')),
      H.length ? el('ul', { class: 'sd-hlist' }, H.map(x => el('li', null, badge(x.k, { bad: 'Problem', warn: 'Hinweis', info: 'Tipp' }[x.k]), el('div', null, el('p', { class: 'sd-ht', text: x.t }), el('p', { class: 'sd-hs' }, el('b', null, 'Nächster Schritt: '), x.s)))))
        : el('p', { class: 'dc-note dc-note-ok', text: 'Titel, Beschreibung und Vorschaubild sind vorhanden und das Bild ist erreichbar.' }));
    return el('div', null, top, urlBlock(d), previews(d), hintBox, dataTable(d), refreshSection(d));
  }

  // ───────── Ablauf ─────────
  async function run(url) {
    if (running) return;
    running = true; lastUrl = url; errBox.hidden = true; go.disabled = true; go.textContent = 'Wird geprüft …'; form.setAttribute('aria-busy', 'true'); out.classList.add('dc-loading');
    status.textContent = `${url} wird abgerufen …`;
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 40000);
      const r = await fetch('/api/share.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: ctl.signal });
      clearTimeout(timer);
      const d = await r.json();
      if (!r.ok && d.fehler !== undefined && d.ok === false && !d.text) throw new Error('api');
      out.replaceChildren(render(d));
      status.textContent = d.ok ? 'Prüfung abgeschlossen.' : 'Die Seite konnte nicht abgerufen werden.';
    } catch (e) {
      out.replaceChildren(el('div', { class: 'dc-card sd-fail' }, badge('bad', 'Prüfung nicht möglich'), el('p', { class: 'dc-note' }, 'Der Prüfdienst ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal.')));
      status.textContent = 'Prüfung nicht möglich.';
    } finally {
      running = false; go.disabled = false; go.textContent = 'Link prüfen'; form.removeAttribute('aria-busy'); out.classList.remove('dc-loading');
    }
  }
  form.addEventListener('submit', e => {
    e.preventDefault();
    const p = prepare(input.value);
    if (p.err) { errBox.textContent = p.err; errBox.hidden = false; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    input.removeAttribute('aria-invalid');
    run(p.url);
  });
  const q = new URLSearchParams(location.search).get('url');
  if (q) input.value = q.slice(0, 2000);
})();
