<?php
// condoo.io – Social Share Debugger: öffentliche Seite sicher abrufen und Vorschau-Daten (Open Graph) auslesen.
// Schutz: nur http/https, nur öffentliche IP-Adressen (auch nach jeder Weiterleitung), feste IP pro Abruf,
// Größen- und Zeitlimits, höchstens 5 Weiterleitungen, Anfragen pro IP begrenzt. Nichts wird gespeichert.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

const UA = 'Mozilla/5.0 (compatible; condooOS-ShareDebugger/1.0; +https://condoo.io/tools/share-debugger/)';
const MAX_HTML = 2097152;   // 2 MB
const MAX_IMG = 10485760;   // 10 MB
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
$sperre = sys_get_temp_dir() . '/condoo-share-' . sha1(($_SERVER['REMOTE_ADDR'] ?? '') . '|condoo') . '.json';
$zeiten = array_values(array_filter((array)json_decode(@file_get_contents($sperre) ?: '[]', true), function ($t) { return $t > time() - 3600; }));
if (count($zeiten) >= 30) fehler('limit', 'Du hast in kurzer Zeit sehr viele Prüfungen gestartet. Bitte warte ein paar Minuten.');
$zeiten[] = time(); @file_put_contents($sperre, json_encode($zeiten));

// ───────── Adresse prüfen ─────────
function oeffentlich($ip) {
  if (!filter_var($ip, FILTER_VALIDATE_IP)) return false;
  if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) return false;
  if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
    $n = ip2long($ip);
    foreach ([['100.64.0.0', 10], ['192.0.0.0', 24], ['192.0.2.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3]] as $r) {
      $m = -1 << (32 - $r[1]); if (($n & $m) === (ip2long($r[0]) & $m)) return false;
    }
  } else {
    $h = bin2hex(inet_pton($ip));
    if (strlen($h) !== 32) return false;
    $v4 = function ($hex) { return long2ip(hexdec($hex)); };
    if (substr($h, 0, 24) === '00000000000000000000ffff') return oeffentlich($v4(substr($h, 24, 8)));   // IPv4-mapped
    if (substr($h, 0, 24) === '0064ff9b0000000000000000') return oeffentlich($v4(substr($h, 24, 8)));   // NAT64
    if (substr($h, 0, 4) === '2002') return oeffentlich($v4(substr($h, 4, 8)));                          // 6to4
    if (substr($h, 0, 30) === str_repeat('0', 30)) return false;                                           // ::, ::1 u. a.
    if (preg_match('~^(fe[89ab]|fc|fd|ff)~', $h) || substr($h, 0, 8) === '20010db8') return false;          // link-local, ULA, Multicast, Doku
  }
  return true;
}
function zerlegen($url) {
  $p = parse_url($url);
  if (!$p || empty($p['scheme']) || empty($p['host'])) return ['err' => ['ungueltig', 'Diese Adresse ist ungültig.']];
  $s = strtolower($p['scheme']);
  if ($s !== 'http' && $s !== 'https') return ['err' => ['ungueltig', 'Es werden nur Adressen mit http:// oder https:// geprüft.']];
  if (isset($p['user']) || isset($p['pass'])) return ['err' => ['ungueltig', 'Die Adresse enthält Zugangsdaten. Bitte entferne sie.']];
  $port = isset($p['port']) ? (int)$p['port'] : ($s === 'https' ? 443 : 80);
  if (!in_array($port, [80, 443, 8080, 8443], true)) return ['err' => ['ungueltig', 'Diese Adresse nutzt einen ungewöhnlichen Port und wird nicht abgerufen.']];
  $host = strtolower(rtrim($p['host'], '.'));
  if (function_exists('idn_to_ascii') && preg_match('/[^\x20-\x7e]/', $host)) { $a = idn_to_ascii($host, IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46); if ($a) $host = $a; }
  $host = trim($host, '[]');
  if ($host === 'localhost' || preg_match('~\.(localhost|local|internal|lan|home\.arpa)$~', $host)) return ['err' => ['privat', 'Lokale Adressen können nicht geprüft werden.']];
  if (filter_var($host, FILTER_VALIDATE_IP)) $ips = [$host];
  else {
    if (!preg_match('~^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)+$~', $host)) return ['err' => ['ungueltig', 'Dieser Domainname ist ungültig.']];
    $ips = [];
    $rec = @dns_get_record($host, DNS_A | DNS_AAAA);
    if (is_array($rec)) foreach ($rec as $r) { if (!empty($r['ip'])) $ips[] = $r['ip']; if (!empty($r['ipv6'])) $ips[] = $r['ipv6']; }
    if (!$ips) { $g = @gethostbynamel($host); if ($g) $ips = $g; }
    if (!$ips) return ['err' => ['dns', 'Die Domain wurde im DNS nicht gefunden. Prüfe die Schreibweise.']];
  }
  foreach ($ips as $ip) if (!oeffentlich($ip)) return ['err' => ['privat', 'Diese Adresse zeigt auf ein internes oder reserviertes Netz und wird aus Sicherheitsgründen nicht abgerufen.']];
  $v4 = array_values(array_filter($ips, function ($i) { return filter_var($i, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4); }));
  return ['scheme' => $s, 'host' => $host, 'port' => $port, 'ip' => $v4 ? $v4[0] : $ips[0]];
}
function absolut($basis, $rel) {
  $rel = trim($rel);
  if ($rel === '') return '';
  if (preg_match('~^[a-z][a-z0-9+.-]*:~i', $rel)) return $rel;
  $b = parse_url($basis);
  $origin = $b['scheme'] . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
  if (substr($rel, 0, 2) === '//') return $b['scheme'] . ':' . $rel;
  if ($rel[0] === '/') return $origin . $rel;
  if ($rel[0] === '?') return $origin . ($b['path'] ?? '/') . $rel;
  if ($rel[0] === '#') return $basis;
  $dir = isset($b['path']) ? preg_replace('~/[^/]*$~', '/', $b['path']) : '/';
  $pfad = $dir . $rel; $teile = [];
  foreach (explode('/', $pfad) as $t) { if ($t === '..') array_pop($teile); elseif ($t !== '.') $teile[] = $t; }
  return $origin . implode('/', $teile);
}

