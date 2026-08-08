'use client'

import { createClient } from '@/lib/supabase/client'

/**
 * Google è l'unico provider previsto dal Flusso. Il login non protegge il
 * sito — la navigazione è anonima — ma serve al momento del Prenota: aggancia
 * la prenotazione a una persona, dà l'id da passare a Cal.com e salva il quiz
 * sul profilo.
 */
export function EntraConGoogle({ next = '/' }: { next?: string }) {
  async function entra() {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
  }

  return (
    <button
      onClick={entra}
      className="rounded-full bg-brand px-6 py-3 font-semibold text-white transition hover:bg-brand-scuro"
    >
      Entra con Google
    </button>
  )
}
