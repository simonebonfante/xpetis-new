// Genera supabase/seed/0002_geo.sql dalla tassonomia XPETIS.
// Uso: node supabase/scripts/genera_geo.mjs
//
// Il seed non si scrive a mano: si rigenera da `xpetis_destinazioni.json`, che
// resta la fonte. Se la tassonomia cambia, si rilancia questo script.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..', '..')
const src  = path.join(root, 'xpetis_destinazioni.json')
const out  = path.join(root, 'supabase', 'seed', '0002_geo.sql')

const tax = JSON.parse(readFileSync(src, 'utf8'))
const q = (v) => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`

const L = []
L.push('-- XPETIS · seed 0002 · Tassonomia geografica')
L.push('--')
L.push('-- GENERATO da supabase/scripts/genera_geo.mjs a partire da')
L.push('-- xpetis_destinazioni.json. Non modificare a mano: rigenerare.')
L.push(`-- Attese: ${tax.statistics.continents} continenti, ${tax.statistics.macro_areas} macro-aree, ` +
       `${tax.statistics.states} stati, ${tax.statistics.regions} regioni, ${tax.statistics.cities} città.`)
L.push('')
L.push('-- Regole di selezione dichiarate dalla tassonomia:')
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
L.push('-- Le città si agganciano alla regione risolvendo (stato, slug regione).')
L.push('insert into geo_cities (country_code, region_id, slug, name_it, is_selectable)')
L.push('select v.country_code, r.id, v.city_slug, v.city_name, v.is_selectable')
L.push('  from (values')
L.push(cities.map(c => c.replace(/^ {2}\(/, '    (')).join(',\n'))
L.push('  ) as v(country_code, region_slug, city_slug, city_name, is_selectable)')
L.push('  join geo_regions r on r.country_code = v.country_code and r.slug = v.region_slug')
L.push('on conflict (region_id, slug) do update set')
L.push('  name_it = excluded.name_it, is_selectable = excluded.is_selectable;')
L.push('')

writeFileSync(out, L.join('\n'))
console.log(`scritto ${path.relative(root, out)}: ${conts.length} continenti, ${macros.length} macro-aree, ` +
            `${states.length} stati, ${regions.length} regioni, ${cities.length} città`)