// ───────── Abruf mit fester IP und eigener Weiterleitungs-Prüfung ─────────
function abrufen($url, $max, $accept) {
  $kette = [];
  for ($i = 0; $i <= MAX_REDIRECTS; $i++) {
    $z = zerlegen($url);
    if (isset($z['err'])) return ['err' => $z['err'], 'kette' => $kette, 'url' => $url];
    $body = ''; $zuGross = false; $kopf = [];
    $c = curl_init($url);
    $ipFuerResolve = strpos($z['ip'], ':') !== false ? '[' . $z['ip'] . ']' : $z['ip'];
    curl_setopt_array($c, [
      CURLOPT_RESOLVE => [$z['host'] . ':' . $z['port'] . ':' . $ipFuerResolve],
      CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 10,
      CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_ENCODING => '',
      CURLOPT_USERAGENT => UA, CURLOPT_HTTPHEADER => ['Accept: ' . $accept, 'Accept-Language: de-DE,de;q=0.9,en;q=0.6'],
      CURLOPT_HEADERFUNCTION => function ($ch, $zeile) use (&$kopf) { $t = explode(':', $zeile, 2); if (count($t) === 2) $kopf[strtolower(trim($t[0]))] = trim($t[1]); return strlen($zeile); },
      CURLOPT_WRITEFUNCTION => function ($ch, $teil) use (&$body, &$zuGross, $max) { $body .= $teil; if (strlen($body) > $max) { $zuGross = true; return 0; } return strlen($teil); },
    ]);
    $ok = curl_exec($c);
    $errno = curl_errno($c); $status = (int)curl_getinfo($c, CURLINFO_RESPONSE_CODE);
    if (!$ok && !$zuGross) {
      if ($errno === CURLE_OPERATION_TIMEDOUT) return ['err' => ['timeout', 'Die Website hat nicht rechtzeitig geantwortet (nach 10 Sekunden abgebrochen).'], 'kette' => $kette, 'url' => $url];
      if ($errno === 60 || $errno === 35 || $errno === 51 || $errno === 58) return ['err' => ['ssl', 'Die sichere Verbindung (SSL/TLS) konnte nicht aufgebaut werden. Prüfe das Zertifikat der Website.'], 'kette' => $kette, 'url' => $url];
      return ['err' => ['verbindung', 'Die Website war nicht erreichbar (keine Verbindung möglich).'], 'kette' => $kette, 'url' => $url];
    }
    if ($status >= 300 && $status < 400 && !empty($kopf['location'])) {
      $kette[] = ['url' => $url, 'status' => $status];
      $url = absolut($url, $kopf['location']);
      continue;
    }
    return ['url' => $url, 'status' => $status, 'kopf' => $kopf, 'body' => $body, 'zuGross' => $zuGross, 'kette' => $kette];
  }
  return ['err' => ['weiterleitungen', 'Die Adresse leitet mehr als ' . MAX_REDIRECTS . '-mal weiter. Prüfe, ob eine Weiterleitungsschleife besteht.'], 'kette' => $kette, 'url' => $url];
}

