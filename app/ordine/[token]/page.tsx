import type { Metadata } from 'next'
import Link from 'next/link'
import { CHIAVI, leggiContatto } from '@/lib/config'
import { euro, euroPerCampo, leggiPaginaOrdine, type PaginaOrdine, type StatoOrdine } from '@/lib/ordine'
import { Avviso, Guscio, ScriviciWhatsApp, Spiegazione } from '@/components/pagina-token'
import { CopiaTesto } from '@/components/copia-testo'

/**
 * La pagina ordine del Travel Designer: il suo unico strumento di lavoro.
 *
 * Flusso §7: «pensata per il telefono, raggiungibile solo dal link con token
 * che riceve via mail a ogni nuovo ordine. Una pagina, uno stato, un'azione.»
 * Il designer non ha login: **il token è la sua identità**, e la riga di
 * `order_status_history` con `actor = 'td'` che le funzioni Postgres scrivono è
 * l'unica prova che abbia agito lui.
 *
 * ## Il primo token che tocca i soldi
 *
 * Questa pagina fissa un prezzo che un cliente pagherà. Il ragionamento su cosa
 * può fare chi trova il link inoltrato è in testa a
 * `0044_proposta_su_misura.sql`; qui ne arrivano le conseguenze:
 *
 *  · **salvare e inviare sono due gesti.** Salvando, il designer vede il
 *    riepilogo esattamente come lo riceverà il viaggiatore; inviando, la
 *    pagina ridichiara il prezzo di quel riepilogo, e se nel frattempo la
 *    bozza è cambiata l'invio si rifiuta;
 *  · **dopo l'invio non c'è un tasto «modifica».** Non perché la pagina lo
 *    nasconda: il database rifiuta la modifica anche alla chiave secret. Una
 *    proposta partita si rifà passando dal team.
 *
 * ## Il credito, in questa pagina
 *
 * Il prezzo che il designer scrive è **il prezzo finale**. Il campo «credito»
 * accanto è la sua dichiarazione di quanto ha scalato, per lo spot-check del
 * team: la pagina non la sottrae, e non deve. Vedi `CLAUDE.md`.
 *
 * ## Cosa manca, di proposito
 *
 * Consegna e revisione (la seconda metà della milestone 6) e il tasto «C'è un
 * problema» (i tasti eccezione, riga a sé). Al loro posto, oggi, WhatsApp al
 * team. E manca un disegno: il Figma non ha questa pagina — è segnata come
 * domanda aperta in `PIANO.md`, e fino ad allora usa il guscio delle altre
 * pagine a token.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'XPETIS',
  robots: { index: false, follow: false, nocache: true },
}

const DATA = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: 'Europe/Rome' })

const STATO: Record<StatoOrdine, string> = {
  requested: 'Richiesta ricevuta',
  in_definition: 'In definizione',
  proposal_sent: 'Proposta inviata, in attesa di pagamento',
  in_progress: 'Pagata: si lavora',
  delivered: 'Consegnato',
  revision_requested: 'Revisione richiesta',
  completed: 'Chiuso',
  cancelled: 'Annullato',
  disputed: 'In verifica dal team',
}

type Query = { esito?: string; campo?: string; motivo?: string; su?: string; modifica?: string }

export default async function PaginaOrdineTd({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Query>
}) {
  const { token } = await params
  const q = await searchParams
  const pagina = await leggiPaginaOrdine(token)
  const whatsapp = await leggiContatto(CHIAVI.whatsapp)

  if (pagina.esito !== 'valido' && pagina.esito !== 'gia_richiesto') {
    return <Spiegazione esito={pagina.esito} whatsapp={whatsapp} />
  }

  const stato = pagina.status!
  const bozzaCompleta = !!(pagina.descrizione && pagina.prezzo_cents != null && pagina.giorni)
  const avviso = testoAvviso(q, pagina)
  const base = `/ordine/${encodeURIComponent(token)}`

  return (
    <Guscio>
      <Intestazione pagina={pagina} stato={stato} />

      {avviso && <Avviso tono={avviso.tono}>{avviso.testo}</Avviso>}

      {(stato === 'requested' || stato === 'in_definition') &&
        (bozzaCompleta && !q.modifica ? (
          <Riepilogo pagina={pagina} base={base} />
        ) : (
          <Modulo pagina={pagina} base={base} />
        ))}

      {stato === 'proposal_sent' && <Inviata pagina={pagina} />}

      {stato === 'in_progress' && (
        <section className="space-y-3">
          <p className="text-corpo-big">
            Il viaggiatore ha pagato: puoi cominciare. Hai {pagina.giorni} giorni per la consegna.
          </p>
          <p className="text-corpo opacity-80">
            Il caricamento dell&apos;itinerario arriverà su questa stessa pagina. Per ora, quando è
            pronto, scrivi al team.
          </p>
        </section>
      )}

      {(stato === 'cancelled' || stato === 'disputed' || stato === 'delivered' ||
        stato === 'revision_requested' || stato === 'completed') && (
        <p className="text-corpo-big">
          {stato === 'cancelled'
            ? 'Questo ordine è stato annullato: non c’è niente da fare qui.'
            : stato === 'disputed'
              ? 'Su questo ordine il team sta guardando una cosa a mano, e ti scriverà.'
              : 'Da qui in avanti se ne occupa il team: per qualunque cosa, scrivi su WhatsApp.'}
        </p>
      )}

      <div className="border-t border-scuro/20 pt-6">
        <ScriviciWhatsApp numero={whatsapp} etichetta="Scrivi al team" />
      </div>
    </Guscio>
  )
}

function Intestazione({ pagina, stato }: { pagina: PaginaOrdine; stato: StatoOrdine }) {
  return (
    <header className="space-y-3">
      <p className="text-corpo opacity-70">
        Itinerario su misura · {pagina.human_ref}
      </p>
      <h1 className="font-titoli text-h3">{STATO[stato]}</h1>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-corpo">
        {pagina.nome_viaggiatore && (
          <>
            <dt className="opacity-60">Per</dt>
            <dd>{pagina.nome_viaggiatore}</dd>
          </>
        )}
        {pagina.call_il && (
          <>
            <dt className="opacity-60">Call del</dt>
            <dd>{DATA.format(new Date(pagina.call_il))}</dd>
          </>
        )}
        {pagina.prezzo_call_cents != null && (
          <>
            <dt className="opacity-60">Consulenza pagata</dt>
            <dd>
              {euro(pagina.prezzo_call_cents)}
              {pagina.credito_usato_su ? ` · già scalata su ${pagina.credito_usato_su}` : ' · da scalare'}
            </dd>
          </>
        )}
      </dl>
    </header>
  )
}

/**
 * Il form della proposta. È HTML che fa POST: funziona senza JavaScript, dal
 * browser dentro l'app di posta da cui il designer arriva.
 *
 * Il prezzo è un campo di testo e non `type="number"`: su telefono quest'ultimo
 * vuole la virgola o il punto a seconda della tastiera, e scarta in silenzio
 * quello che non capisce. La lettura degli euro sta in `euroInCentesimi()`.
 */
