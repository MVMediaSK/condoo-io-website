<?php
// condoo.io Tools – gemeinsamer, abgesicherter Abruf öffentlicher Webseiten (Share Debugger, Cookie Check).
// Schutz: nur http/https, nur öffentliche IP-Adressen (auch nach jeder Weiterleitung), feste IP pro Abruf,
// Größen- und Zeitlimits, höchstens MAX_REDIRECTS Weiterleitungen.
if (realpath(__FILE__) === realpath($_SERVER['SCRIPT_FILENAME'] ?? '')) { http_response_code(404); exit; }
if (!defined('MAX_REDIRECTS')) define('MAX_REDIRECTS', 5);

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
function abrufen($url, $max, $accept, $ua = UA) {
  $kette = [];
  for ($i = 0; $i <= MAX_REDIRECTS; $i++) {
    $z = zerlegen($url);
    if (isset($z['err'])) return ['err' => $z['err'], 'kette' => $kette, 'url' => $url];
    $body = ''; $zuGross = false; $kopf = []; $cookies = [];
    $c = curl_init($url);
    $ipFuerResolve = strpos($z['ip'], ':') !== false ? '[' . $z['ip'] . ']' : $z['ip'];
    curl_setopt_array($c, [
      CURLOPT_RESOLVE => [$z['host'] . ':' . $z['port'] . ':' . $ipFuerResolve],
      CURLOPT_FOLLOWLOCATION => false, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 10,
      CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS, CURLOPT_ENCODING => '',
      CURLOPT_USERAGENT => $ua, CURLOPT_HTTPHEADER => ['Accept: ' . $accept, 'Accept-Language: de-DE,de;q=0.9,en;q=0.6'],
      CURLOPT_HEADERFUNCTION => function ($ch, $zeile) use (&$kopf, &$cookies) { $t = explode(':', $zeile, 2); if (count($t) === 2) { $n = strtolower(trim($t[0])); $kopf[$n] = trim($t[1]); if ($n === 'set-cookie') $cookies[] = trim($t[1]); } return strlen($zeile); },
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
      $kette[] = ['url' => $url, 'status' => $status, 'cookies' => $cookies];
      $url = absolut($url, $kopf['location']);
      continue;
    }
    return ['url' => $url, 'status' => $status, 'kopf' => $kopf, 'cookies' => $cookies, 'body' => $body, 'zuGross' => $zuGross, 'kette' => $kette];
  }
  return ['err' => ['weiterleitungen', 'Die Adresse leitet mehr als ' . MAX_REDIRECTS . '-mal weiter. Prüfe, ob eine Weiterleitungsschleife besteht.'], 'kette' => $kette, 'url' => $url];
}

