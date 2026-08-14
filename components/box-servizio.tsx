import Image from 'next/image'
import Link from 'next/link'
import {
  ETICHETTA_SERVIZIO,
  formattaPrezzo,
  siCompraInVetrina,
  type Servizio,
  type TipoServizio,
} from '@/lib/vetrina'

/**
 * La scheda bianca accanto a "La mia storia" (Figma 171:78).
 *
 * **Qui il Figma e il Flusso dicono due cose diverse, e la differenza conta.**
 * Il Figma disegna in cima due pillole — "Consulenza" rossa e attiva,
 * "Itinerario su misura" marrone e spenta — cioè un selettore fra i servizi del
 * designer, e sotto un solo tasto: "Prenota la call". Il Flusso invece è netto
 * (§3): **i box acquistabili sono due soltanto**, consulenza e consulenza
 * approfondita; su misura e All Inclusive si presentano ma non si comprano, si
 * acquistano dopo la call dai bottoni della mail post-call.
 *
 * Le due cose si tengono insieme così: il selettore resta e mostra tutti i
 * servizi attivi come nel disegno, ma **il tasto d'acquisto compare solo sui due
 * box acquistabili.** Sugli altri, al suo posto, c'è la frase che dice quando si
 * comprano. Un tasto che non può portare a una cassa sarebbe peggio del vuoto —
 * è la stessa scelta fatta sul terzo gruppo di filtri di `/ricerca`.
 *
 * Il selettore passa dalla query (`?servizio=consultation_deep`) e non da uno
 * stato nel browser: la pagina resta interamente renderizzata dal server e una
 * scheda è condivisibile per link. Reversibile: se Chiara conferma un'altra
 * lettura del disegno, si cambia qui e basta.
 */

type Props = {
  nomeDesigner: string
  servizi: Servizio[]
  attivo: Servizio
  /** Il percorso della vetrina, per costruire i link del selettore. */
  slug: string
}

