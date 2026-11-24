"""Kopf (Menü) und Fuß aus entwurf/index.html in alle Entwurfs-Unterseiten übernehmen.
Aufruf:  python3 entwurf/_teile_sync.py   (aus dem Ordner condoo-io-website)"""
import pathlib, re
root = pathlib.Path(__file__).parent
master = (root / "index.html").read_text()
parts = {k: re.search(rf"<!--#{k}-->.*?<!--/{k}-->", master, re.S).group(0) for k in ("kopf", "fuss")}
for page in root.glob("*/index.html"):
    s = page.read_text()
    for k, block in parts.items():
        s = re.sub(rf"<!--#{k}-->.*?<!--/{k}-->", lambda m: block, s, flags=re.S)
    page.write_text(s)
    print("aktualisiert:", page.relative_to(root.parent))
