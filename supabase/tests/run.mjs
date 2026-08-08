// Harness di verifica dello schema: applica tutte le migration e i seed su un
// Postgres 17 in-process (PGlite) e poi esegue una serie di asserzioni.
// Uso: node supabase/tests/run.mjs
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const db = await PGlite.create({ extensions: { pg_trgm, pgcrypto, unaccent } })

// Stub dell'ambiente Supabase che le migration danno per scontato.
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create or replace function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`)

let failures = 0
const ok   = (m) => console.log('  ok   ' + m)
const fail = (m, e) => { failures++; console.log('  FAIL ' + m + (e ? '\n       ' + String(e).split('\n')[0] : '')) }

const runDir = async (dir) => {
  for (const f of readdirSync(path.join(root, dir)).filter(f => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(path.join(root, dir, f), 'utf8'))
      ok(`${dir}/${f}`)
    } catch (e) { fail(`${dir}/${f}`, e) }
  }
}

console.log('\n== Migration ==')
await runDir('migrations')
console.log('\n== Seed ==')
await runDir('seed')

if (failures) { console.log(`\n${failures} errori nell'applicazione. Stop.`); process.exit(1) }

// ---------------------------------------------------------------- asserzioni
const q = (sql, params) => db.query(sql, params)
const expectFail = async (label, sql, expect) => {
  try { await db.exec(sql); fail(`${label} — la scrittura è passata e non doveva`) }
  catch (e) {
    if (expect && !String(e.message).toLowerCase().includes(expect.toLowerCase()))
      fail(`${label} — errore diverso dall'atteso: ${e.message}`)
    else ok(label)
  }
}
const expectOk = async (label, sql) => {
  try { await db.exec(sql); ok(label) } catch (e) { fail(label, e) }
}

console.log('\n== Conteggi di base ==')
for (const [label, sql, expected] of [
  ['6 assi del quiz',            'select count(*) from quiz_axes', 6],
  ['9 temi',                     "select count(*) from tags where kind='theme'", 9],
  ['8 contesti',                 "select count(*) from tags where kind='context'", 8],
  ['2 TD pubblicati nella vetrina pubblica','select count(*) from public_td_showcase', 2],
]) {
  try {
    const n = Number((await q(sql)).rows[0].count)
    n === expected ? ok(`${label} (${n})`) : fail(`${label}: attesi ${expected}, trovati ${n}`)
  } catch (e) { fail(label, e) }
}

console.log('\n== Tassonomia geografica ==')
{
  // Il confronto è contro le statistiche dichiarate dalla tassonomia stessa,
  // non contro numeri copiati a mano: se il file cambia, il test lo dice.
  const tax = JSON.parse(readFileSync(path.join(root, '..', 'xpetis_destinazioni.json'), 'utf8'))
  const st = tax.statistics
  for (const [label, table, expected] of [
    ['continenti',  'geo_continents',  st.continents],
    ['macro-aree',  'geo_macro_areas', st.macro_areas],
    ['stati',       'geo_countries',   st.states],
    ['regioni',     'geo_regions',     st.regions],
    ['città',       'geo_cities',      st.cities],
  ]) {
    const n = Number((await q(`select count(*) from ${table}`)).rows[0].count)
    n === expected ? ok(`${label}: ${n}, come dichiara la tassonomia`)
                   : fail(`${label}: attesi ${expected}, trovati ${n}`)
  }
}
{
  // selectable: macro_area, state, italian_region. searchable_only: continent, city, foreign_region.
  const sel = async (table, where = 'true') =>
    Number((await q(`select count(*) from ${table} where is_filterable and ${where}`)).rows[0].count)
  const tot = async (table, where = 'true') =>
    Number((await q(`select count(*) from ${table} where ${where}`)).rows[0].count)

  await sel('geo_continents') === 0 ? ok('nessun continente filtra') : fail('continenti selezionabili')
  await sel('geo_macro_areas') === await tot('geo_macro_areas')
    ? ok('tutte le macro-aree filtrano') : fail('macro-aree')
  await sel('geo_countries') === await tot('geo_countries')
    ? ok('tutti gli stati filtrano') : fail('stati')
  await sel('geo_cities') === 0 ? ok('nessuna città filtra: porta al suo stato') : fail('città')

  await sel('geo_regions') === 0
    ? ok('nessuna regione filtra: decisione dell\'8 agosto, niente quinto filtro')
    : fail('regioni filtrabili')

  // L'unica differenza fra ciò che la tassonomia dichiara e ciò che filtriamo
  // sono le 20 regioni italiane. Se cambia, questo test lo dice.
  const diff = (await q(`
    select level, count(*)::int as n from geo_search
     where is_selectable is distinct from is_filterable
     group by level order by level`)).rows
  JSON.stringify(diff) === JSON.stringify([{ level: 'region', n: 20 }])
    ? ok('la sola differenza tassonomia/prodotto sono le 20 regioni italiane')
    : fail('differenze: ' + JSON.stringify(diff))

  const it = Number((await q(`select count(*) from geo_regions
                               where kind='italian_region' and is_selectable`)).rows[0].count)
  it === 20
    ? ok('la tassonomia continua a dichiararle selezionabili: il dato non si perde')
    : fail('regioni italiane selectable: ' + it)

  const itr = Number((await q(`select count(*) from geo_regions where country_code='italia'`)).rows[0].count)
  itr === 20 ? ok('l\'Italia ha le sue 20 regioni') : fail('regioni italiane: ' + itr)
}
{
  // Una città può stare in due regioni dello stesso stato: è il caso di Jaipur.
  const j = (await q(`select r.name_it from geo_cities c
                        join geo_regions r on r.id = c.region_id
                       where c.country_code='india' and c.name_it='Jaipur'
                       order by r.name_it`)).rows.map(x => x.name_it)
  j.length === 2
    ? ok('Jaipur vive in due regioni (' + j.join(', ') + '): unicità per regione, non per stato')
    : fail('Jaipur: ' + JSON.stringify(j))
}
{
  const c = (await q(`select country_code, is_filterable from geo_search
                       where level='city' and name_it='Hanoi'`)).rows[0]
  c.country_code === 'vietnam' && c.is_filterable === false
    ? ok('il suggeritore porta una città al suo stato senza renderla selezionabile')
    : fail('geo_search città: ' + JSON.stringify(c))
  const m = (await q(`select is_filterable from geo_search
                       where level='macro_area' and ref='sud_america'`)).rows[0]
  m.is_filterable === true
    ? ok('il suggeritore dichiara filtrabile una macro-area') : fail('geo_search macro-area')
}

