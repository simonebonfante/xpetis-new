import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CHIAVI, leggiContatto } from '@/lib/config'
import { ETICHETTA_SERVIZIO, type TipoServizio } from '@/lib/vetrina'
import { StatoPrenotazione } from '@/components/stato-prenotazione'

export const dynamic = 'force-dynamic'

/**
 * La pagina di una prenotazione, e la pagina di ritorno da Stripe: sono la
 * stessa cosa di proposito.
 *
 * Il viaggiatore torna qui con `?ritorno=1` dopo il pagamento, e quel parametro
 * **non cambia niente di ciò che la pagina afferma**: dice solo al componente
 * client di aspettare la conferma invece di mostrare subito il bottone. Lo stato
 * lo dice il database, che lo riceve dal webhook firmato di Stripe. Trattare il
 * `success_url` come una prova di pagamento è l'errore classico di questi giri,
 * e costa una consulenza regalata a chiunque sappia scrivere un indirizzo.
 *
 * Legge da `my_bookings` con la sessione del viaggiatore: la vista filtra da sé
 * su `auth.uid()`, quindi la prenotazione di qualcun altro semplicemente non
 * esiste da qui — e `cal_booking_uid` non c'è (0019).
 */

const DATA = new Intl.DateTimeFormat('it-IT', {
  dateStyle: 'full',
  timeStyle: 'short',
  timeZone: 'Europe/Rome',
})

export default async function Prenotazione({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ritorno?: string }>
}) {
  const { id } = await params
  const { ritorno } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/?errore=login`)

  const { data: prenotazione } = await supabase
    .from('my_bookings')
    .select('id, status, service_type, starts_at, price_cents, video_url, payment_deadline_at, td_name')
    .eq('id', id)
    .maybeSingle()

  if (!prenotazione) notFound()

  const whatsapp = await leggiContatto(CHIAVI.whatsapp)
  const etichetta = ETICHETTA_SERVIZIO[prenotazione.service_type as TipoServizio]

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 p-10">
      <header className="space-y-2">
        <p className="text-piccolo uppercase tracking-widest opacity-60">{etichetta}</p>
        <h1 className="font-titoli text-h3">
          {prenotazione.td_name ? `Con ${prenotazione.td_name}` : 'La tua consulenza'}
        </h1>
        <p className="text-corpo-big">
          {DATA.format(new Date(prenotazione.starts_at))} ·{' '}
          {(prenotazione.price_cents / 100).toLocaleString('it-IT', {
            style: 'currency',
            currency: 'EUR',
          })}
        </p>
      </header>

      <StatoPrenotazione
        id={prenotazione.id}
        stato={prenotazione.status}
        scadenza={prenotazione.payment_deadline_at}
        ritorno={ritorno === '1'}
        whatsapp={whatsapp}
      />

      <Esito stato={prenotazione.status} video={prenotazione.video_url} whatsapp={whatsapp} />
    </main>
  )
}

/**
 * Quello che la pagina dice quando non c'è più niente da fare. Vive qui e non
 * nel componente client perché non ha bisogno di reagire a niente: è il
 * racconto di uno stato già deciso.
 */
function Esito({
  stato,
  video,
  whatsapp,
}: {
  stato: string
  video: string | null
  whatsapp: string | null
}) {
  if (stato === 'confirmed') {
    return (
      <section className="flex flex-col items-start gap-3">
        <p className="font-titoli text-h4">Consulenza confermata</p>
        <p className="text-corpo-big">
          Il pagamento è arrivato e l&apos;appuntamento è fissato. Ti abbiamo mandato una mail con
          il promemoria; il designer riceve il tuo profilo prima della call.
        </p>
        {video && (
          <a
            href={video}
            className="inline-block rounded-full bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
          >
            Il link della videochiamata
          </a>
        )}
      </section>
    )
  }

  // `completed` e `no_show` sono entrati il 18 settembre 2026, quando "Le mie
  // prenotazioni" ha iniziato a mandare qui ogni riga: prima questa pagina, su
  // quei due stati, non diceva **niente** — solo la testata con data e prezzo, e
  // sotto il vuoto. Era già un difetto e si vedeva poco, perché senza una lista
  // nessuno ci arrivava. Con la lista si vedrebbe subito.
  if (stato === 'completed') {
    return (
      <section className="space-y-3">
        <p className="font-titoli text-h4">Consulenza conclusa</p>
        <p className="text-corpo-big">
          La call si è svolta e questa prenotazione è chiusa. Non c&apos;è altro da fare.
        </p>
      </section>
    )
  }

  if (stato === 'no_show') {
    return (
      <section className="flex flex-col items-start gap-3">
        <p className="font-titoli text-h4">Risulti assente alla call</p>
        <p className="text-corpo-big">
          All&apos;appuntamento non c&apos;era nessuno da parte tua, e la consulenza è stata
          chiusa così. <strong>Se non è andata come dice questa pagina, scrivici:</strong> lo
          guardiamo noi, una persona alla volta.
        </p>
        {whatsapp && (
          <a
            href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`}
            className="inline-block rounded-full bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
          >
            Scrivici su WhatsApp
          </a>
        )}
      </section>
    )
  }

  if (stato === 'cancelled_unpaid') {
    return (
      <section className="space-y-3">
        <p className="font-titoli text-h4">Lo slot si è liberato</p>
        <p className="text-corpo-big">
          Il tempo per pagare è finito e l&apos;appuntamento è stato annullato.{' '}
          <strong>Non è stato addebitato nulla.</strong> Puoi prenotarne un altro quando vuoi.
        </p>
      </section>
    )
  }

  if (stato === 'cancelled') {
    return (
      <section className="space-y-3">
        <p className="font-titoli text-h4">Consulenza annullata</p>
        <p className="text-corpo-big">
          L&apos;appuntamento è stato annullato. Se ti spetta un rimborso ce ne occupiamo noi e ti
          scriviamo: non devi fare niente.
        </p>
      </section>
    )
  }

  if (stato === 'disputed') {
    return (
      <section className="flex flex-col items-start gap-3">
        <p className="font-titoli text-h4">Ci stiamo lavorando</p>
        <p className="text-corpo-big">
          Su questa prenotazione è successo qualcosa che vogliamo guardare noi, una persona alla
          volta. Ti scriviamo a breve.
        </p>
        {whatsapp && (
          <a
            href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`}
            className="inline-block rounded-full bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
          >
            Scrivici su WhatsApp
          </a>
        )}
      </section>
    )
  }

  return null
}
