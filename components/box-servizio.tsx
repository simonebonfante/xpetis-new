import Image from 'next/image'
import Link from 'next/link'
import { PrenotaConsulenza } from '@/components/prenota-consulenza'
import { serviziDopoLaCall } from '@/components/dopo-la-call'
import {
  formattaPrezzo,
  siCompraInVetrina,
  type Servizio,
  type TipoServizio,
} from '@/lib/vetrina'

/**
 * La scheda bianca della vetrina, dentro la fascia hero (Figma nuovo
 * `Q9Krydv6xD8mFJCtU9NHzr`: nodo 18:5792 della vetrina 2-743, rivisto nella
 * 72-48 del 29 settembre).
 *
 * ## 29 settembre: la revisione `72-48`
 *
 * Un cambio di forma solo: **"E dopo l'incontro?" esce dalla scheda** e diventa
 * un riquadro suo sotto la presentazione (`components/dopo-la-call.tsx`, che la
 * pagina mette accanto). Nella scheda resta la riga del credito, spostata sotto
 * il tasto. Il tasto, `calLink`, la guardia su `cal_username` e la chiamata a
 * `PrenotaConsulenza` sono le stesse righe: `prenota-consulenza.tsx` e
 * `lib/cal-embed.ts` non sono stati toccati nemmeno stavolta.
 *
 * ## Cosa è cambiato col Figma del 27 settembre, e cosa no
 *
 * **La forma.** Il disegno vecchio metteva nel selettore tutti i servizi del
 * designer e sotto un solo tasto; per tenerlo insieme al Flusso il tasto
 * compariva solo sui due acquistabili e sugli altri c'era una frase. Il disegno
 * nuovo dà ragione al Flusso (§3) da sé: **il selettore ha solo le due
 * consulenze** — breve e approfondita, deviazione 10 — e i servizi che si
 * comprano dopo la call diventano quattro riquadri non cliccabili, "E dopo
 * l'incontro?" (dal 29 settembre fuori dalla scheda). Il selettore mostra l'approfondita solo a chi la
 * offre: un designer senza approfondita ha una pillola sola.
 *
 * **Il comportamento, no.** Il tasto *Prenota la call* è sempre
 * `PrenotaConsulenza`, con gli stessi argomenti, e `calLink` si compone come
 * prima. Il cancello del login, la guardia su `cal_username` nullo, l'embed e il
 * paracadute vivono lì dentro e in `lib/cal-embed.ts`, e **quei due file non
 * sono stati toccati** dal rifacimento. Se il disegno cambia ancora, si cambia
 * la forma qui e non la meccanica di là.
 *
 * Il selettore passa dalla query (`?servizio=consultation_deep`) e non da uno
 * stato nel browser: la pagina resta renderizzata dal server e una scheda è
 * condivisibile per link.
 *
 * ## Due cose del disegno vecchio che non ci sono più
 *
 *  · **La spunta "Voglio che {nome} progetti e prenoti tutto per me"**, che era
 *    inerte per costruzione. Il Figma nuovo la toglie, e il Flusso (§4) la mette
 *    comunque nel modulo di pagamento, non in vetrina.
 *  · **I testi dei servizi dopo la call.** Nel selettore vecchio su misura e All
 *    Inclusive mostravano il loro `text_during_call` e i loro punti; nei
 *    riquadri nuovi c'è un titolo e una riga. Il Flusso vuole quei servizi
 *    "presentati e spiegati bene in vetrina": se una riga basta è una domanda
 *    per Chiara, in PIANO.md.
 */

type Props = {
  nomeDesigner: string
  /** Tutti i servizi attivi del designer: il box sceglie da sé cosa mostrare. */
  servizi: Servizio[]
  /** Il servizio della scheda aperta: sempre uno dei due acquistabili. */
  attivo: Servizio
  /** Il percorso della vetrina, per costruire i link del selettore. */
  slug: string
  /**
   * L'account Cal.com del designer (migration 0040). `null` se il team non l'ha
   * ancora collegato: in quel caso non c'è nessun calendario da aprire, e il
   * tasto non compare — vedi `calLink` più sotto.
   */
  calUsername: string | null
  /**
   * Chi sta guardando, se collegato. Serve al tasto *Prenota*: senza UUID
   * l'embed non si apre, e il perché sta in `components/prenota-consulenza.tsx`.
   */
  utente: { id: string; nome: string | null; email: string | null } | null
}