console.log('\n== Profili TD ==')
{
  const axes = (await q(`select axis_code, array_agg(value order by value) as vals
                           from td_axis_values
                          where td_id = '11111111-1111-1111-1111-111111111111'
                          group by axis_code`)).rows
  const byCode = Object.fromEntries(axes.map(r => [r.axis_code, r.vals]))
  byCode.companions?.length === 2
    ? ok('asse categoriale multi-valore (companions = ' + JSON.stringify(byCode.companions) + ')')
    : fail('asse categoriale: ' + JSON.stringify(byCode.companions))
  byCode.pace?.length === 1 ? ok('asse continuo a valore singolo') : fail('asse continuo')
  const n = Number((await q(`select count(*) from td_countries
                              where td_id='11111111-1111-1111-1111-111111111111'`)).rows[0].count)
  n === 3 ? ok('3 paesi con livello') : fail('paesi: ' + n)
  const tags = (await q(`select tag_code from td_destination_tags
                          where td_id='11111111-1111-1111-1111-111111111111' and country_code='vietnam'`)).rows
  tags.some(t => t.tag_code === 'food')
    ? ok('tag per coppia TD-destinazione (Vietnam → food)') : fail('tag: ' + JSON.stringify(tags))
}

console.log('\n== match_designers: bande geografiche ==')
// Marco copre VN e TH (livello 1) e JP (livello 2). Giulia copre PE e BO.
const band = async (country, tdSlug) => {
  const r = (await q(`select band, section from match_designers('country', $1) where slug = $2`,
                     [country, tdSlug])).rows[0]
  return r
}
for (const [country, slug, expBand, expSection, label] of [
  ['vietnam', 'marco-rossi', 3, 'esperti_paese', 'paese coperto → banda 3'],
  ['giappone', 'marco-rossi', 3, 'esperti_paese', 'paese coperto a livello 2 → sempre banda 3'],
  ['cambogia', 'marco-rossi', 2, 'macro_area',    'stessa macro-area → banda 2'],
  ['india', 'marco-rossi', 1, 'continente',    'stesso continente → banda 1'],
  ['vietnam', 'giulia-neri', 0, 'fallback',      'nessuna relazione → banda 0'],
]) {
  const r = await band(country, slug)
  Number(r?.band) === expBand && r?.section === expSection
    ? ok(`${label} (${country} → ${slug})`)
    : fail(`${label}: banda ${r?.band}, sezione ${r?.section}`)
}
{
  const n = Number((await q(`select count(*) from match_designers('country','vietnam')`)).rows[0].count)
  n === 2 ? ok('nessun TD è mai escluso (2 su 2 in risposta)') : fail('esclusi: ' + n)
}

// Quiz che combacia in pieno con Marco.
const QUIZ_MARCO = JSON.stringify({
  planning_involvement: 2, pace: 1, comfort_wild: 3,
  curated_vs_real: 3, social_orientation: 4, companions: 2,
})

console.log('\n== match_designers: ricerca per macro-area ==')
{
  // Marco copre Vietnam, Thailandia e Giappone: tutti in Asia Orientale e
  // Sud-Est Asiatico. Giulia copre Perù e Bolivia, in Sud America.
  const r = (await q(`select slug, band, section from match_designers('macro_area','asia_orientale_e_sud_est_asiatico')
                       order by rank_position`)).rows
  const marco = r.find(x => x.slug === 'marco-rossi')
  const giulia = r.find(x => x.slug === 'giulia-neri')
  Number(marco.band) === 3 && marco.section === 'esperti_macro_area'
    ? ok('chi copre un paese della macro-area cercata è in banda 3')
    : fail('macro-area: ' + JSON.stringify(marco))
  Number(giulia.band) === 0
    ? ok('chi non ha niente in quel continente resta in fallback')
    : fail('giulia su macro-area asiatica: ' + JSON.stringify(giulia))
}
{
  // India è in un'altra macro-area asiatica: cercando quella, Marco è banda 1.
  const r = (await q(`select band, section from match_designers('macro_area','asia_centrale_e_subcontinente_indiano')
                       where slug='marco-rossi'`)).rows[0]
  Number(r.band) === 1 && r.section === 'continente'
    ? ok('con una macro-area la banda 2 non esiste: si passa da 3 a 1')
    : fail('banda su altra macro-area: ' + JSON.stringify(r))
}
await expectFail('una città non filtra', `
  select * from match_designers('city', 'hanoi')`, 'non filtrabile')
