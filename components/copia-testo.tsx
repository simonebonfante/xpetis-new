'use client'

import { useRef, useState } from 'react'

/**
 * Il messaggio pronto da copiare nel gruppo WhatsApp, con il suo bottone.
 *
 * **Il campo è la cosa, il bottone è una comodità sopra.** Il testo sta in un
 * campo selezionabile e si copia a mano sempre, con o senza bottone:
 * `navigator.clipboard` esiste solo in contesto sicuro (HTTPS o `localhost`) e
 * manca in alcuni browser dentro le app di posta, che è proprio da dove il
 * designer arriva. Provato il 23 settembre: dall'indirizzo di rete
 * `http://192.168.x.x:3000` il bottone falliva anche dal desktop — in
 * produzione, su HTTPS, funzionerà, ma il designer non deve dipenderne.
 *
 * ⚠️ La correzione **non** è inseguire i browser con `document.execCommand`:
 * è deprecato, e ogni ripiego in più è un modo in più di fallire in silenzio.
 * Il guasto da evitare è uno solo: il designer che resta senza link e non se ne
 * accorge nessuno, mentre il cliente aspetta nel gruppo.
 *
 * Il bottone si disegna sempre, e la disponibilità degli appunti si scopre al
 * clic: deciderla durante il disegno darebbe al server e al browser due pagine
 * diverse.
 */
export function CopiaTesto({ testo, etichetta = 'Copia il messaggio' }: { testo: string; etichetta?: string }) {
  const [stato, setStato] = useState<'pronto' | 'copiato' | 'a_mano'>('pronto')
  const campo = useRef<HTMLTextAreaElement>(null)

  // Su iOS `select()` da solo non seleziona un campo in sola lettura: serve
  // anche l'intervallo esplicito.
  function seleziona(el: HTMLTextAreaElement | null) {
    if (!el) return
    el.focus()
    el.select()
    el.setSelectionRange(0, el.value.length)
  }

  async function copia() {
    try {
      if (!navigator.clipboard) throw new Error('appunti non disponibili')
      await navigator.clipboard.writeText(testo)
      setStato('copiato')
      setTimeout(() => setStato('pronto'), 2500)
    } catch {
      seleziona(campo.current)
      setStato('a_mano')
    }
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-2">
        <span className="block text-corpo opacity-70">
          Il testo da incollare nel gruppo. Se il bottone non copia, tieni il dito sul testo e scegli
          «Copia».
        </span>
        <textarea
          ref={campo}
          readOnly
          value={testo}
          rows={Math.min(10, testo.split('\n').length + 2)}
          onFocus={(e) => seleziona(e.currentTarget)}
          className="w-full rounded-2xl border border-scuro/30 bg-transparent p-4 text-corpo"
        />
      </label>
      <button
        type="button"
        onClick={copia}
        className="rounded-full border border-scuro px-5 py-2 text-corpo transition hover:bg-scuro hover:text-neutro"
      >
        {stato === 'copiato' ? 'Copiato' : etichetta}
      </button>
      {stato === 'a_mano' && (
        <p role="status" className="text-corpo">
          <strong>Il bottone non è riuscito a copiare.</strong> Il testo qui sopra è selezionato:
          copialo tenendoci il dito sopra, poi incollalo nel gruppo.
        </p>
      )}
    </div>
  )
}
