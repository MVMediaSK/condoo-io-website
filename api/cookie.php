<?php
// condoo.io – Cookie- & Tracking-Check
// Ruft eine öffentliche Seite einmal ab (wie ein Erstbesuch, ohne Einwilligung), liest alle Cookies,
// die der Server dabei setzt (auch bei Weiterleitungen), und sucht im Quelltext nach bekannten
// Tracking-Diensten, Einbettungen und Consent-Tools. JavaScript wird NICHT ausgeführt.
// Keine externen Dienste, nichts wird gespeichert.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 condooOS-CookieCheck/1.0 (+https://condoo.io/tools/cookie-check/)';
const MAX_HTML = 3145728;   // 3 MB
const MAX_REDIRECTS = 5;

function antwort($code, $d) { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }
function fehler($code, $text, $extra = []) { antwort(200, array_merge(['ok' => false, 'fehler' => $code, 'text' => $text], $extra)); }

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') antwort(405, ['ok' => false, 'fehler' => 'methode']);
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && !preg_match('~^https://(www\.)?condoo\.io$~', $origin) && !preg_match('~^http://(localhost|127\.0\.0\.1):\d+$~', $origin)) antwort(403, ['ok' => false, 'fehler' => 'herkunft']);
$in = json_decode(file_get_contents('php://input', false, null, 0, 5000), true);
$roh = is_array($in) && isset($in['url']) && is_string($in['url']) ? trim($in['url']) : '';
if ($roh === '' || strlen($roh) > 2000) fehler('ungueltig', 'Bitte gib eine Adresse ein.');

// Höchstens 30 Prüfungen pro Stunde und IP
$sperre = sys_get_temp_dir() . '/condoo-cookie-' . sha1(($_SERVER['REMOTE_ADDR'] ?? '') . '|condoo') . '.json';
$zeiten = array_values(array_filter((array)json_decode(@file_get_contents($sperre) ?: '[]', true), function ($t) { return $t > time() - 3600; }));
if (count($zeiten) >= 30) fehler('limit', 'Du hast in kurzer Zeit sehr viele Prüfungen gestartet. Bitte warte ein paar Minuten.');
$zeiten[] = time(); @file_put_contents($sperre, json_encode($zeiten));

require __DIR__ . '/_abruf.php';
$S = require __DIR__ . '/_cookie-muster.php';

