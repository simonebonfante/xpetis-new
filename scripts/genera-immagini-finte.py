#!/usr/bin/env python3
"""Rigenera le immagini finte del seed in seed-immagini/.

Non serve quasi mai: le immagini sono nel repository. Serve se cambiano i
percorsi dentro supabase/seed/0003_demo.sql, che è la sorgente della lista.

Richiede Pillow:  pip install pillow
Uso:              python3 scripts/genera-immagini-finte.py
"""
import hashlib
import os
import re
import sys

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit('Serve Pillow:  pip install pillow')

RADICE = os.path.join(os.path.dirname(__file__), '..')
BASE = os.path.join(RADICE, 'seed-immagini')
SEED = os.path.join(RADICE, 'supabase', 'seed', '0003_demo.sql')

# Le stesse tinte del design system, più due neutre: si distinguono fra loro
# senza sembrare scelte a caso.
TINTE = [(0x1c, 0x1c, 0x1a), (0xe5, 0x36, 0x19), (0x8a, 0x7f, 0x6a),
         (0x3f, 0x51, 0x45), (0x6b, 0x4f, 0x3a)]
CREMA = (0xf0, 0xee, 0xdf)
CREMA_SPENTO = (0xd8, 0xd4, 0xc4)

FONT_CANDIDATI = (
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
)


def font(px):
    for percorso in FONT_CANDIDATI:
        if os.path.exists(percorso):
            return ImageFont.truetype(percorso, px)
    return ImageFont.load_default()


def segnaposto(chiave, larghezza, altezza, etichetta):
    tinta = TINTE[int(hashlib.md5(chiave.encode()).hexdigest(), 16) % len(TINTE)]
    img = Image.new('RGB', (larghezza, altezza), tinta)
    d = ImageDraw.Draw(img)
    for i in range(-altezza, larghezza, 56):
        d.line([(i, altezza), (i + altezza, 0)],
               fill=tuple(min(255, c + 14) for c in tinta), width=22)
    d.rectangle([18, 18, larghezza - 18, altezza - 18], outline=CREMA, width=2)

    grande, medio, piccolo = (font(max(18, larghezza // 16)),
                              font(max(13, larghezza // 30)),
                              font(max(11, larghezza // 38)))

    def centrato(testo, f, y, colore=CREMA):
        sinistra, sopra, destra, sotto = d.textbbox((0, 0), testo, font=f)
        d.text(((larghezza - (destra - sinistra)) / 2, y), testo, font=f, fill=colore)
        return sotto - sopra

    y = altezza // 2 - altezza // 8
    y += centrato('XPETIS', grande, y) + 14
    y += centrato(etichetta, medio, y) + 8
    centrato('immagine finta · seed di sviluppo', piccolo, y, CREMA_SPENTO)
    centrato(f'{larghezza}×{altezza}', piccolo, altezza - 42, CREMA_SPENTO)
    return img


percorsi = sorted(set(re.findall(r"'(td-media/[^']+)'", open(SEED, encoding='utf-8').read())))
if not percorsi:
    sys.exit(f'Nessun percorso td-media/ trovato in {SEED}')

for percorso in percorsi:
    nome = percorso.rsplit('/', 1)[-1].rsplit('.', 1)[0]
    # Gli itinerari sono card orizzontali, i viaggi firma foto di galleria.
    misure = (800, 600) if nome.startswith('itinerario-') else (1200, 800)
    destinazione = os.path.join(BASE, percorso)
    os.makedirs(os.path.dirname(destinazione), exist_ok=True)
    segnaposto(percorso, *misure, nome.replace('-', ' ').title()).save(
        destinazione, 'JPEG', quality=72)

# Le due foto profilo: quadrate, e non compaiono nel seed perché photo_url è un
# URL completo (vedi seed/0004_foto_finte.sql).
for slug, nome in (('marco-rossi', 'Marco Rossi'), ('giulia-neri', 'Giulia Neri')):
    destinazione = os.path.join(BASE, 'td-media', slug, 'profilo.jpg')
    os.makedirs(os.path.dirname(destinazione), exist_ok=True)
    segnaposto(slug + 'profilo', 900, 900, nome).save(destinazione, 'JPEG', quality=78)

print(f'generate {len(percorsi) + 2} immagini in seed-immagini/')
