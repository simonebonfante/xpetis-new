import Link from 'next/link'

/**
 * La barra bianca a pillola in cima.
 *
 * C'è solo "Accedi", non "Iscriviti": il Flusso vuole la navigazione anonima e
 * il login obbligatorio soltanto al momento della prenotazione. Questo bottone è
 * la scorciatoia per chi ha già un account, non un cancello.
 */
export function Header() {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-6 z-20 px-4 lg:top-10 lg:px-[100px]">
      <div className="pointer-events-auto mx-auto flex h-16 max-w-[1312px] items-center justify-between gap-6 rounded-full bg-neutro px-6 lg:px-8">
        <Link href="/" className="font-testo text-h4 font-bold text-scuro">
          XPETIS
        </Link>

        <nav className="hidden items-center gap-10 text-corpo lg:flex">
          <Link href="/designer" className="hover:text-primario">
            Scopri i Travel Designer
          </Link>
          <Link href="/travel-designer" className="hover:text-primario">
            Entra a far parte di XPETIS
          </Link>
        </nav>

        <Link
          href="/accedi"
          className="rounded-full bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
        >
          Accedi
        </Link>
      </div>
    </header>
  )
}
