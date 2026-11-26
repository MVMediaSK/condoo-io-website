<?php
// condoo.io – Onboarding-Call buchen → condooOS-Kalender (öffentliche Buchungs-Schnittstelle)
// Kein API-Key nötig: genutzt werden nur die öffentlichen Kalender-Endpunkte von condooOS.
//   GET  ?aktion=monat&von=YYYY-MM-DD&bis=YYYY-MM-DD  → freie Termine pro Tag
//   GET  ?aktion=tag&datum=YYYY-MM-DD                 → freie Uhrzeiten an einem Tag
//   POST {zeit, datum, vorname, nachname, email, telefon, firma, notiz}  → Termin buchen
// Hinweis: condooOS liefert Uhrzeiten als Ortszeit des Kalenders (Europe/Bratislava = deutsche Zeit),
// auch wenn sie mit „Z“ gekennzeichnet sind.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

const KONTO    = 'b1b667a7-4198-42b3-b627-1dff16dc49fc';
const KALENDER = '01a21950-3834-7829-bc12-11e0c222722d';
const DIENST   = '01a2194f-fd4b-7175-a300-b6f0501284ba';
const API      = 'https://api-eu.condoo.io/api/v1/public/calendar/';
const ZONE     = 'Europe/Bratislava';

function antwort($code, $daten) { http_response_code($code); echo json_encode($daten, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES); exit; }

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && !preg_match('~^https://(www\.)?condoo\.io$~', $origin) && !preg_match('~^http://(localhost|127\.0\.0\.1):\d+$~', $origin)) antwort(403, ['ok' => false, 'fehler' => 'herkunft']);

function condoo($pfad, $query = [], $post = null) {
  $query['account_id'] = KONTO;
  $url = API . KALENDER . $pfad . '?' . http_build_query($query);
  $c = curl_init($url);
  $opt = [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 6,
          CURLOPT_HTTPHEADER => ['Accept: application/json', 'Content-Type: application/json', 'Origin: https://condoo.io']];
  if ($post !== null) { $opt[CURLOPT_POST] = true; $opt[CURLOPT_POSTFIELDS] = json_encode($post, JSON_UNESCAPED_UNICODE); }
  curl_setopt_array($c, $opt);
  $roh = curl_exec($c);
  $code = (int)curl_getinfo($c, CURLINFO_HTTP_CODE);
  return [$code, is_string($roh) ? json_decode($roh, true) : null, is_string($roh) ? $roh : ''];
}
function datum_ok($d) { return is_string($d) && preg_match('~^\d{4}-\d{2}-\d{2}$~', $d) && checkdate((int)substr($d, 5, 2), (int)substr($d, 8, 2), (int)substr($d, 0, 4)); }
function freie_zeiten($datum) {
  [$code, $j] = condoo('/availability', ['date' => $datum, 'service_id' => DIENST]);
  if ($code !== 200 || !is_array($j)) return null;
  $raus = [];
  foreach ((array)($j['slots'] ?? []) as $s) {
    if (empty($s['available']) || !isset($s['time'], $s['utc_start'], $s['utc_end'])) continue;
    if (($s['date'] ?? $datum) !== $datum) continue;
    $raus[] = ['zeit' => $s['time'], 'start' => $s['utc_start'], 'ende' => $s['utc_end']];
  }
  return $raus;
}

$methode = $_SERVER['REQUEST_METHOD'] ?? '';

if ($methode === 'GET') {
  $aktion = $_GET['aktion'] ?? '';
  if ($aktion === 'monat') {
    $von = $_GET['von'] ?? ''; $bis = $_GET['bis'] ?? '';
    if (!datum_ok($von) || !datum_ok($bis) || $bis < $von) antwort(400, ['ok' => false, 'fehler' => 'datum']);
    if ((strtotime($bis) - strtotime($von)) > 45 * 86400) antwort(400, ['ok' => false, 'fehler' => 'zeitraum']);
    [$code, $j] = condoo('/availability', ['start' => $von, 'end' => $bis, 'mode' => 'month', 'service_id' => DIENST]);
    if ($code !== 200 || !is_array($j)) antwort(502, ['ok' => false, 'fehler' => 'kalender']);
    $tage = [];
    foreach ((array)($j['dates'] ?? []) as $d => $n) if (datum_ok($d)) $tage[$d] = (int)$n;
    antwort(200, ['ok' => true, 'tage' => $tage]);
  }
  if ($aktion === 'tag') {
    $datum = $_GET['datum'] ?? '';
    if (!datum_ok($datum)) antwort(400, ['ok' => false, 'fehler' => 'datum']);
    $z = freie_zeiten($datum);
    if ($z === null) antwort(502, ['ok' => false, 'fehler' => 'kalender']);
    antwort(200, ['ok' => true, 'zeiten' => array_map(function ($s) { return $s['zeit']; }, $z)]);
  }
  antwort(400, ['ok' => false, 'fehler' => 'aktion']);
}

if ($methode !== 'POST') antwort(405, ['ok' => false, 'fehler' => 'methode']);

