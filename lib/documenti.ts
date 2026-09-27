import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * La porta verso i documenti di viaggio su Supabase Storage (bucket privato
 * `order-documents`, migration 0017). Sta solo lato server: la chiave secret
 * non esce di qui, e **nessun link firmato esce di qui se non dentro un
 * redirect**.
 *
 * ## I due link firmati, e perché non sono la stessa cosa
 *
 * **Il caricamento** (`apriCaricamento`) è un biglietto: vale per un solo
 * percorso che ha scelto il database, per un solo file, due ore, senza
 * sovrascrittura. Va al browser del designer perché i byte non possono passare
 * da noi — una funzione Vercel accetta 4,5 MB di corpo, il bucket 50 — ma da
 * solo non consegna niente: la consegna la registra `td_deliver()`, dopo che
 * la route ha controllato cosa è arrivato davvero.
 *
 * **Lo scaricamento** (`linkDiUnMinuto`) è una credenziale che scade. Non va in
 * una mail — funzionerebbe oggi e non fra tre settimane, e finché funziona è
 * inoltrabile a chiunque — e non va in una pagina. Nasce al clic, dentro la
 * route `/…/file/[id]`, e dura quanto serve a seguire un redirect.
 */

export const BUCKET_DOCUMENTI = 'order-documents'

/**
 * Quanto vive un link di scaricamento. **Non è un parametro di prodotto**, e
 * per questo non sta in `app_config`: è il tempo che serve a un browser per
 * seguire un 303, e allungarlo servirebbe solo a chi il link lo copia. Chi
 * torna domani riclicca dalla pagina e ne riceve uno nuovo.
 */
const SECONDI_LINK = 60

const storage = () => createAdminClient().storage.from(BUCKET_DOCUMENTI)

export async function apriCaricamento(path: string): Promise<{ token: string } | null> {
  const { data, error } = await storage().createSignedUploadUrl(path)
  if (error || !data) {
    console.error('caricamento firmato non aperto:', error?.message)
    return null
  }
  return { token: data.token }
}

/** Quello che c'è davvero in Storage a quel percorso: dimensione e tipo, non quelli dichiarati. */
export async function leggiOggetto(path: string): Promise<{ byte: number; tipo: string } | null> {
  const { data, error } = await storage().info(path)
  if (error || !data || data.size == null || !data.contentType) return null
  return { byte: data.size, tipo: data.contentType }
}

/** Un file caricato ma non registrato non deve restare in giro senza una riga che lo spieghi. */
export async function cancellaOggetto(path: string): Promise<void> {
  const { error } = await storage().remove([path])
  if (error) console.error('oggetto orfano non cancellato:', error.message)
}

export async function linkDiUnMinuto(path: string, nome: string): Promise<string | null> {
  const { data, error } = await storage().createSignedUrl(path, SECONDI_LINK, { download: nome })
  if (error || !data) {
    console.error('link di scaricamento non generato:', error?.message)
    return null
  }
  return data.signedUrl
}
