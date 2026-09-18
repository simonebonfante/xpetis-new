import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { Bottone } from '@/components/bottone'
import { BottonePaga, Conto } from '@/components/stato-prenotazione'
import { createClient } from '@/lib/supabase/server'
import { leggiUtente } from '@/lib/supabase/utente'
import { ETICHETTA_SERVIZIO, type TipoServizio } from '@/lib/vetrina'
import {
  ordinaPrenotazioni,
  type PrenotazioneInLista,
  type RigaPrenotazione,
  type Situazione,
} from '@/lib/prenotazioni'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Le mie prenotazioni · XPETIS',
  // Dietro il login, quindi un crawler qui prende solo un redirect verso
  // `/accedi`. La riga è comunque giusta: è una pagina personale, e chiedere di
  // non indicizzarla costa zero.
  robots: { index: false, follow: false },
}

/**
 * L'area del viaggiatore, e il buco che chiude.
 *
 * **Non è una comodità.** Fino a oggi chi chiudeva la scheda fra la prenotazione
 * e il pagamento non aveva nessun modo di tornare indietro: nessuna lista, e la
 * mail che gli darebbe il link non esiste perché il provider di invio è un punto
 * aperto (S-04). Quella prenotazione diventava irraggiungibile e scadeva da sola,
 * lasciando occupato uno slot sul calendario di un designer. Questa pagina è
 * l'unica uscita che oggi non dipende da nessuno.
 *
 * **La mail serve comunque**, e non è una alternativa: copre chi non torna sul
 * sito da sé, che sono quasi tutti. Questa pagina copre chi torna.
 *
 * ## Minima di proposito
 *
 * Nessun profilo, nessuna preferenza, nessuna impostazione: il Flusso guida il
 * viaggiatore con le mail e non descrive nessuna area riservata, quindi ogni
 * pezzo in più qui sarebbe una milestone che nessuno ha pianificato. Deciso da
 * Simone l'8 settembre 2026.
 *
 * ## Il percorso, scelto e non ereditato
 *
 * `/le-mie-prenotazioni` e non `/prenotazioni`. Il secondo è più corto e più
 * ovvio, ed è esattamente il problema: dista **una lettera** da
 * `/prenotazione/[id]`, che esiste già e vuol dire un'altra cosa. Una "i" persa
 * o aggiunta in un `href`, in un redirect o in un `?next=` non rompe niente in
 * modo visibile — porta a un 404 o, peggio, a una pagina plausibile — e nessun
 * controllo di tipo la intercetta. Il nome lungo è il nome che la pagina ha già
 * in `PIANO.md` e nell'header, e non si confonde con niente.
 *
 * ## Tre cose da non rifare
 *
 * 1. **Si legge con il client della sessione, mai con quello admin.**
 *    `my_bookings` (migration 0019) filtra su `auth.uid()`: con la chiave secret
 *    `auth.uid()` è nullo e la vista torna **zero righe**, cioè una pagina che
 *    dice "non hai prenotazioni" a chi ne ha tre, senza nessun errore e senza
 *    nessun segno. È un guasto che somiglia a un dato mancante.
 * 2. **Lo stato mostrato non è `status`.** Lo deriva `lib/prenotazioni.ts`
 *    tenendo conto di `payment_deadline_at`, che è l'autorità: l'orologio dei 5
 *    minuti non esiste ancora e ci sono righe `pending_payment` già scadute. Il
 *    perché per esteso sta lì.
 * 3. **`cal_booking_uid` non rientra da qui.** La 0019 lo tiene fuori da
 *    `my_bookings` perché dopo la verifica S-05 quel codice da solo cancella la
 *    call su Cal.com, senza nessuna chiave. La vista ha già tutto il resto.
 */

const QUANDO = new Intl.DateTimeFormat('it-IT', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Rome',
})

const EURO = (cents: number) =>
  (cents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })

/**
 * Cosa dice una riga, per tutte e nove le situazioni.
 *
 * **Nessuna resta muta.** `completed`, `no_show` e `disputed` non sono casi rari
 * da rimandare: se la pagina non li sa raccontare, il giorno che compaiono
 * qualcuno legge una riga che non dice niente e scrive al team per capire cosa
 * gli è successo.
 *
 * Testi segnaposto come tutti gli altri del sito: li riscrive Gaia. Il vincolo
 * da rispettare quando li riscrive è che **dicano una cosa vera su chi deve fare
 * il prossimo passo** — noi, il viaggiatore, o nessuno. Il racconto lungo dello
 * stesso stato sta in `app/prenotazione/[id]/page.tsx`, dove c'è anche il
 * recapito WhatsApp: qui si resta corti, e ogni riga porta là.
 */
