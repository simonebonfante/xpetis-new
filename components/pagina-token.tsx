import { SPIEGAZIONE, type EsitoToken } from '@/lib/token'

/**
 * I pezzi comuni delle pagine a token: `/servizio/[token]` (il bottone della
 * mail post-call), `/ordine/[token]` (la pagina del designer) e
 * `/proposta/[token]` (la pagina gemella della proposta).
 *
 * Tre pagine con lo stesso guscio di proposito: chi arriva da una mail deve
 * riconoscere di essere nello stesso posto, e un link rotto deve spiegarsi
 * allo stesso modo ovunque — la linea fra risposta onesta e risposta generica
 * sta in `SPIEGAZIONE` (`lib/token.ts`), e ce n'è una sola.
 */

/** Una colonna stretta, niente header: si legge dal telefono, arrivando da una mail. */
export function Guscio({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-7 p-7">
      <p className="text-piccolo uppercase tracking-[0.18em] opacity-60">XPETIS</p>
      {children}
    </main>
  )
}

export function ScriviciWhatsApp({
  numero,
  etichetta = 'Scrivici su WhatsApp',
}: {
  numero: string | null
  etichetta?: string
}) {
  if (!numero) return null
  return (
    <a
      href={`https://wa.me/${numero.replace(/[^0-9]/g, '')}`}
      className="inline-block rounded-full border border-scuro px-5 py-2 text-corpo transition hover:bg-scuro hover:text-neutro"
    >
      {etichetta}
    </a>
  )
}

/** Il link che non porta da nessuna parte, detto con le parole di `SPIEGAZIONE`. */
export function Spiegazione({
  esito,
  whatsapp,
}: {
  esito: Exclude<EsitoToken, 'valido' | 'gia_richiesto'>
  whatsapp: string | null
}) {
  const s = SPIEGAZIONE[esito] ?? SPIEGAZIONE.inesistente

  return (
    <Guscio>
      <header className="space-y-2">
        <h1 className="font-titoli text-h3">{s.titolo}</h1>
      </header>
      <p className="text-corpo-big">{s.testo}</p>
      {s.whatsapp && (
        <div>
          <ScriviciWhatsApp numero={whatsapp} />
        </div>
      )}
    </Guscio>
  )
}

/** Un avviso in cima alla pagina, dopo un gesto: cosa è successo, in una frase. */
export function Avviso({ children, tono = 'neutro' }: { children: React.ReactNode; tono?: 'neutro' | 'errore' }) {
  return (
    <p
      role={tono === 'errore' ? 'alert' : 'status'}
      className={`rounded-2xl border px-5 py-4 text-corpo ${
        tono === 'errore' ? 'border-primario text-primario' : 'border-scuro/30'
      }`}
    >
      {children}
    </p>
  )
}
