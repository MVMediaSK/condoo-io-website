"""Übernimmt Seiten im alten Design (Rechtstexte, Kaufseiten) 1:1 in den Entwurf
und tauscht NUR Menü, Fußzeile, das alte Menü-Skript und interne Links aus.
Aufruf (im Ordner condoo-io-website):  python3 entwurf/_altseiten_uebernehmen.py impressum datenschutz ..."""
import pathlib, re, sys
root = pathlib.Path(__file__).resolve().parent.parent
ent = root / "entwurf"
# Seiten, die es schon im neuen Design gibt (Links dorthin umbiegen)
neu = {p.parent.name for p in ent.glob("*/index.html")} | set(sys.argv[1:])
def link(m):
    attr, path, rest = m.group(1), m.group(2), m.group(3) or ""
    seg = path.strip("/").split("/")[0]
    if path == "/": return f'{attr}="/entwurf/{rest}"'
    if seg in neu:
        return f'{attr}="/entwurf/{path.strip("/")}/{rest}"'
    return m.group(0)
for name in sys.argv[1:]:
    src = (root / name / "index.html").read_text()
    s = src
    s, n1 = re.subn(r'<header class="header".*?</header>', '<!--#kopf--><!--/kopf-->', s, count=1, flags=re.S)
    s, n2 = re.subn(r'<footer class="footer".*?</footer>', '<!--#fuss--><!--/fuss-->', s, count=1, flags=re.S)
    assert n1 == 1 and n2 == 1, (name, n1, n2)
    s = s.replace('<script src="/app.js" defer></script>', '<script src="/entwurf/legal-icons.js" defer></script><script src="/entwurf/entwurf.js" defer></script>')
    s = s.replace('</head>', '<link rel="stylesheet" href="/entwurf/kopf-fuss.css">\n' + ('' if 'name="robots"' in s else '<meta name="robots" content="noindex,nofollow"><!--entwurf-noindex-->\n') + '</head>', 1)
    s = re.sub(r'(href)="(/[a-z0-9\-/]*)(#[^"]*)?"', link, s)
    out = ent / name / "index.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(s)
    # Kontrolle: Inhalt zwischen <main> und </main> ohne Links muss gleich sein
    strip = lambda t: re.sub(r'href="[^"]*"', '', t.split('<main', 1)[1].split('</main>')[0])
    print(f"{name:22} übernommen · Text in <main> unverändert: {strip(src) == strip(s)}")
