import Link from 'next/link'
import {
  dataGiorno,
  euro,
  euroPerCampo,
  FORMA_IMPORTO,
  type PaginaOrdineAI,
  type StatoOrdine,
} from '@/lib/ordine'
import { Avviso } from '@/components/pagina-token'
import { CopiaTesto } from '@/components/copia-testo'
import { RicordaModulo } from '@/components/ricorda-modulo'
import { CaricaConsegna } from '@/components/carica-consegna'
import { ElencoFile } from '@/components/elenco-file'

/**
 * La pagina ordine All Inclusive del designer: le facce che la su misura non
 * ha (0047). Flusso §8 (Chiara): «stessa base del su misura, stati in più,
 * upload documento vincolante».
 *
 * La porta è la stessa, `/ordine/[token]`: il database risolve il token una
 * volta e dice `servizio`, e la pagina sceglie questa faccia. Le regole — cosa
 * si può scrivere in quale stato, l'agenzia assegnata, il prezzo ridichiarato —
 * sono nelle funzioni della 0047; qui si chiede e si riporta.
 *
 * ## Il documento
 *
 * La proposta All Inclusive è **un documento vero**, del designer, e va
 * all'agenzia così com'è. Si carica con lo stesso meccanismo della consegna
 * (`CaricaConsegna`, i byte dritti a Storage), e ne vale l'ultimo caricato
 * prima dell'invio. Il documento finale, a saldo pagato, passa dalla stessa
 * porta.
 *
 * ## Il credito, come nella su misura
 *
 * Il prezzo è il **totale finale**, già al netto della consulenza se il
 * designer la scala. Il campo credito è la sua dichiarazione per lo
 * spot-check; l'acconto lo calcola il database sul totale, all'invio.
 */

const DATA = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: 'Europe/Rome' })

const STATO: Partial<Record<StatoOrdine, string>> = {
  requested: 'Richiesta ricevuta',
  in_definition: 'In definizione',
  proposal_pending_agency: 'In verifica dall’agenzia',
  awaiting_deposit: 'Confermata: in attesa dell’acconto',
  deposit_paid: 'Acconto pagato: prenotazioni in corso',
  awaiting_balance: 'In attesa del saldo',
  balance_paid: 'Saldato: tocca al documento finale',
  delivered: 'Consegnato',
  completed: 'Chiuso',
  cancelled: 'Annullato',
  disputed: 'In verifica dal team',
}

export type QueryOrdineAI = { esito?: string; campo?: string; motivo?: string; su?: string; modifica?: string }

