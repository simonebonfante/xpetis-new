'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Il tasto «Consegna» della pagina ordine: sceglie un file e lo porta in
 * Storage in tre passi, perché i byte non possono passare dal nostro server
 * (una funzione Vercel accetta 4,5 MB, il bucket 50):
 *
 *   1. `/consegna/biglietto` — il database controlla e sceglie il percorso, la
 *      route apre un caricamento firmato su quel percorso soltanto;
 *   2. il browser manda il file dritto a Storage con quel biglietto;
 *   3. `/consegna` — la route guarda cosa è arrivato davvero e il database
 *      registra la consegna.
 *
 * È l'unico pezzo delle pagine a token che ha bisogno di JavaScript: un
 * `<form>` HTML manderebbe il file alla route, cioè al limite dei 4,5 MB. Il
 * client Supabase qui usa la chiave publishable e il biglietto, e basta: non
 * ha modo di leggere niente.
 *
 * Dalla 0047 lo usa anche l'All Inclusive, due volte: per il documento della
 * proposta e per il documento finale. **Il meccanismo è lo stesso** — cosa si
 * sta caricando lo decide il database dallo stato dell'ordine — e cambiano
 * solo le parole, che arrivano da `testi`.
 */

const BUCKET = 'order-documents'
const MASSIMO = 50 * 1024 * 1024

type Stato =
  | { fase: 'pronto' }
  | { fase: 'in_corso'; passo: string }
  | { fase: 'errore'; testo: string }

type Testi = { titolo: string; bottone: string; nota: string }

export function CaricaConsegna({
  base,
  revisione = false,
  testi,
}: {
  base: string
  revisione?: boolean
  testi?: Testi
}) {
  const t: Testi = testi ?? {
    titolo: revisione ? 'La versione rivista' : 'L’itinerario',
    bottone: revisione ? 'Consegna la revisione' : 'Consegna',
    nota: 'Consegnando, il viaggiatore riceve la mail con il link alla sua pagina, da cui scarica il file.',
  }
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [stato, setStato] = useState<Stato>({ fase: 'pronto' })

  async function consegna() {
    if (!file) return
    if (file.size > MASSIMO) {
      setStato({ fase: 'errore', testo: 'Il file supera i 50 MB. Prova a esportarlo più leggero.' })
      return
    }

    try {
      setStato({ fase: 'in_corso', passo: 'Controllo…' })
      const b = await posta(`${base}/consegna/biglietto`, { nome: file.name, byte: file.size, tipo: file.type })
      if (!b.ok) return setStato({ fase: 'errore', testo: testoErrore(b.esito, b.campo) })

      setStato({ fase: 'in_corso', passo: 'Carico il file… non chiudere la pagina.' })
      const { error } = await createClient()
        .storage.from(BUCKET)
        .uploadToSignedUrl(b.path, b.biglietto, file, { contentType: b.tipo || file.type || undefined })
      if (error) {
        return setStato({
          fase: 'errore',
          testo: 'Il caricamento non è riuscito. Controlla la connessione e riprova: non è partito niente.',
        })
      }

      setStato({ fase: 'in_corso', passo: 'Registro la consegna…' })
      const c = await posta(`${base}/consegna`, { path: b.path, nome: file.name })
      if (!c.ok) return setStato({ fase: 'errore', testo: testoErrore(c.esito, c.campo) })

      // La pagina rilegge lo stato dal database: adesso è «consegnato».
      router.refresh()
    } catch {
      setStato({ fase: 'errore', testo: 'Qualcosa si è interrotto. Riprova fra un minuto.' })
    }
  }

  const occupato = stato.fase === 'in_corso'

  return (
    <div className="space-y-4">
      <label className="block space-y-2">
        <span className="text-corpo-big">{t.titolo}</span>
        <span className="block text-corpo opacity-70">PDF, Word o immagine, fino a 50 MB.</span>
        <input
          type="file"
          accept=".pdf,.docx,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          disabled={occupato}
          onChange={(e) => {
            setFile(e.currentTarget.files?.[0] ?? null)
            setStato({ fase: 'pronto' })
          }}
          className="block w-full text-corpo"
        />
      </label>
      <button
        type="button"
        onClick={consegna}
        disabled={!file || occupato}
        className="rounded-full bg-primario px-6 py-3 text-corpo-big text-neutro transition hover:brightness-110 disabled:opacity-50"
      >
        {t.bottone}
      </button>
      {stato.fase === 'in_corso' && <p role="status" className="text-corpo">{stato.passo}</p>}
      {stato.fase === 'errore' && (
        <p role="alert" className="rounded-2xl border border-primario px-5 py-4 text-corpo text-primario">
          {stato.testo}
        </p>
      )}
      <p className="text-corpo opacity-60">{t.nota}</p>
    </div>
  )
}

async function posta(url: string, corpo: unknown) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  return (await r.json()) as { ok: boolean; esito?: string; campo?: string; path: string; biglietto: string; tipo?: string }
}

function testoErrore(esito: string | undefined, campo: string | undefined): string {
  switch (esito) {
    case 'dati_non_validi':
      if (campo === 'tipo') return 'Questo tipo di file non si può consegnare: usa PDF, Word (.docx), JPG o PNG.'
      if (campo === 'dimensione') return 'Il file supera i 50 MB. Prova a esportarlo più leggero.'
      return 'Il file non si legge. Prova a sceglierlo di nuovo.'
    case 'stato_non_ammesso':
      return 'In questo stato l’ordine non si può consegnare. Ricarica la pagina per vedere a che punto è.'
    case 'file_non_arrivato':
      return 'Il file non è arrivato fino a noi. Riprova: non è stato consegnato niente.'
    default:
      return 'Non siamo riusciti a registrare la consegna. Riprova fra un minuto; se continua, scrivi al team.'
  }
}
