<?php
// condoo.io – Kontaktformular → condooOS-CRM (Inbound-Webhook)
// Die Webhook-Adresse steht NICHT im (öffentlichen) Repo, sondern auf dem Server:
//   Datei  <Domain-Ordner>/private/kontakt-webhook.txt  (eine Zeile, die https://…-Adresse)
//   – also neben httpdocs, nicht darin. Alternativ Umgebungsvariable CONDOO_KONTAKT_WEBHOOK.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

function antwort($code, $daten) { http_response_code($code); echo json_encode($daten, JSON_UNESCAPED_UNICODE); exit; }

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') antwort(405, ['ok' => false, 'fehler' => 'methode']);
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && !preg_match('~^https://(www\.)?condoo\.io$~', $origin)) antwort(403, ['ok' => false, 'fehler' => 'herkunft']);

$d = json_decode(file_get_contents('php://input', false, null, 0, 20000), true);
if (!is_array($d)) antwort(400, ['ok' => false, 'fehler' => 'daten']);

// Spam-Schutz: verstecktes Feld ausgefüllt oder zu schnell abgeschickt → still verwerfen
if (!empty($d['website']) || (int)($d['dauer'] ?? 0) < 3000) antwort(200, ['ok' => true]);

$feld = function ($k, $max) use ($d) {
  $v = isset($d[$k]) && is_string($d[$k]) ? trim(strip_tags($d[$k])) : '';
  return function_exists('mb_substr') ? mb_substr($v, 0, $max) : substr($v, 0, $max);
};
$THEMEN = ['frage' => 'Frage zu condooOS', 'umzug' => 'Kostenloser Umzugs-Call', 'reseller' => 'Reseller', 'whitelabel' => 'Whitelabel',
           'accounts' => 'Weitere Complete-Accounts', 'avv' => 'Datenschutz & AVV', 'support' => 'Hilfe zu meinem Account', 'sonstiges' => 'Sonstiges'];
$thema = $feld('thema', 20);
$e = [
  'first_name' => $feld('vorname', 80), 'last_name' => $feld('nachname', 80), 'email' => $feld('email', 160),
  'phone' => $feld('telefon', 40), 'company_name' => $feld('firma', 120),
  'thema' => $THEMEN[$thema] ?? 'Sonstiges', 'thema_key' => isset($THEMEN[$thema]) ? $thema : 'sonstiges',
  'software' => $thema === 'umzug' ? $feld('software', 30) : '', 'nachricht' => $feld('nachricht', 4000),
  'quelle' => 'condoo.io Kontaktformular', 'seite' => $feld('seite', 200), 'zeitpunkt' => gmdate('c'),
];
if ($e['first_name'] === '' || $e['nachricht'] === '' || !filter_var($e['email'], FILTER_VALIDATE_EMAIL)) antwort(422, ['ok' => false, 'fehler' => 'pflichtfelder']);

// Höchstens 5 Nachrichten pro Stunde und Absender-IP
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$sperre = sys_get_temp_dir() . '/condoo-kontakt-' . sha1($ip . '|condoo') . '.json';
$zeiten = array_filter((array)json_decode(@file_get_contents($sperre) ?: '[]', true), function ($t) { return $t > time() - 3600; });
if (count($zeiten) >= 5) antwort(429, ['ok' => false, 'fehler' => 'zu-viele']);

$url = getenv('CONDOO_KONTAKT_WEBHOOK') ?: '';
if ($url === '') {
  foreach ([dirname($_SERVER['DOCUMENT_ROOT'] ?? __DIR__) . '/private/kontakt-webhook.txt', dirname(__DIR__, 2) . '/private/kontakt-webhook.txt'] as $datei) {
    if (is_readable($datei)) { $url = trim(file_get_contents($datei)); break; }
  }
}
if (!preg_match('~^https://~', $url)) antwort(503, ['ok' => false, 'fehler' => 'nicht-eingerichtet']);

$body = json_encode($e, JSON_UNESCAPED_UNICODE);
$code = 0;
if (function_exists('curl_init')) {
  $c = curl_init($url);
  curl_setopt_array($c, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
                         CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_CONNECTTIMEOUT => 6]);
  curl_exec($c); $code = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
} else {
  $ctx = stream_context_create(['http' => ['method' => 'POST', 'header' => "Content-Type: application/json\r\n", 'content' => $body, 'timeout' => 12]]);
  $code = @file_get_contents($url, false, $ctx) === false ? 0 : 200;
}
if ($code < 200 || $code >= 300) antwort(502, ['ok' => false, 'fehler' => 'crm']);

$zeiten[] = time();
@file_put_contents($sperre, json_encode(array_values($zeiten)));
antwort(200, ['ok' => true]);
