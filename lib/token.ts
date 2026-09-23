import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * L'unica porta verso le pagine a token, e sta solo lato server.
 *
 * ## Il token non arriva mai al browser come credenziale verso Supabase
 *
 * Sta nell'indirizzo, la route lo risolve qui con la chiave secret, e alla
 * pagina arriva **contesto già risolto**: un nome, un servizio, uno stato. Il
 * browser non parla con Supabase su questa strada, e non potrebbe comunque —
 * `resolve_access_token_detail` e `create_order_from_token` sono revocate a
 * `anon` e `authenticated` (migration 0043).
 *
 * ## Una volta per richiesta
 *
 * Risolvere un token **scrive**: incrementa `use_count` e aggiorna
 * `last_seen_at` (è così dalla 0012). Quindi si chiama **una volta sola** per
 * richiesta, e ogni funzione qui dentro fa esattamente una chiamata. Chiamarne
 * due nella stessa richiesta conterebbe due usi per un gesto solo.
 *
 * ## Il token non si scrive nei log
 *
 * Nessun messaggio d'errore qui dentro lo riporta. Chi ha il token è dentro:
 * finirebbe negli errori di Vercel, che sono un posto dove le credenziali non
 * devono stare.
 */

/** Le cinque risposte del resolver, più quelle che riguardano l'entità. */
export type EsitoToken =
  | 'valido'
  | 'gia_richiesto'
  | 'inesistente'
  | 'scaduto'
  | 'revocato'
  | 'gia_usato'
  | 'call_in_stato_non_ammesso'
  | 'servizio_non_piu_attivo'
  | 'servizio_non_ordinabile'
  | 'token_di_altro_tipo'
  | 'prenotazione_sconosciuta'
  | 'irraggiungibile'
  // Dalla 0044: le pagine dell'ordine su misura (`lib/ordine.ts`).
  | 'ordine_sconosciuto'
  | 'servizio_non_gestito'

export type PaginaServizio = {
  esito: EsitoToken
  service_type?: 'custom_itinerary' | 'all_inclusive'
  td_name?: string
  td_slug?: string
  nome?: string | null
  starts_at?: string
  human_ref?: string | null
  stato?: string
}

export type EsitoRichiesta = PaginaServizio & { ok?: boolean; order_id?: string }

/**
 * Cosa mostra la pagina prima del clic. Non decide niente: la funzione Postgres
 * è la stessa che poi giudica il clic, quindi non possono dire cose diverse.
 */
export async function leggiPaginaServizio(token: string): Promise<PaginaServizio> {
  const { data, error } = await createAdminClient().rpc('service_request_page', {
    p_token: token,
  })

  if (error || !data) return { esito: 'irraggiungibile' }
  return data as PaginaServizio
}

/**
 * Il clic. **La pagina non decide se l'azione è lecita**: la chiede, e riporta
 * la risposta — servizio dal payload del token, stato della call, doppio clic.
 * Le regole vivono in `create_order_from_token` (0043), dove l'harness le prova.
 */
export async function chiediServizio(token: string): Promise<EsitoRichiesta> {
  const { data, error } = await createAdminClient().rpc('create_order_from_token', {
    p_token: token,
  })

  if (error || !data) return { esito: 'irraggiungibile' }
  return data as EsitoRichiesta
}

/**
 * Quello che la pagina dice quando il link non porta da nessuna parte.
 *
 * ## Dove passa la linea fra onestà e oracolo
 *
 * **Un token che non esiste riceve una risposta generica.** Un token che
 * esiste — scaduto, revocato, già usato, o valido su una call che nel
 * frattempo è cambiata — riceve la risposta onesta.
 *
 * Il ragionamento: per leggere una risposta onesta bisogna già possedere un
 * token vero, cioè aver avuto il link in mano. A chi prova stringhe a caso
 * questa pagina dice sempre e solo la stessa cosa, e non distingue mai «quasi
 * giusto» da «sbagliatissimo». In cambio, la persona che ha davvero un link
 * vecchio non si trova davanti a un muro: sa cosa è successo e cosa fare.
 *
 * I tentativi a vuoto vengono contati (`access_token_misses`), così la linea ha
 * un testimone invece di essere solo un'affermazione.
 */
