import type { Metadata } from 'next'
import { CHIAVI, leggiContatto } from '@/lib/config'
import { euro, leggiPaginaProposta, type PaginaProposta } from '@/lib/ordine'
import { Avviso, Guscio, ScriviciWhatsApp, Spiegazione } from '@/components/pagina-token'
import { AttesaConferma } from '@/components/attesa-conferma'
import { ElencoFile } from '@/components/elenco-file'

/**
 * La pagina gemella della proposta su misura.
 *
 * Flusso §7: «un link che mostra lo stesso identico contenuto della mail,
 * impaginato XPETIS, con il pagamento dentro. Quel link è il pezzo che il TD
 * gira nel gruppo WhatsApp. Chi legge la mail paga dalla mail, chi arriva dal
 * gruppo paga dalla pagina: il pagamento dietro è lo stesso.»
 *
 * ## Fatta per essere girata
 *
 * Quindi mostra la proposta e **niente del viaggiatore**: né nome, né mail, né
 * telefono. Chi ha il link può leggere il viaggio e pagarlo — al massimo, cioè,
 * pagare l'itinerario di qualcun altro.
 *
 * ## Il pagamento dietro un token permanente
 *
 * La regola della 0043 dice che dietro un token permanente non va un'azione
 * che muove denaro. Il bottone qui sotto non ne muove: **apre una cassa**, con
 * l'importo letto dal database, e Stripe lo ridichiara a chi mette la carta. Il
 * denaro lo muove quella persona, con un gesto suo.
 *
 * ## Dopo la consegna (0046)
 *
 * La stessa pagina diventa quella da cui si scarica l'itinerario e si chiede la
 * revisione. È il link che arriva nella mail di consegna, **al posto del file**:
 * un link di Storage in una mail scadrebbe, questo no. I file si scaricano da un
 * indirizzo nostro che firma un link di un minuto al clic.
 *
 * La revisione è **una**, dentro la finestra: il tasto c'è solo quando
 * `puo_chiedere_revisione` lo dice (lo calcola il database con le stesse
 * regole di `request_revision`), e altrimenti la pagina dice perché — già
 * chiesta, o finestra chiusa — invece di mostrare un bottone che non fa niente.
 *
 * ## Cosa manca
 *
 * Un disegno. Il Flusso chiede a Chiara «la pagina proposta pubblica (deve
 * sembrare una pagina XPETIS, non una fattura)» e il Figma non la ha: è una
 * domanda aperta in `PIANO.md`, e fino ad allora usa il guscio delle pagine a
 * token.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'XPETIS',
  robots: { index: false, follow: false, nocache: true },
}

type Query = { ritorno?: string; cassa?: string; revisione?: string; file?: string }

const DATA = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: 'Europe/Rome' })

export default async function PaginaProposta({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Query>
}) {
  const { token } = await params
  const q = await searchParams
  const pagina = await leggiPaginaProposta(token)
  const whatsapp = await leggiContatto(CHIAVI.whatsapp)

  if (pagina.esito !== 'valido' && pagina.esito !== 'gia_richiesto') {
    return <Spiegazione esito={pagina.esito} whatsapp={whatsapp} />
  }

  const designer = pagina.td_name ?? 'il designer'
  const base = `/proposta/${encodeURIComponent(token)}`

  return (
    <Guscio>
      <header className="space-y-2">
        <p className="text-corpo opacity-70">Itinerario su misura · {pagina.human_ref}</p>
        <h1 className="font-titoli text-h3">La proposta di {designer}</h1>
      </header>

      {pagina.fase === 'da_pagare' && (
        <>
          {q.ritorno ? <AttesaConferma /> : avvisoCassa(q.cassa)}
          <Proposta pagina={pagina} />
          <p className="text-corpo opacity-80">
            Il prezzo è quello finale, da pagare così com&apos;è: se c&apos;era la consulenza da
            scalare, {designer} l&apos;ha già fatto. Comprende l&apos;itinerario completo e una
            revisione.
          </p>
          <form action={`/proposta/${encodeURIComponent(token)}/cassa`} method="post" className="space-y-3">
            <button
              type="submit"
              className="rounded-full bg-primario px-6 py-3 text-corpo-big text-neutro transition hover:brightness-110"
            >
              Paga {euro(pagina.prezzo_cents)}
            </button>
            <p className="text-corpo opacity-60">
              Il pagamento avviene su Stripe. Se qualcosa non ti torna, dillo nel gruppo WhatsApp
              prima di pagare: la proposta si può rifare.
            </p>
          </form>
        </>
      )}

      {pagina.fase === 'pagata' && (
        <>
          <p className="text-corpo-big">
            Pagata, grazie. {designer} è al lavoro: l&apos;itinerario arriva entro{' '}
            {pagina.giorni === 1 ? '1 giorno' : `${pagina.giorni} giorni`} dal pagamento.
          </p>
          <details>
            <summary className="cursor-pointer text-corpo underline">La proposta</summary>
            <div className="pt-4">
              <Proposta pagina={pagina} />
            </div>
          </details>
        </>
      )}

      {q.file && (
        <Avviso tono="errore">
          {q.file === 'irraggiungibile'
            ? 'Non riusciamo a preparare il file adesso. Riprova fra un minuto.'
            : 'Questo file non si trova. Ricarica la pagina e riprova; se continua, scrivici.'}
        </Avviso>
      )}
      {avvisoRevisione(q.revisione)}

      {(pagina.fase === 'consegnata' || pagina.fase === 'in_revisione' || pagina.fase === 'chiusa') && (
        <Consegna pagina={pagina} base={base} designer={designer} />
      )}

      {pagina.fase === 'in_aggiornamento' && (
        <p className="text-corpo-big">
          Questa proposta è in aggiornamento: {designer} ne sta preparando una nuova, e la riceverai
          per mail. Il link resta questo.
        </p>
      )}

      {pagina.fase === 'annullata' && (
        <p className="text-corpo-big">Questa richiesta è stata annullata. Se non ti torna, scrivici.</p>
      )}

      {pagina.fase === 'in_verifica' && (
        <p className="text-corpo-big">
          Su questa richiesta il team sta guardando una cosa a mano, e ti scriverà.
        </p>
      )}

      <div className="border-t border-scuro/20 pt-6">
        <ScriviciWhatsApp numero={whatsapp} />
      </div>
    </Guscio>
  )
}

function Consegna({ pagina, base, designer }: { pagina: PaginaProposta; base: string; designer: string }) {
  return (
    <>
      <p className="text-corpo-big">
        {pagina.fase === 'in_revisione'
          ? `Hai chiesto la revisione: ${designer} ci sta lavorando, e riceverai una mail quando la versione rivista è pronta.`
          : pagina.fase === 'chiusa'
            ? `Il tuo itinerario su misura. Buon viaggio!`
            : `${designer} ha consegnato il tuo itinerario su misura.`}
      </p>

      <ElencoFile file={pagina.file ?? []} base={base} titolo="Da scaricare" />

      <Revisione pagina={pagina} base={base} />

      <details>
        <summary className="cursor-pointer text-corpo underline">La proposta</summary>
        <div className="pt-4">
          <Proposta pagina={pagina} />
        </div>
      </details>
    </>
  )
}

/**
 * La revisione inclusa, in tutte le sue facce. Il tasto c'è solo se il
 * database dice che si può; negli altri casi si dice perché, con le date.
 */
