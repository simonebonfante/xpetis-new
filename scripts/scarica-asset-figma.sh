#!/usr/bin/env bash
# Scarica gli asset esportati dal Figma.
#
# **Due file Figma, e conta sapere quale.**
#  · Q9Krydv6xD8mFJCtU9NHzr («XPETIS - Def») — il file autorevole dal 27
#    settembre 2026: https://www.figma.com/design/Q9Krydv6xD8mFJCtU9NHzr/XPETIS---Def
#    Da qui vengono gli asset di home (1-14), quiz (2-2), vetrina (72-48, prima
#    2-743), viaggio di gruppo (3-1121) e itinerario pronto (3-1386).
#  · x1DYYagZ2moagmpEHZHYYE — il file superato. Da qui vengono **ancora** gli
#    asset della ricerca e le lettere del logo grande del footer: il nodo della
#    ricerca sul file nuovo non è noto (CLAUDE.md, sezione "Design") e non si
#    ricava. Le sezioni qui sotto lo dicono una per una.
#
# ATTENZIONE: le URL degli asset Figma scadono dopo circa 7 giorni. Se lo script
# fallisce con 403 o 404 vanno rigenerate rileggendo il design con il connettore
# (get_design_context sul nodo della pagina): è la chiave del file a non
# scadere mai, non queste URL.
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

echo "Home (FILE NUOVO Q9Kry…, nodo 1-14) — URL generate il 29 settembre 2026"
# Controllata il 29 settembre: la foto della hero, le tre stelle, la freccia
# tonda sono **byte per byte** quelle scaricate ad agosto dal file vecchio
# (verificato con cmp). Cambiano solo le tre icone di "Affidarti a un Travel
# Designer significa", ridisegnate: ora un segno rosso dentro un tondo al 20%,
# che è un asset a parte (cerchio-vantaggio.svg, nodo 56:150).
scarica img/hero.png           "https://www.figma.com/api/mcp/asset/f0b1f8f0-6e2a-4a39-b280-c3680a6c2005.png"
scarica img/stella-grande.svg  "https://www.figma.com/api/mcp/asset/a3470270-c799-44f5-bf2c-6499609db9f2.svg"
scarica img/stella.svg         "https://www.figma.com/api/mcp/asset/2986faea-9061-40fb-a8ca-088958b84402.svg"
scarica img/stella-piccola.svg "https://www.figma.com/api/mcp/asset/8fa0b9e0-fa80-4e01-927d-e7b7e92fdd54.svg"
scarica img/freccia.svg        "https://www.figma.com/api/mcp/asset/38c1b320-9078-46de-b13b-f0a63660682a.svg"
scarica img/icona-ricerca.svg  "https://www.figma.com/api/mcp/asset/49d57e79-706e-4b95-bdb9-5214e445e4a5.svg"
scarica img/icona-supporto.svg "https://www.figma.com/api/mcp/asset/f8b0b16c-d068-4782-a425-6b4c56b76e92.svg"
scarica img/icona-misura.svg   "https://www.figma.com/api/mcp/asset/213d1a36-d0f7-4173-a4f5-1b6a29deef91.svg"
scarica img/cerchio-vantaggio.svg "https://www.figma.com/api/mcp/asset/636acdea-589f-410c-a4e8-36a7c99febc1.svg"
# Dal file vecchio, non ritrovati nel nodo 1-14 (la home li usava ad agosto;
# pallino.svg serve ancora all'elenco puntato di "Come puoi viaggiare", che il
# disegno nuovo toglie ma che la home non ha ancora cambiato — PIANO.md).
scarica img/pallino.svg        "https://www.figma.com/api/mcp/asset/a0fafc4e-70ba-40db-a122-46a0eae1cbe1.svg"
scarica img/deco-1.svg         "https://www.figma.com/api/mcp/asset/239fdade-69c4-42e0-88f5-6f001f72547c.svg"
scarica img/deco-2.svg         "https://www.figma.com/api/mcp/asset/f1aebaa2-c322-48db-8a46-659d15171113.svg"

echo "Lettere del logo grande nel footer — FILE VECCHIO (non confrontate col footer del file nuovo)"
scarica logo/x.svg "https://www.figma.com/api/mcp/asset/291d793b-6d92-41d3-8958-1a4926dae91f.svg"
scarica logo/p.svg "https://www.figma.com/api/mcp/asset/25e77a63-323e-4085-8bad-2fc1eef822e3.svg"
scarica logo/e.svg "https://www.figma.com/api/mcp/asset/a17643ab-c20a-4296-a479-abd44c0231bc.svg"
scarica logo/t.svg "https://www.figma.com/api/mcp/asset/169c591c-a45e-4a1f-b945-0b0618b1de8c.svg"
scarica logo/i.svg "https://www.figma.com/api/mcp/asset/11153b15-0e4f-41b7-aed0-5b283e4c8e16.svg"
scarica logo/s.svg "https://www.figma.com/api/mcp/asset/b448fa93-e7e9-40c6-adb3-f0bc8fa2fbeb.svg"

echo "Pagina ricerca (FILE VECCHIO, nodo 177:262) — URL generate il 10 agosto 2026"
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

