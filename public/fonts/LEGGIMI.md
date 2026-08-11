# I font

**Merriweather** (titoli) arriva da Google Fonts: la carica `next/font`, non
serve nessun file qui.

**Ronzino** (testo) è di [Collletttivo](https://www.collletttivo.it/typefaces/ronzino),
open source con licenza SIL OFL 1.1, uso commerciale incluso.

Scaricala e metti qui questi due file:

```
public/fonts/Ronzino-Regular.woff2
public/fonts/Ronzino-Bold.woff2
```

Finché non ci sono, `@font-face` in `app/globals.css` non trova la sorgente e il
browser ricade sul font di sistema: le pagine restano leggibili, cambia solo il
carattere. Non serve toccare il codice quando i file arrivano.
