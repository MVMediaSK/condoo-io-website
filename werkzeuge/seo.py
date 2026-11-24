#!/usr/bin/env python3
"""SEO-Kopfangaben für alle indexierbaren Seiten setzen (idempotent).
Aufruf:  python3 werkzeuge/seo.py   (aus dem Ordner condoo-io-website)

Schreibt zwischen <!--#seo--> und <!--/seo--> im <head>:
canonical, Open Graph, Twitter Card und strukturierte Daten (JSON-LD).
Titel und Beschreibung kommen aus <title> und <meta name="description"> der Seite.
Das Teilen-Bild wird nur eingetragen, wenn /assets/og/condooos-share.jpg existiert.
Seiten mit noindex werden übersprungen."""
import html, json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = 'https://condoo.io'
OG_IMG = ROOT / 'assets/og/condooos-share.jpg'

ORG = {
    '@type': 'Organization', '@id': BASE + '/#org', 'name': 'condoo Systems OOD', 'brand': {'@type': 'Brand', 'name': 'condooOS'},
    'url': BASE + '/', 'logo': BASE + '/assets/icons/icon-512.png', 'email': 'kontakt@condoo.systems', 'vatID': 'BG207078733',
    'address': {'@type': 'PostalAddress', 'streetAddress': 'Rilski Manastir 68', 'postalCode': '9022', 'addressLocality': 'Varna', 'addressCountry': 'BG'},
}
APP = {
    '@type': 'SoftwareApplication', '@id': BASE + '/#app', 'name': 'condooOS', 'applicationCategory': 'BusinessApplication',
    'operatingSystem': 'Web', 'url': BASE + '/', 'publisher': {'@id': BASE + '/#org'}, 'inLanguage': 'de',
    'description': 'All-in-One-Plattform für Europa: Websites, Funnels, CRM, Kommunikation, Automationen, Kalender, Kurse und KI in einem System. Server in Frankfurt.',
    'offers': {'@type': 'Offer', 'price': '97.00', 'priceCurrency': 'EUR', 'url': BASE + '/preise/', 'availability': 'https://schema.org/InStock',
               'priceSpecification': {'@type': 'UnitPriceSpecification', 'price': '97.00', 'priceCurrency': 'EUR', 'valueAddedTaxIncluded': False, 'unitText': 'Monat'}},
}

def text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()

def faq(t):
    items = []
    for q, a in re.findall(r'<details[^>]*>\s*<summary[^>]*>(.*?)</summary>(.*?)</details>', t, re.S):
        q, a = text(q), text(a)
        if q and a:
            items.append({'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}})
    return items

def build(page, t):
    rel = page.parent.relative_to(ROOT).as_posix()
    url = BASE + '/' + ('' if rel == '.' else rel + '/')
    title = text(re.search(r'<title>(.*?)</title>', t, re.S).group(1))
    desc = html.unescape(re.search(r'<meta name="description" content="([^"]*)"', t).group(1))
    e = lambda s: html.escape(s, quote=True)
    tags = [f'<link rel="canonical" href="{url}">',
            '<meta property="og:type" content="website">', '<meta property="og:site_name" content="condooOS">',
            '<meta property="og:locale" content="de_DE">', f'<meta property="og:url" content="{url}">',
            f'<meta property="og:title" content="{e(title)}">', f'<meta property="og:description" content="{e(desc)}">',
            '<meta name="twitter:card" content="summary_large_image">', f'<meta name="twitter:title" content="{e(title)}">',
            f'<meta name="twitter:description" content="{e(desc)}">']
    if OG_IMG.exists():
        img = BASE + '/assets/og/condooos-share.jpg'
        tags += [f'<meta property="og:image" content="{img}">', '<meta property="og:image:width" content="1200">',
                 '<meta property="og:image:height" content="630">', '<meta property="og:image:alt" content="condooOS – Die All-in-One für Europa">',
                 f'<meta name="twitter:image" content="{img}">']
    graph = [ORG]
    if rel == '.':
        graph += [{'@type': 'WebSite', '@id': BASE + '/#web', 'url': BASE + '/', 'name': 'condooOS', 'inLanguage': 'de', 'publisher': {'@id': BASE + '/#org'}}, APP]
    else:
        graph.append({'@type': 'WebPage', '@id': url, 'url': url, 'name': title, 'description': desc, 'inLanguage': 'de', 'isPartOf': {'@id': BASE + '/#web'},
                      'breadcrumb': {'@type': 'BreadcrumbList', 'itemListElement': [
                          {'@type': 'ListItem', 'position': 1, 'name': 'condooOS', 'item': BASE + '/'},
                          {'@type': 'ListItem', 'position': 2, 'name': title.split(' – ')[0].split(' · ')[0], 'item': url}]}})
        if rel in ('preise', 'features'):
            graph.append(APP)
    q = faq(t)
    if q:
        graph.append({'@type': 'FAQPage', '@id': url + '#faq', 'mainEntity': q})
    ld = json.dumps({'@context': 'https://schema.org', '@graph': graph}, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    return '<!--#seo-->\n' + '\n'.join(tags) + f'\n<script type="application/ld+json">{ld}</script>\n<!--/seo-->'

for page in sorted(ROOT.glob('**/index.html')):
    if '.git' in page.parts or page.name.startswith('._') or 'werkzeuge' in page.parts:
        continue
    t = page.read_text(encoding='utf-8')
    if re.search(r'<meta name="robots" content="[^"]*noindex', t):
        continue
    block = build(page, t)
    if '<!--#seo-->' in t:
        neu = re.sub(r'<!--#seo-->.*?<!--/seo-->', lambda m: block, t, flags=re.S)
    else:
        neu = t.replace('</head>', block + '\n</head>', 1)
    if neu != t:
        page.write_text(neu, encoding='utf-8')
        print('SEO:', page.relative_to(ROOT))
