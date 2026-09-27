import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CHIAVI, leggiContatto } from '@/lib/config'
import { leggiUtente } from '@/lib/supabase/utente'
import { permessoDocumentoFinale } from '@/lib/ordine'
import { linkDiUnMinuto } from '@/lib/documenti'
import { Guscio, ScriviciWhatsApp } from '@/components/pagina-token'
import { EntraConGoogle } from '@/components/entra-con-google'

/**
 * Il documento finale dell'All Inclusive, per chi è entrato con Google.
 *
 * **Deciso da Simone il 27 settembre 2026.** Il documento finale porta
 * biglietti, voucher e contatti, e la pagina del viaggiatore (`/proposta/…`)
 * è quella che il designer gira nel gruppo: chi ha quel link non deve avere i
 * biglietti. Quindi da lì si arriva qui, e qui si scarica **solo** se chi
 * guarda è il viaggiatore dell'ordine — lo dice `final_document_for_traveler`
 * (0047), con l'utente letto da `getUser()`, cioè verificato dal server di
 * autenticazione e non soltanto letto dal cookie.
 *
 * ## Perché un indirizzo senza token
 *
 * Per entrare si passa da Google e si torna qui con `?next=`. Se l'indirizzo
 * portasse il token, il token viaggerebbe nel giro del login (il `redirectTo`
 * che Supabase conserva, l'URL di ritorno). L'id del file non è una
 * credenziale: senza la sessione giusta non apre niente, e a chi non è il
 * viaggiatore dell'ordine questa pagina risponde come a un file che non
 * esiste.
 *
 * Il link firmato di Storage nasce qui al momento, vale un minuto, e ci si
 * rimanda il browser: come `/…/file/[id]`, non finisce in nessuna pagina.
 */

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Il tuo documento di viaggio · XPETIS',
  robots: { index: false, follow: false, nocache: true },
}

export default async function DocumentoFinale({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const whatsapp = await leggiContatto(CHIAVI.whatsapp)
  const valido = /^[0-9a-f-]{36}$/i.test(id)
  const user = valido ? await leggiUtente() : null

  if (!valido) {
    return (
      <Guscio>
        <h1 className="font-titoli text-h3">Questo link non funziona</h1>
        <p className="text-corpo-big">
          Riaprilo dalla pagina del tuo viaggio, facendo clic sul documento. Se non funziona lo stesso,
          scrivici.
        </p>
        <div>
          <ScriviciWhatsApp numero={whatsapp} />
        </div>
      </Guscio>
    )
  }

  if (!user) {
    return (
      <Guscio>
        <h1 className="font-titoli text-h3">Il tuo documento di viaggio</h1>
        <p className="text-corpo-big">
          Dentro ci sono i tuoi biglietti e i voucher, quindi lo apri solo tu: entra con l&apos;account
          Google con cui hai prenotato la consulenza, e il documento si scarica subito.
        </p>
        <div>
          <EntraConGoogle next={`/documento/${id}`} />
        </div>
      </Guscio>
    )
  }

  const permesso = await permessoDocumentoFinale(id, user.id)

  if (permesso.esito === 'valido' && permesso.path) {
    const link = await linkDiUnMinuto(permesso.path, permesso.nome ?? 'documento di viaggio')
    if (link) redirect(link)
  } else {
    console.error('documento finale negato:', permesso.esito)
  }

  return (
    <Guscio>
      <h1 className="font-titoli text-h3">
        {permesso.esito === 'valido' || permesso.esito === 'irraggiungibile'
          ? 'Non riusciamo a preparare il documento adesso'
          : 'Questo documento non è collegato al tuo account'}
      </h1>
      <p className="text-corpo-big">
        {permesso.esito === 'valido' || permesso.esito === 'irraggiungibile'
          ? 'È un problema nostro e passeggero: riprova fra un minuto.'
          : `Sei entrato come ${user.email ?? 'un altro utente'}. Se hai prenotato con un altro account Google, esci e rientra con quello; se non ti torna, scrivici.`}
      </p>
      {permesso.esito !== 'valido' && permesso.esito !== 'irraggiungibile' && (
        <form action="/auth/esci" method="post">
          <button className="text-corpo underline hover:text-primario">Esci</button>
        </form>
      )}
      <div className="border-t border-scuro/20 pt-6">
        <ScriviciWhatsApp numero={whatsapp} />
      </div>
    </Guscio>
  )
}