$d = json_decode(file_get_contents('php://input', false, null, 0, 20000), true);
if (!is_array($d)) antwort(400, ['ok' => false, 'fehler' => 'daten']);
// Spam-Schutz: verstecktes Feld ausgefüllt oder zu schnell abgeschickt
if (!empty($d['website']) || (int)($d['dauer'] ?? 0) < 3000) antwort(400, ['ok' => false, 'fehler' => 'daten']);

$feld = function ($k, $max) use ($d) {
  $v = isset($d[$k]) && is_string($d[$k]) ? trim(strip_tags($d[$k])) : '';
  return function_exists('mb_substr') ? mb_substr($v, 0, $max) : substr($v, 0, $max);
};
$datum = $feld('datum', 10); $zeit = $feld('zeit', 5);
$vorname = $feld('vorname', 80); $nachname = $feld('nachname', 80); $email = $feld('email', 160);
$telefon = $feld('telefon', 40); $firma = $feld('firma', 120); $notiz = $feld('notiz', 2000);
if (!datum_ok($datum) || !preg_match('~^\d{2}:\d{2}$~', $zeit)) antwort(422, ['ok' => false, 'fehler' => 'termin']);
$ziffern = preg_replace('~\D~', '', $telefon);
if ($vorname === '' || $nachname === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)
    || strlen($ziffern) < 6 || !preg_match('~^[\d\s+()/.-]+$~', $telefon)) antwort(422, ['ok' => false, 'fehler' => 'pflichtfelder']);

// Höchstens 5 Buchungsversuche pro Stunde und IP
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$sperre = sys_get_temp_dir() . '/condoo-termin-' . sha1($ip . '|condoo') . '.json';
$zeiten = array_filter((array)json_decode(@file_get_contents($sperre) ?: '[]', true), function ($t) { return $t > time() - 3600; });
if (count($zeiten) >= 5) antwort(429, ['ok' => false, 'fehler' => 'zu-viele']);
$zeiten[] = time();
@file_put_contents($sperre, json_encode(array_values($zeiten)), LOCK_EX);

// Nur buchen, was condooOS gerade wirklich als frei meldet
$frei = freie_zeiten($datum);
if ($frei === null) antwort(502, ['ok' => false, 'fehler' => 'kalender']);
$slot = null;
foreach ($frei as $s) if ($s['zeit'] === $zeit) { $slot = $s; break; }
if (!$slot) antwort(409, ['ok' => false, 'fehler' => 'vergeben']);

$hinweis = trim(($firma !== '' ? "Firma: $firma\n" : '') . ($notiz !== '' ? "Notiz: $notiz\n" : '') . 'Gebucht über condoo.io/onboarding-call/');
[$code, $j, $roh] = condoo('/book', [], [
  'service_id' => DIENST, 'start_time' => $slot['start'], 'end_time' => $slot['ende'], 'booking_mode' => 'slot',
  'first_name' => $vorname, 'last_name' => $nachname, 'email' => $email, 'phone' => $telefon,
  'notes' => $hinweis, 'quantity' => 1, 'series' => false, 'series_count' => 1,
]);
if ($code === 409 || ($code >= 400 && stripos($roh, 'avail') !== false)) antwort(409, ['ok' => false, 'fehler' => 'vergeben']);
if ($code !== 200 || !is_array($j) || empty($j['booking_id'])) antwort(502, ['ok' => false, 'fehler' => 'buchung']);

// Kalender-Links selbst bauen (Ortszeit → UTC)
$tz = new DateTimeZone(ZONE);
$start = new DateTime($datum . ' ' . $zeit, $tz);
$ende = new DateTime(substr($slot['ende'], 0, 10) . ' ' . substr($slot['ende'], 11, 5), $tz);
$utc = function ($dt) { $k = clone $dt; $k->setTimezone(new DateTimeZone('UTC')); return $k; };
$titel = 'Onboarding-Call condooOS mit Marco';
$text = "Dein persönlicher Onboarding-Call für condooOS.\nBitte halte Deinen Login bereit und sei am Computer.";
$google = 'https://calendar.google.com/calendar/render?' . http_build_query([
  'action' => 'TEMPLATE', 'text' => $titel, 'details' => $text,
  'dates' => $utc($start)->format('Ymd\THis\Z') . '/' . $utc($ende)->format('Ymd\THis\Z')]);
$outlook = 'https://outlook.live.com/calendar/0/deeplink/compose?' . http_build_query([
  'subject' => $titel, 'body' => $text, 'startdt' => $utc($start)->format('Y-m-d\TH:i:s\Z'), 'enddt' => $utc($ende)->format('Y-m-d\TH:i:s\Z')]);
$ics = (string)($j['add_to_calendar']['ics'] ?? '');
if (!preg_match('~^https://api-eu\.condoo\.io/~', $ics)) $ics = '';

antwort(200, ['ok' => true, 'datum' => $datum, 'zeit' => $zeit, 'bis' => $ende->format('H:i'),
              'google' => $google, 'outlook' => $outlook, 'ics' => $ics, 'meeting' => (string)($j['meeting_url'] ?? '')]);
