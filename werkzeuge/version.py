#!/usr/bin/env python3
"""Versions-Kennung (?v=…) an alle eigenen CSS/JS-Dateien hängen – vor jedem Push ausführen.
Aufruf:  python3 werkzeuge/version.py   (aus dem Ordner condoo-io-website)
Ändert sich eine Datei, ändert sich die Kennung → Browser laden sie trotz langem Caching neu."""
import hashlib, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
cache = {}
def ver(path):
    f = ROOT / path.lstrip('/')
    if not f.is_file():
        return None
    if path not in cache:
        cache[path] = hashlib.md5(f.read_bytes()).hexdigest()[:8]
    return cache[path]
def fix(m):
    attr, path = m.group(1), m.group(2)
    v = ver(path)
    return f'{attr}="{path}?v={v}"' if v else m.group(0)
for page in sorted(ROOT.glob('**/*.html')):
    if '.git' in page.parts or page.name.startswith('._'):
        continue
    t = page.read_text(encoding='utf-8')
    neu = re.sub(r'(href|src)="(/[^"?#]+\.(?:css|js))(?:\?v=[0-9a-f]+)?"', fix, t)
    if neu != t:
        page.write_text(neu, encoding='utf-8')
        print('Version:', page.relative_to(ROOT))