echo "Vetrina del designer (FILE NUOVO Q9Kry…) — nodo 2-743 il 28 settembre, 72-48 dal 29"
# **I quattro segni delle icone di "E dopo l'incontro?"** (nodi 72:515, 72:535,
# 72:540, 72:545) il 29 settembre non si erano potuti scaricare: il connettore
# Figma aveva esaurito le chiamate. Dal 4 ottobre 2026 non vengono da qui ma dal
# tool vetrina v6 (xpetis-vetrine-tool/…/markup/VetrinaMarkup.tsx), dove sono
# SVG in linea: copiati una volta in public/img/dopo-*.svg, insieme alle due
# stelle di "Questo viaggio fa per me?" (stella-fa-per-me-*.svg). Non sono URL
# Figma: questo script non li riscarica e non li deve sovrascrivere. Lo stesso
# vale per il logo dell'header, public/logo/logo-xpetis.svg (4 ottobre 2026),
# preso dalla barra del tool (public/vetrine/img/logo-xpetis.svg) col viewBox
# stretto sul disegno. Anche il "$" del
# credito (72:434) in 72-48 è più grande, 12×18: resta credito-simbolo.svg
# qui sotto, 7,8×12,4, finché non si riscarica. Quando si riscaricano:
# get_design_context su quei nodi, righe qui, e components/dopo-la-call.tsx.
# Le prime sei sono **byte per byte identiche** a quelle scaricate l'11 agosto
# dal file vecchio (verificato con cmp il 28 settembre): il disegno nuovo ha
# ridisegnato le pagine, non le icone. Cambia solo da dove si scaricano.
scarica img/icona-orologio.svg    "https://www.figma.com/api/mcp/asset/7874559e-8039-480b-800f-78a67734b263.svg"
scarica img/icona-video.svg       "https://www.figma.com/api/mcp/asset/67fc4416-b217-449e-9200-460a08b6720e.svg"
scarica img/icona-check.svg       "https://www.figma.com/api/mcp/asset/6c36bb45-e19f-48f2-9393-58d54c63b303.svg"
scarica img/icona-cuore.svg       "https://www.figma.com/api/mcp/asset/1c3e1f56-9e59-4160-8893-4ad9e3b94a02.svg"
scarica img/icona-instagram.svg   "https://www.figma.com/api/mcp/asset/af7b64ee-8f72-4d67-88d6-6b345a0f4ea7.svg"
scarica img/freccia-diagonale.svg "https://www.figma.com/api/mcp/asset/947e5bb9-6375-4d3a-b677-8b7f50974d85.svg"
# Nuove col disegno nuovo: il bollo del credito consulenza nella scheda della
# call (nodi 61:119 e 61:122). Sono due livelli sovrapposti nel Figma e restano
# due file: il cerchio bianco al 28% e il simbolo. Il simbolo è un "$" anche se
# la valuta è l'euro — è così nel disegno, e si corregge là.
scarica img/credito-cerchio.svg   "https://www.figma.com/api/mcp/asset/e5dfeb23-92e8-421d-abd7-f0988486ec55.svg"
scarica img/credito-simbolo.svg   "https://www.figma.com/api/mcp/asset/f747fd93-84a5-4cc1-9b05-5f5e5b8d7d04.svg"
#
# **Tre differenze del file nuovo che non si scaricano, di proposito.**
#  · Il terzo punto della scheda call (18:5833) è un segno di spunta largo
#    14,209 invece di 14,4: lo stesso segno, ridisegnato a mano con un
#    sotto-pixel di differenza. Si usa icona-check.svg per tutti e tre.
#  · La freccia delle card dei viaggi di gruppo (18:5990, "Group 34") nel file
#    nuovo è un cerchio rosso **senza freccia**: un livello perso nel disegno.
#    E comunque quelle card non hanno tasto (la pagina del viaggio non esiste).
#  · La freccia accanto a "Personalizza con una call" nell'itinerario (3:1487,
#    "Group 74") differisce da freccia-diagonale.svg di un sotto-pixel di
#    traslazione, come già nel file vecchio: si usa quella.
#
# **galleria-prec.svg e galleria-succ.svg non si scaricano: sono due ritagli.**
# Nel Figma i comandi della galleria dei viaggi firma sono un unico gruppo largo
# 396 (nodo 171:179, "Group 31") con i due tondi agli estremi: la stessa cosa che
# serve al layout, non due asset separati da esportare. I due file nel repo
# portano le geometrie esatte di quel gruppo, ognuna nel suo viewBox 40×40.
# Se il disegno cambia si riesporta 171:179 e si rifà il ritaglio.
# **Sul file nuovo il gruppo è 18:5863** (vetrina 2-743), e i due tracciati dei
# ritagli ci sono identici: verificato il 28 settembre, i ritagli restano buoni.
#
# La stella rossa del voto medio e il calendario delle recensioni restano fuori:
# non esistono recensioni, quindi non esistono le sezioni che li usano.

echo "Quiz (FILE NUOVO Q9Kry…, nodo 2-2) — freccia avanti del 29 settembre, il resto del 14 agosto"
# Il nodo nuovo è lo stesso disegno: la freccia avanti è byte per byte quella
# di agosto (cmp), la foto è la stessa sorgente Unsplash con lo stesso ritaglio.
# La freccia indietro e il render della foto restano le URL del file vecchio.
scarica img/freccia-avanti.svg   "https://www.figma.com/api/mcp/asset/9a916cf4-c54d-467f-b0e2-501b3669adce.svg"
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