/**
 * Le parole delle pillole, come le scrive il Figma. **Non sono
 * `ETICHETTA_SERVIZIO`**: quella dice "Consulenza" e finisce anche nella cassa
 * Stripe e nelle pagine della prenotazione, dove "breve" non aggiunge niente.
 */
const PILLOLA: Partial<Record<TipoServizio, string>> = {
  consultation: 'Consulenza breve',
  consultation_deep: 'Consulenza approfondita',
}

/**
 * Le pillole con l'icona ("30 minuti", "Videocall").
 *
 * Larghezza e altezza vanno passate una per icona e mai date per uguali: gli
 * SVG esportati dal Figma nascono con `preserveAspectRatio="none"`, quindi
 * un'icona 10×5 forzata in un quadrato da 10 si stira e nessuno se ne accorge
 * leggendo il codice.
 */
function Pillola({
  icona,
  larghezza,
  altezza,
  testo,
}: {
  icona: string
  larghezza: number
  altezza: number
  testo: string
}) {
  return (
    <span className="inline-flex items-center gap-[2px] rounded-full border border-primario py-[2px] pl-1 pr-[3px] text-piccolo leading-none">
      <Image
        src={icona}
        alt=""
        width={larghezza}
        height={altezza}
        style={{ width: larghezza, height: altezza }}
        className="shrink-0"
      />
      {testo}
    </span>
  )
}

