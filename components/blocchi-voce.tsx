import Image from 'next/image'
import { FotoVetrina } from '@/components/foto-vetrina'
import { etichettaTappa, paragrafiDi, puntiFaPerMe } from '@/lib/vetrina-vista'
import type { DettaglioVoce, Tappa } from '@/lib/vetrina'

/**
 * I blocchi che la pagina di un itinerario pronto e quella di un viaggio di
 * gruppo hanno in comune: nel tool vetrina v6 le due voci hanno la stessa
 * forma, e qui gli stessi componenti. Forma dal tool (riferimento:
 * `xpetis-vetrine-tool/riferimento/pagine_tool/`), contenuto dalle viste della
 * 0054.
 *
 * **Ogni blocco senza dati non esiste**, titolo compreso: lo decide il
 * componente stesso, così la pagina non deve ricordarselo.
 */

/** Il racconto del viaggio, con la foto e la firma del designer. */
export function RaccontoFirmato({
  testo,
  nome,
  foto,
}: {
  testo: string | null
  nome: string
  foto: string | null
}) {
  const paragrafi = paragrafiDi(testo)
  if (!paragrafi.length) return null
  return (
    <div className="flex flex-col gap-6 rounded-[25px] bg-neutro p-6 sm:flex-row sm:gap-[34px] lg:p-[46px]">
      <div className="relative size-[120px] shrink-0 overflow-hidden rounded-[20px] sm:size-[180px]">
        <FotoVetrina src={foto} alt={nome} sizes="180px" />
      </div>
      <div className="min-w-0">
        <div className="space-y-4 font-titoli text-[18px] leading-[1.5] lg:text-[20px]">
          {paragrafi.map((p) => (
            <p key={p.slice(0, 40)}>{p}</p>
          ))}
        </div>
        <p className="mt-6 font-titoli text-[18px] font-bold">{nome}</p>
        <p className="text-[14px] text-scuro/70">Travel Designer XPETIS</p>
      </div>
    </div>
  )
}

