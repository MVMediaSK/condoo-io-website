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

require __DIR__ . '/_abruf.php';

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
