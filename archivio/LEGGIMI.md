# Archivio

File superati, tenuti per memoria. **Non si rigenera niente da qui.**

| File | Sostituito da | Quando | Perché |
|---|---|---|---|
| `xpetis_destinazioni_v1.json` | `xpetis_destinazioni_v2.json` (radice del progetto) | 27 settembre 2026 | Stessi continenti, macro-aree, stati e regioni; **1.220 città → 188**, la potatura di Alessandro confermata da Simone. Le 188 sono un sottoinsieme esatto delle vecchie. Era `xpetis_destinazioni.json` nella radice: spostato qui perché due file con lo stesso ruolo nella stessa cartella invitano a rigenerare da quello sbagliato |

La fonte del seed geografico è scritta in una costante sola, `SORGENTE` in
`supabase/scripts/genera_geo.mjs`, che legge anche l'harness.
