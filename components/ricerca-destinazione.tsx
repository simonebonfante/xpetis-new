'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { normalizzaRicerca } from '@/lib/geo'
import { createClient } from '@/lib/supabase/client'

type Voce = {
  level: 'continent' | 'macro_area' | 'country' | 'region' | 'city'
  ref: string
  name_it: string
  country_code: string | null
  is_filterable: boolean
  parent_ref: string | null
}

/** Cosa il viaggiatore ha effettivamente scelto come destinazione. */
type Scelta = { livello: 'country' | 'macro_area'; ref: string; nome: string }

const ETICHETTA: Record<Voce['level'], string> = {
  continent: 'Continente',
  macro_area: 'Area',
  country: 'Paese',
  region: 'Regione',
  city: 'Città',
}

type Props = {
  compatta?: boolean
  /** Sulla pagina risultati la barra nasce già piena della destinazione cercata. */
  destinazioneIniziale?: Scelta | null
  /**
   * Query da conservare cambiando destinazione (filtri, quiz): senza, cambiare
   * meta azzererebbe in silenzio le scelte già fatte.
   */
  mantieni?: string
  /** In home la barra è larga 536; sulla pagina ricerca occupa tutta la riga. */
  larga?: boolean
  /** La lente grigia che nel Figma sta a sinistra, solo sulla pagina ricerca. */
  lente?: boolean
  /** "Cerca" in home, "Modifica" sulla pagina risultati. */
  etichettaAzione?: string
  /**
   * In home il tasto compare solo a destinazione scelta (Flusso §1: una ricerca
   * a vuoto produrrebbe una vetrina casuale). Sulla pagina risultati il Figma lo
   * mostra sempre, e senza destinazione porta il fuoco nel campo invece di
   * lanciare una ricerca che non esiste.
   */
  azioneSempre?: boolean
}