function Modulo({ pagina, base }: { pagina: PaginaOrdine; base: string }) {
  const creditoBloccato = !!pagina.credito_usato_su || pagina.prezzo_call_cents == null

  return (
    <form action={`${base}/bozza`} method="post" className="space-y-6">
      <label className="block space-y-2">
        <span className="text-corpo-big">La proposta</span>
        <span className="block text-corpo opacity-70">
          Cosa farai, come sarà il viaggio, cosa riceverà. È il testo che il viaggiatore legge nella
          mail e sulla pagina della proposta, così come lo scrivi.
        </span>
        <textarea
          name="descrizione"
          required
          rows={10}
          maxLength={20000}
          defaultValue={pagina.descrizione ?? ''}
          className="w-full rounded-2xl border border-scuro/30 bg-transparent p-4 text-corpo"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-corpo-big">Prezzo finale, in euro</span>
        <span className="block text-corpo opacity-70">
          È quello che paga il viaggiatore.{' '}
          {pagina.credito_usato_su
            ? `Il credito di questa call è già stato usato su ${pagina.credito_usato_su}: qui non va scalato.`
            : 'Se scali la consulenza, toglila tu da qui: il sistema non toglie niente da solo.'}
        </span>
        <input
          name="prezzo"
          required
          inputMode="decimal"
          autoComplete="off"
          placeholder="es. 450 oppure 1.150,50"
          defaultValue={euroPerCampo(pagina.prezzo_cents)}
          className="w-full rounded-full border border-scuro/30 bg-transparent px-5 py-3 text-corpo-big"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-corpo-big">Giorni di consegna</span>
        <span className="block text-corpo opacity-70">Dal pagamento alla consegna dell&apos;itinerario.</span>
        <input
          name="giorni"
          type="number"
          required
          min={1}
          inputMode="numeric"
          defaultValue={pagina.giorni ?? ''}
          className="w-32 rounded-full border border-scuro/30 bg-transparent px-5 py-3 text-corpo-big"
        />
      </label>

      {creditoBloccato ? (
        <input type="hidden" name="credito" value="0" />
      ) : (
        <label className="block space-y-2">
          <span className="text-corpo-big">Quanto hai scalato per la consulenza</span>
          <span className="block text-corpo opacity-70">
            Non cambia il prezzo qui sopra: serve al team per il controllo. Al massimo{' '}
            {euro(pagina.prezzo_call_cents)}. Se non hai scalato niente, lascia 0.
          </span>
          <input
            name="credito"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={euroPerCampo(pagina.credito_cents ?? 0)}
            className="w-40 rounded-full border border-scuro/30 bg-transparent px-5 py-3 text-corpo-big"
          />
        </label>
      )}

      <button
        type="submit"
        className="rounded-full bg-primario px-6 py-3 text-corpo-big text-neutro transition hover:brightness-110"
      >
        Salva e rileggi
      </button>
      <p className="text-corpo opacity-60">
        Salvare non manda niente a nessuno: prima rileggi, poi invii.
      </p>
    </form>
  )
}

