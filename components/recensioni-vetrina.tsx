import { ElencoRecensioni } from '@/components/elenco-recensioni'
import type { Recensione } from '@/lib/vetrina'

/**
 * «Cosa dice chi ha viaggiato con me». Forma dal tool vetrina v6.
 *
 * Fino al 3 ottobre 2026 questa sezione non esisteva: le recensioni scritte dal
 * designer stavano chiuse in attesa della milestone 8. **Decisione D3 di
 * Simone**: si mostrano, con una dicitura sopra che dice che le ha raccolte il
 * designer (`app_config.showcase_declared_reviews_note`, prima stesura tecnica,
 * da riscrivere a Gaia). Le stelle della singola recensione si vedono; **la
 * media no** — il voto sulla foto conta solo le verificate (D2).
 *
 * Il tool scrive sotto ogni recensione «Viaggiatore XPETIS da N anni», e se
 * `anni` manca mette 1. **Qui non esce**: chi ha lasciato una recensione al
 * designer fuori da XPETIS non è un viaggiatore XPETIS.
 *
 * Le verificate (`reviews`, milestone 8) arrivano dalla stessa vista
 * (`public_td_reviews`) senza cambiare questa pagina; la dicitura compare solo
 * se fra quelle mostrate ce n'è almeno una dichiarata.
 */
export function RecensioniVetrina({
  recensioni,
  notaDichiarate,
}: {
  recensioni: Recensione[]
  notaDichiarate: string | null
}) {
  const valide = recensioni.filter((r) => r.body?.trim() || r.title?.trim())
  if (!valide.length) return null
  const ciSonoDichiarate = valide.some((r) => r.source === 'td_declared')

  return (
    <section aria-labelledby="titolo-recensioni" className="bg-[#9e6f54] px-4 py-16 lg:px-[100px] lg:py-[72px]">
      <div className="mx-auto max-w-[1312px]">
        <h2 id="titolo-recensioni" className="font-titoli text-[36px] font-bold leading-[1.12] text-neutro lg:text-[44px]">
          Cosa dice chi
          <br />
          ha viaggiato con me
        </h2>
        {ciSonoDichiarate && notaDichiarate && (
          <p className="mt-4 max-w-[720px] text-corpo text-neutro/90">{notaDichiarate}</p>
        )}
        <ElencoRecensioni
          recensioni={valide.map((r) => ({
            titolo: r.title?.trim() || null,
            nome: r.author_name?.trim() || null,
            stelle: Math.max(0, Math.min(5, Number(r.stars) || 0)),
            data: r.date_label?.trim() || null,
            testo: r.body?.trim() || null,
          }))}
        />
      </div>
    </section>
  )
}