await expectFail('un continente non filtra', `
  select * from match_designers('continent', 'asia')`, 'non filtrabile')
await expectFail('una destinazione inesistente non passa in silenzio', `
  select * from match_designers('country', 'atlantide')`, 'inesistente')
{
  const r = (await q(`select has_strong_badge from match_designers(
                        'macro_area','asia_orientale_e_sud_est_asiatico', $1::jsonb, array['food'])
                       where slug='marco-rossi'`, [QUIZ_MARCO])).rows[0]
  r.has_strong_badge === true
    ? ok('badge su macro-area: serve almeno un paese di livello 1 là dentro')
    : fail('badge su macro-area non acceso')
}

console.log('\n== match_designers: affinità, badge, ordine ==')
{
  const r = (await q(`select slug, rank_position, has_strong_badge, salient_axes, matched_themes
                        from match_designers('country','vietnam', $1::jsonb, array['food'])
                       order by rank_position`, [QUIZ_MARCO])).rows
  r[0].slug === 'marco-rossi' ? ok('con destinazione, Marco è primo') : fail('ordine: ' + JSON.stringify(r.map(x=>x.slug)))
  r[0].has_strong_badge === true
    ? ok('badge acceso: affinità piena e VN è livello 1')
    : fail('badge non acceso su match perfetto')
  r[0].salient_axes.length <= 2 && r[0].salient_axes.length > 0
    ? ok('due assi salienti al massimo (' + r[0].salient_axes.join(', ') + ')')
    : fail('assi salienti: ' + JSON.stringify(r[0].salient_axes))
  r[0].matched_themes.includes('food')
    ? ok('tema richiesto e posseduto restituito per la frase') : fail('matched_themes')
  r[1].has_strong_badge === false ? ok('Giulia senza badge') : fail('badge su Giulia')
}
{
  // Stesso quiz perfetto, ma il Giappone è livello 2 per Marco: niente badge.
  const r = (await q(`select has_strong_badge from match_designers('country','giappone', $1::jsonb)`, [QUIZ_MARCO])).rows
  const marco = (await q(`select has_strong_badge from match_designers('country','giappone', $1::jsonb) where slug='marco-rossi'`, [QUIZ_MARCO])).rows[0]
  marco.has_strong_badge === false
    ? ok('affinità piena ma paese di livello 2 → nessun badge')
    : fail('badge acceso su un paese di livello 2')
}
{
  const r = (await q(`select slug, section, has_strong_badge from match_designers(null, null, $1::jsonb)
                       order by rank_position`, [QUIZ_MARCO])).rows
  r[0].slug === 'marco-rossi' && r[0].section === 'match_forte'
    ? ok('senza destinazione: fascia unica, match forti in cima')
    : fail('senza destinazione: ' + JSON.stringify(r))
}
{
  // Senza quiz e senza filtri l'affinità non esiste: decide banda, livello, spareggio.
  const r = (await q(`select slug, rank_position from match_designers('country','vietnam') order by rank_position`)).rows
  r[0].slug === 'marco-rossi' ? ok('senza quiz decidono banda e spareggio') : fail('ordine senza quiz')
}
{
  const cols = (await q(`select column_name from information_schema.columns
                          where table_name = 'match_designers'`)).rows.map(r => r.column_name)
  const leaky = ['level', 'affinity', 'quiz_score', 'axis_value', 'value', 'country_level']
  const found = cols.filter(c => leaky.some(l => c.includes(l)))
  found.length === 0
    ? ok('la funzione non restituisce punteggi, livelli o valori di asse')
    : fail('colonne che perdono informazione: ' + found.join(', '))
}
{
  const r = (await q(`select covered_countries from match_designers() where slug='marco-rossi'`)).rows[0]
  r.covered_countries.includes('Vietnam') && !JSON.stringify(r.covered_countries).includes('1')
    ? ok('paesi coperti restituiti per nome, senza livelli')
    : fail('covered_countries: ' + JSON.stringify(r.covered_countries))
}

console.log('\n== Vincoli sui profili TD ==')
await expectFail('asse continuo con due valori', `
  insert into td_axis_values (td_id, axis_code, value)
  values ('11111111-1111-1111-1111-111111111111','pace',3)`, 'continuo')
await expectFail('valore fuori scala', `
  insert into td_axis_values (td_id, axis_code, value)
  values ('11111111-1111-1111-1111-111111111111','curated_vs_real',9)`, 'fuori scala')
await expectFail('tag su un paese non coperto dal TD', `
  insert into td_destination_tags (td_id, country_code, tag_code)
  values ('11111111-1111-1111-1111-111111111111','tanzania','food')`, 'foreign key')
await expectFail('consulenza attiva senza Payment Link', `
  insert into td_services (td_id, service_type, is_active, price_cents, duration_minutes, cal_event_type_slug)
  values ('11111111-1111-1111-1111-111111111111','consultation_deep',true,9000,45,'x')`, 'bookable_complete')
await expectFail('livello paese diverso da 1 o 2', `
  insert into td_countries (td_id, country_code, level)
  values ('22222222-2222-2222-2222-222222222222','tanzania',3)`, 'level')