/** Il riepilogo prima dell'invio: esattamente quello che riceverà il viaggiatore. */
function Riepilogo({ pagina, base }: { pagina: PaginaOrdine; base: string }) {
  return (
    <section className="space-y-6">
      <p className="text-corpo-big">
        Rileggila: {pagina.nome_viaggiatore ?? 'il viaggiatore'} la riceverà così, per mail e sulla
        pagina della proposta.
      </p>

      <Proposta pagina={pagina} />

      <form action={`${base}/invia`} method="post" className="space-y-3">
        {/* Il prezzo che il designer ha davanti adesso. Se la bozza cambia
            prima del clic, `send_proposal` rifiuta invece di mandare un prezzo
            che nessuno ha riletto. */}
        <input type="hidden" name="prezzo_cents" value={String(pagina.prezzo_cents)} />
        <button
          type="submit"
          className="rounded-full bg-primario px-6 py-3 text-corpo-big text-neutro transition hover:brightness-110"
        >
          Invia la proposta · {euro(pagina.prezzo_cents)}
        </button>
        <p className="text-corpo opacity-80">
          <strong>Dopo l&apos;invio non si modifica più da qui.</strong> Se servirà cambiarla, lo
          farai passando dal team.
        </p>
      </form>

      <Link href={`${base}?modifica=1`} className="inline-block text-corpo underline">
        Modifica
      </Link>
    </section>
  )
}

