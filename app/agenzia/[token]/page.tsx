import type { Metadata } from 'next'
import { CHIAVI, leggiContatto } from '@/lib/config'
import { leggiPaginaAgenzia, type PaginaAgenzia } from '@/lib/agenzia'
import { dataGiorno, euro } from '@/lib/ordine'
import { Avviso, Guscio, ScriviciWhatsApp, Spiegazione } from '@/components/pagina-token'

/**
 * La pagina dell'agenzia: la verifica di una proposta All Inclusive.
 *
 * Flusso §8: «una pagina token come quelle dei TD, un click, nessun login,
 * nessun passaggio del team. È quella conferma a sbloccare la cascata.» È il
 * **terzo** destinatario delle pagine a token, dopo designer e viaggiatore, e
 * valgono le stesse regole: il contesto lo risolve il database, la pagina non
 * decide, `strict-origin` in `next.config.ts`.
 *
 * ## Il link si consuma
 *
 * È l'unico link a token che sblocca una cascata verso un cliente, quindi è
 * **monouso e scade** (0047): la prima risposta vince, e dopo la pagina dice
 * com'è andata. Una proposta rifatta arriva con un link nuovo, e questo
 * risponde «annullato».
 *
 * ## Cosa c'è, e cosa no
 *
 * Il pacchetto e il prezzo: totale, acconto, saldo, date, documento. **Niente
 * del viaggiatore**: l'agenzia non parla con lui («la cucina resta in
 * cucina»), e le persone le conosce dal gruppo tecnico.
 *
 * Manca un disegno: il Flusso lo chiede a Chiara («pagina token di conferma per
 * l'agenzia») e il Figma non l'ha. È una domanda aperta in `PIANO.md`, e fino
 * ad allora usa il guscio delle altre pagine a token.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'XPETIS',
  robots: { index: false, follow: false, nocache: true },
}

const DATA = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: 'Europe/Rome' })

type Query = { esito?: string; campo?: string; file?: string }

export default async function PaginaAgenziaToken({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<Query>
}) {
  const { token } = await params
  const q = await searchParams
  const pagina = await leggiPaginaAgenzia(token)
  const whatsapp = await leggiContatto(CHIAVI.whatsapp)

  if (pagina.esito !== 'valido' && pagina.esito !== 'gia_richiesto') {
    return <Spiegazione esito={pagina.esito} whatsapp={whatsapp} />
  }

  const base = `/agenzia/${encodeURIComponent(token)}`
  const avviso = testoAvviso(q)

  return (
    <Guscio>
      <header className="space-y-2">
        <p className="text-corpo opacity-70">
          All Inclusive · {pagina.human_ref} · invio n. {pagina.invio_n}
        </p>
        <h1 className="font-titoli text-h3">
          {pagina.fase === 'da_decidere' ? 'Proposta da verificare' : TITOLO[pagina.fase ?? 'superata']}
        </h1>
        <p className="text-corpo opacity-80">
          Preparata da {pagina.td_name}
          {pagina.inviata_il ? ` il ${DATA.format(new Date(pagina.inviata_il))}` : ''}.
        </p>
      </header>

      {avviso && <Avviso tono={avviso.tono}>{avviso.testo}</Avviso>}
      {q.file && (
        <Avviso tono="errore">
          {q.file === 'irraggiungibile'
            ? 'Non riusciamo a preparare il documento adesso. Riprova fra un minuto.'
            : 'Il documento non si scarica più da questo link.'}
        </Avviso>
      )}

      <Pacchetto pagina={pagina} base={base} />

      {pagina.fase === 'da_decidere' && <Decisione base={base} valido={pagina.valido_fino ?? null} />}

      {pagina.fase === 'confermata' && (
        <p className="text-corpo-big">
          Avete confermato questa proposta
          {pagina.deciso_il ? ` il ${DATA.format(new Date(pagina.deciso_il))}` : ''}. Il viaggiatore
          l&apos;ha ricevuta con il link dell&apos;acconto: da qui non c&apos;è altro da fare.
        </p>
      )}

      {pagina.fase === 'non_fattibile' && (
        <section className="space-y-3">
          <p className="text-corpo-big">
            Avete risposto «non fattibile»
            {pagina.deciso_il ? ` il ${DATA.format(new Date(pagina.deciso_il))}` : ''}. Il designer ha
            ricevuto la vostra nota e, corretta la proposta, ve la rimanda con un link nuovo.
          </p>
          {pagina.nota && (
            <blockquote className="whitespace-pre-line rounded-2xl border border-scuro/30 p-5 text-corpo">
              {pagina.nota}
            </blockquote>
          )}
        </section>
      )}

      {pagina.fase === 'superata' && (
        <p className="text-corpo-big">
          Questa proposta non è più quella in verifica: è stata ritirata, oppure ne è arrivata una
          nuova con un altro link. Se non vi torna, scriveteci.
        </p>
      )}

      <div className="border-t border-scuro/20 pt-6">
        <ScriviciWhatsApp numero={whatsapp} etichetta="Scrivi al team XPETIS" />
      </div>
    </Guscio>
  )
}

const TITOLO: Record<'confermata' | 'non_fattibile' | 'superata', string> = {
  confermata: 'Proposta confermata',
  non_fattibile: 'Proposta non confermata',
  superata: 'Proposta sostituita',
}

function Pacchetto({ pagina, base }: { pagina: PaginaAgenzia; base: string }) {
  return (
    <article className="space-y-4 rounded-2xl border border-scuro/30 p-5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-corpo">
        <dt className="opacity-60">Totale</dt>
        <dd className="font-bold">{euro(pagina.totale_cents)}</dd>
        <dt className="opacity-60">Acconto</dt>
        <dd>{euro(pagina.acconto_cents)}</dd>
        <dt className="opacity-60">Saldo</dt>
        <dd>{euro(pagina.saldo_cents)}</dd>
        <dt className="opacity-60">Partenza</dt>
        <dd>{dataGiorno(pagina.partenza)}</dd>
        <dt className="opacity-60">Rientro</dt>
        <dd>{pagina.ritorno ? dataGiorno(pagina.ritorno) : 'non indicato'}</dd>
      </dl>
      {pagina.documento && (
        <p className="text-corpo">
          {/* Un indirizzo nostro: la route firma un link di Storage di un minuto al clic. */}
          <a href={`${base}/file/${pagina.documento.id}`} className="underline">
            Scarica il documento · {pagina.documento.nome}
          </a>
        </p>
      )}
      {pagina.descrizione && <p className="whitespace-pre-line text-corpo">{pagina.descrizione}</p>}
    </article>
  )
}

