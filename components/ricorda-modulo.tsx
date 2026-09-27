'use client'

import { useEffect, useRef } from 'react'

/**
 * Rimette nel form **quello che il designer ha appena inviato**, quando la
 * route lo rimanda indietro con un errore.
 *
 * Il difetto che chiude (prove del 23 settembre): il form si ripopolava dalla
 * riga di `orders`, che alla prima stesura non c'è ancora. Un prezzo sbagliato
 * alla prima volta riportava il designer a un form **vuoto**, descrizione
 * compresa. Riscrivere tutto per un errore sul prezzo è il modo di sbagliare
 * anche la seconda volta — e la seconda volta si sbaglia il prezzo.
 *
 * ⚠️ **Ripopolare dal database sembra la cosa giusta, e non lo è.** La riga è
 * l'ultima bozza *salvata*, non l'ultima *inviata*: alla prima stesura non
 * esiste, e dalla seconda in poi è la versione di prima della correzione. La
 * riga resta il ripiego (è il `defaultValue` che disegna il server), questo
 * componente ci scrive sopra quello che è stato mandato.
 *
 * Perché nel browser e non nel redirect: la descrizione arriva a ventimila
 * caratteri, che non stanno in un indirizzo né in un cookie. Il testo resta in
 * `sessionStorage` della scheda, senza il token, il tempo di un giro: si
 * scrive all'invio e si cancella alla lettura, e un form aperto senza errore
 * lo butta. Senza JavaScript si torna al ripiego, cioè a com'era prima.
 */
export function RicordaModulo({ chiave, ripristina }: { chiave: string; ripristina: boolean }) {
  const segnaposto = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const form = segnaposto.current?.closest('form')
    if (!form) return
    const campi = () =>
      Array.from(form.elements).filter(
        (e): e is HTMLInputElement | HTMLTextAreaElement =>
          (e instanceof HTMLInputElement && e.type !== 'hidden') || e instanceof HTMLTextAreaElement,
      )

    try {
      const salvato = sessionStorage.getItem(chiave)
      sessionStorage.removeItem(chiave)
      if (ripristina && salvato) {
        const valori = JSON.parse(salvato) as Record<string, string>
        for (const c of campi()) if (c.name in valori) c.value = valori[c.name]
      }
    } catch {
      // Storage bloccato o testo illeggibile: resta il ripiego del server.
    }

    const ricorda = () => {
      try {
        sessionStorage.setItem(chiave, JSON.stringify(Object.fromEntries(campi().map((c) => [c.name, c.value]))))
      } catch {
        // Idem: senza storage il designer ritrova la bozza salvata, se c'è.
      }
    }
    form.addEventListener('submit', ricorda)
    return () => form.removeEventListener('submit', ricorda)
  }, [chiave, ripristina])

  return <span ref={segnaposto} hidden />
}
