/**
 * La frase della card, composta dai mattoncini. Gira **solo lato server**: la
 * funzione Postgres restituisce i codici dei due assi più salienti e i temi
 * agganciati, qui si scrivono le parole.
 *
 * Perché il valore dell'asse del designer non serve. La salienza è
 * `peso × affinità × estremità`: un asse saliente è per costruzione un asse dove
 * viaggiatore e designer stanno dalla stessa parte. Il frammento si scrive
 * quindi **dalla risposta del viaggiatore**, che lui già conosce, e dal database
 * non esce nessun valore.
 *
 * ── TESTI PROVVISORI ────────────────────────────────────────────────────────
 * I mattoncini li scrive Gaia (Flusso §2, "Da costruire → Comunicazione"). Quelli
 * qui sotto sono segnaposto in tono coerente, e sono l'unica cosa da sostituire:
 * la macchina che li scegli e li monta non cambia.
 *
 * Due vincoli che i testi definitivi devono rispettare, e che non sono di stile:
 *
 * 1. **Nessun aggettivo con genere sul designer.** `travel_designers` non ha una
 *    colonna genere e non l'avrà: i frammenti usano verbi alla terza persona
 *    ("lavora", "cura", "porta"), mai participi ("è abituato/a"). Un frammento con
 *    genere andrebbe sbagliato per metà dei 25 designer.
 * 2. **Niente articoli davanti ai nomi propri di destinazione e ai temi.** La
 *    tassonomia geografica non porta l'articolo ("il Vietnam", "gli Stati Uniti",
 *    "la Thailandia") e nemmeno la tabella `tags`. Le destinazioni passano da
 *    `locativo()` qui sotto; i temi entrano preceduti da "sul tema", che funziona
 *    con tutte e nove le etichette. Se Gaia vuole frasi più naturali sui temi
 *    ("e il food è terreno suo") serve l'articolo come dato, cioè una migration.
 * 3. **Nessuna virgola dentro un frammento.** I pezzi si uniscono con la virgola,
 *    quindi una virgola interna produce frasi che inciampano ("sta dalla parte
 *    del tempo lungo, come te, conosce il ritmo dei viaggi in coppia").
 */
import type { Quiz, RisultatoMatch, Destinazione } from '@/lib/match'

type Frammento = readonly [string, string, string]

/* ------------------------------------------------------------ lo slot geografico */

/**
 * "in Vietnam", "negli Stati Uniti", "a Malta".
 *
 * La tassonomia non dichiara l'articolo, quindi il default è "in" — che va bene
 * per la grande maggioranza dei 129 stati — e le eccezioni stanno qui, per
 * identificatore. Isole e città-stato vogliono "a", i nomi plurali "nei/negli/
 * nelle". Se la tassonomia cresce, una destinazione nuova cade sul default e
 * l'errore è leggibile, non silenzioso.
 */
const LOCATIVO_IRREGOLARE: Record<string, string> = {
  // Plurali e nomi con articolo
  stati_uniti: 'negli Stati Uniti',
  emirati_arabi_uniti: 'negli Emirati Arabi Uniti',
  paesi_bassi: 'nei Paesi Bassi',
  regno_unito: 'nel Regno Unito',
  repubblica_ceca: 'nella Repubblica Ceca',
  repubblica_dominicana: 'nella Repubblica Dominicana',
  polinesia_francese: 'nella Polinesia Francese',
  filippine: 'nelle Filippine',
  isole_cook: 'nelle Isole Cook',
  maldive: 'alle Maldive',
  seychelles: 'alle Seychelles',
  fiji: 'alle Fiji',
  riunione: 'alla Riunione',
  // Isole e città-stato: "a", non "in"
  malta: 'a Malta',
  cipro: 'a Cipro',
  cuba: 'a Cuba',
  taiwan: 'a Taiwan',
  mauritius: 'a Mauritius',
  capo_verde: 'a Capo Verde',
  singapore: 'a Singapore',
  tonga: 'a Tonga',
  samoa: 'a Samoa',
  // Macro-aree
  isole_delloceano_indiano: "nelle Isole dell'Oceano Indiano",
}

export function locativo(destinazione: Destinazione): string {
  return LOCATIVO_IRREGOLARE[destinazione.ref] ?? `in ${destinazione.nome}`
}

/** Banda 3: copre la destinazione cercata. */
const GEO_COPRE: Frammento = [
  'Lavora {loc} da anni',
  'Ha costruito la sua esperienza {loc}',
  'Viaggia {loc} da molto prima di XPETIS',
]

