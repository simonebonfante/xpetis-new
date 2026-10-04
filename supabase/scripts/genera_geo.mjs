// Genera supabase/seed/0002_geo.sql dalla tassonomia XPETIS.
// Uso: node supabase/scripts/genera_geo.mjs
//
// Il seed non si scrive a mano: si rigenera dalla tassonomia, che resta la
// fonte. Se la tassonomia cambia, si rilancia questo script.
//
// **La fonte è `xpetis_destinazioni_v2.json`** dal 27 settembre 2026: stessi
// continenti, macro-aree, stati e regioni della prima versione, e 188 città
// invece di 1.220 (la potatura di Alessandro, confermata da Simone). La prima
// versione è in `archivio/xpetis_destinazioni_v1.json`: non rigenerare da lì.
// Il percorso sta in UNA costante, `SORGENTE`, che legge anche l'harness.
//
// ## Il seed è convergente, non solo additivo
//
// Fino alla v2 il seed faceva solo `insert … on conflict do update`: rigirato su
// un database già popolato aggiornava, ma non toglieva niente. Con la potatura
// quel comportamento lascerebbe dentro le 1.032 città cadute, e il suggeritore
// continuerebbe a proporle. Quindi:
//
//   · le CITTÀ che il file non ha più **si cancellano**. Niente le referenzia
//     (verificato sul database di sviluppo il 27 settembre: nessuna chiave
//     esterna punta a `geo_cities`, la legge solo la vista `geo_search`);
//   · per gli altri livelli una riga in più nel database **ferma il seed**
//     invece di cancellare: uno stato ha dietro `td_countries` e
//     `quiz_responses`, e toglierlo è una decisione, non una rigenerazione;
//   · una città la cui regione non si trova **ferma il seed**. La `join` con cui
//     si agganciano alla regione la scarterebbe in silenzio, ed è esattamente il
//     modo in cui un errore qui farebbe sparire una destinazione senza errori.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const SORGENTE = 'xpetis_destinazioni_v2.json'

const root = path.resolve(import.meta.dirname, '..', '..')
const src  = path.join(root, SORGENTE)
const out  = path.join(root, 'supabase', 'seed', '0002_geo.sql')

// Importato dall'harness solo per leggere SORGENTE: in quel caso non scrive.
const lanciatoDirettamente = process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename

const tax = JSON.parse(readFileSync(src, 'utf8'))
const q = (v) => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`

const L = []
L.push('-- XPETIS · seed 0002 · Tassonomia geografica')
L.push('--')
L.push('-- GENERATO da supabase/scripts/genera_geo.mjs a partire da')
L.push(`-- ${SORGENTE}. Non modificare a mano: rigenerare.`)
L.push(`-- Attese: ${tax.statistics.continents} continenti, ${tax.statistics.macro_areas} macro-aree, ` +
       `${tax.statistics.states} stati, ${tax.statistics.cities} città (nessuna regione, 0057).`)
L.push('')
// Le regioni non esistono più (decisione di Simone, 4 ottobre 2026, migration
// 0057): la gerarchia è continente → macro-area → paese → città. Con loro se ne
// sono andate le 20 regioni italiane e la deviazione 7 che le riguardava. Se un
// file nuovo della tassonomia tornasse con le regioni, il generatore si ferma
// qui sotto invece di ignorarle in silenzio.
L.push('-- Regole di selezione dichiarate dalla tassonomia:')
L.push(`--   selezionabili: ${tax.selection_rules.selectable.join(', ')}`)
L.push(`--   solo cercabili: ${tax.selection_rules.searchable_only.join(', ')}`)
L.push('')

const conts = [], macros = [], states = [], cities = []
tax.continents.forEach((c, ci) => {
  conts.push(`  (${q(c.id)}, ${q(c.name)}, ${c.selectable}, ${ci + 1})`)
  c.macro_areas.forEach((m, mi) => {
    macros.push(`  (${q(m.id)}, ${q(c.id)}, ${q(m.name)}, ${m.selectable}, ${mi + 1})`)
    m.states.forEach((s, si) => {
      states.push(`  (${q(s.id)}, ${q(m.id)}, ${q(s.name)}, ${s.selectable}, ${si + 1})`)
      if (s.regions) {
        console.error(`${SORGENTE}: lo stato ${s.id} ha delle regioni, che dalla 0057 non esistono più. Seed NON scritto.`)
        process.exit(1)
      }
      ;(s.cities ?? []).forEach((ct) => {
        cities.push(`  (${q(s.id)}, ${q(ct.id)}, ${q(ct.name)}, ${ct.selectable})`)
      })
    })
  })
})

// Il file dichiara i propri conteggi: se quello che si è letto non combacia, la
// struttura è cambiata sotto i piedi del generatore e il seed sarebbe sbagliato.
const letti = { continents: conts.length, macro_areas: macros.length, states: states.length,
                cities: cities.length }
for (const [k, n] of Object.entries(letti)) {
  if (tax.statistics[k] !== n) {
    console.error(`${SORGENTE}: dichiara ${tax.statistics[k]} ${k}, ne ho letti ${n}. Seed NON scritto.`)
    process.exit(1)
  }
}

// Le chiavi di ogni livello, per la guardia contro le righe in più.
const codici = { continenti: [], macro: [], stati: [] }
tax.continents.forEach((c) => {
  codici.continenti.push(c.id)
  c.macro_areas.forEach((m) => {
    codici.macro.push(m.id)
    m.states.forEach((s) => {
      codici.stati.push(s.id)
    })
  })
})
const arr = (xs) => `array[${xs.map(q).join(', ')}]::text[]`

L.push('-- Tutto in una transazione: rigirato sopra dati esistenti, un giro fermato')
L.push('-- da una guardia non deve lasciare mezza potatura.')
L.push('begin;')
L.push('')
L.push('-- Guardia: nel database non ci devono essere continenti, macro-aree o stati')
L.push('-- che il file non ha. Non si cancellano da qui (uno stato ha dietro')
L.push('-- td_countries e quiz_responses): si ferma tutto e lo si dice.')
L.push('do $$')
L.push('declare v_extra text;')
L.push('begin')
L.push('  select string_agg(x, \', \') into v_extra from (')
L.push(`    select 'continente ' || code as x from geo_continents where code <> all (${arr(codici.continenti)})`)
L.push(`    union all select 'macro-area ' || code from geo_macro_areas where code <> all (${arr(codici.macro)})`)
L.push(`    union all select 'stato ' || code from geo_countries where code <> all (${arr(codici.stati)})`)
L.push('  ) e;')
L.push('  if v_extra is not null then')
L.push(`    raise exception 'Il database ha righe geografiche che ${SORGENTE} non ha più: %. Toglierle è una decisione, non una rigenerazione.', v_extra;`)
L.push('  end if;')
L.push('end $$;')
L.push('')
L.push('insert into geo_continents (code, name_it, is_selectable, sort_order) values')
L.push(conts.join(',\n') + '\non conflict (code) do update set')
L.push('  name_it = excluded.name_it, is_selectable = excluded.is_selectable, sort_order = excluded.sort_order;')
L.push('')
L.push('insert into geo_macro_areas (code, continent_code, name_it, is_selectable, sort_order) values')
L.push(macros.join(',\n') + '\non conflict (code) do update set')
L.push('  continent_code = excluded.continent_code, name_it = excluded.name_it,')
L.push('  is_selectable = excluded.is_selectable, sort_order = excluded.sort_order;')
L.push('')
L.push('insert into geo_countries (code, macro_area_code, name_it, is_selectable, sort_order) values')
L.push(states.join(',\n') + '\non conflict (code) do update set')
L.push('  macro_area_code = excluded.macro_area_code, name_it = excluded.name_it,')
L.push('  is_selectable = excluded.is_selectable, sort_order = excluded.sort_order;')
L.push('')
L.push('-- Le città, agganciate al loro paese (dalla 0057 non ci sono regioni). Stanno')
L.push('-- in una tabella temporanea perché servono due volte: per l\'inserimento e')
L.push('-- per la potatura. Il drop in testa rende il seed rilanciabile anche dopo un')
L.push('-- giro fermato a metà.')
L.push('drop table if exists geo_citta_attese;')
L.push('create temp table geo_citta_attese (')
L.push('  country_code text, city_slug text, city_name text, is_selectable boolean')
L.push(');')
L.push('insert into geo_citta_attese values')
L.push(cities.join(',\n') + ';')
L.push('')
L.push('insert into geo_cities (country_code, slug, name_it, is_selectable)')
L.push('select v.country_code, v.city_slug, v.city_name, v.is_selectable')
L.push('  from geo_citta_attese v')
L.push('on conflict (country_code, slug) do update set')
L.push('  name_it = excluded.name_it, is_selectable = excluded.is_selectable;')
L.push('')
L.push('-- La potatura: le città che il file non ha più se ne vanno. Nessuna chiave')
L.push('-- esterna punta a geo_cities (verificato il 27 settembre 2026), quindi non')
L.push('-- trascina niente con sé. Su un database vuoto non fa nulla.')
L.push('delete from geo_cities c')
L.push(' where not exists (select 1 from geo_citta_attese v')
L.push('                    where v.country_code = c.country_code and v.city_slug = c.slug);')
L.push('')
L.push('drop table geo_citta_attese;')
L.push('')
L.push('commit;')
L.push('')

if (lanciatoDirettamente) {
  writeFileSync(out, L.join('\n'))
  console.log(`scritto ${path.relative(root, out)}: ${conts.length} continenti, ${macros.length} macro-aree, ` +
              `${states.length} stati, ${cities.length} città`)
}