function Revisione({ pagina, base }: { pagina: PaginaProposta; base: string }) {
  if (pagina.puo_chiedere_revisione) {
    return (
      <form action={`${base}/revisione`} method="post" className="space-y-3">
        <label className="block space-y-2">
          <span className="text-corpo-big">Vuoi cambiare qualcosa?</span>
          <span className="block text-corpo opacity-70">
            Hai una revisione inclusa, una sola
            {pagina.revisione_entro ? `, da chiedere entro il ${DATA.format(new Date(pagina.revisione_entro))}` : ''}.
            Scrivi tutto quello che vorresti diverso, in una volta.
          </span>
          <textarea
            name="nota"
            required
            rows={5}
            maxLength={5000}
            className="w-full rounded-2xl border border-scuro/30 bg-transparent p-4 text-corpo"
          />
        </label>
        <button
          type="submit"
          className="rounded-full border border-scuro px-5 py-2 text-corpo transition hover:bg-scuro hover:text-neutro"
        >
          Chiedi la revisione
        </button>
        <p className="text-corpo opacity-60">Se va bene così, non devi fare niente.</p>
      </form>
    )
  }

  if (pagina.revisione_chiesta_il) {
    return (
      <p className="text-corpo opacity-80">
        La revisione inclusa l&apos;hai chiesta il {DATA.format(new Date(pagina.revisione_chiesta_il))}
        {pagina.revisione_consegnata_il
          ? ` ed è stata consegnata il ${DATA.format(new Date(pagina.revisione_consegnata_il))}`
          : ''}
        . Era una sola: per altre modifiche, scrivilo nel gruppo WhatsApp.
        {pagina.fase === 'consegnata' && pagina.si_chiude_il
          ? ` L’ordine si chiude il ${DATA.format(new Date(pagina.si_chiude_il))}.`
          : ''}
      </p>
    )
  }

  if (pagina.fase === 'chiusa') return null

  return (
    <p className="text-corpo opacity-80">
      Il tempo per chiedere la revisione inclusa è finito
      {pagina.revisione_entro ? ` il ${DATA.format(new Date(pagina.revisione_entro))}` : ''}. Se qualcosa non
      torna, scrivici.
    </p>
  )
}

