import type { FileOrdine } from '@/lib/ordine'

/**
 * I file di un ordine, con i link per scaricarli. **I link sono indirizzi
 * nostri** (`<base>/file/<id>`): la route firma un link di Storage di un minuto
 * al clic. Qui dentro non c'è, e non ci deve essere, nessun URL di Storage.
 *
 * Lo usano la pagina del designer e quella del viaggiatore.
 */
const DATA = new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: 'Europe/Rome' })

const TIPO: Record<FileOrdine['tipo'], string> = {
  itinerary: 'itinerario',
  revision: 'versione rivista',
  proposal_document: 'documento di proposta',
  final_document: 'documento finale',
}

export function ElencoFile({ file, base, titolo }: { file: FileOrdine[]; base: string; titolo: string }) {
  if (file.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-corpo opacity-70">{titolo}</p>
      <ul className="space-y-2">
        {file.map((f) => (
          <li key={f.id}>
            {/* Un link normale e non un <a download>: la route risponde con un
                redirect, e il nome del file lo mette Storage. */}
            <a href={`${base}/file/${f.id}`} className="text-corpo underline">
              {f.nome}
            </a>{' '}
            <span className="text-corpo opacity-60">
              · {TIPO[f.tipo]}, {DATA.format(new Date(f.caricato_il))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
