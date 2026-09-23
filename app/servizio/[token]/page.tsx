import type { Metadata } from 'next'
import { CHIAVI, leggiContatto } from '@/lib/config'
import { ETICHETTA_SERVIZIO, type TipoServizio } from '@/lib/vetrina'
import { leggiPaginaServizio, type PaginaServizio } from '@/lib/token'
import { Guscio, ScriviciWhatsApp, Spiegazione } from '@/components/pagina-token'

/**
 * La pagina di un bottone della mail post-call.
 *
 * ## Perché il clic non crea l'ordine, e questa pagina esiste
 *
 * La strada breve era far creare l'ordine direttamente al link della mail. È
 * scartata, e non per prudenza generica: **i link delle mail vengono aperti da
 * macchine**. Gli antivirus aziendali li visitano per controllarli, Outlook li
 * riscrive e li apre con SafeLinks, Gmail precarica. Un indirizzo che crea un
 * ordine appena viene aperto produrrebbe richieste che nessuna persona ha mai
 * chiesto, e il team aprirebbe gruppi WhatsApp per nessuno.
 *
 * Quindi: il link **mostra**, e un bottone **fa**. Il gesto che conta è un
 * POST, che nessuno scanner esegue.
 *
 * ## Cosa questa pagina non dice
 *
 * Il token non scade mai — è una decisione di prodotto del Flusso, perché il
 * viaggiatore deve poter tornare a mesi di distanza — quindi quel link vive per
 * sempre in una casella che si può inoltrare. Chi lo trova non può impegnare
 * un euro, ma può **leggere**: per questo qui non compaiono il nome del
 * viaggiatore, il suo telefono, la domanda di contesto né il profilo quiz.
 * Restano il designer e il servizio, che sono il minimo per decidere.
 *
 * Il ragionamento per esteso è in testa a `0043_posta.sql`, parte D.
 */

export const dynamic = 'force-dynamic'

// Le pagine token non si indicizzano. Il `meta` qui e l'header `X-Robots-Tag`
// in `next.config.ts` dicono la stessa cosa due volte di proposito: il secondo
// vale anche per chi non esegue l'HTML.
export const metadata: Metadata = {
  title: 'XPETIS',
  robots: { index: false, follow: false, nocache: true },
}

export default async function PaginaServizioToken({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const pagina = await leggiPaginaServizio(token)
  const whatsapp = await leggiContatto(CHIAVI.whatsapp)

  if (pagina.esito === 'valido') {
    return <Conferma token={token} pagina={pagina} />
  }
  if (pagina.esito === 'gia_richiesto') {
    return <Ricevuta pagina={pagina} whatsapp={whatsapp} />
  }
  return <Spiegazione esito={pagina.esito} whatsapp={whatsapp} />
}

/**
 * Il bottone vero. È un form HTML che fa POST: funziona senza una riga di
 * JavaScript, il che conta perché chi arriva qui arriva da una mail, a volte da
 * un browser dentro un'app di posta.
 */
function Conferma({ token, pagina }: { token: string; pagina: PaginaServizio }) {
  const etichetta = ETICHETTA_SERVIZIO[pagina.service_type as TipoServizio]
  const designer = pagina.td_name ?? 'il tuo designer'

  return (
    <Guscio>
      <header className="space-y-2">
        <h1 className="font-titoli text-h3">{etichetta}</h1>
        <p className="text-corpo-big">Con {designer}</p>
      </header>

      <p className="text-corpo-big">
        Se confermi, {designer} riceve la tua richiesta e apriamo un gruppo WhatsApp dove definite
        il viaggio insieme, con i vostri tempi.
      </p>

      {/* Che qui non si compri niente va detto prima del clic, non dopo: è la
          differenza fra un bottone che chiede e uno che impegna dei soldi. */}
      <p className="text-corpo opacity-80">
        <strong>Non stai comprando niente adesso.</strong> Il prezzo lo scrive {designer} più
        avanti, quando saprà cosa vuoi — e quello che hai già pagato per la consulenza lo scala
        da lì.
      </p>

      <form action={`/servizio/${encodeURIComponent(token)}/richiedi`} method="post">
        <button
          type="submit"
          className="rounded-full bg-primario px-6 py-3 text-corpo-big text-neutro transition hover:brightness-110"
        >
          Sì, mandagli la richiesta
        </button>
      </form>

      <p className="text-corpo opacity-60">
        Ci hai ripensato? Chiudi pure questa pagina: non succede niente, e il link resta buono.
      </p>
    </Guscio>
  )
}

function Ricevuta({
  pagina,
  whatsapp,
}: {
  pagina: PaginaServizio
  whatsapp: string | null
}) {
  const etichetta = ETICHETTA_SERVIZIO[pagina.service_type as TipoServizio]

  return (
    <Guscio>
      <header className="space-y-2">
        <h1 className="font-titoli text-h3">L&apos;abbiamo ricevuta</h1>
        <p className="text-corpo-big">
          {etichetta}
          {pagina.td_name ? ` con ${pagina.td_name}` : ''}
          {pagina.human_ref ? ` · ${pagina.human_ref}` : ''}
        </p>
      </header>

      <p className="text-corpo-big">
        Adesso tocca a noi: apriamo il gruppo WhatsApp con te e {pagina.td_name ?? 'il designer'},
        e da lì si parte. Se hai cliccato due volte non è successo niente — la richiesta resta una.
      </p>

      <div>
        <ScriviciWhatsApp numero={whatsapp} />
      </div>
    </Guscio>
  )
}
