// condooOS Tools – DNS Check
// Live-Abfragen direkt aus dem Browser an zwei öffentliche DNS-over-HTTPS-Schnittstellen (ohne API-Key):
// Google Public DNS und Cloudflare 1.1.1.1. Kein eigener Server, keine Datenbank, keine Speicherung.
(function () {
  'use strict';

  // ───────────────────────── Grundlagen ─────────────────────────
  const TYPES = { A: 1, NS: 2, CNAME: 5, SOA: 6, MX: 15, TXT: 16, AAAA: 28, CAA: 257 };
  const TYPE_NAME = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v, k]));
  const ORDER = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'CAA'];
  const INFO = {
    A: 'Verweist den Namen auf eine IPv4-Adresse – meist die Adresse des Webservers.',
    AAAA: 'Verweist den Namen auf eine IPv6-Adresse.',
    CNAME: 'Macht den Namen zu einem Alias für einen anderen Hostnamen.',
    MX: 'Legt fest, welche Mailserver E-Mails für diesen Namen annehmen. Die kleinere Zahl hat Vorrang.',
    TXT: 'Freie Texteinträge, z. B. für SPF, Domain-Bestätigungen oder Verifizierungen.',
    NS: 'Die Nameserver, die für diese Domain zuständig sind.',
    SOA: 'Grunddaten der DNS-Zone: primärer Nameserver, Kontaktadresse und Seriennummer.',
    CAA: 'Legt fest, welche Zertifizierungsstellen SSL-Zertifikate für die Domain ausstellen dürfen.'
  };
  const PROVIDERS = {
    google: { name: 'Google Public DNS', url: (n, t) => `https://dns.google/resolve?name=${encodeURIComponent(n)}&type=${t}`, headers: {} },
    cloudflare: { name: 'Cloudflare 1.1.1.1', url: (n, t) => `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(n)}&type=${t}`, headers: { Accept: 'application/dns-json' } }
  };
  const RCODE = { 1: 'FORMERR', 2: 'SERVFAIL', 4: 'NOTIMP', 5: 'REFUSED' };
  const TIMEOUT = 5000, MAX_PARALLEL = 6, MAX_CHAIN = 8;
  const SPF_LIMITS = { depth: 10, queries: 40, ms: 9000 };

  // Höchstens MAX_PARALLEL Anfragen gleichzeitig
  let active = 0; const waiting = [];
  const limited = fn => new Promise((resolve, reject) => {
    const run = () => { active++; fn().then(resolve, reject).finally(() => { active--; if (waiting.length) waiting.shift()(); }); };
    active < MAX_PARALLEL ? run() : waiting.push(run);
  });

  const normName = s => String(s || '').trim().toLowerCase().replace(/\.$/, '');

  async function rawQuery(name, type, prov) {
    const p = PROVIDERS[prov], ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT), at = new Date();
    try {
      const r = await fetch(p.url(name, type), { headers: p.headers, signal: ctl.signal, cache: 'no-store', referrerPolicy: 'no-referrer', credentials: 'omit' });
      if (!r.ok) return { ok: false, error: 'http', http: r.status, provider: prov, at, name, type };
      const j = await r.json();
      return parseResponse(j, name, type, prov, at);
    } catch (e) {
      return { ok: false, error: e && e.name === 'AbortError' ? 'timeout' : 'network', provider: prov, at, name, type };
    } finally { clearTimeout(timer); }
  }

  function parseResponse(j, name, type, prov, at) {
    if (!j || typeof j.Status !== 'number') return { ok: false, error: 'antwort', provider: prov, at, name, type };
    const want = normName(name);
    const answers = (Array.isArray(j.Answer) ? j.Answer : []).map(a => ({ name: normName(a.name), type: TYPE_NAME[a.type] || String(a.type), ttl: a.TTL, data: String(a.data) }));
    // Nur Einträge, die wirklich zu diesem Namen und Typ gehören (kein Wert vom CNAME-Ziel)
    const records = answers.filter(a => a.name === want && a.type === type).map(a => ({ ...a, value: parseValue(type, a.data) }));
    const cn = answers.find(a => a.name === want && a.type === 'CNAME');
    const alias = cn ? normName(cn.data) : null;
    let status;
    if (records.length) status = 'found';
    else if (j.Status === 0) status = 'empty';
    else if (j.Status === 3) status = alias ? 'empty' : 'nxdomain';
    else status = 'servfail';
    return { ok: true, status, rcode: j.Status, records, alias, answers, provider: prov, at, name: want, type };
  }

  // Kurzer Zwischenspeicher, gebunden an die beobachtete TTL (höchstens 5 Minuten)
  const cache = new Map();
  async function query(name, type, opt = {}) {
    const { force = false, prov = 'google', fallback = true } = opt;
    const key = prov + '|' + name + '|' + type, hit = cache.get(key);
    if (!force && hit && hit.exp > Date.now()) return hit.res;
    let res = await limited(() => rawQuery(name, type, prov));
    if (!res.ok && fallback && prov === 'google') {
      const second = await limited(() => rawQuery(name, type, 'cloudflare'));
      if (second.ok) { second.fallback = true; res = second; } else res.second = second;
    }
    if (res.ok) {
      const ttl = res.records.length ? Math.min(...res.records.map(r => r.ttl)) : 30;
      cache.set(key, { exp: Date.now() + Math.min(Math.max(ttl, 0), 300) * 1000, res });
    }
    return res;
  }

  // ───────────────────────── Werte lesen und vergleichen ─────────────────────────
  function parseTxt(data) {
    const s = String(data).trim();
    if (!s.startsWith('"')) return s;
    let out = '', i = 0, inQ = false;
    while (i < s.length) {
      const c = s[i];
      if (!inQ) { if (c === '"') inQ = true; i++; continue; }
      if (c === '"') { inQ = false; i++; continue; }
      if (c === '\\') {
        const d = s.slice(i + 1, i + 4);
        if (/^\d{3}$/.test(d)) { out += String.fromCharCode(parseInt(d, 10)); i += 4; continue; }
        out += s[i + 1] || ''; i += 2; continue;
      }
      out += c; i++;
    }
    return out;
  }
  function parseCaa(data) {
    const s = String(data).trim();
    if (s.startsWith('\\#')) { // allgemeines Format: \# Länge Hex-Bytes
      const hex = s.replace(/^\\#\s*\d+\s*/, '').replace(/\s+/g, '');
      const b = hex.match(/../g) ? hex.match(/../g).map(h => parseInt(h, 16)) : [];
      if (b.length >= 2) {
        const tl = b[1], tag = String.fromCharCode(...b.slice(2, 2 + tl)), val = new TextDecoder().decode(new Uint8Array(b.slice(2 + tl)));
        return { flags: b[0], tag: tag.toLowerCase(), val };
      }
    }
    const m = s.match(/^(\d+)\s+(\S+)\s+(.*)$/);
    if (m) return { flags: +m[1], tag: m[2].toLowerCase(), val: parseTxt(m[3]) };
    return { flags: 0, tag: '', val: s };
  }
  function normIPv6(s) {
    let a = String(s).trim().toLowerCase();
    if (!/^[0-9a-f:.]+$/.test(a) || !a.includes(':')) return null;
    let tail = [];
    const v4 = a.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (v4) { const p = v4[1].split('.').map(Number); tail = [((p[0] << 8) | p[1]).toString(16), ((p[2] << 8) | p[3]).toString(16)]; a = a.slice(0, -v4[1].length).replace(/:$/, ':0').replace(/::0$/, '::'); if (a.endsWith(':') && !a.endsWith('::')) a = a.slice(0, -1); }
    const parts = a.split('::');
    if (parts.length > 2) return null;
    const head = parts[0] ? parts[0].split(':') : [], rest = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
    const given = head.length + rest.length + tail.length;
    if (given > 8 || (parts.length === 1 && given !== 8)) return null;
    const groups = [...head, ...Array(8 - given).fill('0'), ...rest, ...tail];
    if (groups.some(g => !/^[0-9a-f]{1,4}$/.test(g))) return null;
    return groups.map(g => g.padStart(4, '0')).join(':');
  }
  const isIPv4 = s => /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(s);

  function parseValue(type, data) {
    const d = String(data).trim();
    switch (type) {
      case 'TXT': return parseTxt(d);
      case 'MX': { const m = d.match(/^(\d+)\s+(\S+)$/); return m ? { pref: +m[1], host: normName(m[2]) } : { pref: null, host: normName(d) }; }
      case 'CAA': return parseCaa(d);
      case 'SOA': { const p = d.split(/\s+/); return { mname: normName(p[0]), rname: normName(p[1]), serial: p[2], refresh: p[3], retry: p[4], expire: p[5], minimum: p[6] }; }
      case 'CNAME': case 'NS': return normName(d);
      case 'AAAA': return d.toLowerCase();
      default: return d;
    }
  }
  function show(type, v) {
    switch (type) {
      case 'MX': return v.host === '' ? `${v.pref} .` : `${v.pref} ${v.host}`;
      case 'CAA': return `${v.flags} ${v.tag} "${v.val}"`;
      case 'SOA': return `${v.mname} ${v.rname} ${v.serial} ${v.refresh} ${v.retry} ${v.expire} ${v.minimum}`;
      default: return String(v);
    }
  }
  function key(type, v) {
    switch (type) {
      case 'AAAA': return normIPv6(v) || String(v);
      case 'MX': return `${v.pref} ${v.host}`;
      case 'CAA': return `${v.flags} ${v.tag} ${v.val}`;
      case 'SOA': return [v.mname, v.rname, v.serial, v.refresh, v.retry, v.expire, v.minimum].join(' ');
      case 'TXT': return v; // exakt, inkl. Groß-/Kleinschreibung
      default: return String(v);
    }
  }
  // Erwarteten Wert passend zum Typ lesen. Liefert eine Prüffunktion oder einen Fehlertext.
  function expectation(type, raw) {
    const s = raw.trim();
    if (!s) return null;
    switch (type) {
      case 'A': return isIPv4(s) ? { test: v => v === s } : { err: 'Für einen A-Eintrag gib bitte eine IPv4-Adresse ein, z. B. 203.0.113.10.' };
      case 'AAAA': { const n = normIPv6(s); return n ? { test: v => normIPv6(v) === n } : { err: 'Für einen AAAA-Eintrag gib bitte eine IPv6-Adresse ein, z. B. 2001:db8::1.' }; }
      case 'CNAME': case 'NS': { const n = normName(s); return { test: v => v === n }; }
      case 'MX': { const m = s.match(/^(\d+)\s+(\S+)$/); if (m) { const h = normName(m[2]); return { test: v => v.pref === +m[1] && v.host === h }; } const h = normName(s); return { test: v => v.host === h }; }
      case 'TXT': { const t = /^"(?:[^"\\]|\\.)*"(?:\s*"(?:[^"\\]|\\.)*")*$/.test(s) ? parseTxt(s) : s; return { test: v => v === t }; }
      case 'CAA': { const m = s.match(/^(\d+)\s+(\S+)\s+(.+)$/); if (m) { const k = `${+m[1]} ${m[2].toLowerCase()} ${parseTxt(m[3])}`; return { test: v => key('CAA', v) === k }; } const t = parseTxt(s); return { test: v => v.val === t }; }
      case 'SOA': { const p = s.split(/\s+/); return { test: v => key('SOA', v) === [normName(p[0]), normName(p[1]), ...p.slice(2)].join(' ') }; }
    }
    return { test: v => String(v) === s };
  }

  // ───────────────────────── Eingaben ─────────────────────────
  const LOCAL = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|private|localdomain|home\.arpa)$/;
  const LABEL = /^(?!-)[a-z0-9_-]{1,63}(?<!-)$/;
  function toAsciiHost(h) {
    try { return new URL('http://' + h).hostname; } catch (e) { return null; }
  }
  function checkHostname(host) {
    if (!host) return 'Bitte gib eine Domain oder URL ein.';
    if (host.startsWith('[') || isIPv4(host) || /^[0-9a-f:]+$/.test(host) && host.includes(':')) return 'Bitte gib einen Domainnamen ein, keine IP-Adresse.';
    if (LOCAL.test(host)) return 'Lokale Hostnamen lassen sich nicht im öffentlichen DNS prüfen.';
    if (host.length > 253) return 'Dieser Name ist zu lang.';
    const labels = host.split('.');
    if (labels.length < 2) return 'Bitte gib eine vollständige Domain ein, z. B. beispiel.de.';
    if (labels.some(l => !LABEL.test(l))) return 'Dieser Name enthält unzulässige Zeichen.';
    if (/^\d+$/.test(labels[labels.length - 1])) return 'Bitte gib einen Domainnamen ein, keine IP-Adresse.';
    if (LOCAL.test(host)) return 'Lokale Hostnamen lassen sich nicht im öffentlichen DNS prüfen.';
    return null;
  }
  function parseDomainInput(raw) {
    let s = raw.trim();
    if (!s) return { err: 'Bitte gib eine Domain oder URL ein.' };
    let hostPart;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
      if (!/^https?:\/\//i.test(s)) return { err: 'Bitte gib eine Domain oder eine Adresse mit http:// bzw. https:// ein.' };
      let u; try { u = new URL(s); } catch (e) { return { err: 'Diese Adresse ist ungültig.' }; }
      if (u.username || u.password) return { err: 'Die Adresse enthält Zugangsdaten. Bitte gib nur die Domain ein.' };
      hostPart = u.hostname;
    } else {
      const first = s.split(/[/?#]/)[0];
      if (first.includes('@')) return { err: 'Bitte gib nur die Domain ein, ohne Zugangsdaten oder E-Mail-Adresse.' };
      if (/\s/.test(first)) return { err: 'Die Domain darf keine Leerzeichen enthalten.' };
      hostPart = toAsciiHost(first.replace(/:\d*$/, ''));
      if (hostPart === null) return { err: 'Diese Domain ist ungültig.' };
    }
    const host = normName(hostPart);
    const err = checkHostname(host);
    return err ? { err } : { host };
  }

  // Punycode → Unicode, nur für die Anzeige (z. B. xn--bcher-kva.de → bücher.de)
  function punyDecode(label) {
    const base = 36, tMin = 1, tMax = 26, skew = 38, damp = 700;
    const adapt = (delta, num, first) => { delta = first ? Math.floor(delta / damp) : delta >> 1; delta += Math.floor(delta / num); let k = 0; while (delta > 455) { delta = Math.floor(delta / 35); k += base; } return k + Math.floor(36 * delta / (delta + skew)); };
    const input = label.slice(4), out = [], b = input.lastIndexOf('-');
    for (let j = 0; j < Math.max(b, 0); j++) out.push(input.charCodeAt(j));
    let n = 128, i = 0, bias = 72;
    for (let idx = b > 0 ? b + 1 : 0; idx < input.length;) {
      const oldi = i;
      for (let w = 1, k = base; ; k += base) {
        if (idx >= input.length) return label;
        const c = input.charCodeAt(idx++), digit = c - 48 < 10 ? c - 22 : c - 65 < 26 ? c - 65 : c - 97 < 26 ? c - 97 : base;
        if (digit >= base) return label;
        i += digit * w;
        const t = k <= bias ? tMin : k >= bias + tMax ? tMax : k - bias;
        if (digit < t) break;
        w *= base - t;
      }
      bias = adapt(i - oldi, out.length + 1, oldi === 0);
      n += Math.floor(i / (out.length + 1)); i %= out.length + 1;
      out.splice(i++, 0, n);
    }
    return String.fromCodePoint(...out);
  }
  const toUnicode = h => h.split('.').map(l => l.startsWith('xn--') ? punyDecode(l) : l).join('.');
  const pretty = h => { const u = toUnicode(h); return u === h ? h : `${u} (${h})`; };

  // ───────────────────────── Public Suffix List (lokal gebündelt) ─────────────────────────
  let PSL = null, pslLoading = null;
  function loadPSL() {
    if (PSL) return Promise.resolve(PSL);
    if (!pslLoading) pslLoading = fetch('/tools/dns-check/psl.txt').then(r => { if (!r.ok) throw new Error('psl'); return r.text(); }).then(t => {
      const rules = new Set(), wild = new Set(), exc = new Set();
      for (const l of t.split('\n')) { if (!l || l.startsWith('//')) continue; if (l[0] === '!') exc.add(l.slice(1)); else if (l.startsWith('*.')) wild.add(l.slice(2)); else rules.add(l); }
      return (PSL = { rules, wild, exc });
    }).catch(e => { pslLoading = null; throw e; });
    return pslLoading;
  }
  function baseDomain(host) {
    const L = host.split('.');
    let suffix = 1;
    for (let i = 0; i < L.length; i++) {
      const cand = L.slice(i).join('.');
      if (PSL.exc.has(cand)) { suffix = L.length - i - 1; break; }
      if (PSL.rules.has(cand) || (i + 1 < L.length && PSL.wild.has(L.slice(i + 1).join('.')))) { suffix = L.length - i; break; }
    }
    return L.length > suffix ? L.slice(L.length - suffix - 1).join('.') : null;
  }

  // ───────────────────────── Darstellung ─────────────────────────
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) { if (kid == null || kid === false) continue; e.append(kid instanceof Node ? kid : document.createTextNode(String(kid))); }
    return e;
  }
  // Kinder sicher anhängen (null überspringen, Listen auflösen)
  function add(parent, ...kids) { for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; parent.append(k instanceof Node ? k : document.createTextNode(String(k))); } return parent; }
  const BADGE_ICON = { ok: '✓', warn: '!', bad: '✕', info: 'i', neutral: '–' };
  const badge = (kind, label) => el('span', { class: 'dc-badge dc-' + kind }, el('span', { 'aria-hidden': 'true' }, BADGE_ICON[kind]), label);
  const copied = document.getElementById('dc-copied');
  function copyBtn(value, what) {
    return el('button', { type: 'button', class: 'dc-copy', 'aria-label': `${what} kopieren`, onclick: async e => {
      const b = e.currentTarget;
      try { await navigator.clipboard.writeText(value); }
      catch (x) { const t = el('textarea', { class: 'dc-sr' }); t.value = value; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch (y) { } t.remove(); }
      b.textContent = 'Kopiert'; b.classList.add('done'); copied.textContent = `${what} kopiert`;
      setTimeout(() => { b.textContent = 'Kopieren'; b.classList.remove('done'); copied.textContent = ''; }, 1600);
    } }, 'Kopieren');
  }
  const valueBox = (text, what) => el('div', { class: 'dc-value' }, el('code', { text }), copyBtn(text, what));
  const time = d => d.toLocaleTimeString('de-DE');
  const src = r => PROVIDERS[r.provider].name + (r.fallback ? ' (Ersatz)' : '');
  function failText(r) {
    const why = x => x.error === 'timeout' ? `${PROVIDERS[x.provider].name} hat nicht rechtzeitig geantwortet` : x.error === 'http' ? `${PROVIDERS[x.provider].name} antwortete mit HTTP-Status ${x.http}` : x.error === 'antwort' ? `${PROVIDERS[x.provider].name} lieferte eine unlesbare Antwort` : `${PROVIDERS[x.provider].name} war nicht erreichbar`;
    return 'Anfrage fehlgeschlagen: ' + why(r) + (r.second ? '; ersatzweise: ' + why(r.second) : '') + '.';
  }
  const dnsErr = r => `DNS-Server meldet einen Fehler (${RCODE[r.rcode] || 'Code ' + r.rcode}).`;
  function stateBadge(r) {
    if (!r.ok) return badge('bad', 'Anfrage fehlgeschlagen');
    if (r.status === 'nxdomain') return badge('neutral', 'Hostname existiert nicht');
    if (r.status === 'servfail') return badge('bad', 'DNS-Server meldet einen Fehler');
    if (r.status === 'empty') return badge('neutral', 'Eintragstyp nicht gefunden');
    return badge('ok', r.records.length === 1 ? '1 Eintrag' : `${r.records.length} Einträge`);
  }
  const meta = (rec, r) => el('p', { class: 'dc-meta' },
    el('span', null, 'Hostname ', el('b', { text: rec.name })), el('span', null, 'Typ ', el('b', { text: rec.type })),
    el('span', null, 'TTL ', el('b', { text: rec.ttl + ' s' })), el('span', null, 'Quelle ', el('b', { text: src(r) })), el('span', null, 'Geprüft ', el('b', { text: time(r.at) })));
  function recordRow(rec, r) {
    const t = rec.type, v = rec.value === undefined ? parseValue(t, rec.data) : rec.value, text = show(t, v);
    const extra = t === 'MX' ? el('p', { class: 'dc-sub-info' }, v.host === '' ? 'Null MX: Diese Domain empfängt ausdrücklich keine E-Mails.' : `Priorität ${v.pref} · Mailserver ${v.host}`)
      : t === 'CAA' ? el('p', { class: 'dc-sub-info' }, `Flag ${v.flags}${v.flags & 128 ? ' (kritisch)' : ''} · Tag ${v.tag} · Wert ${v.val}`)
      : t === 'SOA' ? el('p', { class: 'dc-sub-info' }, `Primärer Nameserver ${v.mname} · Kontakt ${v.rname} · Seriennummer ${v.serial}`) : null;
    return el('li', { class: 'dc-rec' }, valueBox(text, `${t}-Wert`), extra, meta(rec, r));
  }
  function head(title, host, again) {
    return el('div', { class: 'dc-rhead' },
      el('div', null, el('p', { class: 'dc-eyebrow', text: title }), el('h2', { text: pretty(host) })),
      again ? el('button', { type: 'button', class: 'dc-again', onclick: again }, '↻ Erneut prüfen') : null);
  }
  const note = (text, kind) => el('p', { class: 'dc-note' + (kind ? ' dc-note-' + kind : '') }, text);

  // ───────────────────────── 1. DNS-Übersicht ─────────────────────────
  async function runOverview(host, force) {
    const res = await Promise.all(ORDER.map(t => query(host, t, { force })));
    const by = Object.fromEntries(ORDER.map((t, i) => [t, res[i]]));
    const wrap = el('div', null, head('DNS-Übersicht', host, () => start(true)));
    const ok = res.filter(r => r.ok);
    if (ok.length && ok.every(r => r.status === 'nxdomain')) {
      add(wrap, el('div', { class: 'dc-card dc-empty' }, badge('neutral', 'Hostname existiert nicht'), el('p', null, `Für ${toUnicode(host)} gibt es im öffentlichen DNS keinen Eintrag. Prüfe die Schreibweise der Domain.`)));
    }
    const grid = el('div', { class: 'dc-cards' });
    for (const t of ORDER) {
      const r = by[t];
      if (r.ok && r.status === 'found') {
        add(grid, el('article', { class: 'dc-card' },
          el('div', { class: 'dc-chead' }, el('h3', { text: t }), stateBadge(r)),
          el('p', { class: 'dc-explain', text: INFO[t] }),
          el('ul', { class: 'dc-recs' }, r.records.sort((a, b) => t === 'MX' ? a.value.pref - b.value.pref : 0).map(rec => recordRow(rec, r)))));
      } else if (r.ok && r.status === 'empty' && r.alias && t !== 'CNAME') {
        const target = r.answers.filter(a => a.type === t && a.name !== host);
        if (!target.length) continue;
        add(grid, el('article', { class: 'dc-card' },
          el('div', { class: 'dc-chead' }, el('h3', { text: `${t} über Alias` }), badge('info', 'am CNAME-Ziel')),
          el('p', { class: 'dc-explain' }, `Kein eigener ${t}-Eintrag an ${host}. Der Name ist ein Alias für ${r.alias}; diese Werte stammen vom Ziel der Weiterleitung:`),
          el('ul', { class: 'dc-recs' }, target.map(rec => recordRow(rec, r)))));
      }
    }
    if (grid.children.length) add(wrap, grid);
    const empty = ORDER.filter(t => by[t].ok && by[t].status === 'empty' && !(by[t].alias && t !== 'CNAME' && by[t].answers.some(a => a.type === t)));
    const failed = ORDER.filter(t => !by[t].ok), serv = ORDER.filter(t => by[t].ok && by[t].status === 'servfail');
    if (empty.length && !(ok.length && ok.every(r => r.status === 'nxdomain'))) add(wrap, el('div', { class: 'dc-card dc-compact' }, badge('neutral', 'Nicht gefunden'), el('p', null, el('b', { text: empty.join(', ') }), ' – diese Eintragstypen gibt es für diesen Namen nicht. Ein fehlender optionaler Eintrag ist für sich genommen kein Fehler.')));
    if (serv.length) add(wrap, el('div', { class: 'dc-card dc-compact' }, badge('bad', 'DNS-Server meldet einen Fehler'), el('p', null, el('b', { text: serv.join(', ') }), ' – ', dnsErr(by[serv[0]]))));
    if (failed.length) add(wrap, el('div', { class: 'dc-card dc-compact' }, badge('bad', 'Anfrage fehlgeschlagen'), el('p', null, el('b', { text: failed.join(', ') }), ' – ', failText(by[failed[0]]), ' Diese Typen wurden nicht geprüft; bitte prüfe erneut.')));
    return wrap;
  }

  // ───────────────────────── 2. DNS-Änderung prüfen ─────────────────────────
  async function runChange(host, force) {
    const type = $('#dc-ae-typ').value, raw = $('#dc-ae-soll').value, exp = expectation(type, raw);
    if (exp && exp.err) throw new UserError(exp.err);
    const [g, c] = await Promise.all([query(host, type, { prov: 'google', fallback: false, force: true }), query(host, type, { prov: 'cloudflare', fallback: false, force: true })]);
    const all = [g, c], ok = all.filter(r => r.ok), failed = all.length - ok.length;
    const outcome = r => !r.ok ? ['bad', 'Anfrage fehlgeschlagen'] : r.status === 'servfail' ? ['bad', 'DNS-Server meldet einen Fehler'] : !r.records.length ? ['neutral', 'Eintrag nicht gefunden'] : exp ? (r.records.some(x => exp.test(x.value)) ? ['ok', 'Erwarteter Wert sichtbar'] : ['warn', 'Anderer Wert sichtbar']) : ['ok', r.records.length === 1 ? '1 Wert gefunden' : `${r.records.length} Werte gefunden`];
    const wrap = el('div', null, head(`DNS-Änderung · ${type}`, host, () => start(true)));
    // Zusammenfassung
    let sum, kind;
    const cacheNote = 'Unterschiedliche Antworten sind nach einer Änderung normal: DNS-Anbieter speichern Einträge für die Dauer der TTL zwischen (Cache). Prüfe in ein paar Minuten erneut.';
    let differs = false;
    if (exp) {
      const vis = ok.filter(r => r.records.some(x => exp.test(x.value))).length;
      sum = `Erwarteter Wert bei ${vis} von 2 DNS-Anbietern sichtbar.`; kind = vis === 2 ? 'ok' : vis ? 'warn' : 'neutral';
      differs = ok.length === 2 && (vis === 1);
    } else if (ok.length === 2) {
      const set = r => r.records.map(x => key(type, x.value)).sort().join('\n');
      differs = set(g) !== set(c);
      if (!differs) { sum = g.records.length ? 'Beide DNS-Anbieter liefern dieselben Werte.' : `Bei beiden DNS-Anbietern wurde kein ${type}-Eintrag gefunden.`; kind = g.records.length ? 'ok' : 'neutral'; }
      else { sum = 'Die Antworten der beiden DNS-Anbieter unterscheiden sich.'; kind = 'warn'; }
    } else { sum = ok.length ? `Nur 1 von 2 DNS-Anbietern hat geantwortet.` : 'Keiner der beiden DNS-Anbieter hat geantwortet.'; kind = 'bad'; }
    add(wrap, el('div', { class: 'dc-summary dc-s-' + kind }, el('p', { class: 'dc-sum-t', text: sum }),
      failed ? el('p', null, 'Der Vergleich ist unvollständig, weil eine Anfrage fehlgeschlagen ist.') : null,
      differs ? el('p', null, cacheNote) : null,
      exp ? el('p', { class: 'dc-sub-info' }, 'Erwarteter Wert: ', el('code', { text: raw.trim() })) : null));
    const grid = el('div', { class: 'dc-cards dc-two' });
    for (const r of all) {
      const [k, label] = outcome(r);
      add(grid, el('article', { class: 'dc-card' },
        el('div', { class: 'dc-chead' }, el('h3', { text: PROVIDERS[r.provider].name }), badge(k, label)),
        !r.ok ? note(failText(r), 'bad') : r.status === 'servfail' ? note(dnsErr(r), 'bad') : r.status === 'nxdomain' ? note('Hostname existiert nicht.') :
          r.records.length ? el('ul', { class: 'dc-recs' }, r.records.map(rec => el('li', { class: 'dc-rec' + (exp ? (exp.test(rec.value) ? ' dc-match' : ' dc-miss') : '') }, valueBox(show(type, rec.value), `${type}-Wert`), el('p', { class: 'dc-meta' }, el('span', null, 'TTL ', el('b', { text: rec.ttl + ' s' })), el('span', null, 'Geprüft ', el('b', { text: time(r.at) })))))) :
          note(r.alias ? `Dieser Eintragstyp wurde nicht gefunden. Der Name ist ein Alias (CNAME) für ${r.alias}.` : 'Dieser Eintragstyp wurde nicht gefunden.')));
    }
    add(wrap, grid, note('„Erneut prüfen“ fragt beide Anbieter neu ab. Ihr eigener Cache kann trotzdem bis zum Ablauf der TTL noch den alten Wert liefern.'));
    return wrap;
  }

  // ───────────────────────── 3. Website-Domain ─────────────────────────
  async function follow(name, force) {
    const hops = [], seen = new Set([name]); let cur = name;
    for (let i = 0; ; i++) {
      const r = await query(cur, 'CNAME', { force });
      if (!r.ok) return { name, hops, fail: r };
      if (r.status === 'servfail') return { name, hops, serv: r };
      if (r.status === 'nxdomain') return { name, hops, nx: cur };
      if (!r.records.length) break;
      const to = r.records[0].value;
      hops.push({ from: cur, to, ttl: r.records[0].ttl, r });
      if (seen.has(to)) return { name, hops, loop: true };
      if (hops.length >= MAX_CHAIN) return { name, hops, limit: true };
      seen.add(to); cur = to;
    }
    return { name, hops, final: cur };
  }
  async function resolveSite(name, force) {
    const f = await follow(name, force);
    if (!f.final) return f;
    const [a, aaaa] = await Promise.all([query(f.final, 'A', { force }), query(f.final, 'AAAA', { force })]);
    return { ...f, a, aaaa };
  }
  async function runWebsite(host, force) {
    await loadPSL();
    const base = baseDomain(host);
    if (!base) throw new UserError(`„${toUnicode(host)}“ ist eine Domain-Endung. Bitte gib eine registrierbare Domain ein, z. B. beispiel.${host}.`);
    const names = [[base, 'Basisdomain'], ['www.' + base, 'www-Adresse']];
    if (host !== base && host !== 'www.' + base) names.push([host, 'Eingegebener Host']);
    const results = await Promise.all(names.map(([n]) => resolveSite(n, force)));
    const wrap = el('div', null, head('DNS-Auflösung der Website-Domain', base, () => start(true)),
      note('Diese Prüfung zeigt, wohin die Namen im DNS zeigen. Ob der Webserver erreichbar ist oder HTTPS funktioniert, gehört nicht dazu.'));
    const grid = el('div', { class: 'dc-cards' });
    results.forEach((s, i) => {
      const [n, label] = names[i];
      const addrs = [...(s.a && s.a.ok ? s.a.records : []), ...(s.aaaa && s.aaaa.ok ? s.aaaa.records : [])];
      let b, msg = null;
      if (s.fail) { b = badge('bad', 'Anfrage fehlgeschlagen'); msg = note(failText(s.fail), 'bad'); }
      else if (s.serv) { b = badge('bad', 'DNS-Server meldet einen Fehler'); msg = note(dnsErr(s.serv), 'bad'); }
      else if (s.loop) { b = badge('bad', 'CNAME-Schleife'); msg = note('Die CNAME-Kette verweist im Kreis. Der Name lässt sich so nicht auflösen.', 'bad'); }
      else if (s.limit) { b = badge('warn', 'Kette zu lang'); msg = note(`Die CNAME-Kette ist länger als ${MAX_CHAIN} Schritte. Die Auflösung wurde hier abgebrochen.`, 'warn'); }
      else if (s.nx) { b = badge('neutral', 'Hostname existiert nicht'); msg = note(s.nx === n ? `${toUnicode(n)} ist im DNS nicht eingetragen.` : `Das CNAME-Ziel ${s.nx} existiert nicht.`, s.nx === n ? null : 'warn'); }
      else if (addrs.length) b = badge('ok', 'Zeigt auf ' + (addrs.length === 1 ? '1 Adresse' : addrs.length + ' Adressen'));
      else b = badge('warn', 'Keine Adresse gefunden');
      const failA = [s.a, s.aaaa].filter(x => x && !x.ok);
      const chain = el('ol', { class: 'dc-chain' }, el('li', null, el('code', { text: n })),
        (s.hops || []).map(h => el('li', null, el('span', { class: 'dc-arrow' }, 'CNAME →'), el('code', { text: h.to }), copyBtn(h.to, 'CNAME-Ziel'), el('span', { class: 'dc-ttl', text: `TTL ${h.ttl} s` }))));
      add(grid, el('article', { class: 'dc-card' },
        el('div', { class: 'dc-chead' }, el('h3', null, el('span', { class: 'dc-lab', text: label }), pretty(n)), b),
        chain, msg,
        addrs.length ? el('ul', { class: 'dc-recs' }, addrs.map(rec => recordRow(rec, rec.type === 'A' ? s.a : s.aaaa))) : null,
        failA.length ? note(failText(failA[0]), 'bad') : null,
        s.final && !addrs.length && !failA.length ? note('Für diesen Namen wurde weder ein A- noch ein AAAA-Eintrag gefunden.') : null));
    });
    add(wrap, grid);
    return wrap;
  }

  // ───────────────────────── 4. E-Mail-Domain ─────────────────────────
  const SPF_RE = /^v=spf1(\s|$)/i;
  function spfTermCheck(term) {
    const mod = term.match(/^([a-z][a-z0-9_.-]*)=(.*)$/i);
    if (mod) return { kind: 'mod', name: mod[1].toLowerCase(), arg: mod[2], err: mod[2] === '' && /^(redirect|exp)$/i.test(mod[1]) ? `„${term}“ braucht eine Domain.` : null };
    const m = term.match(/^([+\-~?]?)([a-z][a-z0-9_.-]*)(.*)$/i);
    if (!m) return { err: `„${term}“ ist kein gültiger SPF-Begriff.` };
    const q = m[1] || '+', name = m[2].toLowerCase(), rest = m[3];
    const dom = '(:[^/\\s]+)?', cidr4 = '(/([0-9]|[12][0-9]|3[0-2]))?', cidr6 = '(//([0-9]|[1-9][0-9]|1[01][0-9]|12[0-8]))?';
    const ok = {
      all: rest === '', include: /^:[^\s]+$/.test(rest), exists: /^:[^\s]+$/.test(rest), ptr: new RegExp('^' + dom + '$').test(rest),
      a: new RegExp('^' + dom + cidr4 + cidr6 + '$').test(rest), mx: new RegExp('^' + dom + cidr4 + cidr6 + '$').test(rest),
      ip4: (() => { const x = rest.match(/^:([^/]+)(\/(\d+))?$/); return !!x && isIPv4(x[1]) && (!x[3] || +x[3] <= 32); })(),
      ip6: (() => { const x = rest.match(/^:([^/]+)(\/(\d+))?$/); return !!x && !!normIPv6(x[1]) && (!x[3] || +x[3] <= 128); })()
    };
    if (!(name in ok)) return { err: `„${m[2]}“ ist kein bekannter SPF-Mechanismus.` };
    if (!ok[name]) return { err: `„${term}“ ist nicht korrekt geschrieben.` };
    return { kind: 'mech', q, name, arg: rest.startsWith(':') ? rest.slice(1).replace(/\/.*$/, '') : '' };
  }
  async function spfFetch(domain, ctx) {
    if (ctx.queries >= SPF_LIMITS.queries || Date.now() - ctx.t0 > SPF_LIMITS.ms) { ctx.incomplete.push(`Abfragelimit erreicht – ${domain} wurde nicht mehr geprüft.`); return { skip: true }; }
    ctx.queries++;
    const r = await query(domain, 'TXT', { force: ctx.force });
    if (!r.ok) { ctx.incomplete.push(`${domain}: ${failText(r)}`); return { skip: true }; }
    if (r.status === 'servfail') { ctx.incomplete.push(`${domain}: ${dnsErr(r)}`); return { skip: true }; }
    const spf = r.records.map(x => x.value).filter(v => SPF_RE.test(v));
    return { r, spf };
  }
  async function spfAnalyze(domain, record, ctx, depth) {
    const node = { domain, record, items: [], errors: [], warns: [] };
    const terms = record.trim().split(/\s+/).slice(1);
    let allIdx = -1, redirect = null;
    terms.forEach((t, i) => {
      const c = spfTermCheck(t); const item = { term: t, ...c }; node.items.push(item);
      if (c.err) node.errors.push(c.err);
      if (c.kind === 'mech' && c.name === 'all' && allIdx < 0) allIdx = i;
      if (c.kind === 'mod' && c.name === 'redirect') { if (redirect) node.errors.push('Mehr als ein „redirect“ ist nicht erlaubt.'); redirect = item; }
      if (c.kind === 'mech' && ['include', 'a', 'mx', 'ptr', 'exists'].includes(c.name)) { ctx.lookups++; item.lookup = true; }
      if (c.kind === 'mech' && c.name === 'ptr') node.warns.push('„ptr“ ist langsam und wird nicht mehr empfohlen.');
      if (/%\{/.test(t)) { item.macro = true; ctx.incomplete.push(`„${t}“ enthält ein Makro, das sich erst bei einer konkreten E-Mail auswerten lässt.`); }
    });
    if (redirect && allIdx < 0) { ctx.lookups++; redirect.lookup = true; }
    if (allIdx >= 0 && allIdx < terms.length - 1 && terms.slice(allIdx + 1).some(t => !/=/.test(t))) node.warns.push('Begriffe nach „all“ werden nie ausgewertet.');
    node.all = allIdx >= 0 ? node.items[allIdx] : null; node.redirect = redirect;
    for (const item of node.items) {
      const target = item.kind === 'mech' && item.name === 'include' ? item.arg : item === redirect && allIdx < 0 ? item.arg : null;
      if (!target || item.macro) continue;
      if (depth >= SPF_LIMITS.depth) { ctx.incomplete.push(`Verschachtelung zu tief – ${target} wurde nicht mehr geprüft.`); continue; }
      const f = await spfFetch(normName(target), ctx);
      if (f.skip) { item.skipped = true; continue; }
      if (f.r.status === 'nxdomain' || !f.spf.length) { item.void = true; node.errors.push(`„${item.term}“ verweist auf ${target}, dort gibt es keinen SPF-Eintrag. Das führt zu einem Fehler (PermError).`); continue; }
      if (f.spf.length > 1) { node.errors.push(`${target} hat mehrere SPF-Einträge. Das führt zu einem Fehler (PermError).`); continue; }
      item.child = await spfAnalyze(normName(target), f.spf[0], ctx, depth + 1);
    }
    return node;
  }
  function spfTree(node) {
    return el('ul', { class: 'dc-spf' }, node.items.map(it => el('li', { class: it.err ? 'dc-spf-err' : '' },
      el('code', { text: it.term }), it.lookup ? el('span', { class: 'dc-pill', text: 'DNS-Abfrage' }) : null,
      it.void ? el('span', { class: 'dc-pill dc-pill-bad', text: 'kein SPF am Ziel' }) : null, it.skipped ? el('span', { class: 'dc-pill', text: 'nicht geprüft' }) : null,
      it.child ? el('details', null, el('summary', null, `Inhalt von ${it.child.domain}`), el('div', { class: 'dc-spf-rec' }, valueBox(it.child.record, 'SPF-Eintrag')), spfTree(it.child),
        [...it.child.errors.map(e => note(e, 'bad')), ...it.child.warns.map(w => note(w, 'warn'))]) : null)));
  }
  const ALL_TEXT = { '-': ['ok', '-all: Server, die nicht aufgeführt sind, sollen abgelehnt werden (Fail).'], '~': ['ok', '~all: Server, die nicht aufgeführt sind, gelten als verdächtig (SoftFail).'], '?': ['warn', '?all: Für nicht aufgeführte Server trifft SPF keine Aussage (Neutral).'], '+': ['bad', '+all: Jeder Server der Welt darf im Namen dieser Domain senden. Das macht SPF wirkungslos.'] };
  function dmarcTags(v) { const t = {}; v.split(';').forEach(p => { const m = p.trim().match(/^([a-z]+)\s*=\s*(.*)$/i); if (m) t[m[1].toLowerCase()] = m[2].trim(); }); return t; }
  const P_TEXT = { none: ['info', 'p=none – nur beobachten: E-Mails werden normal zugestellt, auch wenn die Prüfung fehlschlägt. Du kannst Berichte erhalten.'], quarantine: ['ok', 'p=quarantine – E-Mails, die die Prüfung nicht bestehen, sollen als verdächtig behandelt werden, meist im Spam-Ordner.'], reject: ['ok', 'p=reject – E-Mails, die die Prüfung nicht bestehen, sollen abgewiesen werden.'] };
  function dmarcCard(tags, raw, name) {
    const p = (tags.p || '').toLowerCase(), pt = P_TEXT[p];
    const rows = [['Richtlinie (p)', tags.p], ['Für Subdomains (sp)', tags.sp], ['Anteil (pct)', tags.pct && tags.pct + ' %'], ['Sammelberichte an (rua)', tags.rua], ['Einzelberichte an (ruf)', tags.ruf], ['DKIM-Abgleich (adkim)', tags.adkim && (tags.adkim === 's' ? 'streng' : 'locker')], ['SPF-Abgleich (aspf)', tags.aspf && (tags.aspf === 's' ? 'streng' : 'locker')]].filter(r => r[1]);
    return [valueBox(raw, 'DMARC-Eintrag'), el('p', { class: 'dc-sub-info' }, 'Gefunden unter ', el('b', { text: name })),
      pt ? note(pt[1], pt[0] === 'info' ? null : 'ok') : note(p ? `Unbekannte Richtlinie „p=${tags.p}“.` : 'Die Pflichtangabe „p=“ fehlt. Ohne sie ist der DMARC-Eintrag ungültig.', 'bad'),
      el('dl', { class: 'dc-dl' }, rows.map(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]))];
  }
  async function runEmail(host, force) {
    await loadPSL();
    const base = baseDomain(host) || host;
    const selRaw = $('#dc-dkim').value.trim().toLowerCase().replace(/\.$/, '');
    if (selRaw && !selRaw.split('.').every(l => LABEL.test(l))) throw new UserError('Der DKIM-Selektor enthält unzulässige Zeichen.');
    const [mx, txt, dm] = await Promise.all([query(host, 'MX', { force }), query(host, 'TXT', { force }), query('_dmarc.' + host, 'TXT', { force })]);
    const wrap = el('div', null, head('E-Mail-Domain', host, () => start(true)),
      note('Bewertung der öffentlich sichtbaren DNS-Konfiguration. Das ist kein Zustellbarkeits-Score und keine Aussage darüber, ob eine bestimmte E-Mail die Prüfung besteht.'));
    const grid = el('div', { class: 'dc-cards' });

    // MX
    const mxCard = el('article', { class: 'dc-card' }, el('div', { class: 'dc-chead' }, el('h3', { text: 'MX · Mailserver' })));
    if (!mx.ok) add(mxCard, badge('bad', 'Anfrage fehlgeschlagen'), note(failText(mx), 'bad'));
    else if (mx.status === 'servfail') add(mxCard, badge('bad', 'DNS-Server meldet einen Fehler'), note(dnsErr(mx), 'bad'));
    else if (mx.status === 'nxdomain') add(mxCard, badge('neutral', 'Hostname existiert nicht'), note(`${toUnicode(host)} ist im DNS nicht eingetragen.`));
    else if (!mx.records.length) add(mxCard, badge('warn', 'Kein MX-Eintrag'), note('Kein MX-Eintrag gefunden. Absender greifen dann ersatzweise auf die A-/AAAA-Adresse zurück – für den E-Mail-Empfang ist ein MX-Eintrag üblich.'));
    else if (mx.records.some(r => r.value.host === '' && r.value.pref === 0)) add(mxCard, badge('info', 'Null MX'), note('Null MX (0 .): Diese Domain empfängt ausdrücklich keine E-Mails.'), el('ul', { class: 'dc-recs' }, mx.records.map(r => recordRow(r, mx))));
    else add(mxCard, badge('ok', mx.records.length === 1 ? '1 Mailserver' : mx.records.length + ' Mailserver'), el('ul', { class: 'dc-recs' }, mx.records.sort((a, b) => a.value.pref - b.value.pref).map(r => recordRow(r, mx))));
    add(grid, mxCard);

    // SPF
    const spfCard = el('article', { class: 'dc-card' }, el('div', { class: 'dc-chead' }, el('h3', { text: 'SPF · erlaubte Absender' })));
    if (!txt.ok) add(spfCard, badge('bad', 'Anfrage fehlgeschlagen'), note(failText(txt), 'bad'));
    else if (txt.status === 'servfail') add(spfCard, badge('bad', 'DNS-Server meldet einen Fehler'), note(dnsErr(txt), 'bad'));
    else {
      const spf = txt.records.map(r => r.value).filter(v => SPF_RE.test(v));
      if (!spf.length) add(spfCard, badge('warn', 'Kein SPF-Eintrag'), note(`Unter ${host} gibt es keinen SPF-Eintrag (TXT mit „v=spf1“). Empfänger können dann nicht prüfen, welche Server für diese Domain senden dürfen.`));
      else if (spf.length > 1) add(spfCard, badge('bad', 'Mehrere SPF-Einträge'), note('Es gibt mehr als einen SPF-Eintrag. Erlaubt ist genau einer – so führt die Prüfung zu einem Fehler (PermError). Fasse die Einträge zusammen.', 'bad'), spf.map(v => valueBox(v, 'SPF-Eintrag')));
      else {
        const ctx = { lookups: 0, queries: 0, t0: Date.now(), incomplete: [], force };
        const root = await spfAnalyze(host, spf[0], ctx, 0);
        const errs = [], warns = [];
        (function collect(n) { errs.push(...n.errors); warns.push(...n.warns); n.items.forEach(i => i.child && collect(i.child)); })(root);
        const allQ = root.all ? root.all.q : null, at = allQ && ALL_TEXT[allQ];
        const over = ctx.lookups > 10;
        add(spfCard, 
          errs.length || over ? badge('bad', 'Fehler gefunden') : ctx.incomplete.length ? badge('warn', 'Analyse unvollständig') : warns.length || (at && at[0] !== 'ok') ? badge('warn', 'Mit Hinweisen') : badge('ok', 'Eintrag vorhanden'),
          valueBox(spf[0], 'SPF-Eintrag'),
          at ? note(at[1], at[0]) : root.redirect ? note(`Die Regeln werden von ${root.redirect.arg} übernommen (redirect).`) : note('Ohne „all“ trifft SPF für nicht aufgeführte Server keine Aussage (Neutral).', 'warn'),
          el('p', { class: 'dc-limit' + (over ? ' dc-limit-bad' : ctx.lookups >= 8 ? ' dc-limit-warn' : '') },
            el('b', { text: `${ctx.lookups} von 10` }), ' DNS-abfragenden Begriffen (include, a, mx, ptr, exists, redirect) pro Auswertung.',
            over ? ' Das Limit ist überschritten – Empfänger können die SPF-Prüfung mit einem Fehler (PermError) abbrechen.' : ''),
          errs.map(e => note(e, 'bad')), warns.map(w => note(w, 'warn')),
          ctx.incomplete.length ? el('div', { class: 'dc-note dc-note-warn' }, el('b', null, 'Statische Analyse unvollständig. '), 'Die gezählten Abfragen sind deshalb ein Mindestwert.', el('ul', null, ctx.incomplete.map(t => el('li', { text: t })))) : null,
          el('details', { class: 'dc-spf-wrap' }, el('summary', null, 'Alle Begriffe und verschachtelten Einträge anzeigen'), spfTree(root)),
          el('p', { class: 'dc-sub-info' }, 'Statische Analyse der veröffentlichten Einträge – das ist kein SPF-Ergebnis für eine konkrete E-Mail.'));
      }
    }
    add(grid, spfCard);

    // DMARC
    const dmCard = el('article', { class: 'dc-card' }, el('div', { class: 'dc-chead' }, el('h3', { text: 'DMARC · Richtlinie' })));
    const dmName = '_dmarc.' + host;
    if (!dm.ok) add(dmCard, badge('bad', 'Anfrage fehlgeschlagen'), note(failText(dm), 'bad'));
    else if (dm.status === 'servfail') add(dmCard, badge('bad', 'DNS-Server meldet einen Fehler'), note(dnsErr(dm), 'bad'));
    else {
      const recs = dm.records.map(r => r.value).filter(v => /^v=DMARC1\s*(;|$)/i.test(v));
      if (recs.length > 1) add(dmCard, badge('bad', 'Mehrere DMARC-Einträge'), note('Unter ' + dmName + ' gibt es mehrere DMARC-Einträge. Empfänger werten dann keinen davon aus.', 'bad'), recs.map(v => valueBox(v, 'DMARC-Eintrag')));
      else if (recs.length) { const t = dmarcTags(recs[0]); add(dmCard, P_TEXT[(t.p || '').toLowerCase()] ? badge(t.p.toLowerCase() === 'none' ? 'info' : 'ok', 'Richtlinie p=' + t.p.toLowerCase()) : badge('bad', 'Ungültig'), dmarcCard(t, recs[0], dmName)); }
      else if (host !== base) {
        const up = await query('_dmarc.' + base, 'TXT', { force });
        const upRec = up.ok ? up.records.map(r => r.value).filter(v => /^v=DMARC1\s*(;|$)/i.test(v)) : [];
        add(dmCard, badge('info', 'Kein eigener Eintrag'), note(`Für ${toUnicode(host)} gibt es keinen eigenen DMARC-Eintrag. Es kann die Richtlinie der übergeordneten Domain ${toUnicode(base)} gelten.`));
        if (!up.ok) add(dmCard, note('Die übergeordnete Richtlinie konnte nicht abgefragt werden: ' + failText(up), 'bad'));
        else if (upRec.length === 1) { const t = dmarcTags(upRec[0]); add(dmCard, el('p', { class: 'dc-sub-info' }, t.sp ? `Für Subdomains gilt dort sp=${t.sp}.` : `Dort ist kein sp= gesetzt, für Subdomains gilt daher p=${t.p || '–'}.`), dmarcCard(t, upRec[0], '_dmarc.' + base)); }
        else add(dmCard, note(`Auch unter _dmarc.${base} wurde kein gültiger DMARC-Eintrag gefunden.`, 'warn'));
      } else add(dmCard, badge('warn', 'Kein DMARC-Eintrag'), note(`Unter ${dmName} gibt es keinen DMARC-Eintrag. Damit legst Du fest, wie Empfänger mit E-Mails umgehen, die SPF- und DKIM-Prüfung nicht bestehen.`));
    }
    add(grid, dmCard);

    // DKIM
    const dkCard = el('article', { class: 'dc-card' }, el('div', { class: 'dc-chead' }, el('h3', { text: 'DKIM · Signaturschlüssel' })));
    if (!selRaw) add(dkCard, badge('neutral', 'Nicht geprüft'), note('Für die DKIM-Prüfung brauchst Du den Selektor Deines Mailanbieters. Trag ihn oben im Feld „DKIM-Selektor“ ein.'));
    else {
      const name = `${selRaw}._domainkey.${host}`, f = await follow(name, force);
      let t = null;
      if (f.final) t = await query(f.final, 'TXT', { force });
      const chain = f.hops.length ? el('p', { class: 'dc-sub-info' }, 'Weitergeleitet per CNAME: ', f.hops.map(h => h.to).join(' → ')) : null;
      if (f.fail || (t && !t.ok)) add(dkCard, badge('bad', 'Anfrage fehlgeschlagen'), note(failText(f.fail || t), 'bad'));
      else if (f.serv || (t && t.status === 'servfail')) add(dkCard, badge('bad', 'DNS-Server meldet einen Fehler'), note(dnsErr(f.serv || t), 'bad'));
      else if (f.loop || f.limit) add(dkCard, badge('bad', f.loop ? 'CNAME-Schleife' : 'Kette zu lang'), chain, note('Die Weiterleitung lässt sich nicht bis zum Schlüssel verfolgen.', 'bad'));
      else {
        const vals = t ? t.records.map(r => r.value) : [];
        const key1 = vals.find(v => /(^|;)\s*p\s*=/i.test(v));
        if (!key1) add(dkCard, badge('warn', 'Kein Schlüssel gefunden'), el('p', { class: 'dc-sub-info' }, 'Abgefragt: ', el('b', { text: name })), chain,
          note(vals.length ? 'Unter diesem Namen steht ein TXT-Eintrag, aber kein DKIM-Schlüssel.' : `Unter ${name} wurde kein DKIM-Schlüssel gefunden. Prüfe, ob der Selektor stimmt.`), vals.map(v => valueBox(v, 'TXT-Wert')));
        else {
          const tags = dmarcTags(key1), p = (tags.p || '').replace(/\s/g, ''), k = (tags.k || 'rsa').toLowerCase();
          let bits = null;
          if (p && k === 'rsa') { const bytes = Math.floor(p.replace(/=+$/, '').length * 3 / 4); bits = [1024, 2048, 3072, 4096].reduce((best, b) => Math.abs(b / 8 + 38 - bytes) < Math.abs(best / 8 + 38 - bytes) ? b : best, 1024); }
          add(dkCard, p ? badge('ok', 'Schlüssel veröffentlicht') : badge('warn', 'Schlüssel widerrufen'),
            el('p', { class: 'dc-sub-info' }, 'Abgefragt: ', el('b', { text: name })), chain,
            note(p ? `Ein DKIM-Schlüssel ist veröffentlicht (Typ ${k}${bits ? `, ca. ${bits} Bit` : ''}).` : 'Der Eintrag hat ein leeres „p=“ – der Schlüssel wurde widerrufen.', p ? (bits && bits < 2048 ? 'warn' : 'ok') : 'warn'),
            bits && bits < 2048 ? note('Schlüssel unter 2048 Bit gelten als schwach. Viele Anbieter empfehlen 2048 Bit.', 'warn') : null,
            valueBox(key1, 'DKIM-Eintrag'));
        }
      }
    }
    add(grid, dkCard);
    add(wrap, grid);
    return wrap;
  }

  // ───────────────────────── 5. Anbieter-Eintrag ─────────────────────────
  function providerName(host) {
    const raw = $('#dc-an-host').value.trim();
    if (!raw) return { err: 'Bitte gib den Hostnamen aus der Anleitung Deines Anbieters ein.' };
    const base = baseDomain(host);
    if (!base) return { err: `„${toUnicode(host)}“ ist eine Domain-Endung. Bitte gib oben eine registrierbare Domain ein.` };
    if (raw === '@') return { name: base, base };
    const abs = raw.endsWith('.');
    const ascii = raw.replace(/\.$/, '').split('.').map(l => /^[\x00-\x7f]*$/.test(l) ? l.toLowerCase() : (toAsciiHost(l) || '\u0000')).join('.');
    if (!ascii.split('.').every(l => LABEL.test(l))) return { err: 'Der Hostname enthält unzulässige Zeichen.' };
    const full = abs || ascii === base || ascii.endsWith('.' + base) ? ascii : ascii + '.' + base;
    return full.length > 253 ? { err: 'Dieser Hostname ist zu lang.' } : { name: full, base };
  }
  async function runProvider(host, force) {
    await loadPSL();
    const pn = providerName(host);
    if (pn.err) throw new UserError(pn.err);
    const type = $('#dc-an-typ').value, raw = $('#dc-an-soll').value;
    if (!raw.trim()) throw new UserError('Bitte gib den erwarteten Wert ein.');
    const exp = expectation(type, raw), r = await query(pn.name, type, { force });
    let b, msgs = [];
    if (!r.ok) { b = badge('bad', 'Anfrage fehlgeschlagen'); msgs.push(note(failText(r), 'bad')); }
    else if (r.status === 'servfail') { b = badge('bad', 'DNS-Server meldet einen Fehler'); msgs.push(note(dnsErr(r), 'bad')); }
    else if (!r.records.length) { b = badge('warn', 'Eintrag nicht gefunden'); msgs.push(note(r.status === 'nxdomain' ? 'Diesen Hostnamen gibt es im DNS nicht.' : r.alias ? `Unter diesem Namen gibt es keinen ${type}-Eintrag. Der Name ist ein Alias (CNAME) für ${r.alias}.` : `Unter diesem Namen gibt es keinen ${type}-Eintrag.`)); }
    else if (r.records.some(x => exp.test(x.value))) b = badge('ok', 'Stimmt überein');
    else { b = badge('warn', 'Abweichung gefunden'); msgs.push(note('Der gefundene Wert entspricht nicht dem erwarteten. Achte auf Tippfehler, Leerzeichen und darauf, dass manche Anbieter die Domain automatisch anhängen.')); }
    return el('div', null, head(`Anbieter-Eintrag · ${type}`, pn.name, () => start(true)),
      el('article', { class: 'dc-card' }, el('div', { class: 'dc-chead' }, el('h3', { text: 'Ergebnis' }), b),
        el('dl', { class: 'dc-dl dc-dl-wide' },
          el('dt', { text: 'Abgefragter Name' }), el('dd', null, valueBox(pn.name, 'Hostname')),
          el('dt', { text: 'Eintragstyp' }), el('dd', { text: type }),
          el('dt', { text: 'Erwarteter Wert' }), el('dd', null, valueBox(raw.trim(), 'Erwarteten Wert')),
          el('dt', { text: 'Gefunden' }), el('dd', null, r.ok && r.records.length ? r.records.map(x => el('div', { class: exp.test(x.value) ? 'dc-match' : 'dc-miss' }, valueBox(show(type, x.value), 'Gefundenen Wert'))) : '–')),
        msgs, r.ok ? el('p', { class: 'dc-sub-info' }, `Quelle ${src(r)} · Geprüft ${time(r.at)}${r.records[0] ? ` · TTL ${r.records[0].ttl} s` : ''}`) : null));
  }

  // ───────────────────────── Steuerung ─────────────────────────
  function UserError(msg) { this.message = msg; }
  const $ = s => document.querySelector(s);
  const form = $('#dc-form'), input = $('#dc-domain'), go = $('#dc-go'), errBox = $('#dc-error'), status = $('#dc-status');
  const tabs = [...document.querySelectorAll('.dc-tabs [role=tab]')];
  const RUN = { uebersicht: runOverview, aenderung: runChange, website: runWebsite, email: runEmail, anbieter: runProvider };
  let view = 'uebersicht', running = false;

  function setView(v, focus) {
    view = v;
    tabs.forEach(t => { const on = t.dataset.view === v; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
    document.querySelectorAll('.dc-view').forEach(p => { p.hidden = p.id !== 'view-' + v; });
    document.querySelectorAll('.dc-extra').forEach(x => { x.hidden = x.dataset.for !== v; });
    errBox.hidden = true;
    if (v === 'anbieter') updatePreview();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => setView(t.dataset.view));
    t.addEventListener('keydown', e => {
      const k = { ArrowRight: 1, ArrowLeft: -1, Home: -i, End: tabs.length - 1 - i }[e.key];
      if (k === undefined) return; e.preventDefault();
      setView(tabs[(i + k + tabs.length) % tabs.length].dataset.view, true);
    });
  });

  function showError(msg) { errBox.textContent = msg; errBox.hidden = false; }
  async function start(force) {
    if (running) return;
    errBox.hidden = true;
    const p = parseDomainInput(input.value);
    if (p.err) { showError(p.err); input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    input.removeAttribute('aria-invalid');
    running = true; go.disabled = true; go.textContent = 'Wird geprüft …'; form.setAttribute('aria-busy', 'true');
    const panel = $('#view-' + view), label = tabs.find(t => t.dataset.view === view).textContent;
    status.textContent = `${label}: ${toUnicode(p.host)} wird geprüft …`;
    panel.setAttribute('aria-busy', 'true'); panel.classList.add('dc-loading');
    try {
      const out = await RUN[view](p.host, !!force);
      panel.replaceChildren(out);
      status.textContent = `${label} für ${toUnicode(p.host)} abgeschlossen.`;
    } catch (e) {
      if (e instanceof UserError) { showError(e.message); status.textContent = ''; }
      else { showError('Die Prüfung konnte nicht abgeschlossen werden. Bitte versuch es noch einmal.'); status.textContent = ''; if (window.console) console.error(e); }
    } finally {
      running = false; go.disabled = false; go.textContent = 'Domain prüfen'; form.removeAttribute('aria-busy');
      panel.removeAttribute('aria-busy'); panel.classList.remove('dc-loading');
    }
  }
  form.addEventListener('submit', e => { e.preventDefault(); start(false); });

  // Anbieter-Ansicht: schon vor dem Start zeigen, welcher Name abgefragt wird
  const preview = $('#dc-an-full');
  function updatePreview() {
    const p = parseDomainInput(input.value);
    if (p.err || !$('#dc-an-host').value.trim()) { preview.textContent = 'Gib oben die Domain und hier den Hostnamen ein. @ steht für die Basisdomain.'; return; }
    loadPSL().then(() => { const n = providerName(p.host); preview.textContent = n.err ? n.err : `Abgefragt wird: ${n.name}`; }).catch(() => { preview.textContent = ''; });
  }
  ['input', 'change'].forEach(ev => { input.addEventListener(ev, () => view === 'anbieter' && updatePreview()); $('#dc-an-host').addEventListener(ev, updatePreview); });

  // Domain aus dem Link übernehmen (?domain=…), aber nicht automatisch prüfen
  const qd = new URLSearchParams(location.search).get('domain');
  if (qd) input.value = qd.slice(0, 300);

  // Für die Abnahme-Tests im Browser (keine Testdaten im Produkt)
  window.condooDNS = { parseDomainInput, parseTxt, parseCaa, normIPv6, expectation, key, baseDomain: h => loadPSL().then(() => baseDomain(h)), punyDecode: toUnicode, clearCache: () => cache.clear() };
})();
