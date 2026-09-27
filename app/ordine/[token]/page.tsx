import type { Metadata } from 'next'
import Link from 'next/link'
import { CHIAVI, leggiContatto } from '@/lib/config'
import { euro, euroPerCampo, FORMA_IMPORTO, leggiPaginaOrdine, type PaginaOrdine, type StatoOrdine } from '@/lib/ordine'
import { Avviso, Guscio, ScriviciWhatsApp, Spiegazione } from '@/components/pagina-token'
import { CopiaTesto } from '@/components/copia-testo'
import { RicordaModulo } from '@/components/ricorda-modulo'
import { CaricaConsegna } from '@/components/carica-consegna'
import { ElencoFile } from '@/components/elenco-file'

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
 * ## La consegna (0046)
 *
 * Pagato → il caricamento del file col tasto «Consegna». Consegnato → il
 * messaggio pronto da girare nel gruppo e i file. Revisione chiesta → cosa è
 * stato chiesto e il caricamento della versione rivista. I file si scaricano
 * da un indirizzo nostro che firma un link di un minuto al clic: nessun link
 * di Storage sta in questa pagina.
 *
 * ## Cosa manca, di proposito
 *
 * Il tasto «C'è un problema» in fondo alla pagina ordine, che il Flusso §7
 * chiede e che non è stato chiesto con i tasti del dopo-call: al suo posto,
 * oggi, WhatsApp al team. E manca un disegno: il Figma non ha questa pagina —
 * è segnata come domanda aperta in `PIANO.md`, e fino ad allora usa il guscio
 * delle altre pagine a token.
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

type Query = { esito?: string; campo?: string; motivo?: string; su?: string; modifica?: string; file?: string }

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
      {q.file && (
        <Avviso tono="errore">
          {q.file === 'irraggiungibile'
            ? 'Non riusciamo a preparare il file adesso. Riprova fra un minuto.'
            : 'Questo file non si trova. Ricarica la pagina e riprova.'}
        </Avviso>
      )}

      {(stato === 'requested' || stato === 'in_definition') &&
        (bozzaCompleta && !q.modifica ? (
          <Riepilogo pagina={pagina} base={base} />
        ) : (
          // Tornati con un errore dalla route: il form si ripopola da quello
          // che è stato inviato, non dalla riga (vedi RicordaModulo).
          <Modulo pagina={pagina} base={base} ripristina={!!q.esito && q.esito !== 'salvata'} />
        ))}

      {stato === 'proposal_sent' && <Inviata pagina={pagina} />}

      {stato === 'in_progress' && (
        <section className="space-y-5">
          <p className="text-corpo-big">
            Il viaggiatore ha pagato: puoi cominciare. Hai {pagina.giorni} giorni per la consegna.
          </p>
          <CaricaConsegna base={base} revisione={false} />
        </section>
      )}

      {stato === 'delivered' && <Consegnato pagina={pagina} base={base} />}

      {stato === 'revision_requested' && (
        <section className="space-y-5">
          <p className="text-corpo-big">
            {pagina.nome_viaggiatore ?? 'Il viaggiatore'} ha chiesto la revisione inclusa
            {pagina.revisione_chiesta_il ? `, il ${DATA.format(new Date(pagina.revisione_chiesta_il))}` : ''}.
            Ecco cosa ha scritto:
          </p>
          <blockquote className="whitespace-pre-line rounded-2xl border border-scuro/30 p-5 text-corpo">
            {pagina.revisione_nota}
          </blockquote>
          <CaricaConsegna base={base} revisione />
          <ElencoFile file={pagina.file ?? []} base={base} titolo="Quello che hai consegnato" />
        </section>
      )}

      {stato === 'completed' && (
        <section className="space-y-5">
          <p className="text-corpo-big">
            Ordine chiuso{pagina.chiuso_il ? ` il ${DATA.format(new Date(pagina.chiuso_il))}` : ''}: il
            viaggiatore non ha chiesto altro, e il tuo compenso matura. Grazie.
          </p>
          <ElencoFile file={pagina.file ?? []} base={base} titolo="Quello che hai consegnato" />
        </section>
      )}

      {(stato === 'cancelled' || stato === 'disputed') && (
        <p className="text-corpo-big">
          {stato === 'cancelled'
            ? 'Questo ordine è stato annullato: non c’è niente da fare qui.'
            : 'Su questo ordine il team sta guardando una cosa a mano, e ti scriverà.'}
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
 * quello che non capisce. La lettura degli euro sta in `euroInCentesimi()`, la
 * forma ammessa in `FORMA_IMPORTO`: col `pattern` il browser ferma l'invio di
 * «030» o di tre decimali senza che il designer perda quello che ha scritto.
 * La route ricontrolla comunque.
 */
function Modulo({ pagina, base, ripristina }: { pagina: PaginaOrdine; base: string; ripristina: boolean }) {
  const creditoBloccato = !!pagina.credito_usato_su || pagina.prezzo_call_cents == null

  return (
    <form action={`${base}/bozza`} method="post" className="space-y-6">
      <RicordaModulo chiave={`proposta:${pagina.human_ref}`} ripristina={ripristina} />
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
          pattern={FORMA_IMPORTO}
          title="In euro, con al massimo due decimali: 450, 1.150 oppure 1150,50"
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
            pattern={FORMA_IMPORTO}
            title="In euro, con al massimo due decimali. Se non hai scalato niente, 0"
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

/**
 * Dopo la consegna: il messaggio da girare nel gruppo (porta alla pagina del
 * viaggiatore, mai al file), i file, e i due orologi detti in chiaro.
 */
function Consegnato({ pagina, base }: { pagina: PaginaOrdine; base: string }) {
  const rivista = !!pagina.revisione_consegnata_il
  const revisioneAperta =
    !pagina.revisione_chiesta_il && pagina.revisione_entro && new Date(pagina.revisione_entro) > new Date()

  return (
    <section className="space-y-6">
      <p className="text-corpo-big">
        {rivista ? 'Revisione consegnata' : 'Consegnato'}: {pagina.nome_viaggiatore ?? 'il viaggiatore'} ha
        ricevuto la mail con il link alla sua pagina. Gira il messaggio anche nel gruppo WhatsApp.
      </p>

      {pagina.messaggio_consegna && <CopiaTesto testo={pagina.messaggio_consegna} />}

      <ElencoFile file={pagina.file ?? []} base={base} titolo="Quello che hai consegnato" />

      <p className="text-corpo opacity-80">
        {revisioneAperta && pagina.revisione_entro
          ? `Il viaggiatore può chiedere la revisione inclusa fino al ${DATA.format(new Date(pagina.revisione_entro))}. `
          : ''}
        {pagina.si_chiude_il
          ? `Se non arriva nessuna richiesta, l’ordine si chiude da solo il ${DATA.format(new Date(pagina.si_chiude_il))}.`
          : ''}
      </p>
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
      return 'Il prezzo non si legge: scrivilo in euro, con al massimo due decimali e senza zeri davanti, per esempio 450 oppure 1.150,50. Il minimo è 0,50 €.'
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
