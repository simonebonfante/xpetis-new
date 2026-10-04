import Image from 'next/image'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'

import { leggiUtente } from '@/lib/supabase/utente'

/**
 * La barra bianca a pillola in cima.
 *
 * ⚠️ **"Iscriviti" non esiste, e non va aggiunto** (decisione di Simone, 29
 * settembre 2026). Il Figma nuovo lo disegna ancora accanto ad "Accedi" su
 * ogni pagina: non si costruisce e non si lascia spento. Scritto anche in
 * `PIANO.md`, perché chi guarda il disegno lo vede.
 *
 * C'è "Accedi" e non "Iscriviti": il Flusso vuole la navigazione anonima e il
 * login obbligatorio soltanto al momento della prenotazione. Quel bottone è la
 * scorciatoia per chi ha già un account, non un cancello — il cancello vero è
 * sul tasto *Prenota la call*, e il perché sta in
 * `components/prenota-consulenza.tsx`.
 *
 * ## Le voci di navigazione (8 settembre 2026, riviste il 4 ottobre)
 *
 * Puntavano tutte a un 404, ma non erano lo stesso problema. La differenza è il
 * corollario di `CLAUDE.md`: l'assenza di una cosa nel Figma non è una
 * decisione — e non è nemmeno sempre lo stesso tipo di assenza.
 *
 *  · **Accedi** → `/accedi`, costruita: il componente e la catena OAuth
 *    esistevano già, mancava la pagina.
 *  · **Scopri i Travel Designer** → `/ricerca`, che esiste ed è disegnata
 *    (Figma 177:262). Non c'era niente da inventare: quella *è* la pagina che
 *    scopre i designer. `/designer` reindirizza qui per i link già dati in giro.
 *  · **Entra a far parte di XPETIS** → **tolta** (decisione di Simone, 4
 *    ottobre 2026). Era rimasta spenta dall'8 settembre: il Flusso non descrive
 *    una pagina di reclutamento dei Travel Designer, e i designer arrivano dal
 *    tool vetrina v6 gestito dal team. Una voce spenta in testa a ogni pagina
 *    non serviva a nessuno. Il Figma la disegna ancora: non si rimette.
 *
 * ## Da collegato, e il costo di saperlo
 *
 * Fino all'8 settembre l'header mostrava *Accedi* anche a chi era già dentro.
 * Adesso legge la sessione, e questo **ha un prezzo che vale la pena scrivere**:
 * leggere la sessione vuol dire leggere i cookie, e una pagina che legge i
 * cookie non si può più prerenderizzare.
 *
 * Il prezzo, misurato e non stimato: prima di questa modifica le sole pagine
 * statiche erano `/` e `/designer`, e `/designer` è un reindirizzamento che non
 * rende l'header. Quindi **la modifica rende dinamica una pagina sola: la
 * home.** Tutto il resto del sito legge già il database a ogni richiesta.
 *
 * E anche su quella, il costo è più piccolo di come suona: `proxy.ts` intercetta
 * già `/` e chiama `supabase.auth.getUser()` a ogni richiesta per rinfrescare il
 * token, quindi una richiesta alla home **paga già** un giro verso Supabase e
 * non è mai stata servita da una cache pura senza lavoro sul server. Quello che
 * si aggiunge è la resa React della pagina, non la chiamata di autenticazione.
 *
 * **La strada scartata** era tenere l'header statico e far risolvere lo stato
 * del login a un pezzo client. Costa meno in resa e molto di più in sostanza:
 * mostrerebbe *Accedi* a chi è collegato per qualche centinaio di millisecondi
 * su ogni pagina, cioè esattamente il difetto che stiamo correggendo, solo più
 * breve. Reversibile: se un giorno il tempo di risposta della home diventasse un
 * problema, si separa l'header in due pezzi e si paga il lampeggio soltanto lì.
 *
 * ⚠️ **Il Figma non mostra l'header da collegato.** Questa è la versione minima
 * e onesta — chi sei, dove stanno le tue cose e la via d'uscita — e le domande
 * per Chiara (nome o avatar? tendina o testo? dove sta l'uscita?) sono in
 * `PIANO.md`. In particolare **non c'è nessun menu**: una tendina con voci verso
 * pagine che non esistono sarebbe il 404 travestito da funzionalità, di nuovo.
 *
 * ## "Le mie prenotazioni", e perché compare due volte (18 settembre 2026)
 *
 * Fino a oggi quella voce non c'era di proposito, perché la pagina non esisteva.
 * Adesso esiste — `/le-mie-prenotazioni` — ed è l'unica strada che un
 * viaggiatore ha per tornare su una consulenza prenotata e non pagata: se
 * dall'header non si raggiunge, non l'ha nessuno.
 *
 * Nella pillola ci sta una cosa sola in più, e **su mobile non ci sta nemmeno
 * quella**: a 360 px "XPETIS", il saluto, un link lungo e *Esci* non entrano.
 * Quindi due porte per la stessa stanza. **Il saluto è un link**, sempre, a
 * tutte le larghezze: è l'unico elemento personale già presente, e chi cerca
 * "le mie cose" clicca il proprio nome. Accanto, **solo da desktop**, la voce
 * scritta per esteso, perché "Ciao Simone" non dice dove porta e un link che non
 * si annuncia vale quasi zero. La ridondanza è voluta e costa una riga.
 */

