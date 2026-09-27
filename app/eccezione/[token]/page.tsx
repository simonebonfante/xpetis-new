import type { Metadata } from 'next'
import { CHIAVI, leggiContatto } from '@/lib/config'
import { leggiPaginaEccezione, type PaginaEccezione } from '@/lib/eccezione'
import { Avviso, Guscio, ScriviciWhatsApp, Spiegazione } from '@/components/pagina-token'

/**
 * I due tasti del dopo-call del designer: «no-show» e «altro problema».
 *
 * Flusso §6: «micro-pagine token dei tasti eccezione (semplicissime, una
 * domanda e un tasto)». Il designer ci arriva dalla mail di fine call; se non
 * fa niente, la call si chiude da sola dopo 48 ore, ed è il caso normale.
 *
 * ## Il no-show dichiara, non chiude
 *
 * Premere il tasto **non** chiude la call come no-show: la porta al team, che
 * verifica — lo dice il Flusso, «verifica rapida del team, chiusura come
 * no-show». La pagina lo scrive prima del tasto, perché chi lo preme sappia che
 * sta aprendo una verifica e non emettendo una sentenza.
 *
 * ## Cosa manca
 *
 * Un disegno: il Figma non ha queste pagine (Chiara, «semplicissime»). Usano il
 * guscio delle altre pagine a token. È fra le domande aperte in `PIANO.md`.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'XPETIS',
  robots: { index: false, follow: false, nocache: true },
}

const ORA = new Intl.DateTimeFormat('it-IT', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Rome',
})

type Query = { esito?: string; campo?: string }

export default async function PaginaEccezioneTd({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Query>
}) {
  const { token } = await params
  const q = await searchParams
  const pagina = await leggiPaginaEccezione(token)
  const whatsapp = await leggiContatto(CHIAVI.whatsapp)

  if (pagina.esito !== 'valido' && pagina.esito !== 'gia_richiesto') {
    return <Spiegazione esito={pagina.esito} whatsapp={whatsapp} />
  }

  const noShow = pagina.tipo === 'no_show'
  const chi = pagina.nome_viaggiatore ?? 'chi aveva prenotato'
  const avviso = testoAvviso(q)

  return (
    <Guscio>
      <header className="space-y-2">
        <p className="text-corpo opacity-70">
          Call con {chi} del {pagina.call_il ? ORA.format(new Date(pagina.call_il)) : '—'}
        </p>
        {/* Niente participi con il genere, né per il designer né per chi ha
            prenotato: «dall'altra parte non c'era nessuno», non «non si è
            presentato». È la regola dei testi di seed/0005. */}
        <h1 className="font-titoli text-h3">
          {noShow ? 'Dall’altra parte non c’era nessuno?' : 'C’è stato un problema con la call?'}
        </h1>
      </header>

      {avviso && <Avviso tono={avviso.tono}>{avviso.testo}</Avviso>}

      <Contenuto pagina={pagina} token={token} />

      <div className="border-t border-scuro/20 pt-6">
        <ScriviciWhatsApp numero={whatsapp} etichetta="Scrivi al team" />
      </div>
    </Guscio>
  )
}

