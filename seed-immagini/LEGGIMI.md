# Immagini finte del seed

Rettangoli con su scritto "immagine finta". Servono a vedere se l'impaginazione
regge, non a sembrare vere: **è voluto che si riconoscano a colpo d'occhio**, così
nessuno le scambia per contenuto e nessuno le lascia in giro per sbaglio.

Le foto vere arrivano con l'import delle 25 vetrine, milestone 1.

## A cosa corrispondono

I percorsi rispecchiano uno per uno quelli scritti in
`supabase/seed/0003_demo.sql`, bucket compreso:

```
seed-immagini/td-media/<slug>/<nome>.jpg   →   bucket td-media, oggetto <slug>/<nome>.jpg
```

Ventitré file: le foto dei viaggi firma, le immagini degli itinerari pronti, e
due foto profilo — quelle non compaiono nel seed 0003 perché
`travel_designers.photo_url` è un URL completo e non un percorso nel bucket, e le
sistema `seed/0004_foto_finte.sql`.

## Come si caricano

```bash
bash scripts/carica-immagini-finte.sh
```

Legge `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SECRET_KEY` da `.env.local` e carica
tutto nel bucket `td-media`, sovrascrivendo quello che trova.

Servono **due cose insieme**: questo script mette i file, e i seed mettono i
puntatori. Uno senza l'altro lascia l'immagine rotta com'era.

## Come si rigenerano

Quasi mai serve — sono nel repository. Serve se cambiano i percorsi nel seed:

```bash
python3 scripts/genera-immagini-finte.py    # richiede Pillow
```

Lo script legge la lista dei percorsi **dal seed stesso**, quindi non si può
disallineare: se aggiungi un viaggio firma con una foto nuova, rigeneri e la
trovi.