const RACCONTO: Record<Situazione, { badge: string; tono: Tono; testo: string }> = {
  da_pagare: {
    badge: 'Da pagare',
    tono: 'urgente',
    testo: 'Lo slot è tenuto per te fino al pagamento.',
  },
  tempo_scaduto: {
    badge: 'Tempo scaduto',
    tono: 'quieto',
    testo:
      'Il tempo per pagare è finito e lo slot si sta liberando. Non è stato addebitato nulla: se vuoi, prenota di nuovo.',
  },
  confermata: {
    badge: 'Confermata',
    tono: 'vivo',
    testo:
      'Il pagamento è arrivato e l’appuntamento è fissato. Il designer riceve il tuo profilo prima della call.',
  },
  in_attesa_esito: {
    badge: 'Call passata',
    tono: 'vivo',
    testo:
      'L’orario della call è passato. Se è andata come doveva non devi fare niente, chiudiamo noi; se è successo qualcosa, scrivicelo.',
  },
  in_arbitrato: {
    badge: 'Ci stiamo lavorando',
    tono: 'vivo',
    testo:
      'Su questa prenotazione è successo qualcosa che guardiamo noi, una persona alla volta. Ti scriviamo a breve.',
  },
  conclusa: {
    badge: 'Conclusa',
    tono: 'quieto',
    testo: 'La consulenza si è chiusa. Non c’è altro da fare.',
  },
  assente: {
    badge: 'Risulti assente',
    tono: 'quieto',
    testo:
      'Alla call non c’era nessuno da parte tua, e la consulenza è stata chiusa così. Se non è andata così, dicci com’è andata.',
  },
  annullata: {
    badge: 'Annullata',
    tono: 'quieto',
    testo:
      'L’appuntamento è stato annullato. Se ti spetta un rimborso ce ne occupiamo noi e ti scriviamo: non devi fare niente.',
  },
  slot_liberato: {
    badge: 'Scaduta',
    tono: 'quieto',
    testo:
      'Il tempo per pagare era finito e lo slot si è liberato. Non è stato addebitato nulla.',
  },
}

type Tono = 'urgente' | 'vivo' | 'quieto'

const VESTE: Record<Tono, string> = {
  urgente: 'bg-primario text-neutro',
  vivo: 'border border-scuro/20 text-scuro',
  quieto: 'bg-scuro/5 text-scuro/70',
}

export default async function LeMiePrenotazioni() {
  const utente = await leggiUtente()
  // Come fa il tasto *Prenota*: si torna qui dopo Google, non sulla home.
  if (!utente) redirect(`/accedi?next=${encodeURIComponent('/le-mie-prenotazioni')}`)

  // `createClient()` e **non** `createAdminClient()`: vedi la nota 1 in testa.
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('my_bookings')
    .select(
      'id, status, service_type, starts_at, price_cents, video_url, payment_deadline_at, td_slug, td_name',
    )
    .order('starts_at', { ascending: false })

  // L'istante lo legge `ordinaPrenotazioni`, una volta per richiesta: la regola
  // di purezza di React vieta un orologio dentro la resa, e il perché è scritto
  // là.
  const prenotazioni = error ? [] : ordinaPrenotazioni((data ?? []) as RigaPrenotazione[])

  return (
    <>
      <Header />

      <main className="mx-auto flex min-h-screen w-full max-w-[880px] flex-col gap-8 px-4 pb-24 pt-32 lg:pt-40">
        <header className="space-y-2">
          <h1 className="font-titoli text-h3">Le mie prenotazioni</h1>
          <p className="text-corpo-big">
            Le consulenze che hai prenotato con i Travel Designer di XPETIS, e cosa manca per
            ognuna.
          </p>
        </header>

        {error ? (
          <Riquadro>
            <p className="font-titoli text-h4">Non siamo riusciti a leggere le tue prenotazioni</p>
            <p className="text-corpo-big">
              È un guasto nostro, non un problema del tuo profilo: le prenotazioni ci sono e non si
              sono perse. Ricarica fra un minuto.
            </p>
          </Riquadro>
        ) : prenotazioni.length === 0 ? (
          <Vuoto />
        ) : (
          <ul className="flex flex-col gap-4">
            {prenotazioni.map((p) => (
              <Riga key={p.id} prenotazione={p} />
            ))}
          </ul>
        )}

        {/*
          Qui sotto andranno **gli ordini** — itinerario su misura e All
          Inclusive — quando nasceranno nelle milestone 6 e 7. La vista da cui si
          leggono esiste dal 4 agosto (`my_orders`, migration 0019, stessa forma
          di `my_bookings`: filtra su `auth.uid()` e si legge con il client della
          sessione), e il posto in cui vanno è questo, sotto le consulenze, in una
          seconda sezione col suo titolo.

          **Non si costruisce oggi**, e non per pigrizia: un ordine non può
          esistere finché non esiste il percorso post-call che lo crea, quindi
          una sezione qui sarebbe un blocco vuoto per mesi — o peggio, una
          promessa che il sito non mantiene. Quando arriverà, la cosa da non
          rifare è la stessa di sopra: lo stato che si mostra non è `status`, va
          derivato anche dalle scadenze (`balance_due_at`, `revision_deadline_at`).
        */}
      </main>

      <Footer />
    </>
  )
}