console.log('\n== Allineamento al form Vetrina TD ==')
{
  const ax = (await q(`select code, kind, scale_max, label_min, label_max
                         from quiz_axes order by sort_order`)).rows
  ax.length === 6 ? ok('sempre sei assi') : fail('assi: ' + ax.length)
  const cont = ax.filter(a => a.kind === 'continuous')
  cont.every(a => a.label_min && a.label_max)
    ? ok('il verso di ogni asse continuo è un dato, non un\'interpretazione')
    : fail('assi senza estremi: ' + JSON.stringify(cont.filter(a => !a.label_min).map(a => a.code)))
  const cvr = ax.find(a => a.code === 'curated_vs_real')
  cvr && cvr.label_min === 'Estetica curata' && cvr.label_max === 'Vita reale'
    ? ok('l\'asse invertito è rinominato e il verso combacia col form')
    : fail('curated_vs_real: ' + JSON.stringify(cvr))
  !ax.some(a => a.code === 'aesthetics')
    ? ok('il vecchio codice `aesthetics` non esiste più') : fail('aesthetics ancora presente')
  const comp = ax.find(a => a.code === 'companions')
  Number(comp.scale_max) === 5 ? ok('"con chi viaggi" ha scala fino a 5') : fail('scale_max: ' + comp.scale_max)
}
{
  const opts = (await q(`select value, label_it from quiz_axis_options
                          where axis_code='companions' order by value`)).rows
  opts.length === 5 && opts[4].label_it === 'Gruppo organizzato'
    ? ok('cinque opzioni con le parole esatte del form')
    : fail('opzioni companions: ' + JSON.stringify(opts))
}
await expectOk('quinta opzione di "con chi viaggi" accettata', `
  insert into td_axis_values (td_id, axis_code, value)
  values ('11111111-1111-1111-1111-111111111111','companions',5)`)
await expectFail('valore 5 su un asse continuo rifiutato', `
  insert into td_axis_values (td_id, axis_code, value)
  values ('22222222-2222-2222-2222-222222222222','pace',5)`, 'fuori scala')
{
  const t = (await q(`select label_it from tags where code='aree_estreme'`)).rows[0]
  t.label_it === 'Aree estreme/polari'
    ? ok('etichetta del tag identica al form (altrimenti non aggancia)')
    : fail('etichetta: ' + t.label_it)
}

console.log('\n== I cinque servizi del form ==')
await expectOk('il designer attiva viaggio di gruppo e accompagnamento privato', `
  insert into td_services (td_id, service_type, is_active, sort_order) values
    ('11111111-1111-1111-1111-111111111111','group_trip',true,20),
    ('11111111-1111-1111-1111-111111111111','private_guiding',true,21)`)
await expectFail('ma nessun ordine può nascere su di loro', `
  insert into orders (traveler_id, td_id, service_type)
  values ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','group_trip')`,
  'service_type')
await expectOk('punti del box consulenza, ordinati', `
  insert into td_service_bullets (service_id, position, text_it)
  select id, 1, 'Analisi del tuo stile di viaggio' from td_services
   where td_id='11111111-1111-1111-1111-111111111111' and service_type='consultation'`)
await expectFail('due punti nella stessa posizione', `
  insert into td_service_bullets (service_id, position, text_it)
  select id, 1, 'Doppione' from td_services
   where td_id='11111111-1111-1111-1111-111111111111' and service_type='consultation'`, 'unique')

console.log('\n== Liste chiuse del form ==')
await expectOk('copertura legale con le parole del form', `
  update travel_designers
     set legal_coverage = 'Ho già un''agenzia / struttura — non mi serve supporto',
         hero_bio = 'Paragrafo di apertura della vetrina.',
         manifesto = 'Non progetto itinerari.',
         instagram_handle = '@marco',
         years_experience = 15
   where id='11111111-1111-1111-1111-111111111111'`)
await expectFail('copertura legale con parole diverse', `
  update travel_designers set legal_coverage = 'ho una agenzia'
   where id='11111111-1111-1111-1111-111111111111'`, 'legal_coverage')
await expectOk('durata e budget tipici per paese', `
  update td_countries
     set typical_duration = 'Standard (8–14 gg)',
         typical_budget   = 'Medio (€1.500–3.500)',
         areas_note       = 'Hanoi, Sapa',
         custom_themes    = array['Cucina di strada']
   where td_id='11111111-1111-1111-1111-111111111111' and country_code='vietnam'`)
await expectFail('durata fuori dalle cinque previste', `
  update td_countries set typical_duration = 'due settimane'
   where td_id='11111111-1111-1111-1111-111111111111' and country_code='vietnam'`, 'duration_values')

console.log('\n== Contenuto di vetrina ==')
const MARCO = '11111111-1111-1111-1111-111111111111'
await expectOk('viaggio firma con tre foto', `
  insert into td_signature_trips (id, td_id, position, title, description)
  values ('aaaaaaa1-0000-0000-0000-000000000001','${MARCO}',1,
          'Australia, il richiamo dell''infinito','È l''alba sull''oceano.');
  insert into td_signature_trip_images (trip_id, position, storage_path) values
    ('aaaaaaa1-0000-0000-0000-000000000001',1,'td-media/marco/viaggio-1-foto-1.jpg'),
    ('aaaaaaa1-0000-0000-0000-000000000001',2,'td-media/marco/viaggio-1-foto-2.jpg'),
    ('aaaaaaa1-0000-0000-0000-000000000001',3,'td-media/marco/viaggio-1-foto-3.jpg')`)
await expectFail('viaggio con titolo vuoto (le righe vuote del form)', `
  insert into td_signature_trips (td_id, position, title)
  values ('${MARCO}', 2, '   ')`, 'title')
await expectFail('due viaggi nella stessa posizione', `
  insert into td_signature_trips (td_id, position, title)
  values ('${MARCO}', 1, 'Doppione')`, 'unique')