function Inviata({ pagina }: { pagina: PaginaOrdine }) {
  return (
    <section className="space-y-6">
      <p className="text-corpo-big">
        {pagina.nome_viaggiatore ?? 'Il viaggiatore'} ha ricevuto la proposta per mail. Gira il
        link anche nel gruppo WhatsApp: chi arriva da lì paga dalla stessa pagina.
      </p>

      {pagina.messaggio_pronto ? (
        <CopiaTesto testo={pagina.messaggio_pronto} />
      ) : (
        pagina.link_proposta && <CopiaTesto testo={pagina.link_proposta} etichetta="Copia il link" />
      )}

      <details className="space-y-4">
        <summary className="cursor-pointer text-corpo underline">La proposta inviata</summary>
        <div className="pt-4">
          <Proposta pagina={pagina} />
        </div>
      </details>
    </section>
  )
}

function Proposta({ pagina }: { pagina: PaginaOrdine }) {
  return (
    <article className="space-y-4 rounded-2xl border border-scuro/30 p-5">
      <p className="whitespace-pre-line text-corpo">{pagina.descrizione}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-corpo">
        <dt className="opacity-60">Prezzo</dt>
        <dd className="font-bold">{euro(pagina.prezzo_cents)}</dd>
        <dt className="opacity-60">Consegna</dt>
        <dd>entro {pagina.giorni === 1 ? '1 giorno' : `${pagina.giorni} giorni`} dal pagamento</dd>
        {!!pagina.credito_cents && (
          <>
            <dt className="opacity-60">Credito dichiarato</dt>
            <dd>{euro(pagina.credito_cents)} (già tolto dal prezzo, non si vede nella mail)</dd>
          </>
        )}
      </dl>
    </article>
  )
}

/** Dopo un gesto la route torna qui con `?esito=`: è la pagina a dire cosa è successo. */
function testoAvviso(q: Query, pagina: PaginaOrdine): { testo: string; tono: 'neutro' | 'errore' } | null {
  switch (q.esito) {
    case undefined:
    case 'salvata':
      return null
    case 'inviata':
    case 'gia_inviata':
      return { testo: 'Proposta inviata.', tono: 'neutro' }
    case 'dati_non_validi':
      return { tono: 'errore', testo: testoCampo(q, pagina) }
    case 'credito_gia_usato':
      return {
        tono: 'errore',
        testo: `Il credito di questa call è già stato dichiarato${q.su ? ` sull’ordine ${q.su}` : ' su un altro ordine'}: qui non va scalato. Rimetti il prezzo intero e lascia il credito a zero.`,
      }
    case 'prezzo_cambiato':
      return {
        tono: 'errore',
        testo: 'La proposta è cambiata dopo che l’hai riletta, forse da un’altra scheda. Ricontrolla il riepilogo e invia di nuovo.',
      }
    case 'bozza_mancante':
      return { tono: 'errore', testo: 'Prima salva la proposta: si invia solo dopo averla riletta.' }
    case 'proposta_gia_inviata':
      return {
        tono: 'errore',
        testo: 'La proposta è già partita, e da qui non si modifica più. Se serve cambiarla, scrivi al team.',
      }
    case 'stato_non_ammesso':
      return { tono: 'errore', testo: 'In questo stato la proposta non si può scrivere né inviare.' }
    default:
      return { tono: 'errore', testo: 'Non siamo riusciti a salvare. Riprova fra un minuto.' }
  }
}

function testoCampo(q: Query, pagina: PaginaOrdine): string {
  switch (q.campo) {
    case 'descrizione':
      return 'Manca la descrizione del viaggio.'
    case 'prezzo':
      return 'Il prezzo non si legge: scrivilo in euro, per esempio 450 oppure 1.150,50. Il minimo è 0,50 €.'
    case 'giorni':
      return 'I giorni di consegna devono essere almeno 1.'
    case 'credito':
      if (q.motivo === 'oltre_prezzo_call') {
        return `Il credito non può superare quanto è costata la consulenza (${euro(pagina.prezzo_call_cents)}).`
      }
      if (q.motivo === 'senza_call') {
        return 'Questo ordine non nasce da una consulenza: non c’è credito da scalare.'
      }
      return 'Il credito non si legge: scrivilo in euro, oppure lascia 0.'
    default:
      return 'Qualcosa nella proposta non va. Ricontrolla i campi.'
  }
}
