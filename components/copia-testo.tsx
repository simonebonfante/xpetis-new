'use client'

import { useRef, useState } from 'react'

/**
 * Il messaggio pronto da copiare nel gruppo WhatsApp, con il suo bottone.
 *
 * Il testo sta **anche** in un campo selezionabile e non solo dietro il
 * bottone: `navigator.clipboard` non esiste fuori da HTTPS e manca in alcuni
 * browser dentro le app di posta, che è proprio da dove il designer arriva. Se
 * la copia non riesce, il bottone seleziona il testo e dice di copiarlo a mano.
 *
 * Il bottone si disegna sempre, e la disponibilità degli appunti si scopre al
 * clic: deciderla durante il disegno darebbe al server e al browser due pagine
 * diverse.
 */
export function CopiaTesto({ testo, etichetta = 'Copia il messaggio' }: { testo: string; etichetta?: string }) {
  const [stato, setStato] = useState<'pronto' | 'copiato' | 'a_mano'>('pronto')
  const campo = useRef<HTMLTextAreaElement>(null)

  async function copia() {
    try {
      await navigator.clipboard.writeText(testo)
      setStato('copiato')
      setTimeout(() => setStato('pronto'), 2500)
    } catch {
      campo.current?.select()
      setStato('a_mano')
    }
  }

  return (
    <div className="space-y-3">
      <textarea
        ref={campo}
        readOnly
        value={testo}
        rows={Math.min(10, testo.split('\n').length + 2)}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-2xl border border-scuro/30 bg-transparent p-4 text-corpo"
      />
      <button
        type="button"
        onClick={copia}
        className="rounded-full border border-scuro px-5 py-2 text-corpo transition hover:bg-scuro hover:text-neutro"
      >
        {stato === 'copiato' ? 'Copiato' : etichetta}
      </button>
      {stato === 'a_mano' && (
        <p className="text-corpo opacity-70">Il testo è selezionato: copialo tenendoci il dito sopra.</p>
      )}
    </div>
  )
}
