'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * La pagina d'attesa fra l'embed di Cal.com e la cassa.
 *
 * Interroga `/attesa/cerca` con pause crescenti finché la prenotazione non
 * compare, poi apre la cassa e manda il viaggiatore su Stripe. Le pause
 * crescono invece di restare fisse per la ragione solita: nei primi secondi la
 * riga arriva quasi sempre, e continuare a bussare ogni secondo per mezzo minuto
 * servirebbe solo a fare rumore nel caso in cui non arriva.
 *
 * Se dopo l'attesa non è comparso niente, **non si lascia il viaggiatore a mani
 * vuote**: il messaggio dice la verità (lo slot è preso, la conferma no) e offre
 * WhatsApp, mentre `/attesa/cerca` in POST lascia una riga in `team_alerts`
 * perché qualcuno se ne occupi.
 */

/** Undici tentativi, circa 33 secondi in tutto. */
const PAUSE = [700, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500]

type Stato = 'cerco' | 'apro' | 'non_trovata' | 'errore'

export function AttesaPrenotazione({ whatsapp }: { whatsapp: string | null }) {
  const router = useRouter()
  const [stato, setStato] = useState<Stato>('cerco')
  const [dettaglio, setDettaglio] = useState<string | null>(null)
  // React monta due volte in sviluppo: senza questa guardia il giro parte
  // doppio e la cassa si apre due volte.
  const avviato = useRef(false)

  useEffect(() => {
    if (avviato.current) return
    avviato.current = true

    let vivo = true
    const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms))

    async function giro() {
      for (const pausa of PAUSE) {
        await attendi(pausa)
        if (!vivo) return

        const r = await fetch('/attesa/cerca', { cache: 'no-store' }).catch(() => null)
        if (!vivo) return
        if (!r?.ok) continue

        const { prenotazione } = (await r.json()) as { prenotazione: string | null }
        if (prenotazione) return apri(prenotazione)
      }

      // Ultimo colpo: la route riguarda e, se davvero non c'è niente, segnala.
      const r = await fetch('/attesa/cerca', { method: 'POST' }).catch(() => null)
      if (!vivo) return
      const esito = r?.ok ? ((await r.json()) as { prenotazione: string | null }) : null
      if (esito?.prenotazione) return apri(esito.prenotazione)
      setStato('non_trovata')
    }

    async function apri(prenotazione: string) {
      setStato('apro')
      const r = await fetch(`/prenotazione/${prenotazione}/cassa`, { method: 'POST' }).catch(
        () => null,
      )
      if (!vivo) return

      const corpo = r ? ((await r.json().catch(() => null)) as { url?: string; motivo?: string } | null) : null
      if (r?.ok && corpo?.url) {
        window.location.href = corpo.url
        return
      }
      // La cassa non si apre ma la prenotazione esiste: la sua pagina sa
      // spiegare perché meglio di questa.
      router.push(`/prenotazione/${prenotazione}`)
    }

    giro().catch((e) => {
      if (!vivo) return
      setDettaglio(String(e))
      setStato('errore')
    })

    return () => {
      vivo = false
    }
    // `avviato` impedisce il secondo giro: le dipendenze qui non riavviano
    // niente, ci sono perché la regola le vuole complete.
  }, [router])

  if (stato === 'cerco' || stato === 'apro') {
    return (
      <div className="space-y-3">
        <p className="font-titoli text-h4">
          {stato === 'cerco' ? 'Stiamo registrando la tua prenotazione' : 'Ti portiamo al pagamento'}
        </p>
        <p className="text-corpo-big">
          Ci vogliono pochi secondi. Non chiudere questa pagina.
        </p>
        <Puntini />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="font-titoli text-h4">Lo slot è tuo, la conferma no</p>
      <p className="text-corpo-big">
        Il calendario del designer ha registrato l&apos;appuntamento, ma da noi non è ancora
        arrivato e non possiamo aprirti il pagamento. Non è colpa tua e non ci hai rimesso
        niente: <strong>non è stato addebitato nulla</strong>.
      </p>
      <p className="text-corpo-big">
        Il nostro team è già stato avvisato e ti scrive. Se preferisci fare prima, scrivici tu.
      </p>
      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`}
          className="inline-block rounded-full bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
        >
          Scrivici su WhatsApp
        </a>
      )}
      {dettaglio && <p className="text-piccolo opacity-60">{dettaglio}</p>}
    </div>
  )
}

function Puntini() {
  return (
    <span className="inline-flex gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 animate-pulse rounded-full bg-primario"
          style={{ animationDelay: `${i * 200}ms` }}
        />
      ))}
    </span>
  )
}