/**
 * I due tasti. Due form e non uno: «Non fattibile» chiede una nota, e metterla
 * nello stesso form di «Confermo» farebbe sembrare la conferma incompleta.
 */
function Decisione({ base, valido }: { base: string; valido: string | null }) {
  return (
    <section className="space-y-6">
      <form action={`${base}/decidi`} method="post" className="space-y-3">
        <input type="hidden" name="decisione" value="conferma" />
        <button
          type="submit"
          className="rounded-full bg-primario px-6 py-3 text-corpo-big text-neutro transition hover:brightness-110"
        >
          Confermo
        </button>
        <p className="text-corpo opacity-80">
          Confermando, il viaggiatore riceve subito la proposta con il link dell&apos;acconto. Da quel
          momento prezzo e condizioni non si cambiano più.
        </p>
      </form>

      <form action={`${base}/decidi`} method="post" className="space-y-3 border-t border-scuro/20 pt-6">
        <input type="hidden" name="decisione" value="non_fattibile" />
        <label className="block space-y-2">
          <span className="text-corpo-big">Non fattibile</span>
          <span className="block text-corpo opacity-70">
            Due righe sul perché: il designer le riceve e corregge la proposta. Al viaggiatore non arriva
            niente.
          </span>
          <textarea
            name="nota"
            required
            rows={4}
            maxLength={5000}
            className="w-full rounded-2xl border border-scuro/30 bg-transparent p-4 text-corpo"
          />
        </label>
        <button
          type="submit"
          className="rounded-full border border-scuro px-5 py-2 text-corpo transition hover:bg-scuro hover:text-neutro"
        >
          Non fattibile
        </button>
      </form>

      <p className="text-corpo opacity-60">
        Il link vale per una risposta sola
        {valido ? `, entro il ${DATA.format(new Date(valido))}` : ''}.
      </p>
    </section>
  )
}

/** Dopo il clic la route torna qui con `?esito=`: è la pagina a dire cosa è successo. */
function testoAvviso(q: Query): { testo: string; tono: 'neutro' | 'errore' } | null {
  switch (q.esito) {
    case undefined:
      return null
    case 'confermata':
      return { tono: 'neutro', testo: 'Confermata. Grazie: il viaggiatore la riceve adesso.' }
    case 'non_fattibile':
      return { tono: 'neutro', testo: 'Ricevuto. Il designer ha la vostra nota.' }
    case 'gia_decisa':
      return { tono: 'neutro', testo: 'Su questa proposta avevate già risposto: vale la prima risposta.' }
    case 'superata':
      return { tono: 'errore', testo: 'Questa proposta non è più quella in verifica.' }
    case 'dati_non_validi':
      return q.campo === 'nota'
        ? { tono: 'errore', testo: 'Per «non fattibile» serve una nota: il designer deve sapere cosa correggere.' }
        : { tono: 'errore', testo: 'La risposta non si legge. Riprova.' }
    default:
      return { tono: 'errore', testo: 'Non siamo riusciti a registrare la risposta. Riprova fra un minuto.' }
  }
}