/** Banda 2: copre un altro paese della stessa macro-area. Solo con un paese. */
const GEO_AREA: Frammento = [
  'Non lavora {loc} ma conosce bene la zona',
  'Ha il suo terreno accanto nella stessa area',
  'Copre la stessa area a un paese di distanza',
]

/** Banda 1: stesso continente, altra area. */
const GEO_CONTINENTE: Frammento = [
  'Il suo terreno è un altro ma nello stesso continente',
  'Non è la sua area ma il continente lo conosce',
  'Lavora altrove nello stesso continente',
]

/* ------------------------------------------------------------------- gli assi */

/**
 * Un frammento per **lato** dell'asse, non per valore. Il lato si legge dalla
 * risposta del viaggiatore: su scala 1-4, 1-2 è il lato `label_min`, 3-4 il lato
 * `label_max`. Il verso di ogni asse è quello dichiarato in
 * `quiz_axes.label_min`/`label_max` — mai dedotto dal nome del codice.
 */
const ASSI: Record<string, { min: Frammento; max: Frammento }> = {
  // Poco controllo ↔ Molto controllo
  planning_involvement: {
    min: [
      'prende in mano l’organizzazione e ti lascia viaggiare',
      'ti toglie di mezzo la logistica',
      'organizza tutto e ti lascia solo il viaggio',
    ],
    max: [
      'costruisce l’itinerario insieme a te',
      'ti tiene dentro ogni scelta',
      'lavora a quattro mani senza decidere al posto tuo',
    ],
  },
  // Slow ↔ Dynamic
  pace: {
    min: [
      'ama i ritmi lenti come te',
      'costruisce viaggi che non corrono',
      'sta dalla parte del tempo lungo come te',
    ],
    max: [
      'tiene il ritmo alto come piace a te',
      'riempie le giornate senza farle pesare',
      'progetta viaggi che non stanno mai fermi come te',
    ],
  },
  // Comfort ↔ Wild
  comfort_wild: {
    min: [
      'cura il comfort come te',
      'non fa mancare le comodità',
      'sceglie posti dove si sta bene come te',
    ],
    max: [
      'porta dove finisce l’asfalto come piace a te',
      'non si spaventa davanti al ruvido',
      'cerca il selvatico come te',
    ],
  },
  // Estetica curata ↔ Vita reale
  curated_vs_real: {
    min: [
      'ha occhio per i posti belli come te',
      'cura l’estetica di ogni tappa',
      'sceglie luoghi che si guardano bene come te',
    ],
    max: [
      'cerca la vita vera come te',
      'porta dove la gente vive davvero',
      'sta lontano dalla cartolina come te',
    ],
  },
  // Intimità ↔ Socialità
  social_orientation: {
    min: [
      'difende l’intimità del viaggio come te',
      'lavora su gruppi piccoli e momenti tuoi',
      'tiene il viaggio riservato come te',
    ],
    max: [
      'progetta viaggi che fanno incontrare come te',
      'apre il viaggio agli incontri',
      'sta dalla parte della compagnia come te',
    ],
  },
}

/**
 * "Con chi viaggi" è categoriale a cinque opzioni: il frammento dipende dal
 * valore, non da un lato. Le etichette sono quelle esatte del form Vetrina TD.
 */
const COMPANIONS: Record<number, Frammento> = {
  1: [
    'lavora spesso con chi parte da solo',
    'conosce bene il viaggio in solitaria',
    'sa cosa serve a chi parte da solo',
  ],
  2: [
    'lavora spesso con le coppie',
    'sa costruire viaggi a due',
    'conosce il ritmo dei viaggi in coppia',
  ],
  3: [
    'lavora spesso con le famiglie',
    'sa cosa cambia viaggiando con bambini',
    'progetta viaggi che funzionano anche per i più piccoli',
  ],
  4: [
    'lavora spesso con i piccoli gruppi',
    'sa tenere insieme un gruppo di amici',
    'progetta viaggi per gruppi piccoli',
  ],
  5: [
    'lavora spesso con i gruppi organizzati',
    'sa gestire i numeri di un gruppo',
    'progetta viaggi di gruppo',
  ],
}

/* --------------------------------------------------------- il tema e la chiusura */

const TEMA: Frammento = [
  'e sul tema {tema} ha molto da dire',
  'e sul tema {tema} lavora spesso',
  'e sul tema {tema} ti porta dove serve',
]

