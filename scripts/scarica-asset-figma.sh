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

echo "Vetrina del designer (nodo 171:17) — URL generate l'11 agosto 2026"
scarica img/icona-orologio.svg    "https://www.figma.com/api/mcp/asset/4d9e55fb-5a4f-4c4f-b24d-6bed96d517af.svg"
scarica img/icona-video.svg       "https://www.figma.com/api/mcp/asset/f2d624e9-b994-47c1-a32d-4ee79d15e8b5.svg"
scarica img/icona-check.svg       "https://www.figma.com/api/mcp/asset/a40e49e8-697e-4294-91ae-5ad84ff5c335.svg"
scarica img/icona-cuore.svg       "https://www.figma.com/api/mcp/asset/21a43c5d-bb21-4b93-8d0c-2572cebf3057.svg"
scarica img/icona-instagram.svg   "https://www.figma.com/api/mcp/asset/e2bdff7e-e1a8-4830-a033-fb5102aa25e8.svg"
scarica img/freccia-diagonale.svg "https://www.figma.com/api/mcp/asset/40776503-d6b5-4094-be2b-81815b812c75.svg"
# **galleria-prec.svg e galleria-succ.svg non si scaricano: sono due ritagli.**
# Nel Figma i comandi della galleria dei viaggi firma sono un unico gruppo largo
# 396 (nodo 171:179, "Group 31") con i due tondi agli estremi: la stessa cosa che
# serve al layout, non due asset separati da esportare. I due file nel repo
# portano le geometrie esatte di quel gruppo, ognuna nel suo viewBox 40×40.
# Se il disegno cambia si riesporta 171:179 e si rifà il ritaglio.
#
# La stella rossa del voto medio e il calendario delle recensioni restano fuori:
# non esistono recensioni, quindi non esistono le sezioni che li usano.

echo "Quiz (nodi 346:932 e 346:896) — URL generate il 14 agosto 2026"
scarica img/freccia-avanti.svg   "https://www.figma.com/api/mcp/asset/0f7cc49a-45d7-41b4-b83f-d256d4aeca5a.svg"
scarica img/freccia-indietro.svg "https://www.figma.com/api/mcp/asset/6a6f605b-b50f-4260-8cb9-0a9d7f034eb2.svg"
# La foto è il **rendering del nodo** 346:946 a scala 1 (568×709, jpeg), non la
# sorgente Unsplash: quella è 2731×4096 e pesa 9 MB. Il ritaglio del disegno è
# centrato, quindi `object-cover` lo riproduce da sé a qualunque misura.
scarica img/quiz.jpg             "https://www.figma.com/api/mcp/asset/bcc9ddf3-2e5d-4c23-ad14-4dca72bb480a.jpeg"
#
# **Tre asset del quiz non si scaricano.**
#  · La stella sulla barra di avanzamento è img/stella.svg: nel Figma è alta 36 e
#    larga 34,238, cioè lo stesso path "Star 3" dei bolli (183 × 174,043) scalato
#    5,0833. Un file in meno, e la stessa forma non può divergere.
#  · La cucitura tratteggiata fra card e foto ("Line 28") è una riga bianca da
#    3px con 10 pieni e 10 vuoti: in `components/quiz-domande.tsx` è un gradiente
#    ripetuto. Un SVG di una riga stirata su 659px non aggiunge fedeltà.
#  · Le frecce tonde qui sopra sono le stesse due forme che galleria-prec.svg e
#    galleria-succ.svg portano come ritaglio del gruppo della galleria (171:179).
#    Qui sono l'esportazione pulita dei nodi 346:905 e 346:908, e hanno un nome
#    che non parla di gallerie. Se il disegno cambia, vanno rifatte entrambe le
#    coppie.
