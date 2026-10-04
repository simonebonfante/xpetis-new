// Importa la vetrina di un Travel Designer dal pacchetto del tool vetrina v6
// (`vetrina.json` + cartella `images/`) al nostro database.
//
// Uso, dalla radice del progetto:
//
//   node --env-file=.env.local supabase/scripts/importa_vetrina.mjs <cartella> --slug <slug> [--email <email>] [--scrivi]
//
//   --slug    lo slug del designer. OBBLIGATORIO: non si ricava né dal nome
//             della cartella né dal nome del designer.
//   --email   solo per un designer che non esiste ancora (colonna obbligatoria,
//             il pacchetto non la contiene). Su uno esistente non si tocca.
//   --scrivi  senza, è una PROVA A SECCO: non scrive niente (né database, né
//             foto, né archivio) e stampa il report.
//
// Chiavi da variabili d'ambiente, mai da file versionati e mai stampate:
// SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SECRET_KEY.
//
// ## Come lavora
//
// 1. **Legge e valida in JavaScript** (`preparaImport`, funzione pura che
//    l'harness usa su PGlite): formato, prezzi, durate, foto, voci senza
//    titolo, chiavi sconosciute. Ne esce un payload già ripulito, con le chiavi
//    uguali ai nomi delle colonne.
// 2. **Il database fa tutte le scritture**, in una funzione sola
//    (`td_import_showcase`, migration 0055): tutto il designer o niente. La
//    prova a secco è la stessa funzione, che scrive e poi annulla.
// 3. **Le foto** vanno nel bucket pubblico `td-media`, su percorsi nostri:
//    `td-media/<designer>/<profilo|firma|itinerario|gruppo>/<impronta>.<ext>`,
//    dove l'impronta è lo SHA-256 del contenuto. Niente del percorso originale.
//    Lo stesso file ha sempre lo stesso indirizzo — rilanciare non ricarica
//    niente, e la copertina che il tool ripete in `img` e in `foto[0]` si
//    carica una volta — mentre una foto cambiata prende un indirizzo nuovo,
//    così nessuna cache mostra la vecchia. (La `cardSfondo`, che spesso è una
//    foto di un viaggio, sta in `profilo/` e quindi ha una copia sua.) Si caricano prima della
//    scrittura; se la scrittura fallisce si tolgono; se riesce, si tolgono dal
//    bucket quelle che nessuna riga cita più.
//
// Un URL assoluto (tipicamente del bucket del tool, che ha nel percorso il
// codice segreto del designer) non si scarica e non si linka: va nel report.

