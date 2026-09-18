'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * La parte viva della pagina di una prenotazione: il bottone che apre la cassa,
 * il tempo che resta per pagare, e l'attesa della conferma al ritorno da Stripe.
 *
 * **Al ritorno da Stripe questa pagina non decide niente.** Il `?ritorno=1`
 * nell'URL dice soltanto che il browser è tornato indietro: chiunque può
 * scriverlo a mano nella barra degli indirizzi, e trattarlo come una prova di
 * pagamento è l'errore classico di questi giri. La prova è la riga nel database,
 * che ci arriva dal webhook firmato di Stripe; qui si aspetta e si guarda.
 */

type Stato =
  | 'pending_payment'
  | 'confirmed'
  | 'cancelled_unpaid'
  | 'cancelled'
  | 'completed'
  | 'no_show'
  | 'disputed'

/** Attesa della conferma: circa 45 secondi, poi si smette di chiedere. */
const PAUSA_MS = 1500
const TENTATIVI = 30

export function StatoPrenotazione({
  id,
  stato,
  scadenza,
  ritorno,
  whatsapp,
}: {
  id: string
  stato: Stato
  scadenza: string | null
  ritorno: boolean
  whatsapp: string | null
}) {
  const router = useRouter()
  const [aspetto, setAspetto] = useState(ritorno && stato === 'pending_payment')
  const [rinunciato, setRinunciato] = useState(false)
  const [motivo, setMotivo] = useState<string | null>(null)
  const [apro, setApro] = useState(false)

  // ------------------------------------------------- l'attesa della conferma
  useEffect(() => {
    if (!aspetto) return
    let vivo = true
    let n = 0

    const battito = setInterval(async () => {
      n += 1
      if (n > TENTATIVI) {
        clearInterval(battito)
        if (vivo) {
          setAspetto(false)
          setRinunciato(true)
        }
        return
      }

      const r = await fetch(`/prenotazione/${id}/stato`, { cache: 'no-store' }).catch(() => null)
      if (!vivo || !r?.ok) return

      const { stato: attuale } = (await r.json()) as { stato: Stato }
      if (attuale !== 'pending_payment') {
        clearInterval(battito)
        setAspetto(false)
        // Il server rilegge e ridisegna: lo stato vero lo racconta la pagina,
        // non questo componente.
        router.refresh()
      }
    }, PAUSA_MS)

    return () => {
      vivo = false
      clearInterval(battito)
    }
  }, [aspetto, id, router])

  if (aspetto) {
    return (
      <Riquadro>
        <p className="font-titoli text-h4">Stiamo confermando il pagamento</p>
        <p className="text-corpo-big">
          Stripe ci sta dicendo com&apos;è andata. Di solito è questione di qualche secondo.
        </p>
      </Riquadro>
    )
  }

  if (rinunciato) {
    return (
      <Riquadro>
        <p className="font-titoli text-h4">La conferma sta tardando</p>
        <p className="text-corpo-big">
          Se hai pagato, il pagamento è al sicuro: la conferma arriva anche con calma, e ti
          mandiamo una mail appena c&apos;è. Ricarica fra un minuto, o scrivici.
        </p>
        <Whatsapp numero={whatsapp} />
      </Riquadro>
    )
  }

  // ------------------------------------------------------------ da pagare
  if (stato === 'pending_payment') {
    return (
      <Riquadro>
        <p className="font-titoli text-h4">Manca il pagamento</p>
        <p className="text-corpo-big">
          Lo slot è tenuto per te fino al pagamento. <Conto scadenza={scadenza} />
        </p>
        <button
          onClick={() => paga(id, setApro, setMotivo, router)}
          disabled={apro}
          className="inline-block rounded-full bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110 disabled:opacity-60"
        >
          {apro ? 'Un attimo…' : 'Paga la consulenza'}
        </button>
        {motivo && <p className="text-corpo text-primario">{motivo}</p>}
      </Riquadro>
    )
  }

  return null
}

async function paga(
  id: string,
  setApro: (v: boolean) => void,
  setMotivo: (v: string | null) => void,
  router: ReturnType<typeof useRouter>,
) {
  setApro(true)
  setMotivo(null)

  const r = await fetch(`/prenotazione/${id}/cassa`, { method: 'POST' }).catch(() => null)
  const corpo = r
    ? ((await r.json().catch(() => null)) as { url?: string; motivo?: string; stato?: string } | null)
    : null

  if (r?.ok && corpo?.url) {
    window.location.href = corpo.url
    return
  }

  setApro(false)
  if (corpo?.stato === 'in_conferma') {
    setMotivo('Il pagamento risulta già fatto: stiamo confermando.')
    router.refresh()
    return
  }
  // Stato cambiato sotto i piedi (scaduta, cancellata): la pagina si ridisegna
  // da sé e dice la verità aggiornata invece di lasciare un bottone che mente.
  router.refresh()
  setMotivo(corpo?.motivo ?? 'Non siamo riusciti ad aprire il pagamento. Riprova.')
}

/**
 * Quanto manca alla scadenza, aggiornato al secondo.
 *
 * `fine` era un ref inizializzato dalla prop, ed è diventato un valore derivato
 * l'8 settembre 2026, nella stessa passata in cui è caduta la guardia di
 * `attesa-prenotazione.tsx`. Non era la stessa guardia — questo non ha mai
 * bloccato niente — ma era sbagliato in un altro modo: **un ref inizializzato da
 * una prop rivaluta l'espressione a ogni resa e ne conserva soltanto la prima.**
 * Se `scadenza` cambiasse (un `router.refresh()` che riporta una riga
 * aggiornata), il conto continuerebbe a puntare alla scadenza vecchia, in
 * silenzio.
 *
 * Un numero derivato dalla prop non ha quel difetto e sta nelle dipendenze
 * dell'effetto, che così riparte quando la scadenza cambia davvero. Un ref serve
 * a ricordare qualcosa *fra* le rese; qui non c'era niente da ricordare.
 */
function Conto({ scadenza }: { scadenza: string | null }) {
  const [resta, setResta] = useState<number | null>(null)
  const fine = scadenza ? new Date(scadenza).getTime() : null

  useEffect(() => {
    if (fine === null) return
    const calcola = () => setResta(Math.max(0, Math.floor((fine - Date.now()) / 1000)))
    calcola()
    const t = setInterval(calcola, 1000)
    return () => clearInterval(t)
  }, [fine])

  if (resta === null) return null
  if (resta === 0) return <>Il tempo è finito: ricarica la pagina.</>

  const min = Math.floor(resta / 60)
  const sec = String(resta % 60).padStart(2, '0')
  return (
    <>
      Hai ancora <strong>{min}:{sec}</strong> per completarlo.
    </>
  )
}

function Whatsapp({ numero }: { numero: string | null }) {
  if (!numero) return null
  return (
    <a
      href={`https://wa.me/${numero.replace(/[^0-9]/g, '')}`}
      className="inline-block rounded-full bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
    >
      Scrivici su WhatsApp
    </a>
  )
}

function Riquadro({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col items-start gap-4">{children}</div>
}
