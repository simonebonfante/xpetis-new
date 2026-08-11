#!/usr/bin/env bash
# Scarica gli asset esportati dal Figma. File: x1DYYagZ2moagmpEHZHYYE
# https://www.figma.com/design/x1DYYagZ2moagmpEHZHYYE/XPETIS
# I nodi di ogni pagina sono elencati in CLAUDE.md, sezione "Design".
#
# ATTENZIONE: le URL degli asset Figma scadono dopo circa 7 giorni. Se lo script
# fallisce con 403 o 404 vanno rigenerate rileggendo il design con il connettore:
# è la chiave del file qui sopra a non scadere mai, non queste URL.
#
# Uso, dalla radice del progetto:  bash scripts/scarica-asset-figma.sh
set -u
cd "$(dirname "$0")/.."
mkdir -p public/img public/logo

scarica() {
  if curl -sfL "$2" -o "public/$1"; then
    echo "  ok       $1"
  else
    echo "  FALLITO  $1  (URL scaduta?)"
  fi
}

echo "Immagini e icone"
scarica img/hero.png           "https://www.figma.com/api/mcp/asset/cd8c2684-0e54-4fbc-9fc2-79c20f68c526.png"
scarica img/stella-grande.svg  "https://www.figma.com/api/mcp/asset/4232d809-5937-4dca-927a-1dd069630dbd.svg"
scarica img/stella.svg         "https://www.figma.com/api/mcp/asset/b3cec270-0ca6-4f22-83b0-87d28e06daf1.svg"
scarica img/stella-piccola.svg "https://www.figma.com/api/mcp/asset/3b498359-898a-4690-beb9-f2d7a7075825.svg"
scarica img/pallino.svg        "https://www.figma.com/api/mcp/asset/a0fafc4e-70ba-40db-a122-46a0eae1cbe1.svg"
scarica img/freccia.svg        "https://www.figma.com/api/mcp/asset/515bd49d-b839-47c2-b21a-18f22580ae55.svg"
scarica img/icona-ricerca.svg  "https://www.figma.com/api/mcp/asset/ca6c47b8-3849-416d-bac0-e693874ab542.svg"
scarica img/icona-supporto.svg "https://www.figma.com/api/mcp/asset/46806838-c601-4ff8-9fe2-441450b7c563.svg"
scarica img/icona-misura.svg   "https://www.figma.com/api/mcp/asset/980e22e4-0024-4380-b73b-55468d08cdda.svg"
scarica img/deco-1.svg         "https://www.figma.com/api/mcp/asset/239fdade-69c4-42e0-88f5-6f001f72547c.svg"
scarica img/deco-2.svg         "https://www.figma.com/api/mcp/asset/f1aebaa2-c322-48db-8a46-659d15171113.svg"

echo "Lettere del logo grande nel footer"
scarica logo/x.svg "https://www.figma.com/api/mcp/asset/291d793b-6d92-41d3-8958-1a4926dae91f.svg"
scarica logo/p.svg "https://www.figma.com/api/mcp/asset/25e77a63-323e-4085-8bad-2fc1eef822e3.svg"
scarica logo/e.svg "https://www.figma.com/api/mcp/asset/a17643ab-c20a-4296-a479-abd44c0231bc.svg"
scarica logo/t.svg "https://www.figma.com/api/mcp/asset/169c591c-a45e-4a1f-b945-0b0618b1de8c.svg"
scarica logo/i.svg "https://www.figma.com/api/mcp/asset/11153b15-0e4f-41b7-aed0-5b283e4c8e16.svg"
scarica logo/s.svg "https://www.figma.com/api/mcp/asset/b448fa93-e7e9-40c6-adb3-f0bc8fa2fbeb.svg"

echo "Pagina ricerca (nodo 177:262) — URL generate il 10 agosto 2026"
scarica img/stella-marrone.svg "https://www.figma.com/api/mcp/asset/3f209ed8-f90b-4405-9e24-70b45b7d80ab.svg"
scarica img/icona-lente.svg    "https://www.figma.com/api/mcp/asset/44468180-b225-46d0-8a82-28eb9a01c4a9.svg"
scarica img/deco-gruppo.svg    "https://www.figma.com/api/mcp/asset/0999c495-d492-4d72-b532-a2635dbcdb42.svg"
scarica img/icona-quiz.svg     "https://www.figma.com/api/mcp/asset/b2148b19-ffe7-4a49-9f62-26718ebfb012.svg"
scarica img/icona-chevron.svg  "https://www.figma.com/api/mcp/asset/ffa6ae26-fa34-46a5-9912-311acd781f76.svg"
# La freccia tonda di "Carica ancora" è byte per byte la stessa img/freccia.svg
# della home: non si riscarica.
# icona-quiz e icona-chevron non sono ancora usati: il primo è il gallone bianco
# che nel Figma si sovrappone all'icona tonda del tasto quiz, il secondo apre
# "Filtri avanzati", che non esiste finché match_designers non filtra i servizi.