const CHIUSURA: Frammento = [
  'Vale una call.',
  'Un buon punto da cui partire.',
  'Potrebbe essere la persona giusta.',
]

/* -------------------------------------------------------------- la composizione */

/**
 * Impronta stabile (FNV-1a) dell'id del TD più il nome dello slot: la stessa
 * coppia viaggiatore-TD vede sempre la stessa frase, e due slot diversi non
 * pescano sempre la stessa variante.
 */
function impronta(seme: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seme.length; i++) {
    h ^= seme.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function variante(frammento: Frammento, tdId: string, slot: string, salto = 0): string {
  return frammento[(impronta(`${tdId}·${slot}`) + salto) % frammento.length]
}

function maiuscola(testo: string): string {
  return testo.charAt(0).toUpperCase() + testo.slice(1)
}

type Ingredienti = {
  risultato: RisultatoMatch
  destinazione?: Destinazione | null
  quiz?: Quiz | null
  /** `code → label_it` dalla vista `public_tags`. */
  etichetteTemi?: Record<string, string>
}

/**
 * Compone la frase, o restituisce `null` quando non c'è niente da dire — nessuna
 * destinazione, nessun quiz, nessun filtro agganciato. In quel caso la card
 * mostra la headline del designer: meglio una frase in meno che una frase vuota.
 */
export function componiFrase({
  risultato,
  destinazione = null,
  quiz = null,
  etichetteTemi = {},
}: Ingredienti): string | null {
  const id = risultato.td_id
  const pezzi: string[] = []

  // 1. Lo slot geografico. Senza destinazione non c'è; in banda 0 nemmeno,
  //    perché è la sezione di fallback a dirlo.
  if (destinazione) {
    if (risultato.band === 3) {
      pezzi.push(variante(GEO_COPRE, id, 'geo').replace('{loc}', locativo(destinazione)))
    } else if (risultato.band === 2) {
      pezzi.push(variante(GEO_AREA, id, 'geo').replace('{loc}', locativo(destinazione)))
    } else if (risultato.band === 1) {
      pezzi.push(variante(GEO_CONTINENTE, id, 'geo'))
    }
  }

  // 2. I due assi più salienti, nell'ordine che la funzione ha stabilito.
  //    Se il primo frammento finisce con "come te", il secondo cambia variante:
  //    ripeterlo nella stessa frase suona male. Il salto è deterministico, quindi
  //    la frase resta stabile.
  let giaDetto = false
  for (const codice of risultato.salient_axes.slice(0, 2)) {
    const risposta = quiz?.[codice]
    if (risposta === undefined) continue

    let scelte: Frammento | undefined
    if (codice === 'companions') {
      scelte = COMPANIONS[risposta]
    } else {
      const asse = ASSI[codice]
      // Scala 1-4: 1-2 è il lato label_min, 3-4 il lato label_max.
      if (asse) scelte = risposta <= 2 ? asse.min : asse.max
    }
    if (!scelte) continue

    let testo = variante(scelte, id, codice)
    if (giaDetto && testo.includes('come te')) {
      for (let salto = 1; salto < scelte.length; salto++) {
        const alternativa = variante(scelte, id, codice, salto)
        if (!alternativa.includes('come te')) {
          testo = alternativa
          break
        }
      }
    }
    if (testo.includes('come te')) giaDetto = true
    pezzi.push(testo)
  }

  // 3. Il tema, solo se richiesto e agganciato. Il primo dei temi agganciati
  //    basta: due temi nella stessa frase la allungano senza aggiungere niente.
  const tema = risultato.matched_themes[0]
  const etichetta = tema ? etichetteTemi[tema] : undefined
  if (etichetta) {
    pezzi.push(variante(TEMA, id, 'tema').replace('{tema}', etichetta.toLowerCase()))
  }

  if (pezzi.length === 0) return null

  // Il frammento del tema porta già la sua "e" e chiude sempre la frase; senza
  // tema la congiunzione va messa davanti all'ultimo pezzo.
  const conTema = etichetta ? pezzi.pop()! : null

  let corpo: string
  if (pezzi.length === 0) {
    corpo = conTema!.replace(/^e /, '')
  } else if (conTema) {
    corpo = `${pezzi.join(', ')} ${conTema}`
  } else {
    const ultimo = pezzi.pop()!
    corpo = pezzi.length > 0 ? `${pezzi.join(', ')} e ${ultimo}` : ultimo
  }

  return `${maiuscola(corpo)}. ${variante(CHIUSURA, id, 'chiusura')}`
}