/** Nel Figma la scheda dice "Call con {nome}". Vale per ciò che è una call. */
function titoloBox(tipo: TipoServizio, nome: string): string {
  return siCompraInVetrina(tipo)
    ? `Call con ${nome}`
    : `${ETICHETTA_SERVIZIO[tipo]} con ${nome}`
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
    <span className="inline-flex items-center gap-1 rounded-full border border-primario px-2 py-[2px] text-piccolo">
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

export function BoxServizio({ nomeDesigner, servizi, attivo, slug }: Props) {
  const prezzo = formattaPrezzo(attivo.price_cents)
  const acquistabile = siCompraInVetrina(attivo.service_type)

  // La spunta del Figma ("Voglio che {nome} progetti e prenoti tutto per me") ha
  // senso solo se quel designer offre davvero qualcosa da comprare dopo la call.
  const offreDopoLaCall = servizi.some(
    (s) => s.service_type === 'custom_itinerary' || s.service_type === 'all_inclusive',
  )

  return (
    <div className="rounded-[20px] bg-neutro p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Il selettore. Il servizio attivo è rosso, gli altri marroni: sono i
            due colori del Figma, non due stati inventati. */}
        <ul className="flex flex-wrap items-center gap-2">
          {servizi.map((s) => {
            const scelto = s.service_type === attivo.service_type
            return (
              <li key={s.service_type}>
                <Link
                  href={`/designer/${slug}?servizio=${s.service_type}#servizi`}
                  scroll={false}
                  aria-current={scelto ? 'true' : undefined}
                  className={`inline-block rounded-[20px] px-5 py-2 text-corpo text-neutro transition hover:brightness-110 ${
                    scelto ? 'bg-primario' : 'bg-[#9e6f54]'
                  }`}
                >
                  {ETICHETTA_SERVIZIO[s.service_type]}
                </Link>
              </li>
            )
          })}
        </ul>

        {prezzo && (
          <p className="font-titoli text-[36px] font-bold leading-none text-primario">{prezzo}</p>
        )}
      </div>

      <h2 className="mt-8 font-titoli text-[28px] font-bold leading-tight lg:text-[36px]">
        {titoloBox(attivo.service_type, nomeDesigner)}
      </h2>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {attivo.duration_minutes && (
          <Pillola
            icona="/img/icona-orologio.svg"
            larghezza={10.2}
            altezza={10.2}
            testo={`${attivo.duration_minutes} minuti`}
          />
        )}
        {/* Cal Video, deciso l'8 agosto: nessun designer collega Google Meet. */}
        {acquistabile && (
          <Pillola icona="/img/icona-video.svg" larghezza={10.4} altezza={5.4} testo="Videocall" />
        )}
        {attivo.price_is_custom && !prezzo && (
          <span className="inline-flex items-center rounded-full border border-primario px-2 py-[2px] text-piccolo">
            Prezzo su preventivo
          </span>
        )}
      </div>

      {attivo.text_during_call && (
        <p className="mt-6 text-corpo">{attivo.text_during_call}</p>
      )}

      {attivo.bullets.length > 0 && (
        <ul className="mt-6 space-y-2">
          {attivo.bullets.map((punto) => (
            <li key={punto} className="flex items-start gap-3 text-corpo">
              <Image
                src="/img/icona-check.svg"
                alt=""
                width={14.4}
                height={11.4}
                style={{ width: 14.4, height: 11.4 }}
                className="mt-[6px] shrink-0"
              />
              <span>{punto}</span>
            </li>
          ))}
        </ul>
      )}

      {acquistabile ? (
        <>
          {offreDopoLaCall && (
            <div className="mt-8 rounded-[15px] bg-crema p-4">
              <label className="flex items-start gap-3 text-corpo">
                {/* Inerte per costruzione: questa spunta è un campo del **modulo
                    di prenotazione** (milestone 4, "flag servizi"), non della
                    vetrina. Il Figma la disegna qui e qui resta, ma niente la
                    raccoglie finché la prenotazione non esiste: renderla
                    cliccabile prometterebbe che qualcuno la legge. */}
                <input
                  type="checkbox"
                  disabled
                  className="mt-1 size-[15px] shrink-0 rounded-[2px] border border-primario accent-primario"
                />
                <span>Voglio che {nomeDesigner} progetti e prenoti tutto per me</span>
              </label>
              <p className="mt-2 pl-[27px] text-piccolo">
                Nessun costo aggiuntivo ora: aiuta {nomeDesigner} ad arrivare preparat*. Dopo la
                call ti proporrà un percorso su misura con preventivo.
              </p>
            </div>
          )}

          {/* **Il tasto non naviga, ed è voluto.** Alla prenotazione ci porta
              l'iframe Cal.com del designer, incorporato in questa stessa pagina:
              è milestone 4, insieme al login al momento del Prenota e alla cassa
              aperta dal server. Un `href` verso una pagina che non esiste
              sarebbe un 404 travestito da funzionalità. */}
          <button
            type="button"
            disabled
            aria-describedby="prenota-nota"
            className="mt-8 w-full rounded-[20px] bg-primario px-5 py-2 text-corpo text-neutro opacity-60"
          >
            Prenota la call
          </button>
          <p id="prenota-nota" className="mt-2 text-center text-piccolo">
            La prenotazione si apre qui a breve.
          </p>
        </>
      ) : (
        /* Niente tasto: su misura e All Inclusive non si comprano dalla vetrina.
           Il Flusso li fa nascere dopo la consulenza, dai bottoni della mail
           post-call, e questa frase è l'unica cosa onesta da mettere al posto di
           una cassa che non deve esistere. */
        <p className="mt-8 rounded-[15px] bg-crema p-4 text-corpo">
          Non si acquista da qui: {nomeDesigner} te lo propone dopo la consulenza, quando sa cosa
          stai cercando. Si comincia sempre dalla call.
        </p>
      )}
    </div>
  )
}