/**
 * Come chiamare chi è collegato, e cosa fare quando non lo sappiamo.
 *
 * `full_name` e `avatar_url` arrivano da Google, cioè **da un fornitore
 * esterno**: possono mancare, e un header che stampa una stringa vuota o un
 * UUID è peggio di un header che non stampa niente.
 *
 * Il ripiego è **la parte della mail prima della chiocciola**, e la scelta ha
 * tre ragioni: c'è sempre (il login Google non esiste senza mail), è quasi
 * sempre un nome riconoscibile, e non stampa il dominio — una mail intera in
 * cima alla pagina è un dato in più su uno schermo che qualcuno può guardare da
 * sopra la spalla. L'etichetta neutra resta l'ultimo gradino, per il caso che
 * il tipo di Supabase ammette e che non dovrebbe capitare.
 *
 * **Del nome dichiarato si prende solo la prima parola.** "Ciao Simone" sta
 * nella pillola, "Ciao Simone Bonfante" no, e su mobile la spinge fuori.
 *
 * Nessun participio in questo componente, e non è un caso: la convenzione del
 * progetto sul genere riguarda i **designer**, di cui non conosciamo il genere e
 * per i quali si scrive "preparat*". Qui si parla al viaggiatore in seconda
 * persona, dove il problema non nasce — ma nasce subito appena qualcuno scrive
 * "benvenuto", e allora la regola torna a valere.
 */
function nomeVisibile(utente: User): string {
  const meta = utente.user_metadata ?? {}
  const dichiarato = ((meta.full_name ?? meta.name) as string | undefined)?.trim()
  if (dichiarato) return dichiarato.split(/\s+/)[0]

  const primaDellaChiocciola = utente.email?.split('@')[0]?.trim()
  if (primaDellaChiocciola) return primaDellaChiocciola

  return 'Il tuo profilo'
}

export async function Header() {
  // `leggiUtente` e non `getUser()` diretto: su una pagina che legge la
  // sessione anche per sé — la vetrina, `/accedi` — il giro verso Supabase si
  // farebbe due volte. Vedi `lib/supabase/utente.ts`.
  const user = await leggiUtente()

  return (
    <header className="pointer-events-none absolute inset-x-0 top-6 z-20 px-4 lg:top-10 lg:px-[100px]">
      <div className="pointer-events-auto mx-auto flex h-16 max-w-[1312px] items-center justify-between gap-4 rounded-full bg-neutro px-6 lg:gap-6 lg:px-8">
        {/* Il logo, non la scritta (Simone, 4 ottobre 2026). È quello della barra
            del tool vetrina v6, lo stesso disegno del logo grande del footer:
            copiato in `public/logo/logo-xpetis.svg` col viewBox stretto sul
            disegno (l'originale aveva quasi metà di margine) e senza il blocco
            di metadati. 890 × 200 sono le proporzioni vere. */}
        <Link href="/" className="shrink-0" aria-label="XPETIS, torna alla home">
          <Image
            src="/logo/logo-xpetis.svg"
            alt="XPETIS"
            width={890}
            height={200}
            className="h-6 w-auto lg:h-7"
          />
        </Link>

        <nav className="hidden items-center gap-10 text-corpo lg:flex">
          <Link href="/ricerca" className="hover:text-primario">
            Scopri i Travel Designer
          </Link>
        </nav>

        {user ? (
          <div className="flex min-w-0 items-center gap-3 lg:gap-5">
            <Link
              href="/le-mie-prenotazioni"
              className="max-w-[7rem] truncate text-corpo underline decoration-scuro/30 underline-offset-4 transition hover:text-primario lg:max-w-[12rem]"
            >
              Ciao {nomeVisibile(user)}
            </Link>
            <Link
              href="/le-mie-prenotazioni"
              className="hidden shrink-0 text-corpo transition hover:text-primario lg:inline"
            >
              Le mie prenotazioni
            </Link>
            {/*
              Un `form` e non un link: uscire cambia lo stato del server, e
              `app/auth/esci/route.ts` risponde solo a POST. Un `<a href>` verso
              quella route la farebbe scattare a un prefetch o a una visita di
              un crawler, sloggando chi non l'ha chiesto.
            */}
            <form action="/auth/esci" method="post" className="shrink-0">
              <button
                type="submit"
                className="rounded-full border border-scuro/20 px-4 py-2 text-corpo transition hover:border-primario hover:text-primario"
              >
                Esci
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/accedi"
            className="shrink-0 rounded-full bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
          >
            Accedi
          </Link>
        )}
      </div>
    </header>
  )
}