import { readFileSync, existsSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const FORMATO = 'vetrina-xpetis-v6'
export const BUCKET = 'td-media'
const TIPI_FOTO = ['profilo', 'firma', 'itinerario', 'gruppo']

// Il limite per file del bucket `td-media` (migration 0028): una foto più
// grande la rifiuterebbe Storage, quindi la scarta prima il report.
const LIMITE_BYTE = 15728640
const ESTENSIONI = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

// Chiavi del tool → assi del quiz. Verificate sulle etichette (0021,
// `quiz_axes.label_min/label_max`), non sui nomi. Il verso lo controlla il
// database contro `assiLato`.
const ASSI = {
  controllo: 'planning_involvement',
  ritmo: 'pace',
  scomodita: 'comfort_wild',
  luogo: 'curated_vs_real',
  sociale: 'social_orientation',
}

// Le quattro stringhe di `SERVIZI_DOPO` (costanti.ts del tool).
const SERVIZI_DOPO = {
  'Itinerario su misura': 'custom_itinerary',
  'Itinerario su misura ALL INCLUSIVE': 'all_inclusive',
  'Viaggio di gruppo a tua firma': 'group_trip',
  'Accompagnamento privato / presenza sul posto': 'private_guiding',
}

const FA_PER_ME = { natura: 'fit_nature', trekking: 'fit_trekking', onTheRoad: 'fit_on_the_road',
                    city: 'fit_city', cultura: 'fit_culture', chill: 'fit_chill' }

// Le chiavi che lo script conosce. Le altre finiscono solo nell'archivio, e il
// report le nomina.
const NOTE = {
  radice: ['formato', 'brand', 'nome', 'nomeProfessionale', 'fotoProfilo', 'competenze', 'esperienza', 'lingue',
           'instagram', 'storia', 'viaggiarePerMe', 'heroBio', 'manifesto', 'callDescrizione', 'callPunti',
           'callPrezzo', 'callPrezzoLibero', 'suMisuraPrezzo', 'sessioneOfferta', 'sessionePrezzo',
           'sessioneDurata', 'sessioneDescrizione', 'sessionePunti', 'servizi', 'viaggi', 'itinerari', 'gruppo',
           'recensioni', 'paesi', 'topDestinazioni', 'topDestinazioniId', 'assi', 'assiLato', 'frasiCard',
           'frasiCardStato', 'cardSfondo', 'coperturaLegale', 'gruppoHaGia', 'gruppoTempi', 'membro', 'rating'],
  viaggio: ['titolo', 'descrizione', 'paesi', 'imgs', 'img'],
  voce: ['titolo', 'giorni', 'prezzo', 'img', 'foto', 'paesi', 'dettaglio'],
  dettaglio: ['intro', 'notti', 'prezzoNote', 'tappePrincipali', 'tappe', 'quotaComprende', 'quotaNonComprende',
              'cosaPortare', 'infoSanitarieVisti', 'date', 'partecipantiMin', 'partecipantiMax', 'fasciaEta',
              'accompagnatore', 'accontoSaldoCancellazione', 'puntiFaPerMe', 'notaXpetis'],
  tappa: ['giorni', 'titolo', 'descrizione'],
  partenza: ['dal', 'al', 'stato'],
  faPerMe: Object.keys(FA_PER_ME),
  recensione: ['titolo', 'nome', 'stelle', 'data', 'testo', 'anni'],
  paese: ['id', 'paese', 'livello', 'aree', 'temi', 'temiCustom', 'contesti', 'durata', 'budget'],
  assi: [...Object.keys(ASSI), 'conChi'],
  assiLato: Object.keys(ASSI),
}

// ---------------------------------------------------------------- utilità

const testo = (x) => {
  if (x === null || x === undefined) return null
  const t = String(x).trim()
  return t === '' ? null : t
}
const lista = (x) => {
  if (typeof x === 'string') return testo(x) ? [x.trim()] : []
  if (!Array.isArray(x)) return []
  return x.map(testo).filter(Boolean)
}
const unici = (a) => [...new Set(a)]
const oggetto = (x) => (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length ? x : null)

/** "30", "30€", "30,50" → centesimi. "1.579" no: punto delle migliaia o dei decimali? Non si indovina. */
export function euroInCentesimi(x) {
  const t = String(x ?? '').replace(/€/g, '').replace(/\s+/g, '')
  if (!t) return { vuoto: true }
  if (/^\d+$/.test(t)) return { cents: Number(t) * 100 }
  if (/^\d+,\d{1,2}$/.test(t)) {
    const [e, c] = t.split(',')
    return { cents: Number(e) * 100 + Number(c.padEnd(2, '0')) }
  }
  return { illeggibile: true }
}

/** Un intero scritto come numero o come cifre. */
function intero(x) {
  if (x === null || x === undefined || x === '') return { vuoto: true }
  if (typeof x === 'number') return Number.isInteger(x) ? { n: x } : { illeggibile: true }
  const t = String(x).trim()
  if (t === '') return { vuoto: true }
  return /^\d+$/.test(t) ? { n: Number(t) } : { illeggibile: true }
}

/** "90 minuti", "60 min", "90" → minuti. "1 ora" no. */
function minuti(x) {
  const t = String(x ?? '').trim()
  if (!t) return { vuoto: true }
  const m = /^(\d+)\s*(min|minuti)?$/i.exec(t)
  return m ? { n: Number(m[1]) } : { illeggibile: true }
}

const dataIso = (x) => {
  const t = testo(x)
  if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return null
  const d = new Date(t + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t ? t : null
}

// La stessa normalizzazione dello stato di `normalizza.ts` del tool.
function statoPartenza(s) {
  const t = String(s ?? '').toLowerCase().replace(/[^a-z]/g, '')
  if (t === '') return 'open'
  if (t === 'confermato' || t === 'confermata') return 'confirmed'
  if (t.startsWith('ultimi')) return 'last_seats'
  if (t === 'soldout' || t === 'esaurito' || t === 'esaurita') return 'sold_out'
  return null
}

/** "@pianetaferra", "pianetaferra", "https://instagram.com/pianetaferra/" → "pianetaferra". */
function handleInstagram(x) {
  let t = testo(x)
  if (!t) return { vuoto: true }
  const url = /^https?:\/\/(www\.)?instagram\.com\/([^/?#]+)/i.exec(t)
  if (url) t = url[2]
  t = t.replace(/^@/, '')
  return /^[A-Za-z0-9._]{1,30}$/.test(t) ? { h: t } : { illeggibile: true }
}

// ---------------------------------------------------------------- lettura

/** Il `vetrina.json` di una cartella, o l'errore che lo impedisce. */
export function leggiPacchetto(cartella) {
  const file = path.join(cartella, 'vetrina.json')
  if (!existsSync(file)) return { errore: `Nella cartella ${cartella} non c'è vetrina.json` }
  try {
    return { json: JSON.parse(readFileSync(file, 'utf8')) }
  } catch (e) {
    return { errore: `vetrina.json non è JSON valido: ${e.message}` }
  }
}

/**
 * Dal JSON del tool al payload della funzione `td_import_showcase`.
 *
 * Restituisce `{ payload, foto }`: `foto` è la mappa percorso nel bucket →
 * `{ file, contentType, bytes }` di ciò che va caricato. Pura: non tocca né
 * rete né database (legge solo i file della cartella).
 *
 * `urlPubblica(percorso)` dà l'URL completo di una foto: `photo_url` oggi è un
 * URL (seed 0004) mentre le altre foto sono percorsi nel bucket, ed è la
 * convenzione che le pagine leggono.
 */
export function preparaImport(json, { cartella, slug, email = null, urlPubblica = (p) => p }) {
  const errors = []
  const warnings = []
  const avviso = (m) => warnings.push(m)
  const foto = new Map()
  const sorgente = cartella ? path.basename(path.resolve(cartella)) : null

  const sconosciute = (o, note, dove) => {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return
    for (const k of Object.keys(o)) {
      if (!note.includes(k)) avviso(`Chiave sconosciuta «${k}» in ${dove}: conservata solo nell'archivio`)
    }
  }

  const vuoto = (base) => ({
    td: { slug }, email, errors, warnings, raw: json ?? {}, source: sorgente,
    format: json && typeof json === 'object' ? (json.formato ?? null) : null, ...base,
  })

  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    errors.push('vetrina.json non contiene un oggetto')
    return { payload: vuoto({}), foto }
  }
  if (!slug) errors.push('Manca --slug: lo slug del designer non si ricava dal pacchetto')
  if (json.formato !== FORMATO) {
    errors.push(json.formato
      ? `Formato «${json.formato}» non supportato: serve «${FORMATO}». Riesportalo dal tool v6`
      : `Formato vecchio (manca «formato»): riesportalo dal tool v6`)
    return { payload: vuoto({}), foto }
  }

  sconosciute(json, NOTE.radice, 'radice')

  // Una foto del pacchetto: solo percorsi relativi `images/…`, file presente,
  // estensione e peso ammessi dal bucket.
  const prendiFoto = (rel, tipo, dove) => {
    const r = testo(rel)
    if (!r) return null
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(r) || r.startsWith('//')) {
      let host = '?'
      try { host = new URL(r.startsWith('//') ? 'https:' + r : r).host } catch { /* resta "?" */ }
      avviso(`${dove}: foto con URL assoluto (${host}…), non scaricata né linkata`)
      return null
    }
    const norm = path.posix.normalize(r.replace(/\\/g, '/'))
    if (!norm.startsWith('images/') || norm.includes('..')) {
      avviso(`${dove}: percorso foto «${r}» fuori da images/, ignorato`)
      return null
    }
    const file = path.join(cartella, norm)
    if (!existsSync(file) || !statSync(file).isFile()) {
      avviso(`${dove}: la foto «${r}» non c'è nella cartella`)
      return null
    }
    const est = path.extname(file).slice(1).toLowerCase()
    if (!ESTENSIONI[est]) {
      avviso(`${dove}: la foto «${r}» è .${est}, il bucket accetta jpg, png, webp`)
      return null
    }
    const bytes = readFileSync(file)
    if (bytes.length > LIMITE_BYTE) {
      avviso(`${dove}: la foto «${r}» pesa ${(bytes.length / 1048576).toFixed(1)} MB, oltre il limite del bucket (15 MB)`)
      return null
    }
    const impronta = createHash('sha256').update(bytes).digest('hex').slice(0, 16)
    const percorso = `${BUCKET}/${slug}/${tipo}/${impronta}.${est === 'jpeg' ? 'jpg' : est}`
    foto.set(percorso, { file, contentType: ESTENSIONI[est], bytes })
    return percorso
  }

  // ------------------------------------------------------------ il profilo
  const nome = testo(json.nome)
  const nomeProfessionale = testo(json.nomeProfessionale)
  if (!nome && !nomeProfessionale) errors.push('Manca il nome del designer')

  const esperienza = intero(json.esperienza)
  let anni = null
  if (esperienza.n !== undefined && esperienza.n <= 70) anni = esperienza.n
  else if (!esperienza.vuoto) avviso(`esperienza «${json.esperienza}» non è un numero di anni (0-70): non importata`)

  const ig = handleInstagram(json.instagram)
  if (ig.illeggibile) avviso(`instagram «${json.instagram}» non sembra un profilo: non importato`)

  const lingue = unici(String(json.lingue ?? '').split(',').map((l) => l.trim()).filter(Boolean))

  const fotoProfilo = prendiFoto(json.fotoProfilo, 'profilo', 'fotoProfilo')
  const sfondo = prendiFoto(json.cardSfondo, 'profilo', 'cardSfondo')

  sconosciute(json.assiLato, NOTE.assiLato, 'assiLato')
  const assiLato = oggetto(json.assiLato)

  const td = {
    slug,
    // D8: il nome professionale, quando c'è, è quello in pagina. Il nome
    // anagrafico si conserva chiuso.
    display_name: nomeProfessionale ?? nome,
    legal_name: nome,
    expertise_areas: testo(json.competenze),
    years_experience: anni,
    languages: lingue,
    instagram_handle: ig.h ?? null,
    bio: testo(json.storia),
    travel_philosophy: testo(json.viaggiarePerMe),
    hero_bio: testo(json.heroBio),
    manifesto: testo(json.manifesto),
    photo_url: fotoProfilo ? urlPubblica(fotoProfilo) : null,
    background_photo_url: sfondo ? urlPubblica(sfondo) : null,
    legal_coverage: testo(json.coperturaLegale),
    group_trips_readiness: testo(json.gruppoHaGia),
    group_trips_timing: testo(json.gruppoTempi),
    axis_sides: assiLato,
    card_phrases: oggetto(json.frasiCard),
    card_phrases_status: oggetto(json.frasiCardStato),
  }

  // ------------------------------------------------------------ i paesi
  // Regola del 3 ottobre 2026: livello 1 se il paese è fra le tre destinazioni
  // in evidenza oppure è dichiarato «Esperto», altrimenti 2.
  const paesiDichiarati = Array.isArray(json.paesi) ? json.paesi : []
  const codiciDichiarati = paesiDichiarati.map((p) => testo(p?.id)).filter(Boolean)
  let top = unici(lista(json.topDestinazioniId))
  if (top.length > 3) {
    avviso(`topDestinazioniId ne ha ${top.length}: tenute le prime tre (${top.slice(0, 3).join(', ')})`)
    top = top.slice(0, 3)
  }
  for (const t of top.filter((t) => !codiciDichiarati.includes(t))) {
    avviso(`Destinazione in evidenza «${t}» non è fra i paesi dichiarati: ignorata`)
  }
  top = top.filter((t) => codiciDichiarati.includes(t))

  const countries = []
  const visti = new Set()
  paesiDichiarati.forEach((p, i) => {
    const dove = `paesi[${i + 1}]`
    sconosciute(p, NOTE.paese, dove)
    const code = testo(p?.id)
    if (!code) { avviso(`${dove} «${testo(p?.paese) ?? ''}»: senza id, scartato`); return }
    if (visti.has(code)) { avviso(`${dove}: «${code}» dichiarato due volte, tenuta la prima`); return }
    visti.add(code)
    const livello = testo(p.livello)
    if (livello && livello !== 'Base' && livello !== 'Esperto') {
      avviso(`${dove} ${code}: livello «${livello}» sconosciuto, trattato come Base`)
    }
    const posizione = top.indexOf(code)
    countries.push({
      country_code: code,
      name: testo(p.paese),
      level: posizione >= 0 || livello === 'Esperto' ? 1 : 2,
      highlight_position: posizione >= 0 ? posizione + 1 : null,
      areas_note: testo(p.aree),
      custom_themes: lista(p.temiCustom),
      typical_duration: testo(p.durata),
      typical_budget: testo(p.budget),
      themes: unici(lista(p.temi)),
      contexts: unici(lista(p.contesti)),
    })
  })
  if (countries.length && paesiDichiarati.every((p) => (testo(p?.livello) ?? 'Base') === 'Base')) {
    avviso(`Tutti i paesi dichiarati «Base»: il livello 1 viene solo dalle ${top.length} destinazioni in evidenza`)
  }
  if (countries.length && !countries.some((c) => c.level === 1)) {
    avviso('Nessun paese di livello 1: senza correzione il designer non prenderà mai il badge e non si potrà pubblicare')
  }
  if (!countries.length) avviso('Nessun paese dichiarato')

  // ------------------------------------------------------------ gli assi
  const assi = json.assi && typeof json.assi === 'object' ? json.assi : {}
  sconosciute(assi, NOTE.assi, 'assi')
  const axes = []
  for (const [chiave, asse] of Object.entries(ASSI)) {
    const v = intero(assi[chiave])
    if (v.vuoto) continue // lo segnala il database («Asse … non dichiarato»)
    if (v.illeggibile) { avviso(`assi.${chiave} «${assi[chiave]}» non è un numero: non importato`); continue }
    axes.push({ axis: asse, value: v.n, side: testo(assiLato?.[chiave]) })
  }
  const companions = unici(lista(assi.conChi))

  // ------------------------------------------------------------ i servizi
  const services = []
  const prezzo = (valore, campo) => {
    const p = euroInCentesimi(valore)
    if (p.illeggibile) avviso(`${campo} «${valore}» non si legge come prezzo in euro: non importato`)
    return p.cents ?? null
  }
  const prezzoBreve = prezzo(json.callPrezzo, 'callPrezzo')
  if (euroInCentesimi(json.callPrezzo).vuoto) avviso('callPrezzo vuoto: la consulenza breve resta senza prezzo')
  services.push({
    type: 'consultation', active: true,
    price_cents: prezzoBreve,
    price_is_custom: json.callPrezzoLibero === true,
    text_during_call: testo(json.callDescrizione),
    bullets: lista(json.callPunti),
  })

  const sessione = json.sessioneOfferta === true
  const durataSessione = sessione ? minuti(json.sessioneDurata) : { vuoto: true }
  if (sessione && durataSessione.illeggibile) avviso(`sessioneDurata «${json.sessioneDurata}» non si legge in minuti`)
  services.push({
    type: 'consultation_deep', active: sessione,
    price_cents: sessione ? prezzo(json.sessionePrezzo, 'sessionePrezzo') : null,
    minutes: durataSessione.n ?? null,
    minutes_label: testo(json.sessioneDurata),
    price_is_custom: false,
    text_during_call: testo(json.sessioneDescrizione),
    bullets: lista(json.sessionePunti),
  })

  const scelti = lista(json.servizi)
  for (const s of scelti.filter((s) => !SERVIZI_DOPO[s])) avviso(`Servizio «${s}» sconosciuto: non importato`)
  const tipiScelti = new Set(scelti.map((s) => SERVIZI_DOPO[s]).filter(Boolean))
  const prezzoDa = prezzo(json.suMisuraPrezzo, 'suMisuraPrezzo')
  if (prezzoDa !== null && !tipiScelti.has('custom_itinerary')) {
    avviso('suMisuraPrezzo c\'è ma l\'Itinerario su misura non è fra i servizi: prezzo «da» non scritto')
  }
  for (const tipo of Object.values(SERVIZI_DOPO)) {
    services.push({
      type: tipo, active: tipiScelti.has(tipo),
      price_from_cents: tipo === 'custom_itinerary' && tipiScelti.has(tipo) ? prezzoDa : null,
    })
  }

  // ------------------------------------------------------------ i viaggi firma
  const signature_trips = []
  ;(Array.isArray(json.viaggi) ? json.viaggi : []).forEach((v, i) => {
    const dove = `viaggi[${i + 1}]`
    sconosciute(v, NOTE.viaggio, dove)
    const titolo = testo(v?.titolo)
    const imgs = lista(Array.isArray(v?.imgs) && v.imgs.length ? v.imgs : v?.img ? [v.img] : [])
    if (!titolo && !imgs.length) return // riga vuota del modulo: il tool la scarta in silenzio
    if (!titolo) { avviso(`${dove}: foto senza titolo, scartato`); return }
    const paesi = lista(v.paesi)
    if (paesi.length > 1) avviso(`${dove} «${titolo}»: ${paesi.length} paesi, il tool ne usa uno: tenuto ${paesi[0]}`)
    signature_trips.push({
      title: titolo,
      description: testo(v.descrizione),
      country_code: paesi[0] ?? null,
      images: unici(imgs.map((f) => prendiFoto(f, 'firma', `${dove} «${titolo}»`)).filter(Boolean)),
    })
  })
  if (signature_trips.length > 3) {
    avviso(`${signature_trips.length} viaggi firma: il tool ne prevede tre, importati i primi tre`)
    signature_trips.length = 3
  }

  // ------------------------------------------------------------ itinerari e gruppi
  const voce = (v, i, kind) => {
    const gruppo = kind === 'group'
    const dove = `${gruppo ? 'gruppo' : 'itinerari'}[${i + 1}]`
    sconosciute(v, NOTE.voce, dove)
    const titolo = testo(v?.titolo)
    if (!titolo) { avviso(`${dove}: senza titolo, scartato (nel tool non ha pagina)`); return null }
    const etichetta = `${dove} «${titolo}»`
    const d = v.dettaglio && typeof v.dettaglio === 'object' ? v.dettaglio : {}
    sconosciute(d, NOTE.dettaglio, `${dove}.dettaglio`)

    const sorgenti = Array.isArray(v.foto) && v.foto.length ? v.foto : v.img ? [v.img] : []
    const images = unici(lista(sorgenti).map((f) => prendiFoto(f, gruppo ? 'gruppo' : 'itinerario', etichetta)).filter(Boolean))

    const notti = intero(d.notti)
    if (notti.illeggibile) avviso(`${etichetta}: notti «${d.notti}» non è un numero, non importate`)

    sconosciute(d.puntiFaPerMe, NOTE.faPerMe, `${dove}.dettaglio.puntiFaPerMe`)
    const punti = {}
    for (const [k, col] of Object.entries(FA_PER_ME)) {
      const n = d.puntiFaPerMe?.[k]
      if (n === undefined || n === null || n === '') { punti[col] = 0; continue }
      if (Number.isInteger(n) && n >= 0 && n <= 5) punti[col] = n
      else { avviso(`${etichetta}: «fa per me» ${k} = «${n}» fuori da 0-5, messo a 0`); punti[col] = 0 }
    }

    const stops = (Array.isArray(d.tappe) ? d.tappe : []).map((t, j) => {
      sconosciute(t, NOTE.tappa, `${dove}.dettaglio.tappe[${j + 1}]`)
      return { days_label: testo(t?.giorni), title: testo(t?.titolo), description: testo(t?.descrizione) }
    }).filter((t) => t.title || t.description)

    const out = {
      title: titolo,
      duration_label: testo(v.giorni),
      price_label: testo(v.prezzo),
      intro: testo(d.intro),
      nights: notti.n ?? null,
      price_note: testo(d.prezzoNote),
      main_stops: lista(d.tappePrincipali),
      price_includes: lista(d.quotaComprende),
      price_excludes: lista(d.quotaNonComprende),
      packing_list: lista(d.cosaPortare),
      health_visa_info: testo(d.infoSanitarieVisti),
      ...punti,
      xpetis_note: testo(d.notaXpetis),
      td_terms_text: testo(d.accontoSaldoCancellazione),
      images,
      countries: unici(lista(v.paesi)),
      stops,
    }

    if (gruppo) {
      const min = intero(d.partecipantiMin), max = intero(d.partecipantiMax)
      if (min.illeggibile) avviso(`${etichetta}: partecipantiMin «${d.partecipantiMin}» non è un numero`)
      if (max.illeggibile) avviso(`${etichetta}: partecipantiMax «${d.partecipantiMax}» non è un numero`)
      let pmin = min.n && min.n > 0 ? min.n : null
      let pmax = max.n && max.n > 0 ? max.n : null
      if (pmin && pmax && pmin > pmax) {
        avviso(`${etichetta}: partecipanti minimi (${pmin}) sopra i massimi (${pmax}), non importati`)
        pmin = pmax = null
      }
      const departures = []
      ;(Array.isArray(d.date) ? d.date : []).forEach((x, j) => {
        sconosciute(x, NOTE.partenza, `${dove}.dettaglio.date[${j + 1}]`)
        const dal = dataIso(x?.dal), al = dataIso(x?.al)
        const qui = `${etichetta}, partenza ${j + 1}`
        if (!dal) { avviso(`${qui}: data di partenza «${x?.dal ?? ''}» non valida, scartata`); return }
        if (testo(x?.al) && !al) avviso(`${qui}: data di ritorno «${x.al}» non valida, ignorata`)
        if (al && al < dal) { avviso(`${qui}: torna (${al}) prima di partire (${dal}), scartata`); return }
        const stato = statoPartenza(x?.stato)
        if (!stato) avviso(`${qui}: stato «${x.stato}» sconosciuto, trattata come aperta`)
        if (departures.some((p) => p.starts_on === dal)) { avviso(`${qui}: un'altra partenza il ${dal}, scartata`); return }
        departures.push({ starts_on: dal, ends_on: al, status: stato ?? 'open' })
      })
      Object.assign(out, {
        participants_min: pmin,
        participants_max: pmax,
        age_range: testo(d.fasciaEta),
        guide_name: testo(d.accompagnatore),
        departures,
      })
    } else {
      const ignorati = ['partecipantiMin', 'partecipantiMax', 'fasciaEta', 'accompagnatore'].filter((k) => testo(d[k]))
      if (Array.isArray(d.date) && d.date.length) ignorati.push('date')
      if (ignorati.length) avviso(`${etichetta}: ${ignorati.join(', ')} su un itinerario, il tool li ignora: non importati`)
    }
    return out
  }
  const itineraries = (Array.isArray(json.itinerari) ? json.itinerari : []).map((v, i) => voce(v, i, 'itinerary')).filter(Boolean)
  const group_trips = (Array.isArray(json.gruppo) ? json.gruppo : []).map((v, i) => voce(v, i, 'group')).filter(Boolean)

  // ------------------------------------------------------------ le recensioni
  const reviews = []
  ;(Array.isArray(json.recensioni) ? json.recensioni : []).forEach((r, i) => {
    const dove = `recensioni[${i + 1}]`
    sconosciute(r, NOTE.recensione, dove)
    const autore = testo(r?.nome), corpo = testo(r?.testo)
    if (!autore && !corpo && !testo(r?.titolo)) return
    if (!autore || !corpo) { avviso(`${dove}: senza ${!autore ? 'nome' : 'testo'}, scartata`); return }
    const stelle = intero(r.stelle)
    if (stelle.n === undefined || stelle.n < 1 || stelle.n > 5) {
      avviso(`${dove} di ${autore}: stelle «${r.stelle ?? ''}» fuori da 1-5, scartata`)
      return
    }
    const anniRec = intero(r.anni)
    reviews.push({
      title: testo(r.titolo), author_name: autore, stars: stelle.n, date_label: testo(r.data), body: corpo,
      author_years: anniRec.n !== undefined && anniRec.n <= 100 ? anniRec.n : null,
    })
  })

  return {
    payload: {
      td, email, countries, axes, companions, services, signature_trips, itineraries, group_trips, reviews,
      errors, warnings, raw: json, source: sorgente, format: json.formato,
    },
    foto,
  }
}

// ---------------------------------------------------------------- il report

export function stampaReport(rep, { cartella, slug, scrivi, foto, daCaricare, orfane }) {
  const righe = []
  const r = (s = '') => righe.push(s)
  r(`== ${path.basename(path.resolve(cartella))} → ${slug} · ${scrivi ? 'SCRITTURA' : 'PROVA A SECCO (niente è stato scritto)'} ==`)
  const esito = rep.esito === 'ok'
    ? `${scrivi ? 'scritto' : 'pronto'} · designer ${rep.nuovo ? 'NUOVO (nasce in bozza)' : 'esistente'} · ${rep.modifiche} modifiche`
    : 'RIFIUTATO'
  r(`Esito: ${esito}`)
  const errori = rep.errori ?? []
  r(`Errori (${errori.length})${errori.length ? ':' : ': nessuno'}`)
  for (const e of errori) r(`  ✗ ${e}`)
  const avvisi = rep.avvisi ?? []
  r(`Avvisi (${avvisi.length})${avvisi.length ? ':' : ': nessuno'}`)
  for (const a of avvisi) r(`  · ${a}`)
  if (rep.esito === 'ok') {
    for (const [titolo, chiave, segmento] of [['Itinerari pronti', 'itinerari', 'itinerario'],
                                               ['Viaggi di gruppo', 'gruppi', 'viaggio-di-gruppo']]) {
      const voci = rep[chiave] ?? []
      r(`${titolo} (${voci.length}):`)
      for (const v of voci) r(`  · ${v.title} → /designer/${slug}/${segmento}/${v.slug}`)
    }
    r(`Stato del designer: ${rep.stato}`)
    const blocchi = rep.blocchi_pubblicazione ?? []
    r(`Prima di pubblicarlo (td_publish_blockers): ${blocchi.length ? '' : 'niente'}`)
    for (const b of blocchi) r(`  · ${b}`)
  }
  if (foto && (foto.size > 0 || rep.esito === 'ok')) {
    r(`Foto: ${foto.size} nel pacchetto (dopo i doppioni), ${daCaricare?.length ?? '?'} da caricare, ` +
      `${orfane?.length ?? '?'} nel bucket da togliere`)
  }
  return righe.join('\n')
}

// ---------------------------------------------------------------- da riga di comando

function argomenti(argv) {
  const a = { scrivi: false, cartella: null, slug: null, email: null }
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]
    if (x === '--scrivi') a.scrivi = true
    else if (x === '--slug') a.slug = argv[++i]
    else if (x === '--email') a.email = argv[++i]
    else if (x.startsWith('--')) throw new Error(`Opzione sconosciuta: ${x}`)
    else if (!a.cartella) a.cartella = x
    else throw new Error(`Argomento in più: ${x}`)
  }
  return a
}

