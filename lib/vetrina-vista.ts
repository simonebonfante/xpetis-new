/**
 * Le regole con cui la vetrina mostra i dati del tool vetrina v6: cosa esce
 * quando un dato manca, come si scrivono giorni, prezzi e date, come si chiama
 * lo stato di una partenza.
 *
 * Sono le regole di `vista.ts` e `normalizza.ts` del tool (3 ottobre 2026),
 * **riscritte qui e non importate**: il codice del tool non entra nel nostro
 * (decisione D1). Dove il nostro comportamento diverge dal tool, il commento
 * lo dice e dice perché — l'elenco completo è in `VETRINE_V6_FASE0.md`, § 5.
 *
 * Funzioni pure, senza testi di prodotto: «Prezzo su richiesta», i prefissi
 * della nota di prezzo e le condizioni dei gruppi stanno in `app_config` e
 * arrivano come argomenti.
 */
import type { DettaglioVoce, Partenza, StatoPartenza } from '@/lib/vetrina'

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']

/** "10" → "10 giorni", "1" → "1 giorno"; un testo ("13 giorni", "5-7 giorni") resta com'è. */
export function etichettaGiorni(testo: string | null | undefined): string | null {
  const t = testo?.trim()
  if (!t) return null
  if (/^\d+$/.test(t)) return `${t} ${t === '1' ? 'giorno' : 'giorni'}`
  return t
}

/** "10 giorni" → "10 gg": il primo numero, come nella riga «Durata» del tool. */
export function giorniCorti(testo: string | null | undefined): string | null {
  const t = testo?.trim()
  if (!t) return null
  const m = /^(\d+)/.exec(t)
  return m ? `${m[1]} gg` : t
}

/**
 * Il prezzo di vetrina di un itinerario o di un gruppo. Nel pacchetto è testo
 * libero ("1380", "1.579€"): si tengono cifre, punti e virgole e si aggiunge
 * l'euro, come fa il tool. Senza cifre non c'è prezzo, e la pagina scrive al
 * suo posto il testo di `showcase_price_on_request`.
 */
export function prezzoVetrina(testo: string | null | undefined): string | null {
  const cifre = (testo ?? '').replace(/[^0-9.,]/g, '')
  return cifre ? `${cifre}€` : null
}

function data(iso: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  return m ? { g: Number(m[3]), m: Number(m[2]) - 1, a: Number(m[1]) } : null
}

/** "10 – 21 gen 2027", "28 dic 2026 – 4 gen 2027", come nel tool. */
export function intervalloDate(dal: string, al: string | null): string {
  const a = data(dal)
  const b = data(al)
  if (!a) return dal
  if (!b) return `${a.g} ${MESI[a.m]} ${a.a}`
  if (a.a === b.a && a.m === b.m) return `${a.g} – ${b.g} ${MESI[b.m]} ${b.a}`
  if (a.a === b.a) return `${a.g} ${MESI[a.m]} – ${b.g} ${MESI[b.m]} ${b.a}`
  return `${a.g} ${MESI[a.m]} ${a.a} – ${b.g} ${MESI[b.m]} ${b.a}`
}

/**
 * Le etichette degli stati, del tool. `open` non ne ha. Lo stile sta nel
 * componente: i colori del tool non hanno un nostro token (segnalato in
 * `VETRINE_V6_FASE0.md`, D-31), quindi gli stati si distinguono con i tre che
 * abbiamo.
 */
export const STATO_PARTENZA: Record<Exclude<StatoPartenza, 'open'>, { lunga: string; corta: string }> = {
  confirmed: { lunga: 'Confermato', corta: 'Confermato' },
  last_seats: { lunga: 'Ultimi posti disponibili', corta: 'Ultimi posti' },
  sold_out: { lunga: 'Sold out', corta: 'Sold out' },
}

export function etichettaStato(stato: StatoPartenza, corta = false): string | null {
  if (stato === 'open') return null
  return corta ? STATO_PARTENZA[stato].corta : STATO_PARTENZA[stato].lunga
}

