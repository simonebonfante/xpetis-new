import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Dove atterra il viaggiatore dopo Google.
 *
 * Il giro è: il sito manda a Google → Google torna su **Supabase**
 * (`/auth/v1/callback`, l'URI registrato in Google Cloud) → Supabase rimanda
 * qui con un codice monouso, che scambiamo per una sessione vera.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Dietro il proxy di Vercel `origin` è l'host interno: si usa
      // l'intestazione inoltrata, altrimenti si finisce su un indirizzo che
      // non esiste fuori.
      const forwardedHost = request.headers.get('x-forwarded-host')
      if (process.env.NODE_ENV !== 'development' && forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/?errore=login`)
}