export function OrdineAllInclusive({
  pagina,
  base,
  q,
}: {
  pagina: PaginaOrdineAI
  base: string
  q: QueryOrdineAI
}) {
  const stato = pagina.status
  const aperta = stato === 'requested' || stato === 'in_definition'
  const bozzaCompleta = !!(pagina.descrizione && pagina.prezzo_cents != null && pagina.partenza)
  const rifiutata = aperta && pagina.ultimo_invio?.decisione === 'rejected'
  const avviso = testoAvviso(q, pagina)

  return (
    <>
      <header className="space-y-3">
        <p className="text-corpo opacity-70">All Inclusive · {pagina.human_ref}</p>
        <h1 className="font-titoli text-h3">{STATO[stato] ?? stato}</h1>
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
          <dt className="opacity-60">Agenzia</dt>
          <dd>{pagina.agenzia ?? 'non ancora assegnata dal team'}</dd>
        </dl>
      </header>

      {avviso && <Avviso tono={avviso.tono}>{avviso.testo}</Avviso>}

      {rifiutata && pagina.ultimo_invio && (
        <section className="space-y-2">
          <p className="text-corpo-big">
            L&apos;agenzia non ha confermato l&apos;invio n. {pagina.ultimo_invio.n}
            {pagina.ultimo_invio.decisa_il ? `, il ${DATA.format(new Date(pagina.ultimo_invio.decisa_il))}` : ''}.
            Ecco cosa ha scritto:
          </p>
          <blockquote className="whitespace-pre-line rounded-2xl border border-scuro/30 p-5 text-corpo">
            {pagina.ultimo_invio.nota}
          </blockquote>
          <p className="text-corpo opacity-80">Correggi la proposta e rimandala: al viaggiatore non è arrivato niente.</p>
        </section>
      )}

      {aperta && (
        <>
          <section className="space-y-4">
            <ElencoFile file={pagina.documenti} base={base} titolo="I documenti di proposta caricati (va all’agenzia l’ultimo)" />
            <CaricaConsegna
              base={base}
              testi={{
                titolo: pagina.documenti.length ? 'Un documento nuovo' : 'Il documento di proposta',
                bottone: 'Carica il documento',
                nota: 'Caricare non manda niente a nessuno. Il documento parte con la proposta, quando la invii.',
              }}
            />
          </section>
          {bozzaCompleta && !q.modifica ? (
            <Riepilogo pagina={pagina} base={base} />
          ) : (
            <Modulo pagina={pagina} base={base} ripristina={!!q.esito && q.esito !== 'salvata'} />
          )}
        </>
      )}

      {stato === 'proposal_pending_agency' && (
        <section className="space-y-5">
          <p className="text-corpo-big">
            La proposta è da {pagina.agenzia ?? 'l’agenzia'}
            {pagina.inviata_il ? ` dal ${DATA.format(new Date(pagina.inviata_il))}` : ''}. Quando risponde ricevi
            una mail: se conferma, il viaggiatore riceve la proposta con il link dell&apos;acconto; se no, ti
            scrive cosa correggere.
          </p>
          <Proposta pagina={pagina} />
        </section>
      )}

      {['awaiting_deposit', 'deposit_paid', 'awaiting_balance'].includes(stato) && (
        <section className="space-y-5">
          <p className="text-corpo-big">{testoSoldi(pagina)}</p>
          {pagina.messaggio_pronto ? (
            <CopiaTesto testo={pagina.messaggio_pronto} />
          ) : (
            pagina.link_pagina && <CopiaTesto testo={pagina.link_pagina} etichetta="Copia il link" />
          )}
          <details>
            <summary className="cursor-pointer text-corpo underline">La proposta confermata</summary>
            <div className="pt-4">
              <Proposta pagina={pagina} />
            </div>
          </details>
        </section>
      )}

      {stato === 'balance_paid' && (
        <section className="space-y-5">
          <p className="text-corpo-big">
            Il saldo è pagato. Adesso il documento finale: il documento di viaggio completo, con biglietti,
            voucher, contatti e istruzioni. La partenza è il {dataGiorno(pagina.partenza)}.
          </p>
          <CaricaConsegna
            base={base}
            testi={{
              titolo: 'Il documento finale',
              bottone: 'Consegna il documento finale',
              nota: 'Consegnando, il viaggiatore riceve la mail con il link alla sua pagina. Per scaricare il documento dovrà entrare con Google: dentro ci sono i suoi biglietti.',
            }}
          />
        </section>
      )}

      {(stato === 'delivered' || stato === 'completed') && (
        <section className="space-y-5">
          <p className="text-corpo-big">
            {stato === 'delivered'
              ? `Consegnato${pagina.consegnato_il ? ` il ${DATA.format(new Date(pagina.consegnato_il))}` : ''}: il viaggiatore ha ricevuto la mail. Gira il messaggio anche nel gruppo commerciale.`
              : `Ordine chiuso${pagina.chiuso_il ? ` il ${DATA.format(new Date(pagina.chiuso_il))}` : ''}. Grazie.`}
          </p>
          {stato === 'delivered' && pagina.messaggio_consegna && <CopiaTesto testo={pagina.messaggio_consegna} />}
          <ElencoFile file={pagina.file_finale} base={base} titolo="Quello che hai consegnato" />
        </section>
      )}

      {(stato === 'cancelled' || stato === 'disputed') && (
        <p className="text-corpo-big">
          {stato === 'cancelled'
            ? 'Questo ordine è stato annullato: non c’è niente da fare qui.'
            : 'Su questo ordine il team sta guardando una cosa a mano, e ti scriverà.'}
        </p>
      )}
    </>
  )
}

function testoSoldi(p: PaginaOrdineAI): string {
  switch (p.status) {
    case 'awaiting_deposit':
      return `${p.agenzia ?? 'L’agenzia'} ha confermato${p.confermata_il ? ` il ${DATA.format(new Date(p.confermata_il))}` : ''}, e il viaggiatore ha ricevuto la proposta con il link dell’acconto (${euro(p.acconto_cents)}). Gira il messaggio nel gruppo commerciale: chi arriva da lì paga dalla stessa pagina.`
    case 'deposit_paid':
      return 'L’acconto è pagato e l’agenzia procede con le prenotazioni. Il saldo si chiede con i tempi che detta l’agenzia: li inserisce il team.'
    default:
      return `In attesa del saldo (${euro(p.saldo_cents)})${p.saldo_entro ? `, entro il ${DATA.format(new Date(p.saldo_entro))}` : ''}. Il viaggiatore ha ricevuto la richiesta.`
  }
}

