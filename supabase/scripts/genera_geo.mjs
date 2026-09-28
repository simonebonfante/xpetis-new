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
       `${tax.statistics.states} stati, ${tax.statistics.regions} regioni, ${tax.statistics.cities} città.`)
L.push('')
// ⚠️ DEVIAZIONE 7 DEL PIANO — NON È UN BUG, NON VA «SISTEMATA».
// La tassonomia dichiara `selectable: [macro_area, state, italian_region]` e una
// regola `italy_special` («cercando Italia il sistema suggerisce le 20 regioni,
// tutte selezionabili»). Lo dice sia la v1 (`archivio/xpetis_destinazioni_v1.json`) sia
// `xpetis_destinazioni_v2.json`. **Noi le regioni italiane non le filtriamo**:
// deciso l'8 agosto 2026, confermato da Simone il 27 settembre 2026 davanti al
// file v2. Il valore della tassonomia si copia com'è in `is_selectable` (qui
// sotto, `r.selectable`), e cosa filtra davvero lo dice `is_filterable` della
// 0031, che sulle 20 regioni vale false. Le due colonne differiscono su quelle
// 20 righe e solo lì, di proposito, e l'harness lo verifica. Chi rilegge questo
// JSON e vede `italian_region` fra i selezionabili: la risposta è la
// deviazione 7 in PIANO.md, non una migration.
L.push('-- Regole di selezione dichiarate dalla tassonomia')
L.push('-- (le regioni italiane NON filtrano: deviazione 7 del PIANO, confermata il 27/09/2026):')
L.push(`--   selezionabili: ${tax.selection_rules.selectable.join(', ')}`)
L.push(`--   solo cercabili: ${tax.selection_rules.searchable_only.join(', ')}`)
L.push(`--   ${tax.selection_rules.italy_special}`)
L.push('')

const conts = [], macros = [], states = [], regions = [], cities = []
tax.continents.forEach((c, ci) => {
  conts.push(`  (${q(c.id)}, ${q(c.name)}, ${c.selectable}, ${ci + 1})`)
  c.macro_areas.forEach((m, mi) => {
    macros.push(`  (${q(m.id)}, ${q(c.id)}, ${q(m.name)}, ${m.selectable}, ${mi + 1})`)
    m.states.forEach((s, si) => {
      states.push(`  (${q(s.id)}, ${q(m.id)}, ${q(s.name)}, ${s.selectable}, ${si + 1})`)
      s.regions.forEach((r) => {
        regions.push(`  (${q(s.id)}, ${q(r.id)}, ${q(r.name)}, ${q(r.type)}, ${r.selectable})`)
        r.cities.forEach((ct) => {
          cities.push(`  (${q(s.id)}, ${q(r.id)}, ${q(ct.id)}, ${q(ct.name)}, ${ct.selectable})`)
        })
      })
    })
  })
})

// Il file dichiara i propri conteggi: se quello che si è letto non combacia, la
// struttura è cambiata sotto i piedi del generatore e il seed sarebbe sbagliato.
const letti = { continents: conts.length, macro_areas: macros.length, states: states.length,
                regions: regions.length, cities: cities.length }
for (const [k, n] of Object.entries(letti)) {
  if (tax.statistics[k] !== n) {
    console.error(`${SORGENTE}: dichiara ${tax.statistics[k]} ${k}, ne ho letti ${n}. Seed NON scritto.`)
    process.exit(1)
  }
}

// Le chiavi di ogni livello, per la guardia contro le righe in più.
const codici = { continenti: [], macro: [], stati: [], regioni: [] }
tax.continents.forEach((c) => {
  codici.continenti.push(c.id)
  c.macro_areas.forEach((m) => {
    codici.macro.push(m.id)
    m.states.forEach((s) => {
      codici.stati.push(s.id)
      s.regions.forEach((r) => codici.regioni.push(`${s.id}/${r.id}`))
    })
  })
})
const arr = (xs) => `array[${xs.map(q).join(', ')}]::text[]`

