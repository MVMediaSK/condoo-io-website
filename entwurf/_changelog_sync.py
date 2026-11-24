#!/usr/bin/env python3
"""Changelog-Daten aus dem Artifact ("condooOS Neuigkeiten") in die Website übernehmen.

Aufruf (im Ordner condoo-io-website):
    python3 entwurf/_changelog_sync.py <pfad/zur/artifact.html>

Liest aus der Artifact-HTML das JSON in <script id="cl-data"> sowie UPDATED / ORIG_TOTAL / ORIG_COVERED
und schreibt sie in jede Changelog-Seite der Website (Entwurf und – nach dem Live-Gang – /changelog/).
Design und Skripte der Seite bleiben unverändert.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIELE = ['entwurf/changelog/index.html', 'changelog/index.html']

def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    html = open(sys.argv[1], encoding='utf-8').read()
    m = re.search(r'<script id="cl-data" type="application/json">(.*?)</script>', html, re.S)
    if not m:
        sys.exit('Kein cl-data im Artifact gefunden.')
    data = json.loads(m.group(1).replace('<\\/', '</'))
    if not isinstance(data, list) or not data or not all('d' in x and 's' in x for x in data):
        sys.exit('cl-data hat nicht die erwartete Form.')
    def var(name, kind):
        v = re.search(r'var\s+' + name + r'\s*=\s*(".*?"|\d+)', html)
        if not v:
            return None
        return v.group(1).strip('"') if kind == str else int(v.group(1))
    meta = {'updated': var('UPDATED', str), 'total': var('ORIG_TOTAL', int), 'covered': var('ORIG_COVERED', int)}
    dump = lambda o: json.dumps(o, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    block = ('<!--#cl-daten: wird von entwurf/_changelog_sync.py ersetzt -->\n'
             '<script id="cl-meta" type="application/json">' + dump(meta) + '</script>\n'
             '<script id="cl-data" type="application/json">' + dump(data) + '</script>\n'
             '<!--/cl-daten-->')
    n = 0
    for rel in ZIELE:
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p):
            continue
        s = open(p, encoding='utf-8').read()
        neu, k = re.subn(r'<!--#cl-daten.*?<!--/cl-daten-->', lambda _: block, s, flags=re.S)
        if k != 1:
            sys.exit('Marker <!--#cl-daten--> fehlt in ' + rel)
        if neu != s:
            open(p, 'w', encoding='utf-8').write(neu)
        n += 1
        print('aktualisiert:', rel)
    print(f'{len(data)} Tage, neuester {data[0]["d"]}, Stand {meta["updated"]} → {n} Seite(n)')

if __name__ == '__main__':
    main()
