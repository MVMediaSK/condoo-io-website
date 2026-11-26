/* condoo.io – Onboarding-Call buchen (eigener Kalender, Daten aus condooOS über /api/termin.php) */
(function () {
  'use strict';
  var box = document.getElementById('buchung');
  if (!box) return;
  var API = '/api/termin.php';
  var MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var TAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var MAX_MONATE = 2; // aktueller + nächster Monat

  var $ = function (s, r) { return (r || box).querySelector(s); };
  var pick = $('.bk-pick'), form = $('.bk-form'), done = $('.bk-done');
  var daysEl = $('.bk-days'), mlabel = $('.bk-mlabel'), slotsEl = $('.bk-slots'), dlabel = $('.bk-dlabel');
  var prevBtn = $('[data-monat="-1"]'), nextBtn = $('[data-monat="1"]');
  var err = $('.kt-err', form), send = $('.bk-send', form);

  var heute = new Date(); heute.setHours(0, 0, 0, 0);
  var start = new Date(heute.getFullYear(), heute.getMonth(), 1);
  var monat = new Date(start);
  var cache = {}, tagWahl = null, zeitWahl = null, geoeffnet = 0, ladeNr = 0;

  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var vonIso = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var lang = function (s) { var d = vonIso(s); return TAGE[d.getDay()] + ', ' + d.getDate() + '. ' + MONATE[d.getMonth()]; };
  var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  var holen = function (q) {
    return fetch(API + '?' + q, { headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); });
  };

  function zeige(schritt) {
    [pick, form, done].forEach(function (s) { s.hidden = s.getAttribute('data-schritt') !== String(schritt); });
  }

  /* ---------- Monat ---------- */
  function ladeMonat() {
    var nr = ++ladeNr;
    var erster = new Date(monat.getFullYear(), monat.getMonth(), 1);
    var letzter = new Date(monat.getFullYear(), monat.getMonth() + 1, 0);
    var von = erster < heute ? heute : erster;
    var key = iso(erster);
    mlabel.textContent = MONATE[monat.getMonth()] + ' ' + monat.getFullYear();
    prevBtn.disabled = monat <= start;
    nextBtn.disabled = (monat.getFullYear() - start.getFullYear()) * 12 + monat.getMonth() - start.getMonth() >= MAX_MONATE - 1;
    zeichneMonat(cache[key] || null, !cache[key]);
    if (cache[key]) return;
    holen('aktion=monat&von=' + iso(von) + '&bis=' + iso(letzter)).then(function (j) {
      if (nr !== ladeNr) return;
      if (!j || !j.ok) throw new Error();
      cache[key] = j.tage || {};
      zeichneMonat(cache[key], false);
      if (!tagWahl) ersterFreierTag(cache[key]);
    }).catch(function () {
      if (nr !== ladeNr) return;
      daysEl.innerHTML = '';
      var p = el('p', 'bk-fail', 'Die freien Termine konnten gerade nicht geladen werden. ');
      var a = el('button', 'bk-retry', 'Nochmal versuchen'); a.type = 'button';
      a.addEventListener('click', ladeMonat);
      p.appendChild(a); daysEl.appendChild(p);
    });
  }

  function ersterFreierTag(tage) {
    var frei = Object.keys(tage).filter(function (d) { return tage[d] > 0; }).sort();
    if (frei.length) waehleTag(frei[0], false);
    else if (!nextBtn.disabled) { dlabel.textContent = 'In diesem Monat ist nichts mehr frei – schau in den nächsten.'; }
    else dlabel.textContent = 'Gerade sind keine Termine frei.';
  }

  function zeichneMonat(tage, laedt) {
    daysEl.innerHTML = '';
    daysEl.classList.toggle('laedt', !!laedt);
    var erster = new Date(monat.getFullYear(), monat.getMonth(), 1);
    var versatz = (erster.getDay() + 6) % 7;
    var anzahl = new Date(monat.getFullYear(), monat.getMonth() + 1, 0).getDate();
    for (var i = 0; i < versatz; i++) daysEl.appendChild(el('span', 'bk-pad'));
    for (var t = 1; t <= anzahl; t++) {
      var d = new Date(monat.getFullYear(), monat.getMonth(), t), k = iso(d);
      var frei = tage && tage[k] > 0;
      var b = el('button', 'bk-day', String(t));
      b.type = 'button';
      b.setAttribute('data-tag', k);
      if (k === iso(heute)) b.classList.add('heute');
      if (frei) { b.classList.add('frei'); b.setAttribute('aria-label', lang(k) + ', freie Termine'); }
      else { b.disabled = true; b.setAttribute('aria-label', lang(k) + ', nicht verfügbar'); }
      if (k === tagWahl) { b.classList.add('an'); b.setAttribute('aria-pressed', 'true'); }
      daysEl.appendChild(b);
    }
  }

  daysEl.addEventListener('click', function (e) {
    var b = e.target.closest('.bk-day.frei');
    if (b) waehleTag(b.getAttribute('data-tag'), true);
  });
  daysEl.addEventListener('keydown', function (e) {
    var b = e.target.closest('.bk-day'); if (!b) return;
    var schritt = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!schritt) return;
    var alle = Array.prototype.slice.call(daysEl.querySelectorAll('.bk-day.frei'));
    var i = alle.indexOf(b); if (i < 0) return;
    var ziel = b, d = vonIso(b.getAttribute('data-tag'));
    d.setDate(d.getDate() + schritt);
    var kandidat = daysEl.querySelector('.bk-day.frei[data-tag="' + iso(d) + '"]');
    if (kandidat) ziel = kandidat;
    else if (Math.abs(schritt) === 1 && alle[i + schritt]) ziel = alle[i + schritt];
    e.preventDefault(); ziel.focus();
  });
  prevBtn.addEventListener('click', function () { monat.setMonth(monat.getMonth() - 1); ladeMonat(); });
  nextBtn.addEventListener('click', function () { monat.setMonth(monat.getMonth() + 1); ladeMonat(); });

  /* ---------- Uhrzeiten ---------- */
  function waehleTag(k, fokus) {
    tagWahl = k; zeitWahl = null;
    daysEl.querySelectorAll('.bk-day').forEach(function (b) {
      var an = b.getAttribute('data-tag') === k;
      b.classList.toggle('an', an);
      if (an) b.setAttribute('aria-pressed', 'true'); else b.removeAttribute('aria-pressed');
    });
    dlabel.textContent = lang(k);
    slotsEl.innerHTML = '';
    slotsEl.classList.add('laedt');
    for (var i = 0; i < 4; i++) slotsEl.appendChild(el('span', 'bk-skel'));
    var nr = ++geoeffnet;
    holen('aktion=tag&datum=' + k).then(function (j) {
      if (nr !== geoeffnet) return;
      if (!j || !j.ok) throw new Error();
      slotsEl.classList.remove('laedt');
      slotsEl.innerHTML = '';
      if (!j.zeiten.length) { slotsEl.appendChild(el('p', 'bk-empty', 'An diesem Tag ist leider nichts mehr frei.')); return; }
      j.zeiten.forEach(function (z) {
        var wrap = el('div', 'bk-slot');
        var b = el('button', 'bk-time', z); b.type = 'button'; b.setAttribute('data-zeit', z);
        var w = el('button', 'bk-next', 'Weiter'); w.type = 'button'; w.tabIndex = -1;
        wrap.appendChild(b); wrap.appendChild(w); slotsEl.appendChild(wrap);
      });
      if (fokus && window.matchMedia('(max-width: 900px)').matches) slotsEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }).catch(function () {
      if (nr !== geoeffnet) return;
      slotsEl.classList.remove('laedt');
      slotsEl.innerHTML = '';
      slotsEl.appendChild(el('p', 'bk-empty', 'Die Uhrzeiten konnten nicht geladen werden. Bitte wähle den Tag noch einmal.'));
    });
  }

  slotsEl.addEventListener('click', function (e) {
    var t = e.target.closest('.bk-time'), w = e.target.closest('.bk-next');
    if (t) {
      zeitWahl = t.getAttribute('data-zeit');
      slotsEl.querySelectorAll('.bk-slot').forEach(function (s) {
        var an = s.querySelector('.bk-time') === t;
        s.classList.toggle('an', an);
        s.querySelector('.bk-next').tabIndex = an ? 0 : -1;
      });
      t.parentNode.querySelector('.bk-next').focus();
    }
    if (w) zumFormular();
  });

  /* ---------- Formular ---------- */
  function zeitspanne(z) {
    var p = z.split(':'), m = +p[0] * 60 + +p[1] + 30;
    return z + '–' + pad(Math.floor(m / 60)) + ':' + pad(m % 60) + ' Uhr';
  }
  function zumFormular() {
    if (!tagWahl || !zeitWahl) return;
    $('.bk-when', form).textContent = lang(tagWahl) + ' · ' + zeitspanne(zeitWahl);
    err.hidden = true;
    zeige(2);
    form.dataset.offen = String(Date.now());
    var f = form.querySelector('[name="vorname"]'); f.focus({ preventScroll: true });
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('.bk-back', form).addEventListener('click', function () {
    zeige(1);
    var an = slotsEl.querySelector('.bk-slot.an .bk-time');
    (an || daysEl.querySelector('.bk-day.an') || prevBtn).focus();
  });

  var FEHLER = {
    pflichtfelder: 'Bitte gib Vorname, Nachname, eine gültige E-Mail-Adresse und Deine Telefonnummer an.',
    vergeben: 'Dieser Termin wurde gerade vergeben. Bitte such Dir eine andere Uhrzeit aus.',
    'zu-viele': 'Zu viele Versuche in kurzer Zeit. Bitte versuch es in einer Stunde noch einmal.',
    _: 'Die Buchung hat gerade nicht geklappt. Bitte versuch es noch einmal oder schreib uns über das <a href="/kontakt/">Kontaktformular</a>.'
  };
  function fehler(code) {
    err.innerHTML = FEHLER[code] || FEHLER._;
    err.hidden = false;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = form.elements, ok = true;
    ['vorname', 'nachname', 'email', 'telefon'].forEach(function (n) {
      var v = f[n].value.trim();
      var leer = !v || (n === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) || (n === 'telefon' && (v.replace(/\D/g, '').length < 6 || /[^\d\s+()\/.-]/.test(v)));
      f[n].classList.toggle('bad', leer);
      f[n].setAttribute('aria-invalid', leer ? 'true' : 'false');
      if (leer && ok) { f[n].focus(); ok = false; }
    });
    if (!ok) { fehler('pflichtfelder'); return; }
    err.hidden = true;
    send.disabled = true; send.textContent = 'Wird gebucht …';
    var daten = { datum: tagWahl, zeit: zeitWahl, dauer: Date.now() - (+form.dataset.offen || 0) };
    ['vorname', 'nachname', 'email', 'telefon', 'firma', 'notiz', 'website'].forEach(function (n) { daten[n] = f[n].value; });
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(daten) })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (j) {
        if (j && j.ok) return fertig(j);
        if (j && j.fehler === 'vergeben') {
          delete cache[iso(new Date(monat.getFullYear(), monat.getMonth(), 1))];
          zeige(1); waehleTag(tagWahl, false); ladeMonat();
          dlabel.textContent = 'Dieser Termin wurde gerade vergeben – bitte wähle eine andere Uhrzeit.';
          return;
        }
        fehler(j && j.fehler);
      })
      .catch(function () { fehler(); })
      .then(function () { send.disabled = false; send.textContent = 'Termin verbindlich buchen'; });
  });

  /* ---------- Fertig ---------- */
  function fertig(j) {
    $('.bk-done-when', done).textContent = lang(j.datum) + ' · ' + j.zeit + '–' + j.bis + ' Uhr';
    var add = $('.bk-add', done); add.innerHTML = '';
    [['Google Kalender', j.google], ['Outlook', j.outlook], ['Apple / iCal (.ics)', j.ics]].forEach(function (l) {
      if (!l[1]) return;
      var a = el('a', 'bk-cal', l[0]); a.href = l[1];
      if (l[1].indexOf('.ics') < 0 && l[1].indexOf('/ics') < 0) { a.target = '_blank'; a.rel = 'noopener'; }
      add.appendChild(a);
    });
    zeige(3);
    done.focus({ preventScroll: true });
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  zeige(1);
  ladeMonat();
  window.condooTermin = { ladeMonat: ladeMonat, waehleTag: waehleTag };
})();