// ───────── Seite abrufen ─────────
$start = preg_match('~^[a-z][a-z0-9+.-]*://~i', $roh) ? $roh : 'https://' . $roh;
$start = preg_replace('~\s~', '%20', $start);
$r = abrufen($start, MAX_HTML, 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5');
$basis = ['eingabe' => $roh, 'start_url' => $start, 'weiterleitungen' => $r['kette'] ?? [], 'zeitpunkt' => gmdate('c')];
if (isset($r['err'])) fehler($r['err'][0], $r['err'][1], $basis + ['ziel_url' => $r['url']]);
$basis['ziel_url'] = $r['url']; $basis['status'] = $r['status'];
$ct = strtolower($r['kopf']['content-type'] ?? '');
$basis['content_type'] = $ct;
if ($r['status'] >= 400) {
  $t = $r['status'] === 403 || $r['status'] === 401 ? 'Die Website hat den Abruf blockiert (HTTP ' . $r['status'] . '). Manche Server sperren automatische Abrufe – Plattformen wie Facebook können trotzdem Zugriff haben.'
     : ($r['status'] === 404 ? 'Die Seite wurde nicht gefunden (HTTP 404). Prüfe die Adresse.' : ($r['status'] === 429 ? 'Die Website meldet zu viele Anfragen (HTTP 429). Versuch es später erneut.' : 'Die Website antwortete mit einem Fehler (HTTP ' . $r['status'] . ').'));
  fehler('http', $t, $basis);
}
if ($ct !== '' && strpos($ct, 'html') === false) fehler('kein_html', 'Unter dieser Adresse liegt keine Webseite, sondern eine Datei vom Typ „' . explode(';', $ct)[0] . '“.', $basis);

// ───────── Metadaten auslesen ─────────
$html = $r['body'];
if (!preg_match('~charset=([\w-]+)~i', $ct, $cs)) preg_match('~<meta[^>]+charset=["\']?([\w-]+)~i', substr($html, 0, 4096), $cs);
$charset = strtoupper($cs[1] ?? 'UTF-8');
if ($charset !== 'UTF-8' && function_exists('mb_convert_encoding')) $html = @mb_convert_encoding($html, 'UTF-8', $charset) ?: $html;
$dom = new DOMDocument();
libxml_use_internal_errors(true);
@$dom->loadHTML('<?xml encoding="UTF-8">' . $html, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
libxml_clear_errors();
$meta = [];
foreach ($dom->getElementsByTagName('meta') as $m) {
  $k = strtolower(trim($m->getAttribute('property') ?: $m->getAttribute('name')));
  if ($k === '' || !$m->hasAttribute('content')) continue;
  if (!isset($meta[$k])) $meta[$k] = trim(preg_replace('~\s+~u', ' ', $m->getAttribute('content')));
}
$titel = '';
$tl = $dom->getElementsByTagName('title');
if ($tl->length) $titel = trim(preg_replace('~\s+~u', ' ', $tl->item(0)->textContent));
$canonical = '';
foreach ($dom->getElementsByTagName('link') as $l) if (strtolower($l->getAttribute('rel')) === 'canonical') { $canonical = absolut($r['url'], $l->getAttribute('href')); break; }
$wahl = function ($felder) use ($meta) { foreach ($felder as $f => $q) if (isset($meta[$f]) && $meta[$f] !== '') return ['wert' => $meta[$f], 'quelle' => $q]; return null; };
$daten = [
  'titel' => $wahl(['og:title' => 'og:title', 'twitter:title' => 'twitter:title']) ?: ($titel !== '' ? ['wert' => $titel, 'quelle' => '<title>'] : null),
  'beschreibung' => $wahl(['og:description' => 'og:description', 'twitter:description' => 'twitter:description', 'description' => 'meta description']),
  'bild' => $wahl(['og:image' => 'og:image', 'og:image:url' => 'og:image:url', 'og:image:secure_url' => 'og:image:secure_url', 'twitter:image' => 'twitter:image', 'twitter:image:src' => 'twitter:image:src']),
  'og_url' => $wahl(['og:url' => 'og:url']),
  'seitenname' => $wahl(['og:site_name' => 'og:site_name']),
  'typ' => $wahl(['og:type' => 'og:type']),
  'bild_alt' => $wahl(['og:image:alt' => 'og:image:alt', 'twitter:image:alt' => 'twitter:image:alt']),
  'bild_breite_angabe' => $meta['og:image:width'] ?? null, 'bild_hoehe_angabe' => $meta['og:image:height'] ?? null,
  'twitter_card' => $meta['twitter:card'] ?? null, 'canonical' => $canonical ?: null,
];
if ($daten['bild']) { $daten['bild']['roh'] = $daten['bild']['wert']; $daten['bild']['wert'] = absolut($r['url'], $daten['bild']['wert']); }
if ($daten['og_url']) $daten['og_url']['wert'] = absolut($r['url'], $daten['og_url']['wert']);
$basis['zu_gross'] = $r['zuGross'];

// ───────── Vorschaubild prüfen ─────────
$bild = null;
if ($daten['bild']) {
  $u = $daten['bild']['wert'];
  $bild = ['url' => $u];
  if (!preg_match('~^https?://~i', $u)) { $bild['ok'] = false; $bild['fehler'] = 'ungueltig'; $bild['text'] = 'Die Bildadresse ist keine gültige http(s)-Adresse.'; }
  else {
    $b = abrufen($u, MAX_IMG, 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8');
    $bild['weiterleitungen'] = $b['kette'] ?? [];
    if (isset($b['err'])) { $bild['ok'] = false; $bild['fehler'] = $b['err'][0]; $bild['text'] = $b['err'][1]; }
    else {
      $bild['status'] = $b['status']; $bild['ziel_url'] = $b['url'];
      $bct = strtolower(explode(';', $b['kopf']['content-type'] ?? '')[0]);
      $bild['content_type'] = $bct;
      $bild['bytes'] = $b['zuGross'] ? null : strlen($b['body']);
      if (isset($b['kopf']['content-length'])) $bild['bytes_angabe'] = (int)$b['kopf']['content-length'];
      $bild['zu_gross'] = $b['zuGross'];
      if ($b['status'] >= 400) { $bild['ok'] = false; $bild['fehler'] = 'http'; $bild['text'] = 'Das Bild ist nicht erreichbar (HTTP ' . $b['status'] . ').'; }
      else {
        $info = $b['zuGross'] ? false : @getimagesizefromstring($b['body']);
        if ($info) { $bild['breite'] = $info[0]; $bild['hoehe'] = $info[1]; $bild['format'] = $info['mime']; $bild['ok'] = true; }
        elseif ($bct === 'image/svg+xml' || stripos(substr($b['body'], 0, 500), '<svg') !== false) { $bild['ok'] = true; $bild['format'] = 'image/svg+xml'; }
        elseif ($b['zuGross']) { $bild['ok'] = true; $bild['format'] = $bct ?: null; }
        else { $bild['ok'] = false; $bild['fehler'] = 'kein_bild'; $bild['text'] = 'Unter der Bildadresse liegt keine lesbare Bilddatei' . ($bct ? ' (sondern „' . $bct . '“)' : '') . '.'; }
      }
    }
  }
}
antwort(200, ['ok' => true] + $basis + ['daten' => $daten, 'bild' => $bild]);