/** «Le tappe del viaggio»: la linea tratteggiata con i giorni. */
export function TappeViaggio({ tappe }: { tappe: Tappa[] }) {
  if (!tappe.length) return null
  return (
    <section aria-labelledby="titolo-tappe">
      <h2 id="titolo-tappe" className="font-titoli text-[36px] font-bold leading-tight lg:text-[48px]">
        Le tappe del viaggio
      </h2>
      <ol className="mt-8 lg:mt-10">
        {tappe.map((t, i) => {
          const ultima = i === tappe.length - 1
          return (
            <li key={i} className="flex gap-5 lg:gap-7">
              <div className="flex w-[30px] shrink-0 flex-col items-center" aria-hidden>
                <span className="size-[30px] shrink-0 rounded-full border-[8px] border-primario bg-crema" />
                {!ultima && <span className="my-2 w-0 flex-1 border-l-2 border-dashed border-scuro" />}
              </div>
              <div className={`flex min-w-0 flex-col gap-[6px] ${ultima ? '' : 'pb-8'}`}>
                {etichettaTappa(t.days_label) && (
                  <p className="text-[16px] font-medium uppercase leading-[23px] text-primario lg:text-[18px]">
                    {etichettaTappa(t.days_label)}
                  </p>
                )}
                {t.title && <p className="text-[18px] font-bold leading-[1.3]">{t.title}</p>}
                {t.description && <p className="text-corpo">{t.description}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** «Questo viaggio fa per me?»: sei punteggi da 0 a 5. Tutti a zero, il blocco non esce. */
export function FaPerMe({ voce }: { voce: DettaglioVoce }) {
  const punti = puntiFaPerMe(voce)
  if (punti.every((p) => !p.punti)) return null
  return (
    <section aria-labelledby="titolo-fa-per-me" className="rounded-[25px] bg-scuro p-6 text-neutro lg:p-[46px]">
      <h2 id="titolo-fa-per-me" className="font-titoli text-[30px] font-bold leading-tight lg:text-[36px]">
        Questo viaggio fa per me?
      </h2>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {punti.map((p) => (
          <li key={p.etichetta} className="rounded-[15px] bg-crema px-5 py-4 text-scuro">
            <p className="text-[18px] font-bold leading-[23px]">{p.etichetta}</p>
            <p className="sr-only">{p.punti} su 5</p>
            <div className="mt-3 flex gap-[10px]" aria-hidden>
              {[1, 2, 3, 4, 5].map((n) => (
                <Image
                  key={n}
                  src={n <= p.punti ? '/img/stella-fa-per-me-piena.svg' : '/img/stella-fa-per-me-vuota.svg'}
                  alt=""
                  width={28}
                  height={28}
                  className="size-7"
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * «Informazioni utili»: una fisarmonica con `<details name>`, che il browser
 * apre e chiude da sé — una sola voce aperta alla volta — senza JavaScript.
 * Le voci vuote non escono; tutte vuote, non esce il blocco.
 */
export type VoceInformazioni = {
  titolo: string
  /** Righe con la spunta (la quota comprende). */
  spunte?: string[]
  /** Righe semplici. */
  righe?: string[]
  /** Un secondo elenco con il suo titolo (la quota non comprende). */
  sottotitolo?: string
  righe2?: string[]
  testo?: string | null
}

export function InformazioniUtili({ voci }: { voci: VoceInformazioni[] }) {
  const piene = voci.filter(
    (v) => v.spunte?.length || v.righe?.length || v.righe2?.length || v.testo?.trim(),
  )
  if (!piene.length) return null
  return (
    <section aria-labelledby="titolo-informazioni" className="bg-[#9e6f54] px-4 py-16 lg:px-[100px] lg:py-[72px]">
      <div className="mx-auto max-w-[1312px]">
        <h2 id="titolo-informazioni" className="font-titoli text-[36px] font-bold leading-tight text-neutro lg:text-[48px]">
          Informazioni utili
        </h2>
        <div className="mt-8 space-y-4 lg:mt-10">
          {piene.map((v) => (
            <details key={v.titolo} name="informazioni-utili" className="group rounded-[15px] bg-neutro px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-titoli text-[18px] font-bold lg:text-[20px] [&::-webkit-details-marker]:hidden">
                {v.titolo}
                <span className="text-[24px] font-normal text-primario group-open:hidden" aria-hidden>+</span>
                <span className="hidden text-[24px] font-normal text-primario group-open:inline" aria-hidden>–</span>
              </summary>
              <div className="mt-4 border-t border-dashed border-scuro pt-4 text-corpo">
                {v.spunte && v.spunte.length > 0 && (
                  <ul className="space-y-2">
                    {v.spunte.map((r) => (
                      <li key={r} className="flex gap-2">
                        <span className="text-primario" aria-hidden>✓</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {v.righe && v.righe.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5">
                    {v.righe.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                )}
                {v.righe2 && v.righe2.length > 0 && (
                  <>
                    {v.sottotitolo && <p className="mt-5 font-bold">{v.sottotitolo}</p>}
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {v.righe2.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </>
                )}
                {v.testo && paragrafiDi(v.testo).map((p) => <p key={p.slice(0, 40)} className="mt-2 first:mt-0">{p}</p>)}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * Il riquadro del prezzo, a destra della galleria. «A partire da» e il prezzo,
 * o il testo di `showcase_price_on_request` quando il prezzo manca; sotto, la
 * riga con il prefisso di `app_config` e la nota del designer, **solo sotto un
 * prezzo**: dice cosa comprende quel prezzo, e senza prezzo non comprende
 * niente. Poi le righe della scheda, il tasto e la riga del credito.
 */
/** Una riga della scheda del prezzo: «Durata», «Partenze», «Tappe principali»… */
export type RigaScheda = { etichetta: string; contenuto: React.ReactNode }

export function SchedaPrezzo({
  prezzo,
  prezzoMancante,
  riga,
  righe,
  cta,
  credito,
}: {
  prezzo: string | null
  prezzoMancante: string | null
  riga: string | null
  righe: RigaScheda[]
  cta: { href: string; testo: string }
  credito: string
}) {
  return (
    <div className="flex flex-col rounded-[25px] bg-neutro p-6 lg:px-[34px] lg:py-7">
      {prezzo ? (
        <>
          <p className="flex flex-wrap items-baseline gap-3">
            <span className="text-[20px] leading-[1.5]">A partire da</span>
            <span className="font-titoli text-[32px] font-bold leading-[34px] text-primario">{prezzo}</span>
          </p>
          {riga && <p className="mt-1 text-[13px] leading-[1.5] text-scuro/80">{riga}</p>}
        </>
      ) : (
        prezzoMancante && <p className="text-[20px] italic leading-[1.5] text-primario">{prezzoMancante}</p>
      )}

      {righe.length > 0 && (
        <dl className="mt-5 border-t border-dashed border-scuro">
          {righe.map((r) => (
            <div key={r.etichetta} className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 border-b border-dashed border-scuro py-3 last:border-b-0">
              <dt className="text-[16px] font-medium leading-[1.5]">{r.etichetta}</dt>
              <dd className="text-[16px] leading-[1.5]">{r.contenuto}</dd>
            </div>
          ))}
        </dl>
      )}

      <a href={cta.href} className="group mt-6 flex items-center gap-2">
        <span className="flex-1 rounded-[30px] bg-primario px-5 py-2 text-center text-corpo text-neutro transition group-hover:brightness-110">
          {cta.testo}
        </span>
        <Image src="/img/freccia-diagonale.svg" alt="" width={40} height={40} className="size-10 shrink-0" />
      </a>
      <p className="mt-3 text-[13px] leading-[1.45] text-scuro/80">{credito}</p>
    </div>
  )
}

/**
 * La fascia scura in fondo alla pagina: prezzo, per i gruppi la prossima
 * partenza, e il tasto. C'è nel tool (D-23); senza «Acquista l'itinerario» né
 * «Acquista il posto», che non esistono (R4).
 */
export function FasciaFinale({
  prezzo,
  prezzoMancante,
  riga,
  prossima,
  cta,
  credito,
}: {
  prezzo: string | null
  prezzoMancante: string | null
  riga: string | null
  prossima?: React.ReactNode
  cta: { href: string; testo: string }
  credito: string
}) {
  return (
    <section className="bg-scuro px-4 py-10 text-neutro lg:px-[100px] lg:py-[46px]">
      <div className="mx-auto flex max-w-[1312px] flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          {prezzo ? (
            <>
              <p className="flex flex-wrap items-baseline gap-3">
                <span className="text-[20px]">A partire da</span>
                <span className="font-titoli text-[32px] font-bold leading-[34px] text-primario">{prezzo}</span>
              </p>
              {riga && <p className="mt-1 text-[13px] text-neutro/80">{riga}</p>}
            </>
          ) : (
            prezzoMancante && <p className="text-[20px] italic text-primario">{prezzoMancante}</p>
          )}
        </div>
        {prossima}
        <div className="flex max-w-[420px] flex-col gap-3 lg:items-end lg:text-right">
          <a href={cta.href} className="group inline-flex items-center gap-2 self-start lg:self-end">
            <span className="rounded-[30px] bg-primario px-5 py-2 text-corpo text-neutro transition group-hover:brightness-110">
              {cta.testo}
            </span>
            <Image src="/img/freccia-diagonale.svg" alt="" width={40} height={40} className="size-10 shrink-0" />
          </a>
          <p className="text-[13px] leading-[1.45] text-neutro/80">{credito}</p>
        </div>
      </div>
    </section>
  )
}