async function main() {
  let a
  try { a = argomenti(process.argv.slice(2)) } catch (e) { console.error(e.message); process.exit(64) }
  if (!a.cartella || !a.slug) {
    console.error('Uso: node --env-file=.env.local supabase/scripts/importa_vetrina.mjs <cartella> --slug <slug> [--email <email>] [--scrivi]')
    process.exit(64)
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const chiave = process.env.SUPABASE_SECRET_KEY
  if (!url || !chiave) {
    console.error('Mancano SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) e/o SUPABASE_SECRET_KEY nell\'ambiente.')
    process.exit(64)
  }
  if (!chiave.startsWith('sb_secret_')) {
    console.error('SUPABASE_SECRET_KEY non è una chiave secret (sb_secret_…): l\'import scrive, serve quella.')
    process.exit(64)
  }

  const letto = leggiPacchetto(a.cartella)
  if (letto.errore) { console.error(letto.errore); process.exit(2) }

  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, chiave, { auth: { persistSession: false, autoRefreshToken: false } })
  const urlPubblica = (p) => `${url.replace(/\/+$/, '')}/storage/v1/object/public/${p}`
  const { payload, foto } = preparaImport(letto.json, { cartella: a.cartella, slug: a.slug, email: a.email, urlPubblica })

  const rpc = async (scrivi) => {
    const { data, error } = await sb.rpc('td_import_showcase', { p_payload: payload, p_scrivi: scrivi })
    if (error) { console.error(`td_import_showcase: ${error.message}`); process.exit(1) }
    return data
  }

  // Cosa c'è già nel bucket, nelle quattro cartelle che l'importatore governa.
  // Le altre foto del designer (quelle del seed demo, per dire) non si toccano.
  const presenti = new Set()
  if (!payload.errors.length) {
    for (const tipo of TIPI_FOTO) {
      const { data, error } = await sb.storage.from(BUCKET).list(`${a.slug}/${tipo}`, { limit: 1000 })
      if (error) { console.error(`Storage, elenco di ${a.slug}/${tipo}: ${error.message}`); process.exit(1) }
      for (const f of data ?? []) {
        if (f.name && !f.name.startsWith('.')) presenti.add(`${BUCKET}/${a.slug}/${tipo}/${f.name}`)
      }
    }
  }
  const daCaricare = [...foto.keys()].filter((p) => !presenti.has(p))
  const orfane = [...presenti].filter((p) => !foto.has(p))
  const contesto = { cartella: a.cartella, slug: a.slug, foto, daCaricare, orfane }

  const prova = await rpc(false)
  if (!a.scrivi || prova.esito !== 'ok') {
    if (a.scrivi) {
      // Rifiutato: si archivia il rifiuto, e basta.
      const rifiuto = await rpc(true)
      console.log(stampaReport(rifiuto, { ...contesto, scrivi: true }))
      console.log('\nNiente scritto, foto comprese. Il rifiuto è in td_import_runs.')
    } else {
      console.log(stampaReport(prova, { ...contesto, scrivi: false }))
    }
    process.exit(prova.esito === 'ok' ? 0 : 2)
  }

  // Le foto prima della scrittura: una riga che punta a un file che non c'è
  // ancora sarebbe una foto rotta in pagina.
  const caricate = []
  const chiaveBucket = (p) => p.slice(BUCKET.length + 1)
  const togli = async (percorsi) => {
    if (!percorsi.length) return
    const { error } = await sb.storage.from(BUCKET).remove(percorsi.map(chiaveBucket))
    if (error) console.error(`Storage, rimozione: ${error.message}`)
  }
  for (const p of daCaricare) {
    const f = foto.get(p)
    const { error } = await sb.storage.from(BUCKET).upload(chiaveBucket(p), f.bytes, { contentType: f.contentType, upsert: false })
    if (error && !/exists|duplicate/i.test(error.message)) {
      console.error(`Storage, caricamento di ${path.basename(f.file)}: ${error.message}`)
      await togli(caricate)
      process.exit(1)
    }
    if (!error) caricate.push(p)
  }

  const vero = await rpc(true)
  if (vero.esito !== 'ok') {
    await togli(caricate)
    console.log(stampaReport(vero, { ...contesto, scrivi: true }))
    console.log('\nRifiutato alla scrittura: le foto appena caricate sono state tolte.')
    process.exit(2)
  }
  await togli(orfane)
  console.log(stampaReport(vero, { ...contesto, scrivi: true }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main()
}