export const SPIEGAZIONE: Record<Exclude<EsitoToken, 'valido' | 'gia_richiesto'>, {
  titolo: string
  testo: string
  whatsapp: boolean
}> = {
  inesistente: {
    titolo: 'Questo link non funziona',
    testo:
      'Può essere che si sia spezzato in due copiandolo, o che sia stato riscritto dal programma di posta. Prova ad aprirlo di nuovo dalla mail, facendo clic sul bottone invece di copiare l’indirizzo. Se non funziona lo stesso, scrivici: ci mettiamo un attimo a sistemare.',
    whatsapp: true,
  },
  scaduto: {
    titolo: 'Questo link è scaduto',
    testo:
      'Era valido per un periodo, e quel periodo è finito. Non hai sbagliato niente: scrivici e te ne mandiamo uno nuovo.',
    whatsapp: true,
  },
  revocato: {
    titolo: 'Questo link è stato annullato',
    testo:
      'Qualcuno dalla nostra parte l’ha disattivato — di solito perché ne è stato mandato uno nuovo, o perché su questa pratica è successo qualcosa. Scrivici e ti diciamo a che punto siamo.',
    whatsapp: true,
  },
  gia_usato: {
    titolo: 'Questo link è già stato usato',
    testo:
      'Era un link valido una volta sola, e quella volta è passata. Se la cosa che dovevi fare non ti risulta fatta, scrivici.',
    whatsapp: true,
  },
  call_in_stato_non_ammesso: {
    titolo: 'Su questa consulenza non possiamo partire da qui',
    testo:
      'Il link è buono, ma la consulenza da cui nasce non è in uno stato da cui possa partire una richiesta nuova. Succede quando la call è stata annullata, oppure quando stiamo già guardando qualcosa a mano. Scrivici: è il caso in cui serve una persona.',
    whatsapp: true,
  },
  servizio_non_piu_attivo: {
    titolo: 'Questo servizio non è più disponibile',
    testo:
      'Il designer ha smesso di offrirlo dopo che ti abbiamo mandato la mail. Scrivici: ti diciamo cosa si può fare, e con chi.',
    whatsapp: true,
  },
  // I tre qui sotto non dovrebbero mai capitare a nessuno: se capitano è un
  // difetto nostro, non un link vecchio. Si dice la stessa cosa del link rotto,
  // perché spiegare a una persona un difetto nostro non la aiuta.
  servizio_non_ordinabile: {
    titolo: 'Questo link non funziona',
    testo: 'Qualcosa non torna da parte nostra. Scrivici e lo sistemiamo.',
    whatsapp: true,
  },
  token_di_altro_tipo: {
    titolo: 'Questo link non funziona',
    testo: 'Qualcosa non torna da parte nostra. Scrivici e lo sistemiamo.',
    whatsapp: true,
  },
  prenotazione_sconosciuta: {
    titolo: 'Questo link non funziona',
    testo: 'Qualcosa non torna da parte nostra. Scrivici e lo sistemiamo.',
    whatsapp: true,
  },
  // Anche questi due non dovrebbero capitare: un ordine cancellato dal
  // database, o un token della pagina su misura su un ordine All Inclusive, la
  // cui pagina è milestone 7.
  ordine_sconosciuto: {
    titolo: 'Questo link non funziona',
    testo: 'Qualcosa non torna da parte nostra. Scrivici e lo sistemiamo.',
    whatsapp: true,
  },
  servizio_non_gestito: {
    titolo: 'Questa pagina non è ancora pronta',
    testo:
      'Il link è buono, ma per questo tipo di viaggio la pagina non esiste ancora: per ora se ne occupa il team, a mano. Scrivici e ti diciamo a che punto siamo.',
    whatsapp: true,
  },
  irraggiungibile: {
    titolo: 'Non riusciamo a leggere questo link adesso',
    testo:
      'È un problema nostro e passeggero: riprova fra un minuto. Il link resta valido, non si consuma.',
    whatsapp: false,
  },
}