await expectOk('itinerari pronti con etichette di durata e prezzo', `
  insert into td_ready_itineraries (td_id, position, title, duration_label, price_label, image_path)
  values ('${MARCO}',1,'Bosnia 360 On the Road','5-7 giorni','850€','td-media/marco/itinerario-1.jpg'),
         ('${MARCO}',2,'Vietnam del nord','12 giorni','1.380€',null)`)
{
  const v = (await q(`select signature_trips, ready_itineraries, services, hero_bio
                        from public_td_showcase where slug='marco-rossi'`)).rows[0]
  v.signature_trips.length === 1 && v.signature_trips[0].images.length === 3
    ? ok('la vetrina pubblica serve il viaggio firma con le sue foto in ordine')
    : fail('signature_trips: ' + JSON.stringify(v.signature_trips))
  v.ready_itineraries.length === 2 && v.ready_itineraries[0].price_label === '850€'
    ? ok('itinerari pronti con il prezzo come lo scrive il designer')
    : fail('ready_itineraries: ' + JSON.stringify(v.ready_itineraries))
  const cons = v.services.find(x => x.service_type === 'consultation')
  Array.isArray(cons.bullets) && cons.bullets.length === 1
    ? ok('i punti del box consulenza arrivano nella vetrina')
    : fail('bullets: ' + JSON.stringify(cons))
  v.hero_bio === 'Paragrafo di apertura della vetrina.'
    ? ok('i campi di profilo del form sono esposti') : fail('hero_bio: ' + v.hero_bio)
}

console.log('\n== Recensioni portate da fuori ==')
await expectOk('recensione esterna caricata', `
  insert into td_showcase_reviews (td_id, position, title, author_name, stars, date_label, body)
  values ('${MARCO}',1,'Isole Lofoten','Nico',5,'Febbraio 2026',
          'Il viaggio più entusiasmante che abbia mai fatto.')`)
await expectFail('recensione esterna senza autore', `
  insert into td_showcase_reviews (td_id, position, author_name, stars, body)
  values ('${MARCO}', 2, '  ', 5, 'testo')`, 'author_name')
{
  const r = (await q(`select is_published from td_showcase_reviews where td_id='${MARCO}'`)).rows[0]
  r.is_published === false
    ? ok('nasce non pubblicata: la decisione è rimandata alla milestone 8')
    : fail('is_published di default a vero')

  // A questo punto del test non esiste ancora nessuna recensione XPETIS: se la
  // recensione esterna finisse nelle medie, qui comparirebbe una riga.
  const stats = (await q(`select reviews_count from td_review_stats where td_id='${MARCO}'`)).rows[0]
  stats === undefined
    ? ok('non entra nelle medie interne: td_review_stats resta vuota')
    : fail('td_review_stats contaminato: ' + JSON.stringify(stats))

  const pub = (await q(`
    select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='v'
       and has_table_privilege('anon', c.oid, 'SELECT')
       and pg_get_viewdef(c.oid) like '%td_showcase_reviews%'`)).rows[0]
  Number(pub.count) === 0
    ? ok('nessuna vista pubblica le espone')
    : fail('una vista pubblica espone le recensioni esterne')
}

console.log('\n== Ciclo di vita della prenotazione ==')
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data)
  values ('44444444-4444-4444-4444-444444444444','viaggiatore@example.com','{"full_name":"Anna Bianchi"}');
