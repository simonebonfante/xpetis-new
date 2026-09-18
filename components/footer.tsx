import Link from 'next/link'
import Image from 'next/image'
import { BadgeStella } from './badge-stella'

/**
 * Le voci del footer, come le elenca il Figma.
 *
 * `inerte` marca una voce che **non ha una destinazione e non l'avrà**: la si
 * mostra spenta con una spiegazione invece di linkare un 404. Oggi ne esiste una
 * sola, "Entra nella Community", e la ragione è la stessa scritta in
 * `components/header.tsx`: il Flusso non descrive una pagina di reclutamento dei
 * Travel Designer, i 25 arrivano da un form esterno gestito a mano, e
 * costruirne una vorrebbe dire decidere per il business. Domanda aperta in
 * `PIANO.md`, non un pezzo mancante.
 *
 * ⚠️ Le altre voci senza pagina — `/viaggi-di-gruppo`, `/about`, `/privacy`,
 * `/contatti` — restano link normali di proposito: quelle pagine **devono
 * esistere** (la privacy per obbligo di legge) e i loro testi non sono lavoro
 * tecnico. Spegnerle direbbe "non ci saranno", che è falso. Sono in `PIANO.md`
 * fra le cose che aspettano un contenuto.
 */
const COLONNE: {
  titolo: string
  voci: { testo: string; href?: string; inerte?: string }[]
}[] = [
  {
    titolo: 'Per i viaggiatori',
    voci: [
      { testo: 'Scopri i Travel Designer di XPETIS', href: '/ricerca' },
      { testo: 'Esplora i viaggi di gruppo', href: '/viaggi-di-gruppo' },
    ],
  },
  {
    titolo: 'Per i Travel Designer',
    voci: [
      {
        testo: 'Entra nella Community',
        inerte:
          'Le candidature dei Travel Designer passano ancora dal team: scrivici a info@xpetis.it.',
      },
    ],
  },
  {
    titolo: 'Company',
    voci: [
      { testo: 'About', href: '/about' },
      { testo: 'Privacy & Cookie Policy', href: '/privacy' },
      { testo: 'Contact', href: '/contatti' },
    ],
  },
]

export function Footer() {
  return (
    <footer className="relative overflow-hidden bg-scuro pt-20 text-neutro">
      <div className="mx-auto max-w-[1312px] px-4 lg:px-0">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-3">
          {COLONNE.map((colonna) => (
            <div key={colonna.titolo}>
              <h2 className="mb-6 font-titoli text-h4 font-bold">{colonna.titolo}</h2>
              <ul className="space-y-3 text-corpo">
                {colonna.voci.map((voce) => (
                  <li key={voce.testo}>
                    {voce.href ? (
                      <Link href={voce.href} className="hover:text-primario">
                        {voce.testo}
                      </Link>
                    ) : (
                      <span
                        aria-disabled="true"
                        title={voce.inerte}
                        className="cursor-default opacity-50"
                      >
                        {voce.testo}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-col gap-2 text-piccolo sm:flex-row sm:justify-between">
          <a href="mailto:info@xpetis.it" className="hover:text-primario">
            info@xpetis.it
          </a>
          <p>© XPETIS. 2025 All Rights Reserved</p>
        </div>
      </div>

      {/* Il logo gigante in negativo: la fascia si ridimensiona in blocco
          conservando le proporzioni del file (3709×834). */}
      <div className="mt-10 px-4 lg:px-8">
        <Image
          src="/logo/logo-negative.png"
          alt="XPETIS"
          width={3709}
          height={834}
          className="h-auto w-full"
        />
      </div>

      <BadgeStella
        testo="Pront* a partire?"
        dimensione={183}
        rotazione={11.53}
        className="absolute right-6 top-10 hidden lg:block"
      />
    </footer>
  )
}
