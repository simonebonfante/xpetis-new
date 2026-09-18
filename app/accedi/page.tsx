import Link from 'next/link'
import { redirect } from 'next/navigation'

import { Header } from '@/components/header'
import { Footer } from '@/components/footer'
import { EntraConGoogle } from '@/components/entra-con-google'
import { leggiUtente } from '@/lib/supabase/utente'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Accedi · XPETIS',
}

/**
 * La pagina che l'header cercava da sempre.
 *
 * Il bottone `Accedi` in `components/header.tsx` punta qui dal 23 agosto e fino
 * all'8 settembre 2026 rispondeva 404. Il componente c'era già
 * (`EntraConGoogle`), la catena `/auth/callback?next=…` funzionava: mancava solo
 * il posto dove metterli.
 *
 * **Non è un cancello.** Il Flusso vuole la navigazione anonima e il login
 * obbligatorio soltanto al momento della prenotazione: questa pagina si
 * raggiunge o dal bottone dell'header — chi vuole entrare prima — o dal tasto
 * *Prenota la call*, che ci manda con `?next=` la vetrina da cui si è partiti.
 *
 * **Chi è già dentro non vede un bottone per entrare.** Sarebbe la cosa più
 * facile da sbagliare e la più fastidiosa da subire: si arriva qui dal tasto
 * *Prenota* con la sessione già valida (un secondo clic, un tasto Indietro) e
 * ripartire dal login vorrebbe dire perdere il posto. Quindi si va dove si
 * stava andando.
 */

/**
 * Dove si può tornare dopo il login.
 *
 * `next` arriva dalla query, cioè da fuori, e finisce in un `redirect`: se non
 * si controlla, `/accedi?next=https://altrosito.example` fa di questa pagina un
 * trampolino per portare altrove chi si fida del nostro dominio. Si accettano
 * **solo percorsi interni** — inizio `/` e nessun `//` che il browser leggerebbe
 * come host — e tutto il resto diventa la home.
 */
function destinazione(next: string | string[] | undefined): string {
  const valore = Array.isArray(next) ? next[0] : next
  if (!valore || !valore.startsWith('/') || valore.startsWith('//')) return '/'
  return valore
}

export default async function Accedi({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { next } = await searchParams
  const dove = destinazione(next)

  const user = await leggiUtente()

  // Già dentro: non si chiede di entrare due volte. Se `next` è la home — cioè
  // chi è arrivato qui dall'header senza una meta — si resta e si dice chi sei,
  // altrimenti si riparte da dove si era interrotti.
  if (user && dove !== '/') redirect(dove)

  return (
    <>
      <Header />

      <main className="mx-auto flex min-h-screen max-w-[600px] flex-col justify-center gap-6 px-4 py-32 lg:px-0">
        {user ? (
          <>
            <h1 className="font-titoli text-h3">Sei già dentro</h1>
            <p className="text-corpo-big">
              Hai il profilo collegato a <strong>{user.email}</strong>. Non serve fare altro: da
              qui puoi cercare un Travel Designer o riprendere da dove eri.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/ricerca"
                className="rounded-full bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
              >
                Trova un Travel Designer
              </Link>
              <Link href="/quiz" className="text-corpo underline hover:text-primario">
                Fai il quiz
              </Link>
            </div>
            <form action="/auth/esci" method="post" className="mt-4">
              <button className="text-corpo underline hover:text-primario">Esci</button>
            </form>
          </>
        ) : (
          <>
            <h1 className="font-titoli text-h3">Accedi a XPETIS</h1>
            <p className="text-corpo-big">
              Serve solo per prenotare: il profilo aggancia la consulenza a te, passa il tuo
              nome al designer e tiene da parte le risposte del quiz. Per guardare il sito non
              serve.
            </p>
            <EntraConGoogle next={dove} />
            <p className="text-piccolo">
              Entri con Google. Non chiediamo password e non ne conserviamo nessuna.
            </p>
          </>
        )}
      </main>

      <Footer />
    </>
  )
}
