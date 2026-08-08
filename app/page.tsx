import { createClient } from '@/lib/supabase/server'
import { EntraConGoogle } from '@/components/entra-con-google'

export const dynamic = 'force-dynamic'

/**
 * Pagina di verifica dell'impianto. Non è la home: serve a provare che il giro
 * Google → Supabase → app funziona, e che il trigger su `auth.users` crea la
 * riga in `travelers`. Verrà sostituita dalla home vera.
 */
export default async function Prova() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Legge dalle viste pubbliche con la sola chiave publishable: se rispondono,
  // la superficie pubblica è configurata bene.
  const { count: paesi } = await supabase
    .from('geo_search')
    .select('*', { count: 'exact', head: true })
    .eq('level', 'country')

  const { data: designer } = await supabase
    .from('public_td_showcase')
    .select('slug, display_name')
    .order('display_name')

  // Solo se loggato: la propria riga travelers, che nasce da un trigger su
  // auth.users. Se arriva, funzionano insieme il login, il trigger e la policy.
  const { data: viaggiatore } = user
    ? await supabase.from('travelers').select('id, email, full_name').single()
    : { data: null }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-10">
      <header>
        <p className="text-sm uppercase tracking-widest text-brand">XPETIS</p>
        <h1 className="text-3xl font-bold">Prova dell&apos;impianto</h1>
      </header>

      <section className="rounded-xl border border-neutral-200 p-6">
        <h2 className="mb-3 font-semibold">Lettura pubblica (chiave publishable)</h2>
        <ul className="space-y-1 text-sm">
          <li>Paesi nella tassonomia: <strong>{paesi ?? '—'}</strong> (attesi 129)</li>
          <li>
            Designer pubblicati:{' '}
            <strong>{designer?.map((d) => d.display_name).join(', ') || '—'}</strong>
          </li>
        </ul>
      </section>

      <section className="rounded-xl border border-neutral-200 p-6">
        <h2 className="mb-3 font-semibold">Login Google</h2>
        {user ? (
          <div className="space-y-3 text-sm">
            <p>
              Sessione attiva: <strong>{user.email}</strong>
            </p>
            <p>
              Riga in <code>travelers</code>:{' '}
              {viaggiatore ? (
                <strong className="text-brand">
                  creata dal trigger — {viaggiatore.full_name ?? 'nome non fornito da Google'}
                </strong>
              ) : (
                <strong className="text-red-600">assente</strong>
              )}
            </p>
            <form action="/auth/esci" method="post">
              <button className="text-sm underline">Esci</button>
            </form>
          </div>
        ) : (
          <EntraConGoogle />
        )}
      </section>
    </main>
  )
}
