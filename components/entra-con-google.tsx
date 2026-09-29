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
      className="rounded-full bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
    >
      Entra con Google
    </button>
  )
}