export function BoxServizio({
  nomeDesigner,
  servizi,
  attivo,
  slug,
  calUsername,
  utente,
}: Props) {
  const prezzo = formattaPrezzo(attivo.price_cents)
  const acquistabili = servizi.filter((s) => siCompraInVetrina(s.service_type))
  const dopoLaCall = serviziDopoLaCall(servizi)

  // Il link dell'embed esiste solo se esistono entrambi i pezzi. Un servizio
  // acquistabile senza calendario collegato è una riga incompleta che il team
  // deve sistemare, non un tasto da mostrare speranzosi: `td_publish_blockers`
  // lo impedisce alla pubblicazione, ma la vista può servire un profilo
  // modificato dopo. **Invariato dal disegno vecchio**, compreso il controllo
  // `siCompraInVetrina`: la pagina oggi passa solo servizi acquistabili, ma la
  // regola resta scritta dove si decide il tasto.
  const calLink =
    siCompraInVetrina(attivo.service_type) && calUsername && attivo.cal_event_type_slug
      ? `${calUsername}/${attivo.cal_event_type_slug}`
      : null

  // Il ritorno dal login riporta al box giusto, non al primo della lista.
  const percorsoVetrina = `/designer/${slug}?servizio=${attivo.service_type}#servizi`

  return (
    <div className="rounded-[20px] bg-neutro px-[27px] pb-4 pt-[25px] text-scuro">
      {/* Il selettore. La consulenza scelta è rossa, l'altra marrone: sono i due
          colori del Figma, non due stati inventati. */}
      <ul className="flex flex-wrap items-center gap-2">
        {acquistabili.map((s) => {
          const scelto = s.service_type === attivo.service_type
          return (
            <li key={s.service_type}>
              <Link
                href={`/designer/${slug}?servizio=${s.service_type}#servizi`}
                scroll={false}
                aria-current={scelto ? 'true' : undefined}
                className={`inline-block rounded-[20px] px-5 py-2 text-[14px] leading-none text-neutro transition hover:brightness-110 ${
                  scelto ? 'bg-primario' : 'bg-[#9e6f54]'
                }`}
              >
                {PILLOLA[s.service_type] ?? s.service_type}
              </Link>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex items-baseline justify-between gap-4">
        {/* "Call", e basta: il nome del designer sta già a sinistra, in grande. */}
        <h2 className="font-titoli text-[36px] font-bold leading-[46px]">Call</h2>
        {prezzo && (
          <p className="font-titoli text-[36px] font-bold leading-[34px] text-primario">{prezzo}</p>
        )}
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-[6px]">
        {attivo.duration_minutes && (
          <Pillola
            icona="/img/icona-orologio.svg"
            larghezza={10.2}
            altezza={10.2}
            testo={`${attivo.duration_minutes} minuti`}
          />
        )}
        {/* Cal Video, deciso l'8 agosto: nessun designer collega Google Meet. */}
        <Pillola icona="/img/icona-video.svg" larghezza={10.4} altezza={5.4} testo="Videocall" />
        {attivo.price_is_custom && !prezzo && (
          <span className="inline-flex items-center rounded-full border border-primario px-2 py-[2px] text-piccolo leading-none">
            Prezzo su preventivo
          </span>
        )}
      </div>

      {attivo.text_during_call && (
        <p className="mt-6 text-[12px] leading-[1.25]">{attivo.text_during_call}</p>
      )}

      {attivo.bullets.length > 0 && (
        <ul className="mt-4 space-y-2">
          {attivo.bullets.map((punto) => (
            <li key={punto} className="flex items-start gap-2 text-[12px] leading-[1.25]">
              <Image
                src="/img/icona-check.svg"
                alt=""
                width={14.4}
                height={11.4}
                style={{ width: 14.4, height: 11.4 }}
                className="mt-[2px] shrink-0"
              />
              <span>{punto}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Il tasto apre l'iframe Cal.com del designer in questa stessa pagina
          (deciso il 10 agosto: nessuna pagina di prenotazione disegnata). */}
      {calLink ? (
        <PrenotaConsulenza
          calLink={calLink}
          utente={utente}
          percorsoVetrina={percorsoVetrina}
          nomeDesigner={nomeDesigner}
          slugDesigner={slug}
        />
      ) : (
        /* Nessun calendario collegato. Un tasto che non può portare a un
           calendario è peggio del vuoto. */
        <p className="mt-8 rounded-[15px] bg-crema p-4 text-corpo">
          La prenotazione di {nomeDesigner} non è ancora aperta. Scrivici e ti mettiamo in
          contatto noi.
        </p>
      )}

      {/* Il credito consulenza (Flusso §6): quello che si paga per la call
          si scala dal primo servizio comprato dopo. **Il sito lo dice, non lo
          calcola**: lo applica il designer nella proposta, e il numero qui è
          solo il prezzo di questa scheda. Senza prezzo (su preventivo) la frase
          non avrebbe un numero da dire, e senza servizi dopo la call non
          avrebbe da dove scalarlo: in entrambi i casi sparisce.

          **Dal 4 ottobre 2026 la riga non dice la cifra** (R2 del prompt delle
          vetrine v6, scelta di Simone): il credito si promette e non si
          quantifica. Il prezzo della call è già scritto in grande qui sopra.
          Quindi la riga non dipende più dal prezzo, solo dall'esistenza di un
          servizio da cui scalarlo.

          Figma `72-48`: la riga sta **sotto il tasto**, su fondo bianco, e i
          riquadri dei servizi sono usciti dalla scheda (`dopo-la-call.tsx`).
          Il simbolo è il "$" del disegno anche se la valuta è l'euro. Nel
          `72-48` è più grande (12×18 invece di 7,8×12,4): non riscaricato, il
          connettore Figma aveva finito le chiamate — resta quello di prima. */}
      {dopoLaCall.length > 0 && (
        <p className="mb-6 mt-[27px] flex items-center gap-[15px] text-[12px] leading-[1.25]">
          <span className="relative grid size-[29px] shrink-0 place-items-center">
            <Image
              src="/img/credito-cerchio.svg"
              alt=""
              width={29}
              height={29}
              className="absolute inset-0 size-[29px]"
            />
            <Image
              src="/img/credito-simbolo.svg"
              alt=""
              width={7.798}
              height={12.39}
              style={{ width: 7.798, height: 12.39 }}
              className="relative"
            />
          </span>
          <span className="max-w-[307px]">
            Quello che paghi per l&apos;incontro verrà scalato dal costo del servizio che eventualmente
            sceglierai
          </span>
        </p>
      )}
    </div>
  )
}
