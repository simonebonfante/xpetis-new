'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import { montaEmbed, spazioDiNomi } from '@/lib/cal-embed'

/**
 * Il tasto *Prenota la call* e, dietro, il calendario del designer.
 *
 * Fino all'8 settembre 2026 questo tasto era `disabled` con la nota "la
 * prenotazione si apre qui a breve". Adesso apre l'embed inline di Cal.com nella
 * stessa pagina, come deciso il 10 agosto: niente pagina di prenotazione
 * disegnata, l'iframe del designer.
 *
 * ## Il login è un cancello, e qui sì
 *
 * `components/header.tsx` dice giustamente che *Accedi* non è un cancello: la
 * navigazione è anonima. **Prenotare no.** Senza utente collegato non c'è UUID
 * da mettere in `xpetis_user_id`, e una prenotazione senza quel codice produce
 * uno slot occupato sul calendario del designer e **nessuna riga da noi**: il
 * ponte risponde `viaggiatore_non_identificato`, alza un alert critico e
 * qualcuno deve rincorrere a mano una call che il viaggiatore crede prenotata.
 *
 * Quindi il tasto **non deve mai poter aprire un embed senza UUID**, e la
 * garanzia è strutturale e non un `if` di cortesia: senza `utente` il componente
 * non rende un bottone ma un link a `/accedi?next=<questa vetrina>`, e il codice
 * che monta l'iframe non è raggiungibile. Al ritorno dal login si è di nuovo
 * qui, con la sessione, e il tasto apre.
 */

type Utente = { id: string; nome: string | null; email: string | null }

export function PrenotaConsulenza({
  calLink,
  utente,
  percorsoVetrina,
  nomeDesigner,
}: {
  /** `<cal_username>/<cal_event_type_slug>`, composto dal server. */
  calLink: string
  utente: Utente | null
  /** Dove tornare dopo il login: questa vetrina, col servizio scelto. */
  percorsoVetrina: string
  nomeDesigner: string
}) {
  const router = useRouter()
  const [aperto, setAperto] = useState(false)
  const contenitore = useRef<HTMLDivElement>(null)
  // La navigazione verso /attesa parte una volta sola: i due eventi a cui siamo
  // iscritti (V2 e il deprecato) possono scattare entrambi.
  const inViaggio = useRef(false)

  const idContenitore = spazioDiNomi(calLink)

  useEffect(() => {
    if (!aperto || !utente || !contenitore.current) return

    return montaEmbed({
      calLink,
      selettore: `#${idContenitore}`,
      configurazione: {
        // Il pezzo su cui si regge tutto il ponte Cal.com: l'UUID che torna in
        // `payload.responses.xpetis_user_id.value`. L'identificatore del campo
        // sul modulo di prenotazione deve essere scritto esattamente così —
        // vedi `ONBOARDING_CALCOM_TD.md`, "Il campo nascosto".
        xpetis_user_id: utente.id,
        // Nome e mail sono cortesia verso il viaggiatore: gli risparmiano di
        // riscriverli. Se mancano, l'embed li chiede.
        ...(utente.nome ? { name: utente.nome } : {}),
        ...(utente.email ? { email: utente.email } : {}),
      },
      quandoPrenotato: () => {
        if (inViaggio.current) return
        inViaggio.current = true
        router.push('/attesa')
      },
    })
  }, [aperto, utente, calLink, idContenitore, router])

  // ------------------------------------------------------------- non collegato
  if (!utente) {
    return (
      <>
        <Link
          href={`/accedi?next=${encodeURIComponent(percorsoVetrina)}`}
          className="mt-8 block w-full rounded-[20px] bg-primario px-5 py-2 text-center text-corpo text-neutro transition hover:brightness-110"
        >
          Prenota la call
        </Link>
        <p className="mt-2 text-center text-piccolo">
          Ti chiediamo di entrare prima di scegliere l&apos;orario: serve ad agganciare la call a
          te e a far arrivare a {nomeDesigner} il tuo profilo.
        </p>
      </>
    )
  }

  // ----------------------------------------------------------------- collegato
  if (!aperto) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAperto(true)}
          className="mt-8 w-full rounded-[20px] bg-primario px-5 py-2 text-corpo text-neutro transition hover:brightness-110"
        >
          Prenota la call
        </button>
        <p className="mt-2 text-center text-piccolo">
          Scegli l&apos;orario, poi il pagamento. Lo slot resta tenuto mentre paghi.
        </p>
      </>
    )
  }

  return (
    <div className="mt-8">
      <div
        id={idContenitore}
        ref={contenitore}
        // `min-height` e non un'altezza fissa: l'embed si ridimensiona da sé
        // (manda `__dimensionChanged`), ma prima di caricare lascerebbe la
        // pagina che salta.
        className="min-h-[560px] w-full overflow-hidden rounded-[15px] bg-crema"
      />

      {/*
        **La via manuale, che deve esistere.** La navigazione automatica dipende
        da un evento che Cal.com emette dall'interno dell'iframe e che la loro
        documentazione pubblica non elenca (vedi `lib/cal-embed.ts`). Se un
        giorno cambia nome, senza questo link il viaggiatore resterebbe davanti
        alla conferma di Cal.com — «prenotato!» — senza nessuna via avanti e
        senza aver pagato, cioè con uno slot che il nostro orologio libererà fra
        mezz'ora mentre lui crede di avere un appuntamento.

        Il link porta esattamente dove porta l'evento, e `/attesa` è già scritta
        per fallire bene: cerca la prenotazione lato server, e se non c'è lo dice
        e avvisa il team. Cliccarlo senza aver prenotato non fa danni.
      */}
      <p className="mt-3 text-center text-piccolo">
        Hai finito di prenotare e la pagina non è cambiata?{' '}
        <Link href="/attesa" className="underline hover:text-primario">
          Vai al pagamento
        </Link>
      </p>
    </div>
  )
}