/**
 * Il form della proposta. HTML che fa POST, come nella su misura; le date sono
 * `type="date"`, che su telefono apre il calendario e manda sempre
 * `AAAA-MM-GG` qualunque sia la lingua del sistema.
 */
function Modulo({ pagina, base, ripristina }: { pagina: PaginaOrdineAI; base: string; ripristina: boolean }) {
  const creditoBloccato = !!pagina.credito_usato_su || pagina.prezzo_call_cents == null

  return (
    <form action={`${base}/all-inclusive/bozza`} method="post" className="space-y-6">
      <RicordaModulo chiave={`proposta-ai:${pagina.human_ref}`} ripristina={ripristina} />
      <label className="block space-y-2">
        <span className="text-corpo-big">La proposta, in breve</span>
        <span className="block text-corpo opacity-70">
          Il testo che accompagna il documento: lo leggono l&apos;agenzia e, dopo la sua conferma, il
          viaggiatore nella mail e sulla sua pagina.
        </span>
        <textarea
          name="descrizione"
          required
          rows={8}
          maxLength={20000}
          defaultValue={pagina.descrizione ?? ''}
          className="w-full rounded-2xl border border-scuro/30 bg-transparent p-4 text-corpo"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-corpo-big">Prezzo totale, in euro</span>
        <span className="block text-corpo opacity-70">
          È quello che paga il viaggiatore, in due rate: l&apos;acconto lo calcola il sistema, il saldo è il
          resto.{' '}
          {pagina.credito_usato_su
            ? `Il credito di questa call è già stato usato su ${pagina.credito_usato_su}: qui non va scalato.`
            : 'Se scali la consulenza, toglila tu da qui: il sistema non toglie niente da solo.'}
        </span>
        <input
          name="prezzo"
          required
          inputMode="decimal"
          autoComplete="off"
          placeholder="es. 4.500 oppure 4500,50"
          pattern={FORMA_IMPORTO}
          title="In euro, con al massimo due decimali: 4500, 4.500 oppure 4500,50"
          defaultValue={euroPerCampo(pagina.prezzo_cents)}
          className="w-full rounded-full border border-scuro/30 bg-transparent px-5 py-3 text-corpo-big"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-corpo-big">Partenza</span>
          <input
            name="partenza"
            type="date"
            required
            defaultValue={pagina.partenza ?? ''}
            className="w-full rounded-full border border-scuro/30 bg-transparent px-5 py-3 text-corpo-big"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-corpo-big">Rientro</span>
          <input
            name="ritorno"
            type="date"
            defaultValue={pagina.ritorno ?? ''}
            className="w-full rounded-full border border-scuro/30 bg-transparent px-5 py-3 text-corpo-big"
          />
        </label>
      </div>

      {creditoBloccato ? (
        <input type="hidden" name="credito" value="0" />
      ) : (
        <label className="block space-y-2">
          <span className="text-corpo-big">Quanto hai scalato per la consulenza</span>
          <span className="block text-corpo opacity-70">
            Non cambia il totale qui sopra: serve al team per il controllo. Al massimo{' '}
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
      <p className="text-corpo opacity-60">Salvare non manda niente a nessuno: prima rileggi, poi invii.</p>
    </form>
  )
}

function Riepilogo({ pagina, base }: { pagina: PaginaOrdineAI; base: string }) {
  const senzaDocumento = pagina.documenti.length === 0
  const senzaAgenzia = !pagina.agenzia

  return (
    <section className="space-y-6">
      <p className="text-corpo-big">
        Rileggila: va prima all&apos;agenzia, e solo dopo la sua conferma a{' '}
        {pagina.nome_viaggiatore ?? 'chi viaggia'}.
      </p>
      <Proposta pagina={pagina} />

      {senzaDocumento && <Avviso tono="errore">Manca il documento di proposta: caricalo qui sopra.</Avviso>}
      {senzaAgenzia && (
        <Avviso>
          Il team non ha ancora assegnato l&apos;agenzia: la proposta è pronta, la invii appena c&apos;è. Se
          tarda, scrivi al team.
        </Avviso>
      )}

      <form action={`${base}/all-inclusive/invia`} method="post" className="space-y-3">
        <input type="hidden" name="prezzo_cents" value={String(pagina.prezzo_cents)} />
        <button
          type="submit"
          disabled={senzaDocumento || senzaAgenzia}
          className="rounded-full bg-primario px-6 py-3 text-corpo-big text-neutro transition hover:brightness-110 disabled:opacity-50"
        >
          Invia all&apos;agenzia · {euro(pagina.prezzo_cents)}
        </button>
        <p className="text-corpo opacity-80">
          <strong>Dopo l&apos;invio non si modifica più da qui</strong>, a meno che l&apos;agenzia non te la
          rimandi indietro.
        </p>
      </form>

      <Link href={`${base}?modifica=1`} className="inline-block text-corpo underline">
        Modifica
      </Link>
    </section>
  )
}

function Proposta({ pagina }: { pagina: PaginaOrdineAI }) {
  return (
    <article className="space-y-4 rounded-2xl border border-scuro/30 p-5">
      <p className="whitespace-pre-line text-corpo">{pagina.descrizione}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-corpo">
        <dt className="opacity-60">Totale</dt>
        <dd className="font-bold">{euro(pagina.prezzo_cents)}</dd>
        {pagina.acconto_cents != null && !['requested', 'in_definition'].includes(pagina.status) && (
          <>
            <dt className="opacity-60">Acconto</dt>
            <dd>{euro(pagina.acconto_cents)}</dd>
            <dt className="opacity-60">Saldo</dt>
            <dd>{euro(pagina.saldo_cents)}</dd>
          </>
        )}
        <dt className="opacity-60">Partenza</dt>
        <dd>{dataGiorno(pagina.partenza)}</dd>
        <dt className="opacity-60">Rientro</dt>
        <dd>{pagina.ritorno ? dataGiorno(pagina.ritorno) : 'non indicato'}</dd>
        {!!pagina.credito_cents && (
          <>
            <dt className="opacity-60">Credito dichiarato</dt>
            <dd>{euro(pagina.credito_cents)} (già tolto dal totale, non si vede nella mail)</dd>
          </>
        )}
      </dl>
    </article>
  )
}

function testoAvviso(q: QueryOrdineAI, pagina: PaginaOrdineAI): { testo: string; tono: 'neutro' | 'errore' } | null {
  switch (q.esito) {
    case undefined:
    case 'salvata':
      return null
    case 'inviata':
    case 'gia_inviata':
      return { tono: 'neutro', testo: 'Proposta inviata all’agenzia.' }
    case 'dati_non_validi':
      return { tono: 'errore', testo: testoCampo(q, pagina) }
    case 'documento_mancante':
      return { tono: 'errore', testo: 'Manca il documento di proposta: caricalo e poi invia.' }
    case 'agenzia_non_assegnata':
      return { tono: 'errore', testo: 'Il team non ha ancora assegnato l’agenzia: la proposta resta pronta, scrivi al team.' }
    case 'credito_gia_usato':
      return {
        tono: 'errore',
        testo: `Il credito di questa call è già stato dichiarato${q.su ? ` sull’ordine ${q.su}` : ' su un altro ordine'}: qui non va scalato.`,
      }
    case 'prezzo_cambiato':
      return { tono: 'errore', testo: 'La proposta è cambiata dopo che l’hai riletta, forse da un’altra scheda. Ricontrolla e invia di nuovo.' }
    case 'bozza_mancante':
      return { tono: 'errore', testo: 'Prima salva la proposta: si invia solo dopo averla riletta.' }
    case 'in_verifica_agenzia':
      return { tono: 'errore', testo: 'La proposta è dall’agenzia: finché non risponde non si modifica.' }
    case 'proposta_gia_inviata':
      return { tono: 'errore', testo: 'La proposta è già confermata, e da qui non si modifica più. Se serve cambiarla, scrivi al team.' }
    case 'non_configurato':
      return { tono: 'errore', testo: 'Manca un parametro da parte nostra: la proposta non è partita. Scrivi al team.' }
    default:
      return { tono: 'errore', testo: 'Non siamo riusciti a salvare. Riprova fra un minuto.' }
  }
}

function testoCampo(q: QueryOrdineAI, pagina: PaginaOrdineAI): string {
  switch (q.campo) {
    case 'descrizione':
      return 'Manca il testo della proposta.'
    case 'prezzo':
      return 'Il totale non si legge, oppure è troppo basso per due rate: scrivilo in euro, con al massimo due decimali, per esempio 4.500 oppure 4500,50.'
    case 'partenza':
      return 'La data di partenza deve essere nel futuro.'
    case 'ritorno':
      return 'Il rientro non può essere prima della partenza.'
    case 'credito':
      if (q.motivo === 'oltre_prezzo_call') {
        return `Il credito non può superare quanto è costata la consulenza (${euro(pagina.prezzo_call_cents)}).`
      }
      if (q.motivo === 'senza_call') return 'Questo ordine non nasce da una consulenza: non c’è credito da scalare.'
      return 'Il credito non si legge: scrivilo in euro, oppure lascia 0.'
    default:
      return 'Qualcosa nella proposta non va. Ricontrolla i campi.'
  }
}