export function RicercaDestinazione({
  compatta = false,
  destinazioneIniziale = null,
  mantieni = '',
  larga = false,
  lente = false,
  etichettaAzione = 'Cerca',
  azioneSempre = false,
}: Props) {
  const router = useRouter()
  const [testo, setTesto] = useState(destinazioneIniziale?.nome ?? '')
  const [voci, setVoci] = useState<Voce[]>([])
  const [scelta, setScelta] = useState<Scelta | null>(destinazioneIniziale)
  const [aperto, setAperto] = useState(false)
  const contenitore = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)

  // Chiude l'elenco cliccando fuori.
  useEffect(() => {
    function fuori(e: MouseEvent) {
      if (!contenitore.current?.contains(e.target as Node)) setAperto(false)
    }
    document.addEventListener('mousedown', fuori)
    return () => document.removeEventListener('mousedown', fuori)
  }, [])

  useEffect(() => {
    if (scelta || testo.trim().length < 2) {
      setVoci([])
      return
    }
    const attesa = setTimeout(async () => {
      const supabase = createClient()
      // Si cerca su `name_norm` — senza accenti, minuscolo — e si mostra
      // `name_it`: "peru" trova "Perù" (migration 0035). Il testo digitato passa
      // per la stessa normalizzazione, che sta in `lib/geo.ts`.
      const { data } = await supabase
        .from('geo_search')
        .select('level, ref, name_it, country_code, is_filterable, parent_ref')
        .like('name_norm', `%${normalizzaRicerca(testo)}%`)
        .order('is_filterable', { ascending: false })
        .order('name_it')
        .limit(12)
      setVoci((data as Voce[]) ?? [])
      setAperto(true)
    }, 200)
    return () => clearTimeout(attesa)
  }, [testo, scelta])

  /** Mostra le macro-aree di un continente: il continente non filtra, ci porta. */
  async function scendiNelContinente(voce: Voce) {
    const supabase = createClient()
    const { data } = await supabase
      .from('geo_search')
      .select('level, ref, name_it, country_code, is_filterable, parent_ref')
      .eq('level', 'macro_area')
      .eq('parent_ref', voce.ref)
      .order('name_it')
    setVoci((data as Voce[]) ?? [])
    setTesto(voce.name_it + ' · ')
  }

  /** Mostra i paesi di una macro-area, per chi vuole restringere. */
  async function scendiNellArea(voce: Voce) {
    const supabase = createClient()
    const { data } = await supabase
      .from('geo_search')
      .select('level, ref, name_it, country_code, is_filterable, parent_ref')
      .eq('level', 'country')
      .eq('parent_ref', voce.ref)
      .order('name_it')
    setVoci((data as Voce[]) ?? [])
  }

  async function seleziona(voce: Voce) {
    if (voce.level === 'continent') return scendiNelContinente(voce)

    // Città e regioni non filtrano: portano al loro paese.
    if (!voce.is_filterable) {
      if (!voce.country_code) return
      const supabase = createClient()
      const { data } = await supabase
        .from('geo_search')
        .select('name_it')
        .eq('level', 'country')
        .eq('ref', voce.country_code)
        .single()
      setScelta({ livello: 'country', ref: voce.country_code, nome: data?.name_it ?? voce.name_it })
      setTesto(data?.name_it ?? voce.name_it)
      setAperto(false)
      return
    }

    setScelta({
      livello: voce.level === 'macro_area' ? 'macro_area' : 'country',
      ref: voce.ref,
      nome: voce.name_it,
    })
    setTesto(voce.name_it)
    setAperto(false)
  }

  function cerca() {
    // Senza destinazione non c'è ricerca da lanciare: il tasto riporta il fuoco
    // nel campo invece di non fare niente.
    if (!scelta) return campo.current?.focus()
    const query = `livello=${scelta.livello}&ref=${encodeURIComponent(scelta.ref)}`
    router.push(`/ricerca?${mantieni ? `${query}&${mantieni}` : query}`)
  }

  return (
    <div
      ref={contenitore}
      className={`relative w-full ${larga ? '' : 'max-w-[536px]'}`}
    >
      <div
        className={`flex items-center gap-2 rounded-full bg-neutro pl-6 pr-2 ${
          compatta ? 'h-12' : 'h-[54px]'
        }`}
      >
        {lente && (
          <Image src="/img/icona-lente.svg" alt="" width={17} height={18} className="shrink-0" />
        )}

        <input
          ref={campo}
          value={testo}
          onChange={(e) => {
            setTesto(e.target.value)
            setScelta(null)
          }}
          onFocus={() => voci.length > 0 && setAperto(true)}
          onKeyDown={(e) => e.key === 'Enter' && cerca()}
          placeholder="Dove vuoi andare?"
          aria-label="Dove vuoi andare?"
          className="min-w-0 flex-1 bg-transparent text-corpo text-scuro outline-none placeholder:text-scuro/60"
        />

        {/* In home il tasto compare solo a destinazione selezionata: una ricerca
            a vuoto produrrebbe una vetrina casuale di designer, che contraddice
            la promessa del match. Senza destinazione l'azione è il quiz. */}
        {(scelta || azioneSempre) && (
          <button
            onClick={cerca}
            className="shrink-0 rounded-full bg-primario px-6 py-2 text-corpo text-neutro transition hover:brightness-110"
          >
            {etichettaAzione}
          </button>
        )}
      </div>

      {aperto && voci.length > 0 && (
        <ul className="absolute z-30 mt-2 max-h-[320px] w-full overflow-auto rounded-3xl bg-neutro py-2 shadow-xl">
          {voci.map((voce) => (
            <li key={`${voce.level}-${voce.ref}`}>
              <button
                onClick={() => seleziona(voce)}
                className="flex w-full items-baseline justify-between gap-3 px-6 py-2 text-left text-corpo hover:bg-crema"
              >
                <span>{voce.name_it}</span>
                <span className="shrink-0 text-piccolo text-scuro/50">
                  {ETICHETTA[voce.level]}
                  {!voce.is_filterable && voce.country_code ? ' · porta al paese' : ''}
                </span>
              </button>
              {voce.level === 'macro_area' && (
                <button
                  onClick={() => scendiNellArea(voce)}
                  className="px-6 pb-2 text-piccolo text-primario hover:underline"
                >
                  vedi i paesi
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
