-- XPETIS · seed 0004 · Le foto profilo finte
--
-- Il seed 0003 scrive `photo_url = 'https://example.com/<slug>.jpg'`, che è un
-- host morto: il browser fa la richiesta, fallisce, e ogni card di /ricerca e
-- ogni vetrina mostra un'immagine rotta. Un percorso che non esiste è meglio di
-- un URL che esiste e non risponde: il primo il codice lo sa gestire, il secondo
-- no.
--
-- Qui le due foto puntano al bucket `td-media`, come tutte le altre immagini del
-- seed. I file si caricano con:
--
--     bash scripts/carica-immagini-finte.sh
--
-- Finché non sono caricati l'immagine resta rotta come prima: questo file
-- sistema il *puntatore*, lo script mette il *file*. Servono tutti e due.
--
-- Perché l'host è scritto per esteso: `travel_designers.photo_url` è un URL
-- completo, non un percorso nel bucket come `storage_path` e `image_path`, e il
-- seed non ha modo di leggere la variabile d'ambiente del progetto. Su un
-- progetto diverso si cambia questa riga sola.

update travel_designers
   set photo_url = 'https://rsgyxbqzsxahsbdfgtbm.supabase.co'
                   || '/storage/v1/object/public/td-media/' || slug || '/profilo.jpg'
 where slug in ('marco-rossi', 'giulia-neri');
