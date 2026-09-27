import { scarica } from '@/lib/scarica'

/**
 * L'agenzia scarica il documento della proposta da verificare. Vedi
 * `lib/scarica.ts`: il permesso lo dà `order_file_for_token` (0047) — il solo
 * documento della proposta di quel token, e solo finché l'agenzia non ha
 * risposto — e il link di Storage vive un minuto, dentro un redirect.
 */
export async function GET(request: Request, contesto: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await contesto.params
  return scarica(request, token, id, `/agenzia/${encodeURIComponent(token)}`)
}
