import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Client lato server con la sessione del viaggiatore, letta dai cookie.
 * Rispetta la RLS: vede solo ciò che quell'utente può vedere.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Chiamato da un Server Component: i cookie li rinfresca il
            // middleware, qui si può ignorare.
          }
        },
      },
    },
  )
}