// ───────── Seite abrufen ─────────
$start = preg_match('~^[a-z][a-z0-9+.-]*://~i', $roh) ? $roh : 'https://' . $roh;
$start = preg_replace('~\s~', '%20', $start);
$r = abrufen($start, MAX_HTML, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5', UA);
$basis = ['eingabe' => $roh, 'start_url' => $start, 'zeitpunkt' => gmdate('c'),
          'weiterleitungen' => array_map(function ($k) { return ['url' => $k['url'], 'status' => $k['status']]; }, $r['kette'] ?? [])];
if (isset($r['err'])) fehler($r['err'][0], $r['err'][1], $basis + ['ziel_url' => $r['url']]);
$basis['ziel_url'] = $r['url']; $basis['status'] = $r['status'];
$ct = strtolower($r['kopf']['content-type'] ?? '');
if ($r['status'] >= 400) {
  $t = $r['status'] === 403 || $r['status'] === 401 ? 'Die Website hat den Abruf blockiert (HTTP ' . $r['status'] . '). Manche Server oder Schutzdienste sperren automatische Abrufe.'
     : ($r['status'] === 404 ? 'Die Seite wurde nicht gefunden (HTTP 404). Prüfe die Adresse.' : ($r['status'] === 429 ? 'Die Website meldet zu viele Anfragen (HTTP 429). Versuch es später erneut.' : 'Die Website antwortete mit einem Fehler (HTTP ' . $r['status'] . ').'));
  fehler('http', $t, $basis);
}
if ($ct !== '' && strpos($ct, 'html') === false) fehler('kein_html', 'Unter dieser Adresse liegt keine Webseite, sondern eine Datei vom Typ „' . explode(';', $ct)[0] . '“.', $basis);

// ───────── Cookies aus allen Antworten ─────────
function cookie_lesen($zeile, $url, $muster) {
  $teile = array_map('trim', explode(';', $zeile));
  $erstes = array_shift($teile);
  $p = strpos($erstes, '=');
  if ($p === false || $p === 0) return null;
  $name = substr($erstes, 0, $p); $wert = substr($erstes, $p + 1);
  $host = strtolower(parse_url($url, PHP_URL_HOST) ?: '');
  $c = ['name' => $name, 'wert_laenge' => strlen(trim($wert, '"')), 'domain' => $host, 'domain_angabe' => false, 'pfad' => '/',
        'laufzeit' => null, 'secure' => false, 'httponly' => false, 'samesite' => null, 'gesetzt_von' => $host, 'loescht' => false];
  $ablauf = null; $maxAge = null;
  foreach ($teile as $t) {
    $kv = explode('=', $t, 2); $k = strtolower(trim($kv[0])); $v = isset($kv[1]) ? trim($kv[1]) : '';
    if ($k === 'domain' && $v !== '') { $c['domain'] = strtolower(ltrim($v, '.')); $c['domain_angabe'] = true; }
    elseif ($k === 'path' && $v !== '') $c['pfad'] = $v;
    elseif ($k === 'expires') { $ts = strtotime($v); if ($ts !== false) $ablauf = $ts; }
    elseif ($k === 'max-age' && is_numeric($v)) $maxAge = (int)$v;
    elseif ($k === 'secure') $c['secure'] = true;
    elseif ($k === 'httponly') $c['httponly'] = true;
    elseif ($k === 'samesite') $c['samesite'] = ucfirst(strtolower($v));
  }
  if ($maxAge !== null) $c['laufzeit'] = $maxAge;            // Max-Age hat Vorrang vor Expires
  elseif ($ablauf !== null) $c['laufzeit'] = $ablauf - time();
  if ($c['laufzeit'] !== null && $c['laufzeit'] <= 0) $c['loescht'] = true;
  if (strtolower(trim($wert, '"')) === 'deleted') $c['loescht'] = true;
  $c['art'] = 'unbekannt'; $c['zweck'] = null; $c['dienst'] = null;
  foreach ($muster as $m) {
    if (preg_match($m['name'], $name)) { $c['art'] = $m['art']; $c['zweck'] = $m['zweck']; $c['dienst'] = $m['dienst'] ?? null; break; }
  }
  return $c;
}
$cookies = []; $alle = [];
$antworten = $r['kette']; $antworten[] = ['url' => $r['url'], 'cookies' => $r['cookies']];
foreach ($antworten as $a) foreach ($a['cookies'] as $zeile) { $c = cookie_lesen($zeile, $a['url'], $S['cookies']); if ($c) $alle[] = $c; }
// Spätere Antworten überschreiben frühere mit gleichem Namen/Domain/Pfad
foreach ($alle as $c) $cookies[$c['name'] . '|' . $c['domain'] . '|' . $c['pfad']] = $c;
$cookies = array_values($cookies);
$geloescht = array_values(array_filter($cookies, function ($c) { return $c['loescht']; }));
$cookies = array_values(array_filter($cookies, function ($c) { return !$c['loescht']; }));

// ───────── Quelltext auf Dienste prüfen ─────────
$html = $r['body'];
if (!preg_match('~charset=([\w-]+)~i', $ct, $cs)) preg_match('~<meta[^>]+charset=["\']?([\w-]+)~i', substr($html, 0, 4096), $cs);
$charset = strtoupper($cs[1] ?? 'UTF-8');
if ($charset !== 'UTF-8' && function_exists('mb_convert_encoding')) $html = @mb_convert_encoding($html, 'UTF-8', $charset) ?: $html;
$dom = new DOMDocument();
libxml_use_internal_errors(true);
@$dom->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
libxml_clear_errors();

// Fundstellen sammeln: [text, aktiv?]
$stellen = [];
$seitenHost = strtolower(parse_url($r['url'], PHP_URL_HOST) ?: '');
$JS_TYPEN = ['', 'text/javascript', 'application/javascript', 'module', 'text/ecmascript', 'application/ecmascript'];
foreach ($dom->getElementsByTagName('script') as $e) {
  $typ = strtolower(trim($e->getAttribute('type')));
  $src = $e->getAttribute('src'); $dsrc = $e->getAttribute('data-src') ?: $e->getAttribute('data-cmp-src') ?: $e->getAttribute('data-borlabs-cookie-script-blocker-src');
  $blockiert = !in_array($typ, $JS_TYPEN, true) || ($src === '' && $dsrc !== '');
  if ($typ === 'application/ld+json' || $typ === 'application/json' || $typ === 'importmap') continue;
  $stellen[] = ['t' => trim($src . ' ' . $dsrc . ' ' . $e->textContent), 'aktiv' => !$blockiert, 'art' => 'script', 'src' => $src];
}
foreach ($dom->getElementsByTagName('iframe') as $e) {
  $src = $e->getAttribute('src'); $dsrc = $e->getAttribute('data-src') ?: $e->getAttribute('data-cmp-src');
  $stellen[] = ['t' => $src . ' ' . $dsrc, 'aktiv' => $src !== '' && stripos($src, 'about:blank') !== 0, 'art' => 'iframe', 'src' => $src];
}
foreach ($dom->getElementsByTagName('link') as $e) {
  $rel = strtolower($e->getAttribute('rel'));
  $laedt = (bool)preg_match('~\b(stylesheet|preload|modulepreload|preconnect|dns-prefetch|prefetch|icon|apple-touch-icon|manifest)\b~', $rel);
  $stellen[] = ['t' => $e->getAttribute('href'), 'aktiv' => $laedt, 'art' => 'link', 'src' => $laedt ? $e->getAttribute('href') : ''];
}
foreach ($dom->getElementsByTagName('img') as $e) {
  $src = $e->getAttribute('src'); if ($src !== '') $stellen[] = ['t' => $src, 'aktiv' => true, 'art' => 'img', 'src' => $src];
}
foreach ($dom->getElementsByTagName('noscript') as $e) {
  // Pixel im <noscript> laden nur ohne JavaScript – zählen als Hinweis, nicht als aktiv
  $stellen[] = ['t' => $dom->saveHTML($e), 'aktiv' => false, 'art' => 'noscript', 'src' => ''];
}
// Stilangaben (@import von Google Fonts u. ä.)
foreach ($dom->getElementsByTagName('style') as $e) $stellen[] = ['t' => $e->textContent, 'aktiv' => true, 'art' => 'style', 'src' => ''];

$dienste = [];
foreach ($S['dienste'] as $d) {
  $aktiv = 0; $blockiert = 0;
  foreach ($stellen as $s) {
    if ($s['t'] === '') continue;
    foreach ($d['muster'] as $m) {
      if (preg_match($m, $s['t'])) { if ($s['aktiv']) $aktiv++; else $blockiert++; break; }
    }
  }
  if ($aktiv || $blockiert) {
    $dienste[] = ['id' => $d['id'], 'name' => $d['name'], 'art' => $d['art'], 'text' => $d['text'], 'schritt' => $d['schritt'] ?? null,
                  'aktiv' => $aktiv > 0, 'blockiert' => $blockiert > 0 && $aktiv === 0];
  }
}

// Fremde Skript-Domains (ohne Bewertung, nur zur Transparenz)
function stamm($h) {
  $h = strtolower(rtrim($h, '.')); $t = explode('.', $h); $n = count($t);
  if ($n <= 2) return $h;
  $zwei = $t[$n - 2] . '.' . $t[$n - 1];
  if (preg_match('~^(co|com|org|net|gov|ac|or|ne|go)\.[a-z]{2}$~', $zwei)) return $t[$n - 3] . '.' . $zwei;
  return $zwei;
}
$fremd = []; $fremdSkript = [];
$eigen = stamm($seitenHost);
foreach ($stellen as $s) {
  if (!in_array($s['art'], ['script', 'iframe', 'link', 'img'], true) || !$s['aktiv'] || $s['src'] === '' || preg_match('~^(data|blob|javascript|mailto|tel):~i', $s['src'])) continue;
  $u = absolut($r['url'], $s['src']); $h = parse_url($u, PHP_URL_HOST);
  if ($h && stamm($h) !== $eigen) { $fremd[strtolower($h)] = true; if ($s['art'] === 'script' || $s['art'] === 'iframe') $fremdSkript[strtolower($h)] = true; }
}
$fremd = array_keys($fremd); sort($fremd);
$fremdSkript = array_keys($fremdSkript); sort($fremdSkript);

// Inline-Skripte, die selbst Cookies schreiben
$schreibtSelbst = false;
foreach ($stellen as $s) if ($s['art'] === 'script' && $s['aktiv'] && $s['src'] === '' && preg_match('~document\.cookie\s*=~', $s['t'])) { $schreibtSelbst = true; break; }

antwort(200, ['ok' => true] + $basis + [
  'cookies' => $cookies, 'geloescht' => count($geloescht), 'dienste' => $dienste,
  'fremde_domains' => array_slice($fremd, 0, 40), 'fremde_skripte' => array_slice($fremdSkript, 0, 40), 'schreibt_cookies_per_js' => $schreibtSelbst, 'zu_gross' => $r['zuGross'],
]);
