"""Kopf (Menü) und Fuß aus index.html (Startseite) in alle Unterseiten übernehmen.
Aufruf:  python3 werkzeuge/teile_sync.py   (aus dem Ordner condoo-io-website)
Betroffen sind nur Seiten mit den Markern <!--#kopf-->…<!--/kopf--> und <!--#fuss-->…<!--/fuss-->."""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
master = (root / "index.html").read_text()
parts = {k: re.search(rf"<!--#{k}-->.*?<!--/{k}-->", master, re.S).group(0) for k in ("kopf", "fuss")}
for page in sorted(root.glob("*/index.html")):
    s = page.read_text()
    if "<!--#kopf-->" not in s:
        continue
    neu = s
    for k, block in parts.items():
        neu = re.sub(rf"<!--#{k}-->.*?<!--/{k}-->", lambda m: block, neu, flags=re.S)
    if neu != s:
        page.write_text(neu)
        print("aktualisiert:", page.relative_to(root))