/** Dopo «Chiedi la revisione» la route torna qui con `?revisione=`. */
function avvisoRevisione(codice: string | undefined) {
  switch (codice) {
    case undefined:
      return null
    case 'revisione_chiesta':
    case 'revisione_in_corso':
      return <Avviso>Richiesta ricevuta: il designer la riceve adesso per mail.</Avviso>
    case 'revisione_gia_chiesta':
      return <Avviso tono="errore">La revisione inclusa era una sola, ed è già stata chiesta.</Avviso>
    case 'finestra_chiusa':
      return <Avviso tono="errore">Il tempo per chiedere la revisione è finito.</Avviso>
    case 'ordine_chiuso':
      return <Avviso tono="errore">Questo ordine è chiuso: per qualunque cosa, scrivici.</Avviso>
    case 'dati_non_validi':
      return <Avviso tono="errore">Scrivi cosa vorresti cambiare: senza, il designer non sa da dove partire.</Avviso>
    default:
      return <Avviso tono="errore">Non siamo riusciti a registrare la richiesta. Riprova fra un minuto.</Avviso>
  }
}

function Proposta({ pagina }: { pagina: PaginaProposta }) {
  return (
    <article className="space-y-4 rounded-2xl border border-scuro/30 p-5">
      <p className="whitespace-pre-line text-corpo">{pagina.descrizione}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-corpo">
        <dt className="opacity-60">Prezzo</dt>
        <dd className="font-bold">{euro(pagina.prezzo_cents)}</dd>
        <dt className="opacity-60">Consegna</dt>
        <dd>entro {pagina.giorni === 1 ? '1 giorno' : `${pagina.giorni} giorni`} dal pagamento</dd>
      </dl>
    </article>
  )
}

/** Dopo un clic su «Paga» che non ha portato a Stripe, la route torna qui con `?cassa=`. */
function avvisoCassa(codice: string | undefined) {
  switch (codice) {
    case undefined:
      return null
    case 'in_conferma':
      return <AttesaConferma />
    case 'attendi':
      return <Avviso>Un attimo: c&apos;è già un pagamento in apertura. Riprova fra qualche secondo.</Avviso>
    case 'non_pagabile':
      return <Avviso tono="errore">Questa proposta non è più da pagare.</Avviso>
    default:
      return (
        <Avviso tono="errore">
          Non siamo riusciti ad aprire il pagamento. Riprova fra un minuto; se continua, scrivici.
        </Avviso>
      )
  }
}