`)
{
  const n = Number((await q(`select count(*) from travelers where id='44444444-4444-4444-4444-444444444444'`)).rows[0].count)
  n === 1 ? ok('riga travelers creata dal trigger sul primo login') : fail('trigger auth.users → travelers')
}
await expectOk('creazione prenotazione in attesa di pagamento', `
  insert into bookings (id, traveler_id, td_id, service_type, cal_booking_uid,
                        starts_at, ends_at, original_starts_at, price_cents,
                        payment_deadline_at, last_actor)
  values ('55555555-5555-5555-5555-555555555555',
          '44444444-4444-4444-4444-444444444444',
          '11111111-1111-1111-1111-111111111111',
          'consultation','cal_uid_abc',
          now() + interval '3 days', now() + interval '3 days 30 minutes',
          now() + interval '3 days', 6000,
          now() + interval '30 minutes', 'n8n')`)
await expectFail('stesso UID Cal.com due volte (webhook doppio)', `
  insert into bookings (traveler_id, td_id, service_type, cal_booking_uid,
                        starts_at, ends_at, original_starts_at, price_cents)
  values ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111',
          'consultation','cal_uid_abc', now(), now() + interval '30 min', now(), 6000)`, 'unique')
await expectOk('conferma pagamento', `
  update bookings set status='confirmed', confirmed_at=now(),
         autoclose_at = ends_at + interval '48 hours', last_actor='n8n'
   where id='55555555-5555-5555-5555-555555555555'`)
{
  const h = (await q(`select from_status, to_status, actor from booking_status_history
                       where booking_id='55555555-5555-5555-5555-555555555555' order by id`)).rows
  h.length === 2 && h[1].to_status === 'confirmed' && h[1].actor === 'n8n'
    ? ok('storia degli stati registrata con l\'attore giusto')
    : fail('storia stati: ' + JSON.stringify(h))
}
await expectOk('pagamento consulenza', `
  insert into payments (booking_id, kind, status, amount_cents, client_reference_id, paid_at)
  values ('55555555-5555-5555-5555-555555555555','consultation','paid',6000,'cal_uid_abc',now())`)
await expectFail('doppio incasso della stessa consulenza', `
  insert into payments (booking_id, kind, status, amount_cents)
  values ('55555555-5555-5555-5555-555555555555','consultation','paid',6000)`, 'one_paid_per_kind')
await expectFail('pagamento agganciato a prenotazione e ordine insieme', `
  insert into payments (booking_id, order_id, kind, amount_cents)
  values ('55555555-5555-5555-5555-555555555555', gen_random_uuid(), 'full', 100)`, 'check constraint')

console.log('\n== Ordine su misura ==')
await expectOk('ordine creato dal bottone della mail post-call', `
  insert into orders (id, traveler_id, td_id, service_type, source_booking_id,
                      consultation_credit_cents, last_actor)
  values ('66666666-6666-6666-6666-666666666666',
          '44444444-4444-4444-4444-444444444444',
          '11111111-1111-1111-1111-111111111111',
          'custom_itinerary','55555555-5555-5555-5555-555555555555', 6000, 'traveler')`)
{
  const r = (await q(`select human_ref from orders where id='66666666-6666-6666-6666-666666666666'`)).rows[0];
  /^XP-\d{5}$/.test(r.human_ref) ? ok('riferimento leggibile ' + r.human_ref) : fail('human_ref: ' + r.human_ref)
}
await expectFail('secondo ordine con credito dalla stessa call', `
  insert into orders (traveler_id, td_id, service_type, source_booking_id, consultation_credit_cents)
  values ('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111',
          'all_inclusive','55555555-5555-5555-5555-555555555555', 6000)`, 'one_credit_per_booking')
await expectOk('secondo ordine senza credito: ammesso', `
  insert into orders (id, traveler_id, td_id, service_type, source_booking_id, consultation_credit_cents)
  values ('77777777-7777-7777-7777-777777777777','44444444-4444-4444-4444-444444444444',
          '11111111-1111-1111-1111-111111111111','all_inclusive',
          '55555555-5555-5555-5555-555555555555', 0)`)
await expectFail('salto di stato non previsto (requested → delivered)', `
  update orders set status='delivered' where id='66666666-6666-6666-6666-666666666666'`, 'non ammessa')
await expectFail('proposta su misura senza prezzo', `
  update orders set status='proposal_sent', last_actor='td'
   where id='66666666-6666-6666-6666-666666666666'`, 'senza prezzo')
await expectOk('proposta su misura completa', `
  update orders set status='proposal_sent', proposal_price_cents=120000, delivery_days=7,
         proposal_description='Vietnam 12 giorni', proposal_sent_at=now(), last_actor='td'
   where id='66666666-6666-6666-6666-666666666666'`)
await expectOk('pagamento → in lavorazione', `
  update orders set status='in_progress', last_actor='n8n'
   where id='66666666-6666-6666-6666-666666666666'`)
await expectFail('consegna senza nessun file caricato', `
  update orders set status='delivered', last_actor='td'
   where id='66666666-6666-6666-6666-666666666666'`, 'senza nessun file')
await expectOk('consegna con file', `
  insert into order_files (order_id, kind, storage_path, filename)
  values ('66666666-6666-6666-6666-666666666666','itinerary','order-documents/66/it.pdf','itinerario.pdf');
  update orders set status='delivered', delivered_at=now(),
         revision_deadline_at = now() + interval '5 days', last_actor='td'
   where id='66666666-6666-6666-6666-666666666666'`)
await expectOk('chiusura a silenzio-conferma dopo 5 giorni', `
  update orders set status='completed', completed_at=now(), last_actor='n8n'
   where id='66666666-6666-6666-6666-666666666666'`)

console.log('\n== Ordine All Inclusive ==')
await expectOk('assegnazione agenzia e definizione', `
  update orders set agency_id='33333333-3333-3333-3333-333333333333',
         status='in_definition', last_actor='team'
   where id='77777777-7777-7777-7777-777777777777'`)
await expectFail('proposta all\'agenzia senza documento', `
  update orders set status='proposal_pending_agency', proposal_price_cents=450000, last_actor='td'
   where id='77777777-7777-7777-7777-777777777777'`, 'senza documento')
await expectOk('proposta all\'agenzia con documento e prezzo', `
  insert into order_files (order_id, kind, storage_path, filename)
  values ('77777777-7777-7777-7777-777777777777','proposal_document','order-documents/77/prop.pdf','proposta.pdf');
  update orders set status='proposal_pending_agency', proposal_price_cents=450000,
         total_price_cents=450000, deposit_cents=135000, balance_cents=315000,
         departure_date=current_date + 90, last_actor='td'
   where id='77777777-7777-7777-7777-777777777777'`)
await expectOk('agenzia conferma → acconto', `
  update orders set status='awaiting_deposit', agency_confirmed_at=now(), last_actor='agency'
   where id='77777777-7777-7777-7777-777777777777'`)
await expectOk('acconto sul conto Stripe dell\'agenzia', `
  insert into payments (order_id, kind, status, amount_cents, stripe_account, agency_id, paid_at)
  values ('77777777-7777-7777-7777-777777777777','deposit','paid',135000,'agency',
          '33333333-3333-3333-3333-333333333333', now())`)
await expectFail('incasso su conto agenzia senza agenzia', `
  insert into payments (order_id, kind, amount_cents, stripe_account)
  values ('77777777-7777-7777-7777-777777777777','balance',315000,'agency')`, 'agency_required')
await expectFail('revisione su un All Inclusive (non prevista)', `
  update orders set status='revision_requested' where id='77777777-7777-7777-7777-777777777777'`, 'non ammessa')
await expectOk('disputa da qualunque stato', `
  update orders set status='disputed', dispute_note='test', last_actor='team'
   where id='77777777-7777-7777-7777-777777777777'`)
await expectOk('uscita dalla disputa decisa dal team', `
  update orders set status='awaiting_deposit', last_actor='team'
   where id='77777777-7777-7777-7777-777777777777'`)

console.log('\n== Token ==')
await expectOk('token pagina ordine del TD', `
  insert into access_tokens (purpose, audience, order_id, td_id)
  values ('td_order_page','td','66666666-6666-6666-6666-666666666666',
          '11111111-1111-1111-1111-111111111111')`)
{
  const t = (await q(`select token, length(token) as len from access_tokens limit 1`)).rows[0]
  t.len === 32 && !/[+/=]/.test(t.token) ? ok('token url-safe di 32 caratteri') : fail('token: ' + t.token)
  const r = (await q(`select purpose, order_id from resolve_access_token($1)`, [t.token])).rows
  r.length === 1 ? ok('resolve_access_token risolve un token valido') : fail('resolve: ' + JSON.stringify(r))
  const bad = (await q(`select * from resolve_access_token('token-inesistente')`)).rows
  bad.length === 0 ? ok('resolve_access_token rifiuta un token inesistente') : fail('token falso accettato')
  await db.exec(`update access_tokens set revoked_at = now() where token = '${t.token}'`)
  const rev = (await q(`select * from resolve_access_token($1)`, [t.token])).rows
  rev.length === 0 ? ok('resolve_access_token rifiuta un token revocato') : fail('token revocato accettato')
}
await expectFail('due token attivi per lo stesso scopo', `
  insert into access_tokens (purpose, audience, order_id)
  values ('td_order_page','td','77777777-7777-7777-7777-777777777777');
  insert into access_tokens (purpose, audience, order_id)
  values ('td_order_page','td','77777777-7777-7777-7777-777777777777')`, 'one_active_per_purpose')

console.log('\n== Recensioni ==')
await expectOk('recensione della consulenza', `
  insert into reviews (kind, traveler_id, td_id, booking_id, rating_overall, rating_a, rating_b,
                       body, would_recommend, display_name)
  values ('consultation','44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111',
          '55555555-5555-5555-5555-555555555555',5,5,4,'Ottima call',true,'Anna B.')`)
await expectFail('due recensioni sulla stessa call', `
  insert into reviews (kind, traveler_id, td_id, booking_id, rating_overall)
  values ('consultation','44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111',
          '55555555-5555-5555-5555-555555555555',4)`, 'one_per_booking')
await expectFail('recensione viaggio agganciata a una prenotazione', `
  insert into reviews (kind, traveler_id, td_id, booking_id, rating_overall)
  values ('trip','44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111',
          '55555555-5555-5555-5555-555555555555',4)`, 'kind_matches_source')
await expectFail('voto fuori scala', `
  insert into reviews (kind, traveler_id, td_id, order_id, rating_overall)
  values ('trip','44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111',
          '77777777-7777-7777-7777-777777777777',7)`, 'rating_overall')
{
  const s = (await q(`select reviews_count, avg_overall from td_review_stats
                       where td_id='11111111-1111-1111-1111-111111111111'`)).rows[0]
  Number(s.reviews_count) === 1 ? ok('td_review_stats aggrega (' + s.avg_overall + ')') : fail('stats: ' + JSON.stringify(s))
  const p = (await q(`select count(*) from public_reviews`)).rows[0]
  Number(p.count) === 1 ? ok('public_reviews espone solo le recensioni pubblicate') : fail('public_reviews')
}

console.log('\n== Idempotenza dei webhook e dei messaggi ==')
await expectOk('webhook registrato', `
  insert into webhook_events (provider, external_id, event_type, payload)
  values ('cal','evt_1','BOOKING_CREATED','{}')`)
await expectFail('stesso webhook due volte', `
  insert into webhook_events (provider, external_id, event_type, payload)
  values ('cal','evt_1','BOOKING_CREATED','{}')`, 'unique')
await expectOk('mail buon viaggio registrata', `
  insert into outbound_messages (message_kind, entity_type, entity_id, recipient)
  values ('bon_voyage','order','77777777-7777-7777-7777-777777777777','viaggiatore@example.com')`)
await expectFail('timer che rigira e rimanda la stessa mail', `
  insert into outbound_messages (message_kind, entity_type, entity_id, recipient)
  values ('bon_voyage','order','77777777-7777-7777-7777-777777777777','viaggiatore@example.com')`, 'unique')

console.log('\n== Superficie pubblica ==')
{
  const rows = (await q(`
    select c.relname, c.relkind
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relkind in ('r','v')
       and has_table_privilege('anon', c.oid, 'SELECT')
     order by 1`)).rows
  const leaked = rows.filter(r => r.relkind === 'r')
  leaked.length === 0
    ? ok('anon non legge nessuna tabella direttamente')
    : fail('tabelle leggibili da anon: ' + leaked.map(r => r.relname).join(', '))
  const views = rows.filter(r => r.relkind === 'v').map(r => r.relname)
  const expected = ['geo_search','public_config','public_quiz_axes','public_reviews','public_tags','public_td_showcase']
  JSON.stringify(views.sort()) === JSON.stringify(expected)
    ? ok('anon legge solo le 6 viste pubbliche')
    : fail('viste esposte: ' + JSON.stringify(views))

  // Nessuna vista pubblica deve nominare i valori degli assi o il livello dei paesi.
  const defs = (await q(`
    select c.relname, pg_get_viewdef(c.oid) as def
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relkind='v'
       and has_table_privilege('anon', c.oid, 'SELECT')`)).rows;
  // Nota: geo_search ha una colonna `level` che è il livello della gerarchia
  // geografica (città/regione/paese), non il livello di copertura di un TD.
  const leaks = defs.filter(v =>
    /td_axis_values/.test(v.def)
    || (/td_countries/.test(v.def) && /\blevel\b/.test(v.def))
    || (/app_config/.test(v.def) && v.relname !== 'public_config'));
  leaks.length === 0
    ? ok('nessuna vista pubblica tocca assi, livelli di copertura o parametri di matching')
    : fail('viste che perdono informazione: ' + leaks.map(v => v.relname).join(', '));

  const cfgGroups = (await q(`select distinct config_group from public_config`)).rows.map(r => r.config_group);
  JSON.stringify(cfgGroups) === JSON.stringify(['booking_rules'])
    ? ok('public_config espone solo le regole di prenotazione, non i pesi del match')
    : fail('gruppi in public_config: ' + JSON.stringify(cfgGroups));

  const axCols = (await q(`select column_name from information_schema.columns
                            where table_name='public_quiz_axes'`)).rows.map(r => r.column_name);
  !axCols.includes('weight')
    ? ok('public_quiz_axes non espone più i pesi')
    : fail('public_quiz_axes espone weight');

  const authRows = (await q(`
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname='public' and c.relkind='r'
       and has_table_privilege('authenticated', c.oid, 'SELECT')
     order by 1`)).rows.map(r => r.relname);
  JSON.stringify(authRows) === JSON.stringify(['travelers'])
    ? ok('l\'utente loggato non legge nessuna tabella oltre la propria riga travelers')
    : fail('tabelle leggibili da authenticated: ' + JSON.stringify(authRows));

  const myCols = (await q(`select column_name from information_schema.columns
                            where table_name='my_bookings'`)).rows.map(r => r.column_name);
  !myCols.includes('cal_booking_uid')
    ? ok('my_bookings non contiene cal_booking_uid (dopo S-05 è una credenziale)')
    : fail('my_bookings espone cal_booking_uid');

  const policies = (await q(`
    select tablename, policyname from pg_policies where schemaname='public' order by 1,2`)).rows;
  policies.length === 2
    ? ok('2 policy, entrambe sulla riga travelers dell\'utente')
    : fail('policy: ' + JSON.stringify(policies));

  const rls = (await q(`
    select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`)).rows[0]
  Number(rls.count) === 0 ? ok('RLS accesa su tutte le tabelle') : fail(Number(rls.count) + ' tabelle senza RLS')
}

console.log('\n== Plausibilità e blocco alla pubblicazione ==')
{
  const r = (await q(`select * from td_publish_readiness where slug='marco-rossi'`)).rows[0]
  r.can_publish === true && Number(r.level1_count) === 2 && Number(r.axes_declared) === 6
    ? ok('marco-rossi pubblicabile (2 paesi di livello 1, 6 assi)')
    : fail('readiness: ' + JSON.stringify(r))
}
await expectOk('TD creato in draft', `
  insert into travel_designers (id, slug, status, display_name, email, bio, photo_url, cal_username)
  values ('88888888-8888-8888-8888-888888888888','td-incompleto','draft','TD Incompleto',
          'x@example.com','Bio lunga abbastanza da superare il controllo di completezza del profilo.',
          'https://example.com/x.jpg','td-incompleto-xpetis')`)
await expectFail('pubblicazione di un profilo senza paesi né assi', `
  update travel_designers set status='published'
   where id='88888888-8888-8888-8888-888888888888'`, 'non pubblicabile')
await expectOk('paesi e assi caricati, ma tutti di livello 2', `
  insert into td_countries (td_id, country_code, level) values
    ('88888888-8888-8888-8888-888888888888','tanzania',2),
    ('88888888-8888-8888-8888-888888888888','cambogia',2);
  insert into td_axis_values (td_id, axis_code, value)
  select '88888888-8888-8888-8888-888888888888', code, 2 from quiz_axes;
  insert into td_services (td_id, service_type, is_active, price_cents, duration_minutes,
                           cal_event_type_slug, stripe_payment_link_url)
  values ('88888888-8888-8888-8888-888888888888','consultation',true,5000,30,
          'consulenza-xpetis-30','https://buy.stripe.com/test_x')`)
await expectFail('il profilo "tutto livello 2" non si pubblica', `
  update travel_designers set status='published'
   where id='88888888-8888-8888-8888-888888888888'`, 'livello 1')
{
  const r = (await q(`select blockers, warnings from td_publish_readiness
                       where slug='td-incompleto'`)).rows[0]
  r.blockers.some(b => b.includes('livello 1'))
    ? ok('il motivo del blocco è scritto: ' + r.blockers.find(b => b.includes('livello 1')))
    : fail('blockers: ' + JSON.stringify(r.blockers))
  r.warnings.some(w => w.includes('contesto')) && r.warnings.some(w => w.includes('tema'))
    ? ok('segnalati anche i paesi senza tema e senza contesto')
    : fail('warnings: ' + JSON.stringify(r.warnings))
}
await expectOk('promosso un paese a livello 1: ora si pubblica', `
  update td_countries set level = 1
   where td_id='88888888-8888-8888-8888-888888888888' and country_code='tanzania';
  update travel_designers set status='published'
   where id='88888888-8888-8888-8888-888888888888'`)

console.log(failures === 0 ? '\nTutto verde.\n' : `\n${failures} asserzioni fallite.\n`)
process.exit(failures === 0 ? 0 : 1)
