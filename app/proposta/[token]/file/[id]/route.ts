import { scarica } from '@/lib/scarica'

/** Il viaggiatore (o chiunque nel gruppo) scarica l'itinerario. Vedi `lib/scarica.ts`. */
export async function GET(request: Request, contesto: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await contesto.params
  return scarica(request, token, id, `/proposta/${encodeURIComponent(token)}`)
}