/**
 * "6-15 persone". Con il solo massimo il tool scrive "15 persone", come se
 * fossero esattamente quindici: qui "fino a 15 persone" (D-18, testo da
 * rivedere a Gaia). Con il solo minimo, "almeno 6 persone".
 */
export function persone(min: number | null, max: number | null, parola = 'persone'): string | null {
  if (min && max) return min === max ? `${max} ${parola}` : `${min}-${max} ${parola}`
  if (max) return `fino a ${max} ${parola}`
  if (min) return `almeno ${min} ${parola}`
  return null
}

/** "Laos e Thailandia", "Perù, Bolivia e Cile". */
export function elencoPaesi(paesi: string[]): string | null {
  if (!paesi.length) return null
  return new Intl.ListFormat('it', { style: 'long', type: 'conjunction' }).format(paesi)
}

/** "Giorno 1-3", "Giorno 4". */
export function etichettaTappa(giorni: string | null): string | null {
  const t = giorni?.trim()
  return t ? `Giorno ${t}` : null
}

/** La riga sotto il prezzo: prefisso di `app_config` · nota. I pezzi vuoti spariscono. */
export function rigaPrezzo(...pezzi: (string | null | undefined)[]): string | null {
  const riga = pezzi.map((p) => p?.trim()).filter(Boolean).join(' · ')
  return riga || null
}

/** «Durata» dell'itinerario: "10 gg · 11 notti". */
export function durataItinerario(giorni: string | null, notti: number | null): string | null {
  return rigaPrezzo(giorniCorti(giorni), notti ? `${notti} notti` : null)
}

/** «Durata» del gruppo: "13 giorni · 12 notti" (il tool qui non accorcia). */
export function durataGruppo(giorni: string | null, notti: number | null): string | null {
  return rigaPrezzo(etichettaGiorni(giorni), notti ? `${notti} notti` : null)
}

/** I sei punteggi di «Questo viaggio fa per me?», con le etichette del tool. */
export function puntiFaPerMe(v: DettaglioVoce): { etichetta: string; punti: number }[] {
  return [
    { etichetta: 'Natura', punti: v.fit_nature },
    { etichetta: 'Trekking', punti: v.fit_trekking },
    { etichetta: 'On the Road', punti: v.fit_on_the_road },
    { etichetta: 'City', punti: v.fit_city },
    { etichetta: 'Cultura', punti: v.fit_culture },
    { etichetta: 'Chill', punti: v.fit_chill },
  ]
}

/** La prossima partenza in forma leggibile, con l'etichetta corta dello stato. */
export function prossimaPartenza(p: Partenza | null) {
  if (!p) return null
  return { date: intervalloDate(p.starts_on, p.ends_on), stato: p.status, etichetta: etichettaStato(p.status, true) }
}

/** Testo a paragrafi: separati da una riga vuota, come la storia del form. */
export function paragrafiDi(testo: string | null | undefined): string[] {
  if (!testo) return []
  return testo.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
}

/** Accorcia per la descrizione dell'anteprima (WhatsApp, social): 160 caratteri, a parola intera. */
export function accorcia(testo: string | null | undefined, n = 160): string | undefined {
  const t = (testo ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return undefined
  return t.length > n ? `${t.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : t
}

/**
 * La riga sotto «Personalizza con una call» / «Parlane con…». Il tool scrive
 * «Si parte dall'Incontro, 30 minuti e 30€: se poi parti con Luca, i 30€ si
 * scalano dal viaggio» — fuori regola due volte: i 30€ sono scritti a mano per
 * tutti (R1) e il credito è quantificato (R2). Qui durata e prezzo vengono dal
 * servizio del designer, e il credito si promette senza cifra.
 */
export function rigaCredito(minuti: number | null, prezzo: string | null, nome: string): string {
  const inizio = [minuti ? `${minuti} minuti` : null, prezzo].filter(Boolean).join(' e ')
  return inizio
    ? `Si parte dalla call, ${inizio}: se poi parti con ${nome}, il costo della call viene scalato dal viaggio.`
    : `Si parte dalla call: se poi parti con ${nome}, il costo della call viene scalato dal viaggio.`
}
