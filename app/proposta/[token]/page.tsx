import type { Metadata } from 'next'
import { CHIAVI, leggiContatto } from '@/lib/config'
import { euro, leggiPaginaProposta, type PaginaProposta } from '@/lib/ordine'
import { Avviso, Guscio, ScriviciWhatsApp, Spiegazione } from '@/components/pagina-token'
import { AttesaConferma } from '@/components/attesa-conferma'

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

type Query = { ritorno?: string; cassa?: string }

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