L.push('-- Tutto in una transazione: rigirato sopra dati esistenti, un giro fermato')
L.push('-- da una guardia non deve lasciare mezza potatura.')
L.push('begin;')
L.push('')
L.push('-- Guardia: nel database non ci devono essere continenti, macro-aree, stati o')
L.push('-- regioni che il file non ha. Non si cancellano da qui (uno stato ha dietro')
L.push('-- td_countries e quiz_responses): si ferma tutto e lo si dice.')
L.push('do $$')
L.push('declare v_extra text;')
L.push('begin')
L.push('  select string_agg(x, \', \') into v_extra from (')
L.push(`    select 'continente ' || code as x from geo_continents where code <> all (${arr(codici.continenti)})`)
L.push(`    union all select 'macro-area ' || code from geo_macro_areas where code <> all (${arr(codici.macro)})`)
L.push(`    union all select 'stato ' || code from geo_countries where code <> all (${arr(codici.stati)})`)
L.push(`    union all select 'regione ' || country_code || '/' || slug from geo_regions`)
L.push(`     where (country_code || '/' || slug) <> all (${arr(codici.regioni)})`)
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
L.push('insert into geo_regions (country_code, slug, name_it, kind, is_selectable) values')
L.push(regions.join(',\n') + '\non conflict (country_code, slug) do update set')
L.push('  name_it = excluded.name_it, kind = excluded.kind, is_selectable = excluded.is_selectable;')
L.push('')
L.push('-- Le città si agganciano alla regione risolvendo (stato, slug regione). Stanno')
L.push('-- in una tabella temporanea perché servono tre volte: per la guardia, per')
L.push('-- l\'inserimento e per la potatura.')
L.push('-- Il drop in testa rende il seed rilanciabile anche dopo un giro fermato a metà.')
L.push('drop table if exists geo_citta_attese;')
L.push('create temp table geo_citta_attese (')
L.push('  country_code text, region_slug text, city_slug text, city_name text, is_selectable boolean')
L.push(');')
L.push('insert into geo_citta_attese values')
L.push(cities.join(',\n') + ';')
L.push('')
L.push('-- Guardia: una città senza la sua regione verrebbe scartata dalla join in')
L.push('-- silenzio. Meglio fermarsi.')
L.push('do $$')
L.push('declare v_orfane text;')
L.push('begin')
L.push("  select string_agg(v.country_code || '/' || v.region_slug || '/' || v.city_slug, ', ') into v_orfane")
L.push('    from geo_citta_attese v')
L.push('   where not exists (select 1 from geo_regions r')
L.push('                      where r.country_code = v.country_code and r.slug = v.region_slug);')
L.push('  if v_orfane is not null then')
L.push("    raise exception 'Città senza regione nel database: %', v_orfane;")
L.push('  end if;')
L.push('end $$;')
L.push('')
L.push('insert into geo_cities (country_code, region_id, slug, name_it, is_selectable)')
L.push('select v.country_code, r.id, v.city_slug, v.city_name, v.is_selectable')
L.push('  from geo_citta_attese v')
L.push('  join geo_regions r on r.country_code = v.country_code and r.slug = v.region_slug')
L.push('on conflict (region_id, slug) do update set')
L.push('  name_it = excluded.name_it, is_selectable = excluded.is_selectable;')
L.push('')
L.push('-- La potatura: le città che il file non ha più se ne vanno. Nessuna chiave')
L.push('-- esterna punta a geo_cities (verificato il 27 settembre 2026), quindi non')
L.push('-- trascina niente con sé. Su un database vuoto non fa nulla.')
L.push('delete from geo_cities c')
L.push(' where not exists (')
L.push('   select 1 from geo_citta_attese v')
L.push('     join geo_regions r on r.country_code = v.country_code and r.slug = v.region_slug')
L.push('    where r.id = c.region_id and v.city_slug = c.slug);')
L.push('')
L.push('drop table geo_citta_attese;')
L.push('')
L.push('commit;')
L.push('')

if (lanciatoDirettamente) {
  writeFileSync(out, L.join('\n'))
  console.log(`scritto ${path.relative(root, out)}: ${conts.length} continenti, ${macros.length} macro-aree, ` +
              `${states.length} stati, ${regions.length} regioni, ${cities.length} città`)
}
