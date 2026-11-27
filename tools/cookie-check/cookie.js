// condooOS Tools – Cookie Check
// Die Seite wird über /api/cookie.php abgerufen (Browser dürfen Cookies fremder Seiten nicht auslesen).
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const form = $('#ck-form'), input = $('#ck-url'), go = $('#ck-go'), errBox = $('#ck-error'), status = $('#ck-status'), out = $('#ck-out'), copied = $('#ck-copied');
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
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };
  const plural = (n, eins, mehr) => n + ' ' + (n === 1 ? eins : mehr);
  async function copy(text, what, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const t = el('textarea', { class: 'dc-sr' }); t.value = text; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch (x) { } t.remove(); }
    const old = btn.textContent; btn.textContent = 'Kopiert'; btn.classList.add('done'); copied.textContent = what + ' kopiert';
    setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); copied.textContent = ''; }, 1600);
  }

  const ART = {
    notwendig: ['ok', 'Technisch notwendig'], funktional: ['neutral', 'Funktional'], consent: ['neutral', 'Einwilligung'],
    statistik: ['bad', 'Statistik'], marketing: ['bad', 'Marketing'], unbekannt: ['warn', 'Zweck unbekannt']
  };
  const DIENST_ART = {
    statistik: ['Analyse & Statistik', 'bad'], marketing: ['Werbung & Marketing', 'bad'], chat: ['Chat & Widgets', 'warn'],
    einbettung: ['Eingebettete Inhalte', 'warn'], daten: ['Datenübertragung an Dritte (ohne Cookies)', 'info'],
    cookielos: ['Analyse ohne Cookies', 'ok'], consent: ['Consent-Banner', 'neutral']
  };
  const TRACKING = ['statistik', 'marketing', 'chat', 'einbettung'];
  // Anbieter mit Sitz außerhalb der EU (Konzernsitz)
  const DRITTLAND = {
    ga: 'USA', gtm: 'USA', gads: 'USA', youtube: 'USA', 'youtube-nc': 'USA', maps: 'USA', recaptcha: 'USA', gfonts: 'USA',
    meta: 'USA', fbembed: 'USA', clarity: 'USA', bing: 'USA', linkedin: 'USA', pinterest: 'USA', xads: 'USA', xembed: 'USA',
    hubspot: 'USA', klaviyo: 'USA', addthis: 'USA', intercom: 'USA', tawk: 'USA', zendesk: 'USA', vimeo: 'USA', calendly: 'USA',
    stripe: 'USA', adobefonts: 'USA', gravatar: 'USA', tiktok: 'außerhalb der EU', vwo: 'außerhalb der EU'
  };
  const FONTS = ['gfonts', 'adobefonts'];

  function laufzeit(s) {
    if (s == null) return 'Sitzung';
    const m = 60, h = 3600, t = 86400;
    if (s < h) return plural(Math.max(1, Math.round(s / m)), 'Minute', 'Minuten');
    if (s < t) return plural(Math.round(s / h), 'Stunde', 'Stunden');
    if (s < 60 * t) return plural(Math.round(s / t), 'Tag', 'Tage');
    if (s < 730 * t) return plural(Math.round(s / (30.44 * t)), 'Monat', 'Monate');
    return plural(Math.round(s / (365.25 * t)), 'Jahr', 'Jahre');
  }

  // ───────── Eingabe ─────────
  function prepare(raw) {
    let s = raw.trim();
    if (!s) return { err: 'Bitte gib die Adresse der Website ein, z. B. https://deine-website.de.' };
    if (/\s/.test(s)) return { err: 'Die Adresse darf keine Leerzeichen enthalten.' };
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
    let u; try { u = new URL(s); } catch (e) { return { err: 'Diese Adresse ist ungültig.' }; }
    if (!/^https?:$/.test(u.protocol)) return { err: 'Bitte gib eine Adresse mit http:// oder https:// ein.' };
    if (u.username || u.password) return { err: 'Die Adresse enthält Zugangsdaten. Bitte entferne sie.' };
    if (!u.hostname.includes('.')) return { err: 'Bitte gib eine vollständige Adresse ein, z. B. https://deine-website.de.' };
    return { url: u.toString() };
  }

  // ───────── Auswertung ─────────
  function auswerten(d) {
    const C = d.cookies, D = d.dienste;
    const trackC = C.filter(c => c.art === 'statistik' || c.art === 'marketing');
    const unbekC = C.filter(c => c.art === 'unbekannt');
    const aktivT = D.filter(x => x.aktiv && TRACKING.includes(x.art));
    const aktivHart = aktivT.filter(x => x.art === 'statistik' || x.art === 'marketing');
    const blockiert = D.filter(x => x.blockiert && TRACKING.includes(x.art));
    const consent = D.filter(x => x.art === 'consent');
    const daten = D.filter(x => x.aktiv && x.art === 'daten');
    const fonts = D.filter(x => x.aktiv && FONTS.includes(x.id));
    const dritt = D.filter(x => x.aktiv && DRITTLAND[x.id]);
    const js = !!d.schreibt_cookies_per_js;
    const fs = d.fremde_skripte || [];
    let stufe;
    if (!C.length && !aktivT.length && !daten.length && !js && !fs.length) stufe = 'sauber';
    else if (!C.length && !aktivT.length && (js || fs.length)) stufe = 'unklar';
    else if (!C.length && !aktivT.length) stufe = 'daten';
    else if (trackC.length || aktivHart.length) stufe = 'bad';
    else if (unbekC.length || aktivT.length) stufe = 'warn';
    else stufe = 'notwendig';
    return { C, D, trackC, unbekC, aktivT, aktivHart, blockiert, consent, daten, fonts, dritt, js, fs, stufe };
  }

  function hinweise(d, A) {
    const h = [], add = (k, t, s) => h.push({ k, t, s });
    const https = /^https:/i.test(d.ziel_url || '');
    if (A.trackC.length) {
      const namen = [...new Set(A.trackC.map(c => c.dienst || c.name))].join(', ');
      add('bad', `Schon beim ersten Aufruf – also vor jeder Zustimmung – werden Tracking-Cookies gesetzt (${namen}).`, 'Sorge dafür, dass diese Cookies erst nach einer Einwilligung im Consent-Banner gesetzt werden.');
    }
    A.aktivT.forEach(x => add(x.art === 'statistik' || x.art === 'marketing' ? 'bad' : 'warn', `${x.name} wird sofort geladen. ${x.text}`, x.schritt || 'Lade den Dienst erst nach Zustimmung.'));
    if (A.consent.length && A.aktivHart.length) add('warn', `Ein Consent-Banner ist eingebunden (${A.consent.map(x => x.name).join(', ')}), trotzdem laden ${A.aktivHart.map(x => x.name).join(', ')} ohne Blockierung.`, 'Prüfe in Deinem Consent-Tool, ob diese Dienste wirklich erst nach Zustimmung starten – z. B. über die automatische Blockierung oder den Consent-Modus.');
    if (!A.consent.length && (A.trackC.length || A.aktivHart.length)) add('warn', 'Es wurde kein bekanntes Consent-Banner gefunden.', 'Für Analyse- und Werbe-Cookies brauchst Du in der Regel eine Einwilligung. Binde ein Consent-Tool ein oder verzichte auf diese Dienste.');
    A.unbekC.forEach(c => add('info', `Das Cookie „${c.name}“ kennt unser Check nicht – der Zweck ist unklar.`, 'Frag Deinen Webentwickler oder Anbieter, wofür es gesetzt wird, und führe es in Deiner Datenschutzerklärung auf.'));
    A.daten.forEach(x => add('info', `${x.name}: ${x.text}`, x.schritt || ''));
    A.C.forEach(c => {
      if (c.samesite && c.samesite.toLowerCase() === 'none' && !c.secure) add('warn', `„${c.name}“ ist mit SameSite=None, aber ohne Secure gesetzt. Moderne Browser verwerfen solche Cookies.`, 'Ergänze das Merkmal Secure.');
      else if (https && !c.secure) add('info', `„${c.name}“ hat kein Secure-Merkmal und könnte auch über unverschlüsselte Verbindungen übertragen werden.`, 'Setze das Cookie mit Secure.');
      if (c.laufzeit != null && c.laufzeit > 400 * 86400) add('info', `„${c.name}“ soll ${laufzeit(c.laufzeit)} gültig bleiben. Chrome begrenzt Cookies ohnehin auf höchstens 400 Tage.`, 'Wähle eine kürzere Laufzeit – so lange, wie der Zweck es wirklich braucht.');
    });
    if (A.D.some(x => x.id === 'gtm' && x.aktiv)) add('info', 'Über den Google Tag Manager können weitere Dienste nachgeladen werden, die im Quelltext nicht sichtbar sind.', 'Öffne den Tag Manager und prüfe, welche Tags ohne Zustimmung ausgelöst werden.');
    if (A.fs.length && !A.aktivT.length) add('warn', `Von ${plural(A.fs.length, 'fremden Quelle', 'fremden Quellen')} werden Skripte geladen, die unser Check nicht einordnen kann: ${A.fs.join(', ')}.`, 'Öffne die Seite in einem privaten Browserfenster, dann Entwicklertools → „Anwendung“ (Chrome) bzw. „Speicher“ (Firefox) → „Cookies“. Dort siehst Du alle Cookies, auch die per Skript gesetzten.');
    if (d.schreibt_cookies_per_js) add('warn', 'Ein Skript direkt im Quelltext der Seite schreibt selbst Cookies im Browser (document.cookie). Welche das sind, sieht unser Check nicht.', 'Prüfe zusätzlich in den Entwicklertools Deines Browsers unter „Anwendung → Cookies“, was nach dem Laden gesetzt wird.');
    if (d.geloescht) add('info', `${plural(d.geloescht, 'Cookie wird', 'Cookies werden')} beim Aufruf gelöscht – das zählen wir nicht mit.`, '');
    if (d.zu_gross) add('info', 'Die Seite ist größer als 3 MB. Es wurde nur der Anfang des Quelltexts geprüft.', '');
    const order = { bad: 0, warn: 1, info: 2 };
    return h.sort((a, b) => order[a.k] - order[b.k]);
  }

  // ───────── Erfolg (keine Cookies) ─────────
  function krümel() {
    const ns = 'http://www.w3.org/2000/svg';
    const s = (tag, a) => { const e = document.createElementNS(ns, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const svg = s('svg', { viewBox: '0 0 160 160', class: 'ck-anim', 'aria-hidden': 'true' });
    const keks = s('g', { class: 'ck-keks' });
    const viertel = [
      'M80 80 L80 34 A46 46 0 0 1 126 80 Z', 'M80 80 L126 80 A46 46 0 0 1 80 126 Z',
      'M80 80 L80 126 A46 46 0 0 1 34 80 Z', 'M80 80 L34 80 A46 46 0 0 1 80 34 Z'];
    const chips = [[[95, 55], [108, 70]], [[100, 98], [88, 110]], [[62, 104], [52, 92]], [[57, 60], [70, 50]]];
    viertel.forEach((p, i) => {
      const g = s('g', { class: 'ck-st ck-st' + i });
      g.append(s('path', { d: p, class: 'ck-teig' }));
      chips[i].forEach(([x, y]) => g.append(s('circle', { cx: x, cy: y, r: 4.2, class: 'ck-chip' })));
      keks.append(g);
    });
    svg.append(keks);
    for (let i = 0; i < 10; i++) {
      const w = (i / 10) * Math.PI * 2, r = 3 + (i % 3);
      svg.append(s('circle', { cx: 80 + Math.cos(w) * 30, cy: 80 + Math.sin(w) * 30, r, class: 'ck-krume', style: `--dx:${Math.cos(w) * 58}px;--dy:${Math.sin(w) * 58}px;--d:${(i % 4) * 40}ms` }));
    }
    const haken = s('g', { class: 'ck-haken' });
    const defs = s('defs', {});
    const lg = s('linearGradient', { id: 'ck-grad', x1: '0', y1: '0', x2: '1', y2: '1' });
    lg.append(s('stop', { offset: '0', 'stop-color': '#2A4DD1' }), s('stop', { offset: '.55', 'stop-color': '#3FA9E0' }), s('stop', { offset: '1', 'stop-color': '#2BB3A3' }));
    defs.append(lg); svg.prepend(defs);
    haken.append(s('circle', { cx: 80, cy: 80, r: 46, class: 'ck-ring' }), s('path', { d: 'M60 81 L74 95 L101 66', class: 'ck-check' }));
    svg.append(haken);
    return svg;
  }
  function erfolg(d, A) {
    const extra = [];
    const cl = A.D.filter(x => x.art === 'cookielos');
    if (cl.length) extra.push(el('li', null, badge('ok', 'Gut'), ` ${cl.map(x => x.name).join(', ')} – Analyse ohne Cookies.`));
    if (A.blockiert.length) extra.push(el('li', null, badge('ok', 'Gut'), ` ${A.blockiert.map(x => x.name).join(', ')} ${A.blockiert.length === 1 ? 'lädt' : 'laden'} erst nach Zustimmung.`));
    A.daten.forEach(x => extra.push(el('li', null, badge('info', 'Tipp'), ` ${x.name}: ${x.text} `, x.schritt ? el('b', null, 'Nächster Schritt: ') : null, x.schritt || '')));
    return el('section', { class: 'ck-win', 'aria-labelledby': 'ck-win-h' },
      krümel(),
      el('h3', { id: 'ck-win-h', class: 'ck-win-h' }, 'Keine Cookies – ', el('span', { class: 'grad' }, 'perfekt!')),
      el('p', { class: 'ck-win-t', text: `${host(d.ziel_url)} setzt beim ersten Aufruf keine Cookies, und im Quelltext steckt kein bekannter Tracking-Dienst.` }),
      extra.length ? el('ul', { class: 'ck-win-list' }, extra) : null,
      el('p', { class: 'ck-win-fine' }, 'Geprüft wurden die Cookies vom Server und über 50 bekannte Dienste im Quelltext. Was erst später per JavaScript nachgeladen wird, sieht dieser Check nicht – ', el('a', { href: '#ck-about', onclick: () => { $('#ck-about').open = true; } }, 'mehr dazu'), '.'));
  }

  // ───────── Prüfpunkte (Übersicht) ─────────
  function pruefpunkte(d, A) {
    const namen = l => l.map(x => x.name).join(', ');
    const P = [];
    const nurOk = A.C.every(c => ['notwendig', 'funktional', 'consent'].includes(c.art));
    P.push(['Cookies beim ersten Aufruf',
      !A.C.length && A.js ? ['warn', 'Der Server setzt keine Cookies – aber ein Skript auf der Seite schreibt selbst Cookies im Browser. Diese erfasst der Check nicht.']
        : !A.C.length && A.fs.length ? ['warn', 'Der Server setzt keine Cookies. Fremde Skripte auf der Seite können aber im Browser Cookies setzen.']
        : !A.C.length ? ['ok', 'Weder der Server noch ein Skript im Quelltext setzt beim ersten Aufruf Cookies.']
        : A.trackC.length ? ['bad', `${plural(A.C.length, 'Cookie', 'Cookies')}, davon ${A.trackC.length} für Tracking – noch vor jeder Zustimmung.`]
        : nurOk ? ['ok', `${plural(A.C.length, 'Cookie', 'Cookies')}, laut Name technisch notwendig oder funktional.`]
        : ['warn', `${plural(A.C.length, 'Cookie', 'Cookies')}, davon ${A.unbekC.length} mit unbekanntem Zweck.`]]);
    const trackBlock = A.blockiert.filter(x => x.art === 'statistik' || x.art === 'marketing');
    P.push(['Tracking & Werbung im Quelltext',
      A.aktivHart.length ? ['bad', `Lädt sofort: ${namen(A.aktivHart)}.`]
        : trackBlock.length ? ['ok', `${namen(trackBlock)} – lädt erst nach Zustimmung.`]
        : ['ok', 'Keine bekannten Analyse- oder Werbedienste gefunden.']]);
    const emb = A.aktivT.filter(x => x.art === 'einbettung' || x.art === 'chat');
    P.push(['Eingebettete Inhalte & Chats',
      emb.length ? ['warn', `Lädt sofort: ${namen(emb)}.`] : ['ok', 'Keine Videos, Karten, Chats oder andere Fremd-Einbettungen, die sofort laden.']]);
    P.push(['Google Fonts & externe Schriften',
      A.fonts.length ? ['warn', `${namen(A.fonts)}: Die Schriften kommen von fremden Servern, dabei geht die IP-Adresse dorthin.`] : ['ok', 'Es werden keine Schriften von Google Fonts oder Adobe Fonts geladen.']]);
    P.push(['Anbieter außerhalb der EU',
      A.dritt.length ? ['info', A.dritt.map(x => `${x.name} (${DRITTLAND[x.id]})`).join(', ') + '. Prüfe Rechtsgrundlage und Datenschutzerklärung.'] : ['ok', 'Keine bekannten Dienste von Anbietern außerhalb der EU, die sofort laden.']]);
    P.push(['Skripte von Drittanbietern',
      A.fs.length ? ['warn', `${plural(A.fs.length, 'fremde Quelle lädt', 'fremde Quellen laden')} sofort Skripte oder Inhalte: ${A.fs.slice(0, 4).join(', ')}${A.fs.length > 4 ? ' …' : ''}. Sie können Cookies setzen, die dieser Check nicht sieht.`] : ['ok', 'Es laufen keine Skripte oder eingebetteten Seiten von fremden Servern.']]);
    const f = d.fremde_domains;
    P.push(['Externe Domains',
      f.length ? ['info', `${plural(f.length, 'fremde Domain wird', 'fremde Domains werden')} sofort geladen: ${f.slice(0, 4).join(', ')}${f.length > 4 ? ' …' : ''}`] : ['ok', 'Die Seite lädt Skripte, Schriften, Stylesheets und Bilder nur vom eigenen Server.']]);
    const braucht = A.trackC.length || A.aktivT.length || A.blockiert.length;
    P.push(['Cookie-Banner',
      A.consent.length ? ['ok', `${namen(A.consent)} gefunden.`]
        : braucht ? ['warn', 'Kein bekanntes Consent-Tool gefunden, obwohl Dienste eingebunden sind, die meist eine Einwilligung brauchen.']
        : ['ok', 'Kein Consent-Tool erkannt – es wurden auch keine Dienste gefunden, die typischerweise eine Einwilligung brauchen.']]);
    const LBL = { ok: 'Gut', warn: 'Prüfen', bad: 'Problem', info: 'Hinweis' };
    return el('section', { class: 'ck-points', 'aria-label': 'Prüfpunkte' },
      el('ul', null, P.map(([t, [k, txt]]) => el('li', { class: 'ck-pt ck-pt-' + k },
        el('span', { class: 'ck-dot', 'aria-hidden': 'true' }),
        el('div', null, el('p', { class: 'ck-pt-h', text: t }), el('p', { class: 'ck-pt-t', text: txt })),
        el('span', { class: 'ck-pill ck-pill-' + k, text: LBL[k] })))),
      el('p', { class: 'ck-pt-fine', text: 'Technische Erstprüfung ohne JavaScript – Cookies, die erst durch Skripte im Browser entstehen, sind nicht enthalten. Kein Ersatz für eine Rechtsberatung.' }));
  }

  // ───────── Ergebnis-Teile ─────────
  function urteil(d, A) {
    const kach = (zahl, text, art) => el('div', { class: 'ck-tile ck-t-' + art }, el('b', { text: String(zahl) }), el('span', { text }));
    const T = {
      unklar: ['warn', 'Keine Server-Cookies – aber Skripte können Cookies setzen', 'Der Server setzt beim ersten Aufruf keine Cookies. Auf der Seite laufen aber Skripte, die im Browser selbst Cookies anlegen können. Die kann dieser Check nicht sehen – prüfe sie zusätzlich direkt im Browser.'],
      daten: ['warn', 'Keine Cookies – aber Daten gehen an Dritte', 'Beim ersten Aufruf werden keine Cookies gesetzt und keine Tracking-Dienste geladen. Die Seite lädt aber Inhalte von fremden Servern, die dabei die IP-Adresse Deiner Besucher erfahren.'],
      notwendig: ['ok', 'Nur technisch notwendige Cookies', 'Beim ersten Aufruf werden nur Cookies gesetzt, die für Betrieb oder Sicherheit der Seite gedacht sind. Tracking-Dienste wurden im Quelltext nicht gefunden.'],
      warn: ['warn', 'Bitte genauer hinschauen', 'Es gibt Cookies oder eingebettete Inhalte, die Du prüfen solltest. Die Hinweise unten zeigen Dir, wo.'],
      bad: ['bad', 'Tracking ohne Zustimmung möglich', 'Beim ersten Aufruf werden Tracking-Cookies gesetzt oder Analyse- bzw. Werbedienste geladen – bevor Besucher zustimmen konnten.']
    }[A.stufe];
    return el('div', { class: 'dc-summary dc-s-' + T[0] + ' ck-verdict' },
      el('div', { class: 'ck-v-head' }, badge(T[0], T[0] === 'ok' ? 'In Ordnung' : T[0] === 'warn' ? 'Prüfen' : 'Handlungsbedarf'), el('p', { class: 'dc-sum-t', text: T[1] })),
      el('p', { text: T[2] }),
      el('div', { class: 'ck-tiles' },
        kach(A.C.length, A.C.length === 1 ? 'Cookie beim ersten Aufruf' : 'Cookies beim ersten Aufruf', A.C.length ? (A.trackC.length ? 'bad' : 'neutral') : 'ok'),
        kach(A.trackC.length, 'davon Tracking', A.trackC.length ? 'bad' : 'ok'),
        kach(A.aktivT.length, A.aktivT.length === 1 ? 'Dienst lädt sofort' : 'Dienste laden sofort', A.aktivHart.length ? 'bad' : A.aktivT.length ? 'warn' : 'ok'),
        kach(A.blockiert.length, 'erst nach Zustimmung', 'neutral')));
  }
  function hinweisBox(H) {
    if (!H.length) return null;
    return el('section', { class: 'dc-card ck-hints', 'aria-labelledby': 'ck-h-h' },
      el('div', { class: 'dc-chead' }, el('h3', { id: 'ck-h-h', text: 'Hinweise' })),
      el('ul', { class: 'ck-hlist' }, H.map(x => el('li', null, badge(x.k, { bad: 'Problem', warn: 'Hinweis', info: 'Tipp' }[x.k]),
        el('div', null, el('p', { class: 'ck-ht', text: x.t }), x.s ? el('p', { class: 'ck-hs' }, el('b', null, 'Nächster Schritt: '), x.s) : null)))));
  }
  function cookieTabelle(A) {
    if (!A.C.length) return null;
    const merk = c => [c.secure ? 'Secure' : null, c.httponly ? 'HttpOnly' : null, c.samesite ? 'SameSite=' + c.samesite : null].filter(Boolean);
    return el('section', { class: 'dc-card ck-cookies', 'aria-labelledby': 'ck-c-h' },
      el('div', { class: 'dc-chead' }, el('h3', { id: 'ck-c-h', text: plural(A.C.length, 'Cookie', 'Cookies') + ' beim ersten Aufruf' })),
      el('p', { class: 'dc-sub-info', text: 'Die Einordnung beruht auf dem Namen des Cookies. Werte zeigen wir aus Datenschutzgründen nicht an – nur ihre Länge.' }),
      el('div', { class: 'ck-table', role: 'table', 'aria-label': 'Gefundene Cookies' },
        el('div', { class: 'ck-tr ck-th', role: 'row' }, ['Name', 'Art', 'Laufzeit', 'Merkmale', 'Gesetzt von'].map(t => el('span', { role: 'columnheader', text: t }))),
        A.C.map(c => el('div', { class: 'ck-tr', role: 'row' },
          el('span', { role: 'cell', class: 'ck-name' }, el('code', { text: c.name }), el('small', { text: `Wert: ${c.wert_laenge} Zeichen` })),
          el('span', { role: 'cell', 'data-l': 'Art' }, badge(...ART[c.art] || ART.unbekannt), c.zweck ? el('small', { class: 'ck-zweck', text: c.zweck }) : null),
          el('span', { role: 'cell', 'data-l': 'Laufzeit', text: laufzeit(c.laufzeit) }),
          el('span', { role: 'cell', 'data-l': 'Merkmale' }, merk(c).length ? merk(c).map(m => el('em', { class: 'ck-flag', text: m })) : el('span', { class: 'ck-miss', text: 'keine' })),
          el('span', { role: 'cell', 'data-l': 'Gesetzt von' }, el('code', { class: 'ck-host', text: c.domain_angabe ? '.' + c.domain : c.gesetzt_von }))))));
  }
  function dienstListe(A) {
    const gruppen = Object.keys(DIENST_ART).map(art => [art, A.D.filter(x => x.art === art)]).filter(([, l]) => l.length);
    if (!gruppen.length) return el('section', { class: 'dc-card ck-dienste' }, el('div', { class: 'dc-chead' }, el('h3', { text: 'Dienste im Quelltext' })), el('p', { class: 'dc-note dc-note-ok', text: 'Kein bekannter Tracking-Dienst, keine Einbettung und kein Consent-Tool gefunden.' }));
    return el('section', { class: 'dc-card ck-dienste', 'aria-labelledby': 'ck-d-h' },
      el('div', { class: 'dc-chead' }, el('h3', { id: 'ck-d-h', text: 'Dienste im Quelltext' })),
      gruppen.map(([art, l]) => el('div', { class: 'ck-gruppe' },
        el('p', { class: 'ck-g-h', text: DIENST_ART[art][0] }),
        el('ul', { class: 'ck-dlist' }, l.map(x => el('li', null,
          el('div', { class: 'ck-d-top' }, el('b', { text: x.name }),
            art === 'consent' || art === 'cookielos' ? badge(DIENST_ART[art][1], art === 'consent' ? 'Gefunden' : 'Ohne Cookies')
              : x.aktiv ? badge(DIENST_ART[art][1] === 'info' ? 'info' : DIENST_ART[art][1], 'Lädt sofort') : badge('ok', 'Erst nach Zustimmung')),
          el('p', { text: x.text })))))));
  }
  function fremdBox(d) {
    if (!d.fremde_domains.length) return null;
    return el('details', { class: 'dc-card ck-fremd' }, el('summary', null, `Skripte und Inhalte von ${plural(d.fremde_domains.length, 'fremden Domain', 'fremden Domains')}`),
      el('p', { class: 'dc-sub-info', text: 'Diese Adressen lädt die Seite sofort. Nicht jede setzt Cookies, aber jede erfährt dabei die IP-Adresse des Besuchers.' }),
      el('ul', { class: 'ck-fremd-list' }, d.fremde_domains.map(h => el('li', null, el('code', { text: h })))));
  }
  function urlBlock(d) {
    const moved = d.weiterleitungen && d.weiterleitungen.length;
    return el('div', { class: 'dc-card ck-urls' },
      el('dl', { class: 'dc-dl dc-dl-wide' },
        el('dt', { text: 'Eingegebene URL' }), el('dd', null, el('code', { class: 'ck-code', text: d.start_url })),
        moved ? [el('dt', { text: 'Weiterleitungen' }), el('dd', null, el('ol', { class: 'ck-hops' }, d.weiterleitungen.map(w => el('li', null, el('span', { class: 'dc-arrow', text: w.status }), ' ', el('code', { class: 'ck-code', text: w.url })))))] : null,
        el('dt', { text: 'Geprüfte Seite' }), el('dd', null, el('code', { class: 'ck-code', text: d.ziel_url || d.start_url })),
        d.status ? [el('dt', { text: 'Antwort' }), el('dd', { text: 'HTTP ' + d.status })] : null));
  }
  const NEXT = {
    dns: 'Prüfe die Schreibweise der Domain und ob sie registriert ist.', timeout: 'Versuch es in ein paar Minuten erneut.',
    verbindung: 'Prüfe, ob die Website online ist und ob die Adresse stimmt.', ssl: 'Erneuere oder repariere das SSL-Zertifikat der Website.',
    privat: 'Gib die öffentliche Adresse Deiner Website ein.', ungueltig: 'Korrigiere die Adresse, z. B. https://deine-website.de.', kein_html: 'Gib die Adresse einer Webseite ein, nicht die einer Datei.',
    weiterleitungen: 'Prüfe die Weiterleitungen Deiner Website, z. B. in der .htaccess oder bei Deinem Hoster.', limit: 'Warte ein paar Minuten und prüfe dann erneut.'
  };
  function failCard(d) {
    const blocked = d.fehler === 'http' && (d.status === 403 || d.status === 401);
    const next = d.fehler === 'http' ? (blocked ? 'Manche Schutzdienste lassen automatische Abrufe nicht zu. Prüfe die Cookies dann direkt in Deinem Browser: Entwicklertools öffnen → „Anwendung“ → „Cookies“.' : d.status === 404 ? 'Prüfe, ob die Adresse stimmt und die Seite veröffentlicht ist.' : 'Prüfe, ob die Seite im Browser normal lädt, und versuch es dann erneut.') : NEXT[d.fehler] || 'Versuch es noch einmal.';
    return el('div', null,
      el('div', { class: 'dc-card ck-fail' }, el('div', { class: 'dc-chead' }, el('h3', { text: blocked ? 'Abruf blockiert' : 'Seite konnte nicht abgerufen werden' }), badge(blocked ? 'warn' : 'bad', blocked ? 'Blockiert' : 'Abruf fehlgeschlagen')),
        el('p', { class: 'dc-note dc-note-bad', text: d.text }), el('p', { class: 'dc-note' }, el('b', null, 'Nächster Schritt: '), next)),
      d.start_url ? urlBlock(d) : null);
  }
  function render(d) {
    const top = el('div', { class: 'dc-rhead' }, el('div', null, el('p', { class: 'dc-eyebrow', text: 'Cookie Check' }), el('h2', { text: host(d.ziel_url || d.start_url || d.eingabe) })),
      el('button', { type: 'button', class: 'dc-again', onclick: () => run(lastUrl) }, '↻ Erneut prüfen'));
    if (!d.ok) return el('div', null, top, failCard(d));
    const A = auswerten(d);
    if (A.stufe === 'sauber') return el('div', null, top, erfolg(d, A), pruefpunkte(d, A), urlBlock(d));
    return el('div', null, top, urteil(d, A), pruefpunkte(d, A), hinweisBox(hinweise(d, A)), cookieTabelle(A), dienstListe(A), fremdBox(d), urlBlock(d));
  }

  // ───────── Ablauf ─────────
  async function run(url) {
    if (running) return;
    running = true; lastUrl = url; errBox.hidden = true; go.disabled = true; go.textContent = 'Wird geprüft …'; form.setAttribute('aria-busy', 'true'); out.classList.add('dc-loading');
    status.textContent = `${url} wird abgerufen …`;
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 40000);
      const r = await fetch('/api/cookie.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal: ctl.signal });
      clearTimeout(timer);
      const d = await r.json();
      if (d.ok === false && !d.text) throw new Error('api');
      out.replaceChildren(render(d));
      status.textContent = d.ok ? 'Prüfung abgeschlossen.' : 'Die Seite konnte nicht abgerufen werden.';
    } catch (e) {
      out.replaceChildren(el('div', { class: 'dc-card ck-fail' }, badge('bad', 'Prüfung nicht möglich'), el('p', { class: 'dc-note' }, 'Der Prüfdienst ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal.')));
      status.textContent = 'Prüfung nicht möglich.';
    } finally {
      running = false; go.disabled = false; go.textContent = 'Cookies prüfen'; form.removeAttribute('aria-busy'); out.classList.remove('dc-loading');
      out.focus({ preventScroll: true });
      out.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
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
  if (q) { input.value = q; const p = prepare(q); if (p.url) run(p.url); }
  window.condooCookie = { run, render, auswerten };
})();