/**
 * Chi è collegato e non ha niente non vede una pagina vuota: vede dove andare.
 * Una lista vuota è l'unico stato in cui questa pagina non ha niente da dire di
 * sé, e l'unica cosa utile che può fare è rimandare alla ricerca.
 */
function Vuoto() {
  return (
    <Riquadro>
      <p className="font-titoli text-h4">Non hai ancora prenotato niente</p>
      <p className="text-corpo-big">
        Qui compariranno le consulenze che prenoti, con lo stato di ognuna e il link della
        videochiamata. Si parte trovando il Travel Designer giusto.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Bottone href="/ricerca">Trova un Travel Designer</Bottone>
        <Link href="/quiz" className="text-corpo underline hover:text-primario">
          Oppure fai il quiz
        </Link>
      </div>
    </Riquadro>
  )
}

function Riga({ prenotazione }: { prenotazione: PrenotazioneInLista }) {
  const { badge, tono, testo } = RACCONTO[prenotazione.situazione]
  const etichetta = ETICHETTA_SERVIZIO[prenotazione.service_type as TipoServizio]

  return (
    <li className="flex flex-col gap-4 rounded-[24px] bg-neutro p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-piccolo uppercase tracking-widest opacity-60">{etichetta}</p>
          <h2 className="font-titoli text-h4">
            {prenotazione.td_name ? `Con ${prenotazione.td_name}` : 'Consulenza'}
          </h2>
          <p className="text-corpo-big">
            {QUANDO.format(new Date(prenotazione.starts_at))} · {EURO(prenotazione.price_cents)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-4 py-1 text-corpo ${VESTE[tono]}`}
        >
          {badge}
        </span>
      </div>

      <p className="text-corpo">
        {testo}{' '}
        {/* Il conto alla rovescia è quello della pagina della prenotazione, non
            una seconda copia: `Conto` sta in `stato-prenotazione.tsx`. */}
        {prenotazione.situazione === 'da_pagare' && (
          <Conto scadenza={prenotazione.payment_deadline_at} />
        )}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        {prenotazione.situazione === 'da_pagare' && <BottonePaga id={prenotazione.id} />}

        {prenotazione.situazione === 'confermata' && prenotazione.video_url && (
          <a
            href={prenotazione.video_url}
            className="inline-block rounded-full bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
          >
            Il link della videochiamata
          </a>
        )}

        {(prenotazione.situazione === 'tempo_scaduto' ||
          prenotazione.situazione === 'slot_liberato') && (
          <Link
            href={prenotazione.td_slug ? `/designer/${prenotazione.td_slug}` : '/ricerca'}
            className="inline-block rounded-full bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
          >
            Prenota di nuovo
          </Link>
        )}

        {/* Ogni riga porta al suo dettaglio, dove sta il racconto per esteso e il
            recapito del team. Il numero WhatsApp resta là e non si duplica qui:
            oggi è un cellulare personale, e stamparlo su una pagina in più non
            aggiunge niente a chi ne ha bisogno. */}
        <Link
          href={`/prenotazione/${prenotazione.id}`}
          className="text-corpo underline hover:text-primario"
        >
          Vedi il dettaglio
        </Link>
      </div>
    </li>
  )
}

function Riquadro({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4 rounded-[24px] bg-neutro p-6 lg:p-8">
      {children}
    </div>
  )
}
