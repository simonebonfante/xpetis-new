'use client'

import Link from 'next/link'
import { useEffect, useSyncExternalStore } from 'react'

/**
 * "Torna ai risultati" (Figma nuovo 18:6084, in fondo alla vetrina), e il pezzo
 * che lo rende possibile.
 *
 * I risultati non hanno un indirizzo che la vetrina conosca: la card di
 * `/ricerca` porta a `/designer/<slug>` senza la query, perché meta, filtri e
 * quiz sono del viaggiatore e non del designer — e l'indirizzo di una vetrina
 * deve restare lo stesso per tutti, perché finisce su WhatsApp. `document.referrer`
 * non basta: nelle navigazioni interne di Next.js non cambia.
 *
 * Quindi `/ricerca` si annota da sé l'ultimo indirizzo mostrato, in
 * `sessionStorage` della scheda, e il tasto lo rilegge. Niente di personale:
 * è la stessa stringa che il viaggiatore ha nella barra degli indirizzi.
 * Senza annotazione (link da WhatsApp, scheda nuova, storage bloccato) il tasto
 * porta a `/ricerca` nuda, che è il punto di partenza e non una pagina rotta.
 */
const CHIAVE = 'xpetis:ultimi-risultati'

/** Messo in `/ricerca`: annota l'indirizzo dei risultati che si stanno guardando. */
export function RicordaRisultati({ percorso }: { percorso: string }) {
  useEffect(() => {
    try {
      sessionStorage.setItem(CHIAVE, percorso)
    } catch {
      // Storage bloccato: il tasto ripiegherà su /ricerca.
    }
  }, [percorso])
  return null
}

/**
 * L'indirizzo annotato, se è un percorso nostro verso `/ricerca`: il valore sta
 * nel browser, e un link che porta fuori dal sito non deve poterci finire.
 */
function leggiAnnotato(): string {
  try {
    const annotato = sessionStorage.getItem(CHIAVE)
    if (annotato && /^\/ricerca(\?|$)/.test(annotato)) return annotato
  } catch {
    // Storage bloccato.
  }
  return '/ricerca'
}

// Nessuna sottoscrizione: l'annotazione la scrive un'altra pagina, e qui si
// legge una volta. `useSyncExternalStore` serve a leggerla dopo l'idratazione
// senza un `setState` dentro un effetto; sul server il valore è `/ricerca`.
const nessunaSottoscrizione = () => () => {}

export function TornaAiRisultati({ className }: { className?: string }) {
  const href = useSyncExternalStore(nessunaSottoscrizione, leggiAnnotato, () => '/ricerca')

  return (
    <Link href={href} className={className}>
      Torna ai risultati
    </Link>
  )
}
