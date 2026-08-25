#!/usr/bin/env bash
# Carica le immagini finte del seed nel bucket `td-media` di Supabase Storage.
#
# Perché servono: il seed 0003 riempie le tabelle della vetrina con percorsi
# come `td-media/marco-rossi/ha-giang-1.jpg`, ma il bucket del progetto di
# sviluppo è vuoto. Le pagine reggono il buco, però non si vede se
# l'impaginazione funziona finché non c'è un'immagine dentro.
#
# Le foto vere arrivano con l'import delle 25 vetrine (milestone 1). Queste sono
# rettangoli con su scritto "immagine finta": impossibile scambiarle per vere.
#
# Uso, dalla radice del progetto:  bash scripts/carica-immagini-finte.sh
set -u
cd "$(dirname "$0")/.."

[ -f .env.local ] && set -a && . ./.env.local && set +a

URL="${NEXT_PUBLIC_SUPABASE_URL:-}"
CHIAVE="${SUPABASE_SECRET_KEY:-}"

if [ -z "$URL" ] || [ -z "$CHIAVE" ]; then
  echo "Servono NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY in .env.local" >&2
  exit 1
fi

if [ ! -d seed-immagini/td-media ]; then
  echo "Manca la cartella seed-immagini/. Rigenerala con:" >&2
  echo "  python3 scripts/genera-immagini-finte.py" >&2
  exit 1
fi

caricate=0
fallite=0

while IFS= read -r file; do
  percorso="${file#seed-immagini/}"            # td-media/<slug>/<nome>.jpg
  oggetto="${percorso#td-media/}"              # <slug>/<nome>.jpg
  # **Servono entrambi gli header.** Con le chiavi nuove (`sb_secret_…`) il solo
  # `Authorization: Bearer` non basta: l'API Storage prova a leggere il valore
  # come JWT, non ci riesce e risponde 403 `Invalid Compact JWS`. È l'header
  # `apikey` a far riconoscere la chiave. Con le vecchie `service_role`, che sono
  # JWT davvero, il Bearer da solo funzionava: è una trappola che si vede solo
  # provando, verificata il 23 agosto sul progetto di sviluppo.
  codice=$(curl -s -o /dev/null -w '%{http_code}' \
    -X POST "$URL/storage/v1/object/td-media/$oggetto" \
    -H "apikey: $CHIAVE" \
    -H "Authorization: Bearer $CHIAVE" \
    -H "Content-Type: image/jpeg" \
    -H "x-upsert: true" \
    --data-binary "@$file")
  if [ "$codice" = "200" ]; then
    caricate=$((caricate + 1))
    printf '  ok       %s\n' "$oggetto"
  else
    fallite=$((fallite + 1))
    printf '  FALLITO  %s  (HTTP %s)\n' "$oggetto" "$codice"
  fi
done < <(find seed-immagini -type f -name '*.jpg' | sort)

echo
echo "caricate: $caricate · fallite: $fallite"
[ "$fallite" -eq 0 ] || exit 1