function Contenuto({ pagina, token }: { pagina: PaginaEccezione; token: string }) {
  const azione = `/eccezione/${encodeURIComponent(token)}/segnala`
  const noShow = pagina.tipo === 'no_show'

  switch (pagina.fase) {
    case 'gia_segnalata':
      return (
        <p className="text-corpo-big">
          Questa call è già stata segnalata al team
          {pagina.segnalata_il ? ` il ${ORA.format(new Date(pagina.segnalata_il))}` : ''}
          {pagina.segnalata_tipo === 'no_show' ? ', come no-show' : ', con un problema'}. Adesso se ne
          occupa il team, che ti scrive. Se devi aggiungere qualcosa, scrivilo su WhatsApp.
        </p>
      )
    case 'chiusa':
      return (
        <p className="text-corpo-big">
          Questa call si è chiusa
          {pagina.chiusa_il ? ` il ${ORA.format(new Date(pagina.chiusa_il))}` : ''}: da qui non si
          segnala più niente. Se c’è qualcosa che il team deve sapere, scrivilo su WhatsApp.
        </p>
      )
    case 'troppo_presto':
      return (
        <p className="text-corpo-big">
          La call è cominciata da poco. Prima di segnalare un no-show si aspettano{' '}
          {pagina.minuti_attesa ?? 15} minuti dall’inizio: riapri questo link se allo scadere non è
          arrivato nessuno.
        </p>
      )
    case 'non_ammessa':
      return (
        <p className="text-corpo-big">
          Questa call non è in uno stato da cui si possa segnalare qualcosa. Scrivi al team: è il caso
          in cui serve una persona.
        </p>
      )
  }

  // aperta
  return (
    <form action={azione} method="post" className="space-y-6">
      {noShow ? (
        <>
          <p className="text-corpo-big">
            Segnalalo qui. <strong>La call non si chiude come no-show da sola</strong>: la guarda il
            team, che ti scrive. Nel frattempo la chiusura automatica si ferma.
          </p>
          <label className="block space-y-2">
            <span className="text-corpo-big">Quanti minuti hai aspettato?</span>
            <span className="block text-corpo opacity-70">
              La regola è aspettare almeno {pagina.minuti_attesa ?? 15} minuti dall’inizio.
            </span>
            <input
              name="minuti"
              type="number"
              required
              min={0}
              max={600}
              inputMode="numeric"
              className="w-32 rounded-full border border-scuro/30 bg-transparent px-5 py-3 text-corpo-big"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-corpo-big">Vuoi aggiungere qualcosa?</span>
            <span className="block text-corpo opacity-70">
              Per esempio l’ora in cui hai aperto la call, o se hai provato a scrivere. Aiuta il team a
              decidere.
            </span>
            <textarea
              name="nota"
              rows={4}
              maxLength={5000}
              className="w-full rounded-2xl border border-scuro/30 bg-transparent p-4 text-corpo"
            />
          </label>
        </>
      ) : (
        <>
          <p className="text-corpo-big">
            Racconta cosa è successo. La call passa al team, che decide cosa fare e ti scrive; nel
            frattempo la chiusura automatica si ferma.
          </p>
          <label className="block space-y-2">
            <span className="text-corpo-big">Cosa è successo?</span>
            <textarea
              name="nota"
              required
              rows={6}
              maxLength={5000}
              className="w-full rounded-2xl border border-scuro/30 bg-transparent p-4 text-corpo"
            />
          </label>
        </>
      )}
      <button
        type="submit"
        className="rounded-full bg-primario px-6 py-3 text-corpo-big text-neutro transition hover:brightness-110"
      >
        {noShow ? 'Segnala il no-show' : 'Segnala il problema'}
      </button>
      {pagina.si_chiude_il && (
        <p className="text-corpo opacity-60">
          Si può segnalare fino al {ORA.format(new Date(pagina.si_chiude_il))}. Se è andato tutto bene,
          non serve fare niente.
        </p>
      )}
    </form>
  )
}

function testoAvviso(q: Query): { testo: string; tono: 'neutro' | 'errore' } | null {
  switch (q.esito) {
    case undefined:
      return null
    case 'segnalata':
      return { tono: 'neutro', testo: 'Segnalazione ricevuta. Il team la guarda e ti scrive.' }
    case 'gia_segnalata':
    case 'chiusa':
    case 'troppo_presto':
    case 'non_ammessa':
      return null   // lo dice la pagina, con il contesto intorno
    case 'dati_non_validi':
      return {
        tono: 'errore',
        testo:
          q.campo === 'minuti'
            ? 'Scrivi quanti minuti hai aspettato, con un numero.'
            : 'Scrivi cosa è successo: il team deve sapere di cosa si tratta.',
      }
    default:
      return { tono: 'errore', testo: 'Non siamo riusciti a registrare la segnalazione. Riprova fra un minuto.' }
  }
}
