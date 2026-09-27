import { scarica } from '@/lib/scarica'

/** Il designer scarica un file del suo ordine. Vedi `lib/scarica.ts`. */
export async function GET(request: Request, contesto: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await contesto.params
  return scarica(request, token, id, `/ordine/${encodeURIComponent(token)}`)
}
