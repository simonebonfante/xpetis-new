// Harness di verifica dello schema: applica tutte le migration e i seed su un
// Postgres 17 in-process (PGlite) e poi esegue una serie di asserzioni.
// Uso: node supabase/tests/run.mjs
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const db = await PGlite.create({ extensions: { pg_trgm, pgcrypto, unaccent } })

// La parola segreta con cui Cal.com firma i webhook. Nel repo non c'è e non ci
// deve stare: si legge dall'ambiente, o da `.env.local` che non è versionato.
// Se manca, il ponte si prova comunque con una parola inventata — cambia solo
// che le firme VERE registrate nelle fixture non si possono verificare, e il
// test lo dice invece di tacerlo.
const leggiSegretoCalcom = () => {
  if (process.env.CALCOM_WEBHOOK_SECRET) return { valore: process.env.CALCOM_WEBHOOK_SECRET, vero: true }
  const env = path.join(root, '..', '.env.local')
  if (existsSync(env)) {
    const riga = readFileSync(env, 'utf8').split('\n')
      .find(r => r.startsWith('CALCOM_WEBHOOK_SECRET='))
    if (riga) {
      const v = riga.slice('CALCOM_WEBHOOK_SECRET='.length).trim().replace(/^["']|["']$/g, '')
      if (v) return { valore: v, vero: true }
    }
  }
  return { valore: 'parola-segreta-finta-per-l-harness', vero: false }
}
const segretoCalcom = leggiSegretoCalcom()

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

  -- Supabase Vault: su un progetto vero lo schema c'è già, qui si simula come
  -- auth.users. La 0037 legge la parola segreta di Cal.com da questa vista.
  create schema vault;
  create table vault.decrypted_secrets (
    id uuid primary key default gen_random_uuid(),
    name text unique,
    description text,
    decrypted_secret text
  );
`)
await db.query(
  `insert into vault.decrypted_secrets (name, decrypted_secret) values ('calcom_webhook_secret', $1)`,
  [segretoCalcom.valore])

// Lo signing secret di Stripe. Qui, a differenza di Cal.com, una parola
// inventata basta e non toglie niente: le fixture Stripe **non portano una firma
// vera** — la sessione è stata creata e fatta scadere via API, senza passare da
// un endpoint webhook, quindi non c'è nessun `Stripe-Signature` autentico da
// riprodurre. Quello che l'harness verifica è l'algoritmo (HMAC su
// `"<t>.<corpo>"`, tolleranza, più `v1` durante una rotazione), e per quello la
// parola segreta può essere qualunque cosa purché le due parti la condividano.
const SEGRETO_STRIPE = 'whsec_parola_segreta_finta_per_l_harness'
await db.query(
  `insert into vault.decrypted_secrets (name, decrypted_secret) values ('stripe_webhook_secret', $1)`,
  [SEGRETO_STRIPE])

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
// Il Payment Link non è più fra i requisiti (0038): la deviazione 1 dice che la
// cassa la apre il nostro server, e pretenderlo avrebbe voluto dire far
// inventare 25 URL finte per pubblicare 25 profili. Restano le tre condizioni
// che contano — senza prezzo la cassa non si apre, senza durata ed event type la
// prenotazione non nasce.
await expectOk('consulenza attiva senza Payment Link: ora si può', `
  insert into td_services (td_id, service_type, is_active, price_cents, duration_minutes, cal_event_type_slug)
  values ('11111111-1111-1111-1111-111111111111','consultation_deep',true,9000,45,'x')`)
await expectFail('consulenza attiva senza prezzo', `
  insert into td_services (td_id, service_type, is_active, duration_minutes, cal_event_type_slug)
  values ('22222222-2222-2222-2222-222222222222','consultation_deep',true,45,'x')`, 'bookable_complete')
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
// Le posizioni 1-4 le occupa il seed di vetrina: le prove usano posizioni alte,
// così restano indipendenti da quanto contenuto ha il seed.
await expectOk('punti del box consulenza, ordinati', `
  insert into td_service_bullets (service_id, position, text_it)
  select id, 91, 'Analisi del tuo stile di viaggio' from td_services
   where td_id='11111111-1111-1111-1111-111111111111' and service_type='consultation'`)
await expectFail('due punti nella stessa posizione', `
  insert into td_service_bullets (service_id, position, text_it)
  select id, 91, 'Doppione' from td_services
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
  values ('aaaaaaa1-0000-0000-0000-000000000001','${MARCO}',91,
          'Australia, il richiamo dell''infinito','È l''alba sull''oceano.');
  insert into td_signature_trip_images (trip_id, position, storage_path) values
    ('aaaaaaa1-0000-0000-0000-000000000001',1,'td-media/marco/viaggio-1-foto-1.jpg'),
    ('aaaaaaa1-0000-0000-0000-000000000001',2,'td-media/marco/viaggio-1-foto-2.jpg'),
    ('aaaaaaa1-0000-0000-0000-000000000001',3,'td-media/marco/viaggio-1-foto-3.jpg')`)
await expectFail('viaggio con titolo vuoto (le righe vuote del form)', `
  insert into td_signature_trips (td_id, position, title)
  values ('${MARCO}', 92, '   ')`, 'title')
await expectFail('due viaggi nella stessa posizione', `
  insert into td_signature_trips (td_id, position, title)
  values ('${MARCO}', 91, 'Doppione')`, 'unique')
await expectOk('itinerari pronti con etichette di durata e prezzo', `
  insert into td_ready_itineraries (td_id, position, title, duration_label, price_label, image_path)
  values ('${MARCO}',91,'Bosnia 360 On the Road','5-7 giorni','850€','td-media/marco/itinerario-1.jpg'),
         ('${MARCO}',92,'Vietnam del nord','12 giorni','1.380€',null)`)
{
  // Le asserzioni cercano per titolo e non per conteggio: il seed di vetrina
  // popola le stesse tabelle, e un test che conta le righe si romperebbe ogni
  // volta che qualcuno aggiunge contenuto ai due designer finti.
  const v = (await q(`select signature_trips, ready_itineraries, services, hero_bio
                        from public_td_showcase where slug='marco-rossi'`)).rows[0]
  const viaggio = v.signature_trips.find(t => t.title.startsWith('Australia'))
  viaggio?.images.length === 3 && viaggio.images[0].endsWith('foto-1.jpg')
    ? ok('la vetrina pubblica serve il viaggio firma con le sue foto in ordine')
    : fail('signature_trips: ' + JSON.stringify(v.signature_trips))
  v.ready_itineraries.find(i => i.title === 'Bosnia 360 On the Road')?.price_label === '850€'
    ? ok('itinerari pronti con il prezzo come lo scrive il designer')
    : fail('ready_itineraries: ' + JSON.stringify(v.ready_itineraries))
  // I viaggi firma escono in ordine di `position`, non di inserimento.
  v.signature_trips[0].title.startsWith('Ha Giang')
    ? ok('i viaggi firma escono ordinati per posizione')
    : fail('ordine dei viaggi firma: ' + v.signature_trips.map(t => t.title).join(' | '))
  const cons = v.services.find(x => x.service_type === 'consultation')
  cons.bullets.includes('Analisi del tuo stile di viaggio')
    ? ok('i punti del box consulenza arrivano nella vetrina')
    : fail('bullets: ' + JSON.stringify(cons))
  v.hero_bio === 'Paragrafo di apertura della vetrina.'
    ? ok('i campi di profilo del form sono esposti') : fail('hero_bio: ' + v.hero_bio)
}

console.log('\n== Lo slug degli itinerari pronti (0033) ==')
const GIULIA = '22222222-2222-2222-2222-222222222222'
await expectOk('itinerario con titolo accentato e punteggiatura', `
  insert into td_ready_itineraries (td_id, position, title)
  values ('${MARCO}', 93, 'Perù & Bolivia: l''altopiano più alto')`)
{
  const r = (await q(`select slug from td_ready_itineraries
                       where td_id='${MARCO}' and position=93`)).rows[0]
  r.slug === 'peru-bolivia-l-altopiano-piu-alto'
    ? ok('lo slug nasce dal titolo, senza accenti né maiuscole: ' + r.slug)
    : fail('slug generato: ' + r.slug)
}
await expectOk('due itinerari con lo stesso titolo, stesso designer', `
  insert into td_ready_itineraries (td_id, position, title)
  values ('${MARCO}', 94, 'Perù & Bolivia: l''altopiano più alto')`)
{
  const r = (await q(`select slug from td_ready_itineraries
                       where td_id='${MARCO}' and position=94`)).rows[0]
  r.slug === 'peru-bolivia-l-altopiano-piu-alto-2'
    ? ok('la collisione dentro lo stesso designer prende il suffisso: ' + r.slug)
    : fail('slug della collisione: ' + r.slug)
}
await expectOk('lo stesso slug su un altro designer non collide', `
  insert into td_ready_itineraries (td_id, position, title)
  values ('${GIULIA}', 93, 'Perù & Bolivia: l''altopiano più alto')`)
{
  const r = (await q(`select slug from td_ready_itineraries
                       where td_id='${GIULIA}' and position=93`)).rows[0]
  r.slug === 'peru-bolivia-l-altopiano-piu-alto'
    ? ok("l'unicità è per designer, non globale")
    : fail('slug del secondo designer: ' + r.slug)
}
// **La proprietà che conta**: l'indirizzo non si muove quando il titolo cambia.
await expectOk('correggere il titolo non muove lo slug', `
  update td_ready_itineraries set title = 'Perù e Bolivia, l''altopiano'
   where td_id='${MARCO}' and position=93`)
{
  const r = (await q(`select slug, title from td_ready_itineraries
                       where td_id='${MARCO}' and position=93`)).rows[0]
  r.slug === 'peru-bolivia-l-altopiano-piu-alto' && r.title.startsWith('Perù e Bolivia')
    ? ok('titolo corretto, slug immobile: il link già dato resta valido')
    : fail(`slug=${r.slug} titolo=${r.title}`)
}
// E nemmeno un riordino lo muove: è il punto per cui `position` non bastava.
await expectOk('riordinare gli itinerari non muove gli slug', `
  update td_ready_itineraries set position = 96 where td_id='${MARCO}' and position=93`)
{
  const r = (await q(`select slug from td_ready_itineraries
                       where td_id='${MARCO}' and position=96`)).rows[0]
  r.slug === 'peru-bolivia-l-altopiano-piu-alto'
    ? ok('riordinato: lo slug è lo stesso')
    : fail('slug dopo il riordino: ' + r.slug)
}
await expectOk('uno slug scritto a mano si rispetta', `
  insert into td_ready_itineraries (td_id, position, title, slug)
  values ('${MARCO}', 95, 'Un titolo qualunque', 'giappone-in-primavera')`)
{
  const r = (await q(`select slug from td_ready_itineraries
                       where td_id='${MARCO}' and position=95`)).rows[0]
  r.slug === 'giappone-in-primavera'
    ? ok('lo slug esplicito non viene riscritto dal trigger')
    : fail('slug esplicito: ' + r.slug)
}
await expectFail('due slug identici sullo stesso designer', `
  insert into td_ready_itineraries (td_id, position, title, slug)
  values ('${MARCO}', 97, 'Doppione', 'giappone-in-primavera')`, 'unique')
{
  const it = (await q(`select ready_itineraries from public_td_showcase
                        where slug='marco-rossi'`)).rows[0].ready_itineraries
  it.every(x => typeof x.slug === 'string' && x.slug.length > 0)
    ? ok('la vetrina pubblica serve lo slug di ogni itinerario')
    : fail('itinerari senza slug: ' + JSON.stringify(it))
}
{
  // Il seed vero: gli slug dei tre itinerari di Marco sono leggibili. È la
  // ragione per cui non abbiamo scelto l'uuid.
  const r = (await q(`select slug from td_ready_itineraries
                       where td_id='${MARCO}' and position=1`)).rows[0]
  r.slug === 'vietnam-del-nord-hanoi-ninh-binh-ha-giang'
    ? ok('gli slug del seed si leggono: ' + r.slug)
    : fail('slug del seed: ' + r.slug)
}

console.log('\n== Maschera contestuale dei filtri (0036) ==')
{
  // Nel seed Giulia dichiara 'deserto' sulla Bolivia e 'montagna' sul Perù,
  // nessuno dichiara 'mare_isole' là: è l'esempio del Flusso, alla lettera.
  const bolivia = (await q(`select code from tags_for_destination('country','bolivia')`))
    .rows.map(r => r.code)
  bolivia.includes('deserto') && !bolivia.includes('mare_isole')
    ? ok('sulla Bolivia si mostra "deserto" e non "mare": ' + bolivia.join(', '))
    : fail('tag sulla Bolivia: ' + JSON.stringify(bolivia))
  const thailandia = (await q(`select code from tags_for_destination('country','thailandia')`))
    .rows.map(r => r.code)
  thailandia.includes('mare_isole')
    ? ok('sulla Thailandia il mare c\'è')
    : fail('tag sulla Thailandia: ' + JSON.stringify(thailandia))
}
{
  // Con una macro-area si guardano tutti i suoi paesi: Perù e Bolivia stanno
  // entrambi in Sud America, quindi l'unione porta montagna e deserto.
  const area = (await q(`select code from tags_for_destination('macro_area','sud_america')`))
    .rows.map(r => r.code)
  area.includes('montagna') && area.includes('deserto')
    ? ok('la macro-area unisce i tag dei suoi paesi: ' + area.join(', '))
    : fail('tag su sud_america: ' + JSON.stringify(area))
}
{
  const tutti = (await q(`select code from tags_for_destination()`)).rows.map(r => r.code)
  const quanti = (await q(`select count(*)::int as n from tags`)).rows[0].n
  tutti.length === quanti
    ? ok(`senza destinazione nessuna maschera: tutti i ${quanti} tag`)
    : fail(`senza destinazione: ${tutti.length} tag su ${quanti}`)
}
await expectFail('una città non può mascherare i filtri',
  `select * from tags_for_destination('city','lima')`, 'non filtrabile')
await expectFail('nemmeno un continente',
  `select * from tags_for_destination('continent','sud_america')`, 'non filtrabile')
await expectFail('una destinazione inesistente non torna vuota: solleva',
  `select * from tags_for_destination('country','atlantide')`, 'inesistente')
{
  // Un tag che esiste solo su una bozza non deve comparire: cliccarlo darebbe
  // zero risultati, che è il difetto da togliere.
  await expectOk('un designer in bozza che dichiara "mare" sulla Bolivia', `
    insert into travel_designers (id, slug, display_name, email, status, cal_username)
    values ('99999999-9999-9999-9999-999999999999','td-bozza','TD Bozza',
            'bozza@example.com','draft','td-bozza');
    insert into td_countries (td_id, country_code, level)
    values ('99999999-9999-9999-9999-999999999999','bolivia',1);
    insert into td_destination_tags (td_id, country_code, tag_code)
    values ('99999999-9999-9999-9999-999999999999','bolivia','mare_isole')`)
  const bolivia = (await q(`select code from tags_for_destination('country','bolivia')`))
    .rows.map(r => r.code)
  !bolivia.includes('mare_isole')
    ? ok('un tag dichiarato solo da una bozza non entra nella maschera')
    : fail('la bozza ha inquinato la maschera: ' + JSON.stringify(bolivia))
}
{
  const priv = (await q(`select has_function_privilege('anon',
      'tags_for_destination(text,text)', 'EXECUTE') as si`)).rows[0]
  const tabella = (await q(`select has_table_privilege('anon','td_destination_tags','SELECT') as si`)).rows[0]
  priv.si && !tabella.si
    ? ok('anon chiama la funzione ma non legge td_destination_tags')
    : fail(`execute=${priv.si} select_tabella=${tabella.si}`)
}

console.log('\n== Ricerca accento-insensibile (0035) ==')
{
  const r = (await q(`select name_it, level from geo_search
                       where name_norm like '%peru%' and level='country'`)).rows
  r.some(x => x.name_it === 'Perù')
    ? ok('"peru" trova "Perù" (era il difetto)')
    : fail('cercando "peru" fra i paesi: ' + JSON.stringify(r))
}
{
  // Solo le tabelle: `geo_search` ha la stessa colonna ma è una vista, e una
  // vista non ha colonne generate.
  const gen = (await q(`select c.table_name, c.is_generated
                          from information_schema.columns c
                          join information_schema.tables t
                            on t.table_schema = c.table_schema and t.table_name = c.table_name
                         where c.column_name='name_norm' and c.table_schema='public'
                           and t.table_type='BASE TABLE'
                         order by c.table_name`)).rows
  gen.length === 5 && gen.every(c => c.is_generated === 'ALWAYS')
    ? ok('name_norm è una colonna generata su tutte e cinque le tabelle geo')
    : fail('colonne name_norm: ' + JSON.stringify(gen))
}
await expectOk('correggere un nome aggiorna il normalizzato nello stesso statement', `
  update geo_countries set name_it = 'Perù Prova' where code='peru'`)
{
  const r = (await q(`select name_norm from geo_countries where code='peru'`)).rows[0]
  r.name_norm === 'peru prova'
    ? ok('la colonna generata segue il nome: nessun trigger da ricordarsi')
    : fail('name_norm dopo la modifica: ' + r.name_norm)
  await db.exec(`update geo_countries set name_it = 'Perù' where code='peru'`)
}
{
  const idx = (await q(`select indexname from pg_indexes where schemaname='public'
                         and indexname in ('geo_countries_norm_trgm','geo_regions_norm_trgm',
                                           'geo_cities_norm_trgm')`)).rows
  idx.length === 3
    ? ok('i tre indici trigramma sulle tabelle grosse esistono')
    : fail('indici trovati: ' + JSON.stringify(idx.map(i => i.indexname)))
}
{
  // **La proprietà che il codice da solo non garantisce.** Il pattern lo
  // normalizza il browser (`normalizzaRicerca` in lib/geo.ts), la colonna la
  // normalizza Postgres con `unaccent`: sono due implementazioni, e devono
  // essere d'accordo. Qui si verifica su tutta la tassonomia vera che il nome
  // di ogni riga, normalizzato dal lato browser, si trovi dentro il
  // normalizzato dal lato database — cioè che scrivendo il nome per intero si
  // trovi la riga.
  //
  // Questa è una **copia** di normalizzaRicerca: è il termine di confronto del
  // test, non una seconda verità. Se cambia là, cambiala qui — è esattamente
  // ciò che questo test serve a scoprire.
  const senzaSegno = { 'ø':'o','ð':'d','ł':'l','ı':'i','đ':'d','æ':'ae','œ':'oe',
                       'ß':'ss','þ':'th','ħ':'h','ŋ':'n','ŧ':'t','ĸ':'q','ſ':'s','ɛ':'e' }
  const normalizza = (t) => t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[øðłıđæœßþħŋŧĸſɛ]/g, (c) => senzaSegno[c] ?? c)
    .replace(/[%_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const righe = (await q(`
    select name_it, name_norm from geo_continents
    union all select name_it, name_norm from geo_macro_areas
    union all select name_it, name_norm from geo_countries
    union all select name_it, name_norm from geo_regions
    union all select name_it, name_norm from geo_cities`)).rows
  const perse = righe.filter(r => !r.name_norm.includes(normalizza(r.name_it)))
  righe.length > 1500 && perse.length === 0
    ? ok(`browser e database normalizzano allo stesso modo su ${righe.length} nomi veri`)
    : fail(`nomi su cui le due normalizzazioni divergono (${perse.length} su ${righe.length}): `
           + JSON.stringify(perse.slice(0, 5)))
}

console.log('\n== Parametri di testo in app_config (0034) ==')
await expectOk('una riga di testo si inserisce', `
  insert into app_config (key, value, value_text, config_group, label_it)
  values ('prova_testo', null, 'un testo', 'showcase', 'Riga di prova')`)
await expectFail('una riga con numero e testo insieme', `
  insert into app_config (key, value, value_text, config_group, label_it)
  values ('prova_doppia', 1, 'e anche testo', 'showcase', 'Riga di prova')`, 'app_config_value_xor')
await expectFail('una riga senza né numero né testo', `
  insert into app_config (key, value, value_text, config_group, label_it)
  values ('prova_vuota', null, null, 'showcase', 'Riga di prova')`, 'app_config_value_xor')
{
  const r = (await q(`select value, value_text from public_config
                       where key='ready_itinerary_price_note'`)).rows[0]
  r && r.value === null && r.value_text.includes('IVA')
    ? ok('la nota del prezzo arriva al sito: ' + r.value_text)
    : fail('nota del prezzo: ' + JSON.stringify(r))
}
// **La regressione da escludere**: `match_designers` legge `app_config` con
// `max(value)`, e ora in quella tabella ci sono righe con `value` nullo. Se le
// aggregazioni si rompessero, il match tornerebbe senza punteggi e nessuno se ne
// accorgerebbe leggendo il codice.
{
  const r = (await q(`select count(*)::int as n from match_designers(null, null, null, null, null, 10, 0)`)).rows[0]
  r.n > 0
    ? ok('il match regge le righe di configurazione senza numero')
    : fail('match_designers non restituisce più niente')
}
await expectOk('pulizia delle righe di prova', `delete from app_config where key='prova_testo'`)

console.log('\n== Recensioni portate da fuori ==')
await expectOk('recensione esterna caricata', `
  insert into td_showcase_reviews (td_id, position, title, author_name, stars, date_label, body)
  values ('${MARCO}',91,'Isole Lofoten','Nico',5,'Febbraio 2026',
          'Il viaggio più entusiasmante che abbia mai fatto.')`)
await expectFail('recensione esterna senza autore', `
  insert into td_showcase_reviews (td_id, position, author_name, stars, body)
  values ('${MARCO}', 92, '  ', 5, 'testo')`, 'author_name')
{
  const r = (await q(`select is_published from td_showcase_reviews
                       where td_id='${MARCO}' and author_name='Nico'`)).rows[0]
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

  // ------------------------------------------------ l'embed Cal.com (0040)
  // L'embed vive nel browser e senza queste due stringhe non si apre. Ciò che
  // resta fuori è quello che conta: `cal_booking_uid`, che dopo S-05 è una
  // credenziale di cancellazione.
  {
    const cols = (await q(`select column_name from information_schema.columns
                            where table_name='public_td_showcase'`)).rows.map(r => r.column_name);
    cols.includes('cal_username')
      ? ok('public_td_showcase espone cal_username: senza, l\'embed non ha un link da aprire')
      : fail('public_td_showcase senza cal_username: ' + JSON.stringify(cols));

    const def = (await q(`select pg_get_viewdef('public_td_showcase'::regclass) as d`)).rows[0].d;
    !/cal_booking_uid/.test(def)
      ? ok('e continua a NON nominare cal_booking_uid, nemmeno dentro il jsonb')
      : fail('public_td_showcase nomina cal_booking_uid');

    const srv = (await q(`
      select jsonb_path_query_first(services, '$[*] ? (@.service_type == "consultation")') as s
        from public_td_showcase where slug = 'marco-rossi'`)).rows[0].s;
    srv && srv.cal_event_type_slug === 'consulenza-xpetis-30'
      ? ok('lo slug dell\'event type arriva dentro ogni servizio, non sul designer')
      : fail('cal_event_type_slug nel servizio: ' + JSON.stringify(srv));

    // `create or replace view` conserva i privilegi; un `drop` + `create` li
    // avrebbe portati via e la vetrina sarebbe smessa di funzionare per `anon`.
    const leggibile = (await q(
      `select has_table_privilege('anon', 'public_td_showcase', 'SELECT') as v`)).rows[0].v;
    leggibile === true
      ? ok('il grant della 0028 è sopravvissuto al create or replace della 0040')
      : fail('anon non legge più public_td_showcase');
  }

  // `distinct` non promette un ordine: si ordina qui, altrimenti il test passa
  // o fallisce a seconda del piano di esecuzione.
  const cfgGroups = (await q(`select distinct config_group from public_config`))
    .rows.map(r => r.config_group).sort();
  JSON.stringify(cfgGroups) === JSON.stringify(['booking_rules', 'showcase'])
    ? ok('public_config espone regole di prenotazione e stringhe di vetrina, non i pesi del match')
    : fail('gruppi in public_config: ' + JSON.stringify(cfgGroups));
  // La porta chiusa dalla 0018 resta chiusa: è l'asserzione che conta.
  !cfgGroups.includes('matching')
    ? ok('i pesi e le soglie del matching non sono sulla superficie pubblica')
    : fail('public_config espone il gruppo matching');

  // Il numero WhatsApp NON deve uscire da `public_config`. Oggi è il cellulare
  // personale di Simone, prestato in attesa di un numero dedicato, e
  // `public_config` è leggibile da chiunque senza nemmeno una sessione: i
  // raccoglitori di contatti lo indicizzerebbero, e da lì non si torna indietro
  // cambiando una riga. Le pagine lo leggono lato server con `leggiContatto()`.
  // Quando arriverà un numero aziendale, questa asserzione si toglie apposta.
  {
    const pubblico = Number((await q(
      `select count(*) from public_config where key = 'whatsapp_number'`)).rows[0].count);
    const esiste = Number((await q(
      `select count(*) from app_config where key = 'whatsapp_number' and config_group = 'contacts'`)).rows[0].count);
    pubblico === 0 && esiste === 1
      ? ok('il numero WhatsApp esiste in app_config ma non esce da public_config')
      : fail(`whatsapp_number: ${pubblico} righe pubbliche, ${esiste} nel gruppo contacts`);
  }

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

// ===========================================================================
// Il ponte Cal.com → bookings (migration 0037)
// ===========================================================================
// Le sette fixture sono messaggi VERI, raccolti sull'account di prova. Si
// rigiocano in sequenza perché il punto del ponte non è il singolo messaggio:
// è che la catena regga — creazione, riprogrammazioni, cancellazione — quando
// Cal.com cambia il codice della prenotazione sotto i piedi.
console.log('\n== Il ponte Cal.com → bookings ==')
{
  const fxDir = path.join(root, 'tests', 'fixtures', 'calcom')
  const fx = {}
  for (const f of readdirSync(fxDir).filter(f => f.endsWith('.json'))) {
    fx[f.replace(/^booking_|\.json$/g, '')] = JSON.parse(readFileSync(path.join(fxDir, f), 'utf8'))
  }

  // Il corpo vero, senza le due chiavi di commento (`_nota`,
  // `_headers_rilevanti`) aggiunte a mano quando le fixture sono state salvate.
  const senzaMeta = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')))
  // SCOPERTA, e vale la pena scriverla: Cal.com firma il JSON COMPATTO, e
  // `JSON.stringify` di un oggetto appena parsato riproduce quei byte esatti.
  // È il motivo per cui le firme registrate nelle fixture sono verificabili
  // davvero, invece che solo ricalcolabili.
  const grezzo = (o) => JSON.stringify(senzaMeta(o))
  const firmaDi = (raw) =>
    crypto.createHmac('sha256', segretoCalcom.valore).update(raw, 'utf8').digest('hex')

  let nVarianti = 0
  const clone = (o) => JSON.parse(JSON.stringify(o))
  // Una variante di un messaggio vero. `createdAt` cambia sempre: la chiave di
  // diario è `trigger:uid:createdAt`, e senza questo una variante passerebbe
  // per un doppio scatto del messaggio da cui deriva.
  const variante = (base, patch = {}) => {
    const b = clone(senzaMeta(base))
    b.createdAt = `2026-09-06T20:${String(nVarianti++).padStart(2, '0')}:00.000Z`
    for (const [via, val] of Object.entries(patch)) {
      const parti = via.split('.')
      let n = b
      for (const p of parti.slice(0, -1)) n = n[p]
      n[parti.at(-1)] = val
    }
    return b
  }
  // Il BOOKING_CREATED che apre una catena di riprogrammazioni non è stato
  // catturato: la raccolta delle fixture comincia dalla prima riprogrammazione.
  // Si ricostruisce dal messaggio di creazione vero sostituendo tre campi, e i
  // valori NON sono inventati: `uid` e orario di partenza sono esattamente
  // `rescheduleUid` e `rescheduleStartTime` che il messaggio di
  // riprogrammazione vero dichiara.
  const creataRicostruita = (uid, startISO, patch = {}) => variante(fx.created, {
    'payload.uid': uid,
    'payload.startTime': startISO,
    'payload.endTime': new Date(Date.parse(startISO) + 30 * 60000).toISOString(),
    'payload.metadata.videoCallUrl': `https://app.cal.com/video/${uid}`,
    ...patch,
  })

  const chiama = async (corpoObj, firma) => {
    const raw = typeof corpoObj === 'string' ? corpoObj : JSON.stringify(corpoObj)
    const r = await db.query('select calcom_webhook($1, $2) as esito', [raw, firma ?? firmaDi(raw)])
    return r.rows[0].esito
  }
  const prenotazione = async (where, params = []) =>
    (await db.query(`select * from bookings where ${where}`, params)).rows[0]
  const nAlert = async (kind) =>
    Number((await db.query('select count(*) from team_alerts where kind = $1', [kind])).rows[0].count)
  const nDiario = async () =>
    Number((await db.query("select count(*) from webhook_events where provider='cal'")).rows[0].count)

  // Il viaggiatore delle fixture: l'UUID che compare in
  // `responses.xpetis_user_id.value` in tutti e sette i messaggi.
  const VIAGGIATORE = '69a37b12-b899-47c4-9bdb-31a17d9cb986'
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'pinco.pallino@example.com', '{"full_name":"Pinco Pallino"}'::jsonb)`, [VIAGGIATORE])
  {
    const n = Number((await db.query('select count(*) from travelers where id = $1', [VIAGGIATORE])).rows[0].count)
    n === 1 ? ok('il viaggiatore delle fixture esiste (creato dal trigger sul login)')
            : fail('viaggiatore delle fixture non creato')
  }
  // Un designer con la consulenza attiva ma senza prezzo non può esistere (lo
  // vieta td_services_bookable_complete): per provare quel caso serve un
  // servizio spento, che è esattamente lo scenario reale — il team lo
  // disattiva mentre uno slot è ancora aperto su Cal.com.
  await db.exec(`
    insert into travel_designers (id, slug, status, display_name, email, cal_username)
    values ('44444444-4444-4444-4444-444444444444','td-senza-prezzo','draft','TD Senza Prezzo',
            'senzaprezzo@example.com','td-senza-prezzo-xpetis');
    insert into td_services (td_id, service_type, is_active, cal_event_type_slug)
    values ('44444444-4444-4444-4444-444444444444','consultation', false, 'consulenza-xpetis-30');`)

  // ------------------------------------------------------------------- firma
  console.log('  -- la firma --')
  if (segretoCalcom.vero) {
    let verificate = 0, saltate = []
    for (const [nome, o] of Object.entries(fx)) {
      const attesa = o._headers_rilevanti?.['x-cal-signature-256']
      if (!attesa) continue
      const r = (await db.query('select calcom_signature_ok($1, $2) as v', [grezzo(o), attesa])).rows[0].v
      r ? verificate++ : saltate.push(nome)
    }
    // `created` è l'unica che non torna, e si sa perché: la password del video
    // (un JWT) è stata sostituita prima di salvare la fixture, quindi quel
    // corpo non è più quello firmato. Lo dice il suo `_nota`.
    verificate === 6 && saltate.length === 1 && saltate[0] === 'created'
      ? ok('6 firme VERE su 7 verificate contro i byte veri (la settima ha il JWT video sostituito)')
      : fail(`firme vere verificate: ${verificate}, non verificate: ${JSON.stringify(saltate)}`)
  } else {
    ok('firme vere non verificate: CALCOM_WEBHOOK_SECRET non è nell\'ambiente (il resto del ponte si prova comunque)')
  }
  {
    const raw = grezzo(fx.created)
    const r = (await db.query('select calcom_signature_ok($1, $2) as v', [raw, firmaDi(raw)])).rows[0].v
    r === true ? ok('la firma calcolata sul corpo grezzo combacia') : fail('firma ricalcolata non combacia')
  }
  for (const [etichetta, firma] of [
    ['una firma sbagliata', 'a'.repeat(64)],
    ['una firma vuota', ''],
    ['nessuna firma', null],
  ]) {
    const r = (await db.query('select calcom_signature_ok($1, $2) as v', [grezzo(fx.created), firma])).rows[0].v
    r === false ? ok(`${etichetta} non passa`) : fail(`${etichetta} è passata`)
  }
  {
    // Anche un solo byte diverso nel corpo cambia la firma: è la ragione per
    // cui il nodo Webhook di n8n deve consegnare il corpo GREZZO e non un JSON
    // riserializzato.
    const raw = grezzo(fx.created)
    const r = (await db.query('select calcom_signature_ok($1, $2) as v',
      [raw + ' ', firmaDi(raw)])).rows[0].v
    r === false ? ok('un corpo alterato di un solo carattere non passa più') : fail('corpo alterato passato')
  }
  {
    const prima = await nDiario()
    const e = await chiama(senzaMeta(fx.created), 'b'.repeat(64))
    const dopo = await nDiario()
    e.esito === 'firma_non_valida' && e.ok === false && dopo === prima
      ? ok('firma non valida: nessuna riga nel diario, come deve essere')
      : fail(`firma non valida gestita male: ${JSON.stringify(e)}, diario ${prima}→${dopo}`)
  }

  // --------------------------------------------------------- BOOKING_CREATED
  console.log('  -- BOOKING_CREATED --')
  {
    const e = await chiama(senzaMeta(fx.created))
    if (e.esito !== 'creata') fail(`creazione: ${JSON.stringify(e)}`)
    else {
      ok('BOOKING_CREATED vero: riga creata')
      const b = await prenotazione('cal_booking_uid = $1', ['mMZAwLvZ759AUffL61hj66'])
      b.status === 'pending_payment' ? ok('nasce in pending_payment') : fail('stato: ' + b.status)
      // Nel messaggio `price` è 0 e `currency` "usd": il prezzo lo dà il
      // listino, e questa asserzione è la prova che non lo prendiamo da lì.
      Number(b.price_cents) === 6000
        ? ok('prezzo 6000 dal listino del designer, non lo 0 del messaggio')
        : fail('price_cents: ' + b.price_cents)
      b.td_id === '11111111-1111-1111-1111-111111111111'
        ? ok('designer identificato con cal_username + payload.type') : fail('td_id: ' + b.td_id)
      b.traveler_id === VIAGGIATORE
        ? ok('viaggiatore identificato da responses.xpetis_user_id.value') : fail('traveler_id: ' + b.traveler_id)
      b.cal_event_type_slug === 'consulenza-xpetis-30'
        ? ok('slug preso da payload.type') : fail('slug: ' + b.cal_event_type_slug)
      b.video_url === 'https://app.cal.com/video/mMZAwLvZ759AUffL61hj66'
        ? ok('link video da metadata.videoCallUrl') : fail('video_url: ' + b.video_url)
      +new Date(b.original_starts_at) === +new Date(b.starts_at)
        ? ok('original_starts_at uguale a starts_at alla nascita') : fail('original_starts_at diverso')
      const min = (+new Date(b.payment_deadline_at) - Date.now()) / 60000
      min > 25 && min < 31
        ? ok(`finestra di pagamento di ~30 minuti da app_config (${Math.round(min)})`)
        : fail('finestra di pagamento: ' + min)
      b.last_actor === 'traveler'
        ? ok('last_actor = traveler: lo slot l\'ha scelto lui, n8n è solo il mezzo')
        : fail('last_actor: ' + b.last_actor)
      const h = (await db.query(
        `select to_status, actor from booking_status_history where booking_id = $1`, [b.id])).rows
      h.length === 1 && h[0].to_status === 'pending_payment' && h[0].actor === 'traveler'
        ? ok('una riga di storia, attribuita al viaggiatore') : fail('storia: ' + JSON.stringify(h))
      const w = (await db.query(
        `select external_id, processed_at, error from webhook_events
          where payload -> 'payload' ->> 'uid' = 'mMZAwLvZ759AUffL61hj66'`)).rows[0]
      w.processed_at && !w.error && w.external_id.startsWith('BOOKING_CREATED:mMZAwLvZ')
        ? ok('messaggio registrato nel diario e marcato lavorato') : fail('diario: ' + JSON.stringify(w))
    }
  }
  {
    // Cal.com ritenta: gli stessi byte, la stessa chiave di diario.
    const e = await chiama(senzaMeta(fx.created))
    const n = Number((await db.query(
      `select count(*) from bookings where cal_booking_uid = 'mMZAwLvZ759AUffL61hj66'`)).rows[0].count)
    e.esito === 'duplicato' && e.ok === true && n === 1
      ? ok('doppio scatto: riconosciuto duplicato, una sola prenotazione')
      : fail(`doppio scatto: ${JSON.stringify(e)}, prenotazioni ${n}`)
  }

  // ------------------------------------------------- la catena del designer
  console.log('  -- la catena: creazione → 2 riprogrammazioni → cancellazione --')
  {
    const UID0 = 'ideSbZgh1rxn6JXSq4b4jd'   // = booking_rescheduled_1.rescheduleUid
    const UID1 = 'ovsVi7iaqqYAfx62N7bnfy'   // = booking_rescheduled_1.uid
    const UID2 = 'hXBtFar1ZUCZci4qszEbs2'   // = booking_rescheduled_2.uid = booking_cancelled.uid
    const e0 = await chiama(creataRicostruita(UID0, '2026-09-11T08:30:00.000Z'))
    e0.esito === 'creata' ? ok('anello 0: prenotazione dell\'11 settembre') : fail('anello 0: ' + JSON.stringify(e0))
    const b0 = await prenotazione('cal_booking_uid = $1', [UID0])
    // Il pagamento lo conferma il workflow Stripe: qui si simula, perché la
    // regola sulle cancellazioni cambia a seconda che i soldi siano arrivati.
    await db.query(
      `update bookings set status='confirmed', confirmed_at=now(), last_actor='n8n' where id=$1`, [b0.id])

    const e1 = await chiama(senzaMeta(fx.rescheduled_1))
    e1.esito === 'riprogrammata' && e1.booking_id === b0.id
      ? ok('1ª riprogrammazione: la riga si trova con rescheduleUid, non con uid')
      : fail('1ª riprogrammazione: ' + JSON.stringify(e1))
    let b = await prenotazione('id = $1', [b0.id])
    b.cal_booking_uid === UID1
      ? ok(`cal_booking_uid sostituito con quello nuovo (${UID1.slice(0, 8)}…)`)
      : fail('uid non sostituito: ' + b.cal_booking_uid)
    +new Date(b.starts_at) === +new Date('2026-09-14T08:00:00.000Z')
      ? ok('starts_at spostato al 14 settembre') : fail('starts_at: ' + b.starts_at)
    +new Date(b.original_starts_at) === +new Date('2026-09-11T08:30:00.000Z')
      ? ok('original_starts_at fermo all\'11: è l\'ancora dei 20 giorni') : fail('ancora mossa: ' + b.original_starts_at)
    b.reschedule_count_td === 1 && b.reschedule_count_traveler === 0
      ? ok('contatore del designer a 1 (rescheduledBy = organizer.email)')
      : fail(`contatori: td ${b.reschedule_count_td}, viaggiatore ${b.reschedule_count_traveler}`)

    const e2 = await chiama(senzaMeta(fx.rescheduled_2))
    e2.esito === 'riprogrammata' && e2.booking_id === b0.id
      ? ok('2ª riprogrammazione: trovata col codice che la 1ª aveva scritto')
      : fail('2ª riprogrammazione: ' + JSON.stringify(e2))
    b = await prenotazione('id = $1', [b0.id])
    b.cal_booking_uid === UID2 && +new Date(b.starts_at) === +new Date('2026-09-18T08:00:00.000Z')
      ? ok('la catena degli uid regge: 18 settembre, codice nuovo') : fail('anello 2: ' + JSON.stringify(b))
    +new Date(b.original_starts_at) === +new Date('2026-09-11T08:30:00.000Z')
      ? ok('original_starts_at ancora fermo dopo due riprogrammazioni') : fail('ancora mossa')
    b.reschedule_count_td === 2 ? ok('contatore del designer a 2') : fail('contatore td: ' + b.reschedule_count_td)

    // La prova vera: la cancellazione arriva col codice NUOVO. Senza la
    // sostituzione nella riprogrammazione, qui non si troverebbe niente.
    const e3 = await chiama(senzaMeta(fx.cancelled))
    e3.esito === 'cancellata' && e3.booking_id === b0.id
      ? ok('cancellazione trovata col codice nuovo: la catena ha tenuto')
      : fail('cancellazione: ' + JSON.stringify(e3))
    b = await prenotazione('id = $1', [b0.id])
    b.status === 'cancelled' && b.cancelled_by === 'td' && b.cancelled_at
      ? ok('cancellata (era pagata), per mano del designer') : fail('cancellazione: ' + JSON.stringify(b))
    b.cancel_reason === 'Dummy text canceling event'
      ? ok('motivo conservato') : fail('motivo: ' + b.cancel_reason)
    await nAlert('calcom_designer_ha_cancellato_call_pagata') === 1
      ? ok('alert critico: il designer ha cancellato una call pagata, cosa che il Flusso non ammette')
      : fail('manca l\'alert sul designer che cancella una call pagata')
    const ev = (await db.query(
      `select event from event_log where entity_type='booking' and entity_id=$1 order by id`, [b0.id])).rows
      .map(r => r.event)
    JSON.stringify(ev) === JSON.stringify(
      ['calcom_riprogrammata', 'calcom_riprogrammata', 'calcom_cancellata'])
      ? ok('il diario della prenotazione racconta i tre passaggi') : fail('event_log: ' + JSON.stringify(ev))
  }

  // ---------------------------------------------- la catena del viaggiatore
  console.log('  -- attribuzione: la stessa catena, ma per mano del viaggiatore --')
  {
    const UID0 = 'dFcnoaXSPXR7kZP6d3A7gj'  // = booking_rescheduled_by_attendee.rescheduleUid
    const UID1 = '9f1wLNY9hn3ZMxc9L8fA5f'  // = ..._by_attendee.uid = booking_cancelled_by_attendee.uid
    const e0 = await chiama(creataRicostruita(UID0, '2026-09-30T11:00:00.000Z'))
    const b0 = await prenotazione('cal_booking_uid = $1', [UID0])
    e0.esito === 'creata' ? ok('anello 0 della seconda catena') : fail('anello 0: ' + JSON.stringify(e0))

    const e1 = await chiama(senzaMeta(fx.rescheduled_by_attendee))
    let b = await prenotazione('id = $1', [b0.id])
    e1.esito === 'riprogrammata' && b.reschedule_count_traveler === 1 && b.reschedule_count_td === 0
      ? ok('rescheduledBy diverso da organizer.email: conta il viaggiatore, non il designer')
      : fail(`attribuzione riprogrammazione: ${JSON.stringify(e1)} / td ${b.reschedule_count_td} viagg ${b.reschedule_count_traveler}`)
    b.cal_booking_uid === UID1 && b.last_actor === 'traveler'
      ? ok('codice sostituito e last_actor = traveler') : fail('anello 1: ' + JSON.stringify(b))

    const e2 = await chiama(senzaMeta(fx.cancelled_by_attendee))
    b = await prenotazione('id = $1', [b0.id])
    e2.esito === 'cancellata' && b.cancelled_by === 'traveler'
      ? ok('cancelledBy diverso da organizer.email: ha cancellato il viaggiatore')
      : fail('attribuzione cancellazione: ' + JSON.stringify(e2) + ' / ' + b.cancelled_by)
    b.status === 'cancelled_unpaid'
      ? ok('non era pagata: cancelled_unpaid, niente da rimborsare') : fail('stato: ' + b.status)
    await nAlert('calcom_designer_ha_cancellato_call_pagata') === 1
      ? ok('nessun alert in più: una cancellazione del viaggiatore è routine') : fail('alert di troppo')
  }

  // ------------------------------------------------- il tasto Request reschedule
  console.log('  -- il tasto *Request reschedule* --')
  {
    const UID = 'fMQVWeV9Qvqm5NjTZm2w1E'
    await chiama(creataRicostruita(UID, '2026-09-30T11:00:00.000Z'))
    const b0 = await prenotazione('cal_booking_uid = $1', [UID])
    await db.query(`update bookings set status='confirmed', confirmed_at=now() where id=$1`, [b0.id])

    const e = await chiama(senzaMeta(fx.cancelled_request_reschedule))
    const b = await prenotazione('id = $1', [b0.id])
    e.esito === 'request_reschedule_bloccata' && b.status === 'disputed'
      ? ok('*Request reschedule* del designer: stato bloccato in disputed')
      : fail('request reschedule: ' + JSON.stringify(e) + ' / ' + b.status)
    b.dispute_note && b.dispute_note.includes('cancellazione secca')
      ? ok('scritto in tabella perché è bloccata') : fail('dispute_note: ' + b.dispute_note)
    await nAlert('calcom_request_reschedule_del_designer') === 1
      ? ok('alert critico al team: il rimborso si esegue a mano') : fail('manca l\'alert critico')
    const msg = (await db.query(
      `select message from team_alerts where kind='calcom_request_reschedule_del_designer'`)).rows[0].message
    msg.includes('ERA PAGATA')
      ? ok('l\'alert dice che c\'erano soldi dentro: è l\'informazione che serve al team')
      : fail('messaggio dell\'alert: ' + msg)
  }
  {
    // SERVONO ENTRAMBI I SEGNI. Un viaggiatore può scrivere a mano un motivo
    // che comincia per "Please reschedule.", e trattarlo come il tasto del
    // designer produrrebbe un rimborso non dovuto.
    const UID = 'FintoViaggiatoreScrive'
    await chiama(creataRicostruita(UID, '2026-10-05T09:00:00.000Z'))
    const b0 = await prenotazione('cal_booking_uid = $1', [UID])
    await db.query(`update bookings set status='confirmed', confirmed_at=now() where id=$1`, [b0.id])

    const e = await chiama(variante(fx.cancelled_request_reschedule, {
      'payload.uid': UID,
      'payload.cancelledBy': 'viaggiatore.furbo@example.com',
    }))
    const b = await prenotazione('id = $1', [b0.id])
    e.esito === 'cancellata' && b.status === 'cancelled' && b.cancelled_by === 'traveler'
      ? ok('stesso motivo "Please reschedule." ma scritto dal viaggiatore: cancellazione normale')
      : fail('il prefisso da solo ha bloccato la riga: ' + JSON.stringify(e) + ' / ' + b.status)
    await nAlert('calcom_request_reschedule_del_designer') === 1
      ? ok('nessun secondo alert: il prefisso da solo non basta') : fail('alert di troppo')
  }

  // ------------------------------------------------------------- gli scarti
  console.log('  -- quello che si scarta --')
  {
    const prima = await nDiario()
    const e = await chiama(variante(fx.created, { 'payload.type': 'caffe-con-marco' }))
    e.esito === 'event_type_non_nostro' && e.ok === true
      ? ok('event type non nostro: scartato senza alert (il webhook è per account, non per event type)')
      : fail('event type non nostro: ' + JSON.stringify(e))
    await nDiario() === prima + 1 ? ok('scartato ma annotato nel diario') : fail('non annotato')
    const n = Number((await db.query(
      `select count(*) from event_log where event='calcom_event_type_non_nostro'`)).rows[0].count)
    n === 1 ? ok('e la ragione dello scarto è leggibile in event_log') : fail('event_log: ' + n)
  }
  {
    const e = await chiama(variante(fx.created, { 'payload.organizer.username': 'chi-e-questo' }))
    e.esito === 'designer_sconosciuto' && await nAlert('calcom_designer_sconosciuto') === 1
      ? ok('designer sconosciuto su un nostro slug: scartato CON alert (o è onboarding, o un username cambiato)')
      : fail('designer sconosciuto: ' + JSON.stringify(e))
  }
  {
    // marco-rossi non ha la consulenza approfondita: giulia-neri sì, quindi lo
    // slug è dei nostri ma non di questo designer.
    const e = await chiama(variante(fx.created, { 'payload.type': 'consulenza-xpetis-approfondita' }))
    e.esito === 'servizio_non_del_designer' && await nAlert('calcom_servizio_non_configurato') === 1
      ? ok('slug nostro ma non di questo designer: alert critico, nessuna riga')
      : fail('servizio non del designer: ' + JSON.stringify(e))
  }
  {
    const e = await chiama(variante(fx.created, { 'payload.organizer.username': 'td-senza-prezzo-xpetis' }))
    e.esito === 'servizio_senza_prezzo' && await nAlert('calcom_servizio_senza_prezzo') === 1
      ? ok('servizio senza prezzo: nessuna riga, alert critico (la cassa non si può aprire)')
      : fail('servizio senza prezzo: ' + JSON.stringify(e))
  }
  {
    const e = await chiama(variante(fx.created, {
      'payload.responses.xpetis_user_id.value': '00000000-0000-4000-8000-000000000000' }))
    e.esito === 'viaggiatore_non_identificato' && await nAlert('calcom_viaggiatore_non_identificato') === 1
      ? ok('viaggiatore inesistente: nessuna riga, alert critico') : fail('viaggiatore inesistente: ' + JSON.stringify(e))
  }
  {
    const e = await chiama(variante(fx.created, {
      'payload.responses.xpetis_user_id.value': 'non-un-uuid' }))
    e.esito === 'viaggiatore_non_identificato'
      ? ok('codice XPETIS che non è un UUID: scartato, non fa esplodere il ponte')
      : fail('codice non-uuid: ' + JSON.stringify(e))
  }
  {
    const e = await chiama(variante(fx.created, { triggerEvent: 'MEETING_ENDED' }))
    e.esito === 'evento_non_gestito' && e.ok === true
      ? ok('un evento che non gestiamo: annotato e lasciato stare') : fail('evento non gestito: ' + JSON.stringify(e))
  }
  {
    const e = await chiama(variante(fx.rescheduled_1, { 'payload.rescheduleUid': 'unCodiceCheNonAbbiamo' }))
    e.esito === 'prenotazione_sconosciuta' && await nAlert('calcom_riprogrammazione_orfana') === 1
      ? ok('riprogrammazione di una prenotazione che non abbiamo: alert critico')
      : fail('riprogrammazione orfana: ' + JSON.stringify(e))
  }
  {
    const e = await chiama(variante(fx.cancelled, { 'payload.uid': 'unCodiceCheNonAbbiamo' }))
    e.esito === 'prenotazione_sconosciuta' && await nAlert('calcom_cancellazione_orfana') === 1
      ? ok('cancellazione di una prenotazione che non abbiamo: alert') : fail('cancellazione orfana: ' + JSON.stringify(e))
  }
  {
    const e = await chiama(variante(fx.created, { payload: null }))
    e.esito === 'corpo_non_riconosciuto' ? ok('corpo firmato ma senza payload: esito, non errore') : fail('corpo senza payload: ' + JSON.stringify(e))
  }
  {
    const raw = 'questo non è json'
    const e = (await db.query('select calcom_webhook($1,$2) as esito', [raw, firmaDi(raw)])).rows[0].esito
    e.esito === 'corpo_non_json' ? ok('corpo firmato ma non JSON: esito, non errore') : fail('corpo non json: ' + JSON.stringify(e))
  }

  // ------------------------------------------------------------ la superficie
  console.log('  -- chi può chiamare il ponte --')
  for (const ruolo of ['anon', 'authenticated']) {
    const v = (await db.query(
      `select has_function_privilege($1, 'calcom_webhook(text,text)', 'EXECUTE') as v`, [ruolo])).rows[0].v
    v === false ? ok(`${ruolo} non può chiamare calcom_webhook`) : fail(`${ruolo} può chiamare il ponte`)
  }
  {
    const v = (await db.query(
      `select has_function_privilege('service_role', 'calcom_webhook(text,text)', 'EXECUTE') as v`)).rows[0].v
    v === true ? ok('service_role sì: è la chiave secret che usa n8n') : fail('service_role non può chiamare il ponte')
  }
  {
    // Nessun messaggio si è fermato su un errore: gli esiti sopra sono tutti
    // decisioni prese, non guasti. Un errore lascia `processed_at` nullo di
    // proposito, così il ritentativo di Cal.com riprova.
    const rotti = (await db.query(
      `select external_id, error from webhook_events
        where provider='cal' and error is not null`)).rows
    rotti.length === 0
      ? ok('nessun messaggio si è fermato su un errore')
      : fail('messaggi in errore: ' + JSON.stringify(rotti))
  }
}

// ===========================================================================
// Il ponte Stripe (migration 0039)
// ===========================================================================
console.log('\n== Il ponte Stripe ==')
{
  const fxDir = path.join(root, 'tests/fixtures/stripe')
  const fx = {}
  for (const f of readdirSync(fxDir).filter(f => f.endsWith('.json'))) {
    fx[f.replace(/^checkout_session_|\.json$/g, '')] = JSON.parse(readFileSync(path.join(fxDir, f), 'utf8'))
  }

  // Le due chiavi di commento aggiunte a mano quando le fixture sono state
  // salvate, come per Cal.com.
  const senzaMeta = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')))
  const clone = (o) => JSON.parse(JSON.stringify(o))

  let nEvt = 0
  // Una variante di un messaggio. L'`id` dell'evento cambia sempre: per Stripe
  // la chiave di diario è quella e basta, quindi senza un id nuovo ogni
  // variante passerebbe per un doppio scatto di quella da cui deriva.
  const evento = (base, patch = {}) => {
    const b = clone(senzaMeta(base))
    b.id = `evt_harness_${String(++nEvt).padStart(4, '0')}`
    b.created = Math.floor(Date.now() / 1000)
    for (const [via, val] of Object.entries(patch)) {
      const parti = via.split('.')
      let n = b
      for (const p of parti.slice(0, -1)) n = n[p]
      n[parti.at(-1)] = val
    }
    return b
  }

  // La firma di Stripe: HMAC-SHA256 su `"<t>.<corpo grezzo>"`, non sul solo
  // corpo. È la differenza con Cal.com che rende sbagliato copiare l'altro ponte.
  const firmaStripe = (raw, t = Math.floor(Date.now() / 1000)) =>
    `t=${t},v1=` + crypto.createHmac('sha256', SEGRETO_STRIPE).update(`${t}.${raw}`, 'utf8').digest('hex')

  const chiama = async (corpo, firma) => {
    const raw = typeof corpo === 'string' ? corpo : JSON.stringify(corpo)
    const r = await db.query('select stripe_webhook($1, $2) as esito', [raw, firma ?? firmaStripe(raw)])
    return r.rows[0].esito
  }
  const nAlert = async (kind) =>
    Number((await db.query('select count(*) from team_alerts where kind = $1', [kind])).rows[0].count)
  const pagamento = async (sessione) =>
    (await db.query('select * from payments where stripe_checkout_session_id = $1', [sessione])).rows[0]
  const prenotazione = async (id) =>
    (await db.query('select * from bookings where id = $1', [id])).rows[0]

  // ---------------------------------------------------------------- il campo
  // Il viaggiatore e il designer delle fixture Cal.com esistono già: qui
  // servono solo prenotazioni in stati diversi, create direttamente perché
  // riusare quelle del blocco precedente le legherebbe a com'è finito quello.
  const VIAGGIATORE = '69a37b12-b899-47c4-9bdb-31a17d9cb986'
  const P = (n) => `7f3e1c2a-0000-4000-8000-00000000000${n}`
  const SESSIONE_FIXTURE = fx.completed.data.object.id

  for (const [n, stato] of [[1, 'pending_payment'], [2, 'pending_payment'], [3, 'pending_payment'],
                            [4, 'pending_payment'], [5, 'pending_payment'], [6, 'pending_payment'],
                            [7, 'pending_payment']]) {
    await db.query(
      `insert into bookings (id, traveler_id, td_id, service_type, status, cal_booking_uid,
                             cal_event_type_slug, starts_at, ends_at, original_starts_at,
                             price_cents, payment_deadline_at, last_actor)
       values ($1, $2, '11111111-1111-1111-1111-111111111111', 'consultation', $3,
               'uid-stripe-' || $4, 'consulenza-xpetis-30',
               now() + interval '3 days', now() + interval '3 days' + interval '30 minutes',
               now() + interval '3 days', 6000, now() + interval '30 minutes', 'traveler')`,
      [P(n), VIAGGIATORE, stato, String(n)])
  }
  // La quarta è quella su cui l'orologio ha già liberato lo slot.
  await db.query(`update bookings set status='cancelled_unpaid', cancelled_at=now(),
                   cancelled_by='system', last_actor='system' where id = $1`, [P(4)])

  // Le casse aperte dal nostro server. La 5 di proposito NON ce l'ha: è il caso
  // della riga di pagamento da ricostruire.
  const sessioneDi = (n) => (n === 1 ? SESSIONE_FIXTURE : `cs_test_harness_000${n}`)
  for (const n of [1, 2, 3, 4, 6]) {
    await db.query(
      `insert into payments (booking_id, kind, status, amount_cents, currency,
                             stripe_account, client_reference_id, stripe_checkout_session_id, expires_at)
       values ($1, 'consultation', 'pending', 6000, 'EUR', 'xpetis', $2, $3, now() + interval '30 minutes')`,
      [P(n), P(n), sessioneDi(n)])
  }
  // La settima ha la riga ma **senza sessione**: è la corsa in cui la route ha
  // scritto la riga, ha chiamato Stripe, e il webhook è arrivato prima che
  // l'identificativo della sessione fosse registrato.
  await db.query(
    `insert into payments (booking_id, kind, status, amount_cents, currency,
                           stripe_account, client_reference_id, expires_at)
     values ($1, 'consultation', 'pending', 6000, 'EUR', 'xpetis', $2, now() + interval '30 minutes')`,
    [P(7), P(7)])

  // ------------------------------------------------------------------- firma
  console.log('  -- la firma, che NON è quella di Cal.com --')
  {
    const raw = JSON.stringify(senzaMeta(fx.expired))
    const v = (await db.query('select stripe_signature_ok($1,$2) as v', [raw, firmaStripe(raw)])).rows[0].v
    v === true ? ok('firma valida verificata sui byte grezzi') : fail('firma valida rifiutata')
  }
  {
    // La prova che l'HMAC è su `"<t>.<corpo>"` e non sul solo corpo: firmare
    // come fa Cal.com non deve passare. Senza questa asserzione, un ponte che
    // copia l'altro sembrerebbe funzionare finché non arriva Stripe davvero.
    const raw = JSON.stringify(senzaMeta(fx.expired))
    const t = Math.floor(Date.now() / 1000)
    const allaCalcom = crypto.createHmac('sha256', SEGRETO_STRIPE).update(raw, 'utf8').digest('hex')
    const v = (await db.query('select stripe_signature_ok($1,$2) as v', [raw, `t=${t},v1=${allaCalcom}`])).rows[0].v
    v === false ? ok('firmare come Cal.com (solo il corpo) non passa') : fail('la firma alla Cal.com è passata')
  }
  {
    const raw = JSON.stringify(senzaMeta(fx.expired))
    const t = Math.floor(Date.now() / 1000) - 600
    const firma = `t=${t},v1=` + crypto.createHmac('sha256', SEGRETO_STRIPE).update(`${t}.${raw}`, 'utf8').digest('hex')
    const v = (await db.query('select stripe_signature_ok($1,$2) as v', [raw, firma])).rows[0].v
    v === false
      ? ok('firma valida ma vecchia di 10 minuti: fuori tolleranza, rifiutata')
      : fail('una firma fuori tolleranza è passata: il rigioco è possibile')
  }
  {
    const raw = JSON.stringify(senzaMeta(fx.expired))
    const t = Math.floor(Date.now() / 1000) + 600
    const firma = `t=${t},v1=` + crypto.createHmac('sha256', SEGRETO_STRIPE).update(`${t}.${raw}`, 'utf8').digest('hex')
    const v = (await db.query('select stripe_signature_ok($1,$2) as v', [raw, firma])).rows[0].v
    v === false ? ok('e nemmeno una datata dieci minuti nel futuro') : fail('firma dal futuro accettata')
  }
  {
    // Rotazione del segreto: Stripe manda due `v1`, uno per parola segreta.
    // Accettarne uno solo farebbe cadere il ponte proprio mentre si cambia la
    // parola segreta.
    const raw = JSON.stringify(senzaMeta(fx.expired))
    const t = Math.floor(Date.now() / 1000)
    const buona = crypto.createHmac('sha256', SEGRETO_STRIPE).update(`${t}.${raw}`, 'utf8').digest('hex')
    const v = (await db.query('select stripe_signature_ok($1,$2) as v',
      [raw, `t=${t},v1=${'0'.repeat(64)},v1=${buona}`])).rows[0].v
    v === true ? ok('due v1 (rotazione del segreto): basta che uno combaci') : fail('rotazione del segreto: rifiutata')
  }
  {
    const raw = JSON.stringify(senzaMeta(fx.expired))
    const t = Math.floor(Date.now() / 1000)
    const buona = crypto.createHmac('sha256', SEGRETO_STRIPE).update(`${t}.${raw}`, 'utf8').digest('hex')
    const v = (await db.query('select stripe_signature_ok($1,$2) as v', [raw, `t=${t},v0=${buona}`])).rows[0].v
    v === false ? ok('una firma di sola versione v0 non passa') : fail('v0 accettata')
  }
  for (const [etichetta, firma] of [
    ['una firma sbagliata', `t=${Math.floor(Date.now() / 1000)},v1=${'a'.repeat(64)}`],
    ['un header senza timestamp', `v1=${'a'.repeat(64)}`],
    ['un header senza v1', `t=${Math.floor(Date.now() / 1000)}`],
    ['un timestamp che non è un numero', `t=domani,v1=${'a'.repeat(64)}`],
    ['una firma vuota', ''],
    ['nessuna firma', null],
  ]) {
    const raw = JSON.stringify(senzaMeta(fx.expired))
    const v = (await db.query('select stripe_signature_ok($1,$2) as v', [raw, firma])).rows[0].v
    v === false ? ok(`${etichetta} non passa`) : fail(`${etichetta} è passata`)
  }
  {
    const raw = JSON.stringify(senzaMeta(fx.expired))
    const v = (await db.query('select stripe_signature_ok($1,$2) as v', [raw + ' ', firmaStripe(raw)])).rows[0].v
    v === false ? ok('un corpo alterato di un solo carattere non passa più') : fail('corpo alterato passato')
  }
  {
    const prima = Number((await db.query("select count(*) from webhook_events where provider='stripe'")).rows[0].count)
    const e = await chiama(evento(fx.expired), `t=${Math.floor(Date.now() / 1000)},v1=${'b'.repeat(64)}`)
    const dopo = Number((await db.query("select count(*) from webhook_events where provider='stripe'")).rows[0].count)
    e.esito === 'firma_non_valida' && e.ok === false && dopo === prima
      ? ok('firma non valida: nessuna riga nel diario, come per Cal.com')
      : fail(`firma non valida gestita male: ${JSON.stringify(e)}, diario ${prima}→${dopo}`)
  }

  // ------------------------------------------------ checkout.session.completed
  console.log('  -- checkout.session.completed --')
  {
    const e = await chiama(evento(fx.completed))
    if (e.esito !== 'confermata') fail(`conferma: ${JSON.stringify(e)}`)
    else {
      ok('pagamento che combacia: prenotazione confermata')
      const b = await prenotazione(P(1))
      b.status === 'confirmed' ? ok('la prenotazione è confirmed') : fail('stato: ' + b.status)
      b.confirmed_at ? ok('con confirmed_at valorizzato') : fail('confirmed_at vuoto')
      b.last_actor === 'traveler'
        ? ok('last_actor = traveler: ha pagato lui, n8n è il mezzo') : fail('last_actor: ' + b.last_actor)

      const p = await pagamento(SESSIONE_FIXTURE)
      p.status === 'paid' && p.paid_at ? ok('la riga di pagamento è paid') : fail('pagamento: ' + p.status)
      p.stripe_payment_intent_id === 'pi_3UD5QwB5Y7cSwqYh1kZmR8Tq'
        ? ok('il PaymentIntent è annotato: è il filo verso l\'incasso su Stripe')
        : fail('payment_intent: ' + p.stripe_payment_intent_id)

      const h = (await db.query(
        `select from_status, to_status, actor from booking_status_history
          where booking_id = $1 order by created_at`, [P(1)])).rows
      h.at(-1).to_status === 'confirmed' && h.at(-1).actor === 'traveler'
        ? ok('la storia registra chi ha pagato: è l\'unica prova, il TD non ha login')
        : fail('storia: ' + JSON.stringify(h))

      const w = (await db.query(
        `select external_id, processed_at, error from webhook_events
          where provider='stripe' order by received_at desc limit 1`)).rows[0]
      w.processed_at && !w.error
        ? ok('messaggio registrato nel diario e marcato lavorato') : fail('diario: ' + JSON.stringify(w))
    }
  }
  {
    // Stripe ritenta: stesso `evt_`, stessa chiave di diario. Nessuna
    // composizione come per Cal.com — l'id lo dà il mittente.
    const corpo = evento(fx.completed)
    await chiama(corpo)
    const e = await chiama(corpo)
    e.esito === 'duplicato' && e.ok === true
      ? ok('stesso evt_ due volte: duplicato riconosciuto')
      : fail('doppio scatto: ' + JSON.stringify(e))
  }
  {
    const e = await chiama(evento(fx.completed))
    e.esito === 'gia_confermata' && e.ok === true
      ? ok('completed su una prenotazione già confermata: niente da fare, e non è un guasto')
      : fail('già confermata: ' + JSON.stringify(e))
  }
  {
    // Lo scarto sull'importo non si conferma in silenzio. È il controllo che
    // rende inutile manomettere la cassa: il prezzo vero sta in `bookings`.
    const e = await chiama(evento(fx.completed, {
      'data.object.id': sessioneDi(2),
      'data.object.amount_total': 100,
      'data.object.client_reference_id': P(2),
      'data.object.metadata.booking_id': P(2),
    }))
    const b = await prenotazione(P(2))
    const p = await pagamento(sessioneDi(2))
    e.esito === 'importo_non_combacia' && e.ok === false
      && b.status === 'pending_payment' && p.status === 'pending'
      && await nAlert('stripe_importo_non_combacia') === 1
      ? ok('1 € incassati su una consulenza da 60: alert critico, nessuna conferma')
      : fail(`importo non combacia: ${JSON.stringify(e)}, prenotazione ${b.status}, pagamento ${p.status}`)
  }
  {
    const e = await chiama(evento(fx.completed, {
      'data.object.id': sessioneDi(2),
      'data.object.currency': 'usd',
      'data.object.client_reference_id': P(2),
      'data.object.metadata.booking_id': P(2),
    }))
    e.esito === 'importo_non_combacia' && (await prenotazione(P(2))).status === 'pending_payment'
      ? ok('importo giusto ma in dollari: stesso trattamento (è l\'adaptive pricing acceso)')
      : fail('valuta diversa: ' + JSON.stringify(e))
  }
  {
    const e = await chiama(evento(fx.completed, {
      'data.object.id': 'cs_test_di_nessuno',
      'data.object.client_reference_id': null,
      'data.object.metadata': {},
    }))
    e.esito === 'prenotazione_sconosciuta' && await nAlert('stripe_pagamento_senza_prenotazione') === 1
      ? ok('soldi incassati senza prenotazione a cui attaccarli: alert critico')
      : fail('prenotazione sconosciuta: ' + JSON.stringify(e))
  }
  {
    // Il caso che succederà davvero: l'orologio libera lo slot al minuto 30, il
    // pagamento arriva al minuto 30 e qualcosa.
    const e = await chiama(evento(fx.completed, {
      'data.object.id': sessioneDi(4),
      'data.object.client_reference_id': P(4),
      'data.object.metadata.booking_id': P(4),
    }))
    const b = await prenotazione(P(4))
    const p = await pagamento(sessioneDi(4))
    e.esito === 'pagamento_su_prenotazione_chiusa' && b.status === 'cancelled_unpaid'
      && p.status === 'paid' && await nAlert('stripe_pagamento_su_prenotazione_chiusa') === 1
      ? ok('pagamento su uno slot già liberato: incasso registrato, prenotazione no, alert critico')
      : fail(`pagamento su chiusa: ${JSON.stringify(e)}, ${b.status}, ${p.status}`)
  }
  {
    // Metodi a notifica differita: `completed` arriva con l'incasso ancora per
    // aria. Confermare qui vorrebbe dire regalare una consulenza.
    const e = await chiama(evento(fx.completed, {
      'data.object.id': sessioneDi(6),
      'data.object.payment_status': 'unpaid',
      'data.object.client_reference_id': P(6),
      'data.object.metadata.booking_id': P(6),
    }))
    e.esito === 'pagamento_non_ancora_incassato' && (await prenotazione(P(6))).status === 'pending_payment'
      && await nAlert('stripe_pagamento_differito') === 1
      ? ok('completed con payment_status unpaid: si aspetta, non si conferma')
      : fail('pagamento differito: ' + JSON.stringify(e))
  }
  {
    // La riga di pagamento manca: la route era arrivata ad aprire la cassa e
    // non a registrarla. Il registro si ricostruisce invece di restare monco.
    const e = await chiama(evento(fx.completed, {
      'data.object.id': 'cs_test_harness_0005',
      'data.object.client_reference_id': P(5),
      'data.object.metadata.booking_id': P(5),
    }))
    const p = await pagamento('cs_test_harness_0005')
    e.esito === 'confermata' && (await prenotazione(P(5))).status === 'confirmed'
      && p && p.status === 'paid' && p.stripe_account === 'xpetis'
      && await nAlert('stripe_riga_pagamento_ricostruita') === 1
      ? ok('pagamento senza riga in payments: riga ricostruita, conferma buona, alert al team')
      : fail('riga ricostruita: ' + JSON.stringify(e))
  }

  {
    // La corsa: riga scritta, sessione non ancora registrata. Il ripiego per
    // prenotazione deve agganciare **quella** riga, non fabbricarne una nuova.
    const e = await chiama(evento(fx.completed, {
      'data.object.id': 'cs_test_harness_0007',
      'data.object.client_reference_id': P(7),
      'data.object.metadata.booking_id': P(7),
    }))
    const righe = (await db.query(
      `select status, stripe_checkout_session_id from payments where booking_id = $1`, [P(7)])).rows
    e.esito === 'confermata' && righe.length === 1
      && righe[0].status === 'paid' && righe[0].stripe_checkout_session_id === 'cs_test_harness_0007'
      && await nAlert('stripe_riga_pagamento_ricostruita') === 1
      ? ok('webhook arrivato prima che la sessione fosse registrata: aggancia la riga che c\'è, non ne crea una seconda')
      : fail(`corsa route/webhook: ${JSON.stringify(e)}, righe ${JSON.stringify(righe)}`)
  }

  // -------------------------------------------------- checkout.session.expired
  console.log('  -- checkout.session.expired --')
  {
    const statoPrima = (await prenotazione(P(3))).status
    const e = await chiama(evento(fx.expired, {
      'data.object.id': sessioneDi(3),
      'data.object.client_reference_id': P(3),
      'data.object.metadata.booking_id': P(3),
    }))
    const p = await pagamento(sessioneDi(3))
    const b = await prenotazione(P(3))
    e.esito === 'scaduta' && p.status === 'expired' && b.status === statoPrima
      ? ok('cassa scaduta: solo la riga di pagamento; la prenotazione NON si tocca')
      : fail(`scadenza: ${JSON.stringify(e)}, pagamento ${p.status}, prenotazione ${b.status}`)
    b.cancelled_at === null
      ? ok('e lo slot non si libera qui: è compito dell\'orologio, in un posto solo')
      : fail('la scadenza della cassa ha cancellato la prenotazione')
  }
  {
    const e = await chiama(evento(fx.expired, { 'data.object.id': SESSIONE_FIXTURE }))
    e.esito === 'gia_chiusa' && (await pagamento(SESSIONE_FIXTURE)).status === 'paid'
      ? ok('expired su una cassa già pagata: il pagamento non si declassa')
      : fail('expired su pagata: ' + JSON.stringify(e))
  }
  {
    // La sessione non la conosciamo ma la prenotazione sì, e ha una cassa
    // ancora viva: la scadenza NON deve toccarla. Vale solo per la sessione che
    // la porta — su un `completed` invece il ripiego per prenotazione ricuce il
    // registro, ed è la differenza fra i due casi.
    const vivaPrima = (await db.query(
      'select status from payments where stripe_checkout_session_id = $1', [sessioneDi(6)])).rows[0].status
    const e = await chiama(evento(fx.expired, {
      'data.object.id': 'cs_test_mai_vista',
      'data.object.client_reference_id': P(6),
      'data.object.metadata.booking_id': P(6),
    }))
    const vivaDopo = (await db.query(
      'select status from payments where stripe_checkout_session_id = $1', [sessioneDi(6)])).rows[0].status
    e.esito === 'pagamento_sconosciuto' && e.ok === true
      && vivaPrima === 'pending' && vivaDopo === 'pending'
      ? ok('expired di una sessione ignota: si annota, e la cassa viva di quella prenotazione resta aperta')
      : fail(`expired sconosciuta: ${JSON.stringify(e)}, cassa viva ${vivaPrima}→${vivaDopo}`)
  }

  // ------------------------------------------------------------ il contorno
  console.log('  -- rimborsi, eventi non gestiti, corpi storti --')
  {
    const e = await chiama(evento(fx.completed, { type: 'charge.refunded' }))
    const n = Number((await db.query(
      `select count(*) from event_log where event='stripe_rimborso'`)).rows[0].count)
    e.esito === 'rimborso_annotato' && e.ok === true && n === 1
      ? ok('rimborso: annotato e basta, le regole sono milestone 5')
      : fail('rimborso: ' + JSON.stringify(e))
  }
  {
    const e = await chiama(evento(fx.completed, { type: 'customer.created' }))
    e.esito === 'evento_non_gestito' && e.ok === true
      ? ok('evento fuori dal nostro giro: annotato, non un guasto') : fail('non gestito: ' + JSON.stringify(e))
  }
  {
    const e = await chiama(evento(fx.completed, { data: { object: null } }))
    e.esito === 'corpo_non_riconosciuto'
      ? ok('corpo firmato ma senza data.object: esito, non errore') : fail('senza oggetto: ' + JSON.stringify(e))
  }
  {
    const raw = 'questo non è json'
    const e = (await db.query('select stripe_webhook($1,$2) as esito', [raw, firmaStripe(raw)])).rows[0].esito
    e.esito === 'corpo_non_json'
      ? ok('corpo firmato ma non JSON: esito, non errore') : fail('non json: ' + JSON.stringify(e))
  }

  // ----------------------------------------------------- una sola cassa aperta
  console.log('  -- una sola cassa aperta per prenotazione --')
  await expectFail('seconda cassa aperta sulla stessa prenotazione', `
    insert into payments (booking_id, kind, status, amount_cents, stripe_account, stripe_checkout_session_id)
    values ('${P(6)}', 'consultation', 'pending', 6000, 'xpetis', 'cs_test_doppione')`,
    'payments_one_pending_per_kind')
  await expectOk('ma una cassa nuova dopo che la precedente è scaduta, sì', `
    update payments set status='expired' where booking_id='${P(6)}' and status='pending';
    insert into payments (booking_id, kind, status, amount_cents, stripe_account, stripe_checkout_session_id)
    values ('${P(6)}', 'consultation', 'pending', 6000, 'xpetis', 'cs_test_seconda_buona')`)

  // ------------------------------------------------------- su quale conto incassa
  console.log('  -- su quale conto incassa (deviazione 9) --')
  {
    const r = (await db.query('select * from consultation_payment_account()')).rows[0]
    r.stripe_account === 'xpetis' && r.agency_id === null
      ? ok('oggi incassa xpetis, e l\'agenzia non serve') : fail('conto: ' + JSON.stringify(r))
  }
  {
    await db.query(`update app_config set value_text='agency' where key='consultation_stripe_account'`)
    await db.query(`update agencies set is_default_partner=false, is_active=true`)
    let esploso = false
    try { await db.query('select * from consultation_payment_account()') } catch { esploso = true }
    esploso
      ? ok('conto agency senza agenzia partner: fallisce con una frase leggibile, invece che su un check')
      : fail('agency senza agenzia è passata')

    await db.query(`insert into agencies (id, name, operational_email, is_default_partner)
                    values ('aaaaaaaa-0000-4000-8000-000000000001','Agenzia di prova','ops@example.com', true)
                    on conflict (id) do update set is_default_partner = true`)
    const r = (await db.query('select * from consultation_payment_account()')).rows[0]
    r.stripe_account === 'agency' && r.agency_id === 'aaaaaaaa-0000-4000-8000-000000000001'
      ? ok('con l\'agenzia partner attiva: conto agency e il suo id, che payments_agency_required pretende')
      : fail('conto agency: ' + JSON.stringify(r))

    await db.query(`update app_config set value_text='xpetis' where key='consultation_stripe_account'`)
  }
  {
    // Il default della colonna non si tocca: il passaggio è la riga di
    // app_config, non una migration.
    const d = (await db.query(
      `select column_default from information_schema.columns
        where table_name='payments' and column_name='stripe_account'`)).rows[0].column_default
    String(d).includes('xpetis')
      ? ok('il default della colonna stripe_account resta xpetis, come dice il PIANO')
      : fail('default cambiato: ' + d)
  }

  // ------------------------------------------------------------ la superficie
  console.log('  -- chi può chiamare il ponte --')
  for (const f of ['stripe_webhook(text,text)', 'stripe_webhook_secret()',
                   'stripe_signature_ok(text,text,integer)', 'consultation_payment_account()']) {
    for (const ruolo of ['anon', 'authenticated']) {
      const v = (await db.query(`select has_function_privilege($1, $2, 'EXECUTE') as v`, [ruolo, f])).rows[0].v
      v === false ? ok(`${ruolo} non può chiamare ${f.split('(')[0]}`) : fail(`${ruolo} può chiamare ${f}`)
    }
  }
  {
    const v = (await db.query(
      `select has_function_privilege('service_role', 'stripe_webhook(text,text)', 'EXECUTE') as v`)).rows[0].v
    v === true ? ok('service_role sì: è la chiave secret che usa n8n') : fail('service_role non può chiamare il ponte')
  }
  {
    const cols = (await db.query(
      `select column_name from information_schema.columns where table_name='my_bookings'`)).rows.map(r => r.column_name)
    cols.includes('payment_deadline_at') && !cols.includes('cal_booking_uid')
      ? ok('my_bookings dà la scadenza del pagamento e continua a non dare cal_booking_uid')
      : fail('my_bookings: ' + JSON.stringify(cols))
  }
  {
    const rotti = (await db.query(
      `select external_id, error from webhook_events where provider='stripe' and error is not null`)).rows
    rotti.length === 0
      ? ok('nessun messaggio Stripe si è fermato su un errore')
      : fail('messaggi in errore: ' + JSON.stringify(rotti))
  }
}

// ===========================================================================
// L'orologio dei 5 minuti (migration 0041)
// ===========================================================================
// Qui l'harness prova **la parte che decide**: quali righe l'orologio sceglie e
// cosa fa degli esiti. Il braccio — la chiamata vera a Cal.com — non si può
// provare da qui e non si finge: sta in `n8n/`, e le prove di Simone sono in
// `PIANO.md`.
console.log('\n== L\'orologio dei 5 minuti ==')
{
  const TD = '11111111-1111-1111-1111-111111111111'
  const VIAGGIATORE = '69a37b12-b899-47c4-9bdb-31a17d9cb986'
  const B = (n) => `c10c0000-0000-4000-8000-00000000000${n}`

  // `scadenza` è un'espressione SQL: il punto di queste prove sono i casi
  // storti, e ognuno è una scadenza messa in un posto diverso del tempo.
  const crea = async (n, scadenza, stato = 'pending_payment') =>
    db.query(
      `insert into bookings (id, traveler_id, td_id, service_type, status, cal_booking_uid,
                             cal_event_type_slug, starts_at, ends_at, original_starts_at,
                             price_cents, payment_deadline_at, last_actor)
       values ($1, $2, $3, 'consultation', $4, 'uid-orologio-' || $5, 'consulenza-xpetis-30',
               now() + interval '2 days', now() + interval '2 days' + interval '30 minutes',
               now() + interval '2 days', 6000, ${scadenza}, 'traveler')`,
      [B(n), VIAGGIATORE, TD, stato, String(n)])

  await crea(1, `now() - interval '1 hour'`)          // scaduta da un'ora
  await crea(2, `now() - interval '1 second'`)        // scaduta da un secondo
  await crea(3, `now() - interval '1 hour'`)          // scaduta MA pagata
  await crea(4, `now() - interval '1 hour'`, 'cancelled_unpaid') // già liberata
  await crea(5, `null`)                               // senza scadenza
  await crea(6, `now() + interval '10 minutes'`)      // non ancora scaduta
  await crea(7, `now() - interval '1 hour'`)          // tentativi esauriti
  await crea(8, `now() - interval '1 hour'`)          // il webhook di ritorno
  await crea(9, `now() - interval '1 hour'`)          // pagata nel frattempo

  // La terza ha un incasso riuscito: è la riga che l'orologio non deve toccare
  // nemmeno se è scaduta da un'ora. Prendere i soldi e dare via lo slot è il
  // danno peggiore che questo workflow possa fare.
  await db.query(
    `insert into payments (booking_id, kind, status, amount_cents, currency,
                           stripe_account, client_reference_id, paid_at)
     values ($1, 'consultation', 'paid', 6000, 'EUR', 'xpetis', $2, now())`, [B(3), B(3)])
  await db.query(`update bookings set cancel_attempts = 3 where id = $1`, [B(7)])

  const tick = async (limite = 100) =>
    (await db.query('select * from clock_tick($1)', [limite])).rows
  const stato = async (id) =>
    (await db.query('select * from bookings where id = $1', [id])).rows[0]
  const nAlert = async (kind) =>
    Number((await db.query('select count(*) from team_alerts where kind = $1', [kind])).rows[0].count)
  const ultimoAttore = async (id) =>
    (await db.query(
      `select actor, to_status from booking_status_history
        where booking_id = $1 order by created_at desc, id desc limit 1`, [id])).rows[0]

  // ------------------------------------------------- chi entra e chi non entra
  console.log('  -- quali righe sceglie, che è tutto il punto --')
  const primo = await tick()
  const scelti = new Set(primo.map(r => r.entity_id))

  for (const [n, atteso, perche] of [
    [1, true,  'scaduta da un\'ora: si libera'],
    [2, true,  'scaduta da un secondo: la scadenza è la scadenza'],
    [3, false, 'scaduta ma PAGATA: non si tocca'],
    [4, false, 'già cancelled_unpaid: non si ripassa sulle righe chiuse'],
    [5, false, 'senza scadenza: la cassa la tratta come pagabile, quindi l\'orologio la lascia stare'],
    [6, false, 'non ancora scaduta'],
    [7, false, 'tentativi esauriti: si smette di riprovare'],
  ]) {
    scelti.has(B(n)) === atteso ? ok(perche) : fail(`${perche} — e invece ${atteso ? 'non c\'è' : 'c\'è'}`)
  }

  // ------------------------------------------------------------- il compito
  console.log('  -- la forma del compito consegnato al braccio --')
  {
    const c = primo.find(r => r.entity_id === B(1))
    c && c.task === 'calcom_cancel_unpaid' && c.entity_type === 'booking'
      ? ok('il compito si chiama calcom_cancel_unpaid e parla di una prenotazione')
      : fail('compito malformato: ' + JSON.stringify(c))
    c?.payload?.cal_booking_uid === 'uid-orologio-1'
      ? ok('porta cal_booking_uid, che esce dal database solo da questa porta')
      : fail('manca il codice della prenotazione: ' + JSON.stringify(c?.payload))
    c?.payload?.cancel_url === 'https://api.cal.com/v2/bookings/uid-orologio-1/cancel'
      ? ok('{uid} nell\'URL è sostituito col codice: il braccio non compone niente')
      : fail('URL non sostituito: ' + c?.payload?.cancel_url)
    c?.payload?.attempt === 1
      ? ok('il compito dice a che tentativo siamo')
      : fail('tentativo: ' + JSON.stringify(c?.payload?.attempt))
  }
  {
    const b = await stato(B(1))
    b.cancel_requested_at && b.cancel_attempts === 1
      ? ok('la riga consegnata è segnata: cancel_requested_at pieno, un tentativo')
      : fail('riga non segnata: ' + JSON.stringify([b.cancel_requested_at, b.cancel_attempts]))
  }

  // Il braccio ha in mano il compito: un secondo giro subito dopo non lo
  // riconsegna a nessuno.
  {
    const subito = await tick()
    subito.some(r => r.entity_id === B(1))
      ? fail('il giro successivo ha riconsegnato una riga già in lavorazione')
      : ok('un giro subito dopo non riconsegna le righe già in mano al braccio')
  }

  // --------------------------------------------------- il braccio riferisce
  console.log('  -- cosa significano gli esiti --')
  {
    const r = (await db.query(`select clock_task_done('calcom_cancel_unpaid', $1, 200, null) as e`, [B(1)])).rows[0].e
    const b = await stato(B(1))
    r.esito === 'liberata' && b.status === 'cancelled_unpaid'
      ? ok('cancellazione riuscita: la riga passa a cancelled_unpaid, e solo adesso')
      : fail('esito ' + JSON.stringify(r) + ' stato ' + b.status)
    const h = await ultimoAttore(B(1))
    h?.actor === 'system' && b.cancelled_by === 'system'
      ? ok('ha agito il sistema, e booking_status_history lo dice')
      : fail('attore sbagliato: ' + JSON.stringify(h))
  }
  {
    // TRAPPOLA 3: cancellare due volte deve essere innocuo. Il secondo
    // tentativo Cal.com lo rifiuta — qui un 400 — e la risposta giusta non si
    // cerca nel suo messaggio d'errore ma nello stato della riga: lo slot è
    // libero, e come ci sia arrivato non cambia niente.
    const r = (await db.query(
      `select clock_task_done('calcom_cancel_unpaid', $1, 400, 'already cancelled') as e`, [B(1)])).rows[0].e
    r.esito === 'gia_liberata' && r.ok === true
      ? ok('secondo tentativo su una riga già chiusa: successo, non guasto — e senza indovinare il testo di Cal.com')
      : fail('doppio tentativo: ' + JSON.stringify(r))
  }
  {
    // Cal.com non ha risposto: la riga resta scaduta e da liberare.
    const r = (await db.query(
      `select clock_task_done('calcom_cancel_unpaid', $1, 503, 'timeout') as e`, [B(2)])).rows[0].e
    const b = await stato(B(2))
    r.esito === 'ritentare' && b.status === 'pending_payment'
      ? ok('cancellazione fallita: la riga resta pending_payment, perché si marca DOPO')
      : fail('fallimento gestito male: ' + JSON.stringify(r) + ' ' + b.status)

    // ...e il giro successivo la ritrova, che è il senso di tutta la scelta.
    await db.query(
      `update bookings set cancel_requested_at = now() - interval '10 minutes' where id = $1`, [B(2)])
    const dopo = await tick()
    dopo.some(r2 => r2.entity_id === B(2))
      ? ok('il giro successivo ritrova la riga che non si era riusciti a cancellare')
      : fail('la riga fallita non è tornata: lo slot resterebbe occupato per sempre')
    const b2 = await stato(B(2))
    b2.cancel_attempts === 2 ? ok('e conta il secondo tentativo') : fail('tentativi: ' + b2.cancel_attempts)
  }

  // --------------------------------------------- TRAPPOLA 2, accaduta davvero
  {
    await db.query(`update bookings set status='confirmed', confirmed_at=now() where id = $1`, [B(9)])
    const r = (await db.query(`select clock_task_done('calcom_cancel_unpaid', $1, 200, null) as e`, [B(9)])).rows[0].e
    const b = await stato(B(9))
    r.esito === 'pagata_nel_frattempo' && b.status === 'confirmed'
      ? ok('pagamento arrivato mentre si cancellava: lo stato non si tocca')
      : fail('corsa col pagamento gestita male: ' + JSON.stringify(r) + ' ' + b.status)
    await nAlert('orologio_ha_liberato_uno_slot_pagato') === 1
      ? ok('e il team riceve un alert critico: quella call su Cal.com non esiste più')
      : fail('nessun alert sulla corsa col pagamento')
  }

  // ------------------------------- TRAPPOLA 1: la nostra cancellazione torna
  console.log('  -- il webhook che la nostra stessa cancellazione fa tornare indietro --')
  {
    const fxDir = path.join(root, 'tests', 'fixtures', 'calcom')
    const base = JSON.parse(readFileSync(path.join(fxDir, 'booking_cancelled.json'), 'utf8'))
    const corpo = Object.fromEntries(Object.entries(base).filter(([k]) => !k.startsWith('_')))
    corpo.createdAt = '2026-09-18T10:00:00.000Z'
    corpo.payload.uid = 'uid-orologio-8'
    // Cal.com potrebbe attribuire la cancellazione a chi ha prenotato: è
    // esattamente il caso che il trigger deve correggere.
    corpo.payload.cancelledBy = corpo.payload.attendees?.[0]?.email ?? 'viaggiatore@example.com'
    corpo.payload.cancellationReason = 'Pagamento non completato: lo slot è stato liberato.'

    // La riga 8 è stata consegnata al braccio nel primo giro: `cancel_requested_at`
    // è pieno, ed è il segno che ha agito il sistema.
    const prima = await stato(B(8))
    if (!prima.cancel_requested_at) fail('la riga 8 non era stata consegnata: la prova non vale')

    const raw = JSON.stringify(corpo)
    const firma = crypto.createHmac('sha256', segretoCalcom.valore).update(raw, 'utf8').digest('hex')
    const esito = (await db.query('select calcom_webhook($1, $2) as e', [raw, firma])).rows[0].e
    const b = await stato(B(8))
    esito.esito === 'cancellata' && b.status === 'cancelled_unpaid'
      ? ok('il webhook di ritorno chiude la riga, come deve')
      : fail('ritorno gestito male: ' + JSON.stringify(esito) + ' ' + b.status)

    const h = await ultimoAttore(B(8))
    h?.actor === 'system'
      ? ok('e l\'ha fatto il SISTEMA, non il viaggiatore, anche se Cal.com dice il contrario')
      : fail('attribuzione sbagliata nella sola prova di chi ha agito: ' + JSON.stringify(h))
    b.cancelled_by === 'system'
      ? ok('anche cancelled_by dice sistema')
      : fail('cancelled_by: ' + b.cancelled_by)
    // Nessun alert **su questa riga**: il conteggio è per entità e non per
    // tipo, perché il blocco Cal.com più sopra ha già scritto i suoi, legittimi.
    const spuri = (await db.query(
      'select kind from team_alerts where entity_id = $1', [B(8)])).rows.map(r => r.kind)
    spuri.length === 0
      ? ok('e nessun alert su quella riga: la nostra cancellazione non è un\'eccezione')
      : fail('alert spuri sulla nostra stessa cancellazione: ' + JSON.stringify(spuri))
  }

  // ------------------------------------------------- il braccio che non riesce
  console.log('  -- quando il braccio è rotto --')
  await nAlert('orologio_cancellazione_calcom_non_riesce') === 1
    ? ok('tentativi esauriti: un alert critico, una volta sola')
    : fail('nessun alert sui tentativi esauriti')
  {
    await tick()
    await nAlert('orologio_cancellazione_calcom_non_riesce') === 1
      ? ok('e il giro dopo non ne scrive un secondo')
      : fail('alert duplicato a ogni giro')
  }

  // ------------------------------------------------------ il budget dei 35'
  console.log('  -- il budget del Flusso, controllato a ogni giro --')
  {
    await nAlert('orologio_fuori_budget') === 0
      ? ok('con 30 + 0 + 5 = 35 nessun allarme: siamo sul limite, non oltre')
      : fail('allarme di budget con i parametri buoni')
    await db.query(`update app_config set value = 45 where key = 'booking_payment_window_min'`)
    await tick()
    await tick()
    await nAlert('orologio_fuori_budget') === 1
      ? ok('finestra allargata da Studio: un allarme, e uno solo')
      : fail('il budget sfondato non produce esattamente un allarme')
    await db.query(`update app_config set value = 30 where key = 'booking_payment_window_min'`)
  }

  // --------------------------------------------- i parametri non si inventano
  {
    await db.query(`update app_config set value_text = null, value = 0 where key = 'calcom_cancel_url'`)
      .then(async () => {
        try {
          await db.query('select * from clock_tick(10)')
          fail('senza URL di cancellazione l\'orologio ha girato lo stesso')
        } catch {
          ok('manca un parametro: solleva, invece di girare a vuoto in silenzio')
        }
      })
    await db.query(
      `update app_config set value_text = 'https://api.cal.com/v2/bookings/{uid}/cancel', value = null
        where key = 'calcom_cancel_url'`)
  }

  // ------------------------------------------ la riga senza scadenza, mai
  {
    const b = await stato(B(5))
    b.status === 'pending_payment' && b.cancel_requested_at === null
      ? ok('dopo tutti i giri, la riga senza scadenza non è stata toccata nemmeno una volta')
      : fail('la riga senza scadenza è stata toccata: ' + JSON.stringify([b.status, b.cancel_requested_at]))
  }

  // ------------------------------------------------------------ la superficie
  console.log('  -- chi può far girare l\'orologio --')
  for (const f of ['clock_tick(integer)', 'clock_task_done(text,uuid,integer,text)']) {
    for (const ruolo of ['anon', 'authenticated']) {
      const v = (await db.query(`select has_function_privilege($1, $2, 'EXECUTE') as v`, [ruolo, f])).rows[0].v
      v === false ? ok(`${ruolo} non può chiamare ${f.split('(')[0]}`) : fail(`${ruolo} può chiamare ${f}`)
    }
    const v = (await db.query(`select has_function_privilege('service_role', $1, 'EXECUTE') as v`, [f])).rows[0].v
    v === true ? ok(`service_role sì su ${f.split('(')[0]}`) : fail(`service_role non può chiamare ${f}`)
  }
}

// ===========================================================================
// Le firme rifiutate (migration 0042)
// ===========================================================================
// Il silenzio che questa parte rompe: una parola segreta sbagliata su un account
// Cal.com produce `firma_non_valida`, che non scrive niente da nessuna parte, e
// n8n risponde 200. Quel designer smette di arrivarci e nessuno lo sa.
console.log('\n== Le firme Cal.com rifiutate ==')
{
  const NOSTRO = 'marco-rossi-xpetis'   // il cal_username del designer di prova

  // I blocchi precedenti hanno già fatto rifiuti veri — il ponte Cal.com prova
  // la firma sbagliata. Si azzera il campo per poter contare da zero.
  await db.query('delete from calcom_signature_rejections')
  await db.query("delete from team_alerts where kind in ('calcom_firme_rifiutate', 'orologio_ramo_non_configurato')")

  const corpo = (username) => JSON.stringify({
    triggerEvent: 'BOOKING_CREATED',
    createdAt: new Date().toISOString(),
    payload: { uid: 'uid-finto', type: 'consulenza-xpetis-30', organizer: { username } },
  })
  const rifiuta = async (c) =>
    (await db.query('select calcom_webhook($1, $2) as e', [c, 'firma-inventata'])).rows[0].e
  const conteggi = async () =>
    (await db.query(`select cal_username_hint, n from calcom_signature_rejections
                      order by coalesce(cal_username_hint, '')`)).rows
  const nAlert = async (kind) =>
    Number((await db.query('select count(*) from team_alerts where kind = $1', [kind])).rows[0].count)
  const alert = async (kind) =>
    (await db.query(
      'select message from team_alerts where kind = $1 order by created_at desc limit 1', [kind])).rows[0]
  const tick = () => db.query('select * from clock_tick(100)')

  // ------------------------------------------------------------- il conteggio
  console.log('  -- si conta, e non si scrive un diario --')
  {
    const e = await rifiuta(corpo(NOSTRO))
    e.esito === 'firma_non_valida' ? ok('firma inventata: rifiutata, come prima') : fail(JSON.stringify(e))

    const righe = await conteggi()
    righe.length === 1 && righe[0].n === 1 && righe[0].cal_username_hint === NOSTRO
      ? ok('il rifiuto è contato, con l\'indizio di chi lo manda')
      : fail('conteggio: ' + JSON.stringify(righe))
  }
  {
    await rifiuta(corpo(NOSTRO))
    await rifiuta(corpo(NOSTRO))
    const righe = await conteggi()
    righe.length === 1 && righe[0].n === 3
      ? ok('tre rifiuti nella stessa ora: UNA riga che conta 3, non tre righe')
      : fail('la tabella cresce per messaggio: ' + JSON.stringify(righe))
  }
  {
    // È il principio della 0037 che non si annulla: l'indirizzo del webhook è
    // pubblico, e un corpo non autenticato non entra nel diario.
    const n = Number((await db.query(
      "select count(*) from webhook_events where provider='cal' and external_id like '%uid-finto%'")).rows[0].count)
    n === 0
      ? ok('e webhook_events resta intatto: un corpo non firmato non ci entra')
      : fail('il corpo non autenticato è finito nel diario: ' + n)
  }

  // --------------------------------------------- l'indizio, che è solo nostro
  console.log('  -- l\'indizio è un indizio, e non è testo arbitrario --')
  {
    await rifiuta(corpo('account-che-non-conosciamo'))
    const righe = await conteggi()
    const ignoto = righe.find(r => r.cal_username_hint === null)
    righe.some(r => r.cal_username_hint === 'account-che-non-conosciamo')
      ? fail('un username inventato è stato salvato: la tabella accetta testo da chiunque')
      : ok('un username che non è dei nostri non si salva: diventa "non dichiarato"')
    ignoto && ignoto.n === 1 ? ok('e viene contato lì') : fail('conteggio ignoto: ' + JSON.stringify(righe))
  }
  {
    await rifiuta('questo non è JSON')
    const righe = await conteggi()
    const ignoto = righe.find(r => r.cal_username_hint === null)
    ignoto && ignoto.n === 2
      ? ok('un corpo che non è nemmeno JSON viene contato senza far esplodere niente')
      : fail('corpo non JSON: ' + JSON.stringify(righe))
  }

  // ------------------------------------------------------------ sopra soglia
  console.log('  -- quando l\'orologio decide che è troppo --')
  {
    await tick()
    await nAlert('calcom_firme_rifiutate') === 1
      ? ok('cinque rifiuti con soglia 3: un alert')
      : fail('nessun alert sopra soglia')
    const m = await alert('calcom_firme_rifiutate')
    m?.message?.includes(NOSTRO) && m.message.includes('NON VERIFICATO')
      ? ok('l\'alert dice chi, e dice a chiare lettere che è un indizio non verificato')
      : fail('testo dell\'alert: ' + (m?.message ?? '(nessuno)'))
  }
  {
    await tick()
    await tick()
    await nAlert('calcom_firme_rifiutate') === 1
      ? ok('e resta uno solo finché non viene risolto, come gli altri alert dell\'orologio')
      : fail('alert duplicato a ogni giro')
  }
  {
    // Sotto soglia non si disturba nessuno: si risolve l'alert e si riparte da
    // due soli rifiuti.
    await db.query("update team_alerts set resolved_at = now() where kind = 'calcom_firme_rifiutate'")
    await db.query('delete from calcom_signature_rejections')
    await rifiuta(corpo(NOSTRO))
    await rifiuta(corpo(NOSTRO))
    await tick()
    await nAlert('calcom_firme_rifiutate') === 1
      ? ok('due rifiuti con soglia 3: nessun alert nuovo')
      : fail('alert sotto soglia: l\'indirizzo pubblico lo farebbe scattare a ogni scanner di passaggio')
  }

  // ------------------------------------------------- la finestra e la pulizia
  console.log('  -- la finestra, e la tabella che non cresce per sempre --')
  {
    await db.query(`update calcom_signature_rejections
                       set bucket_at = now() - interval '40 days',
                           last_at   = now() - interval '40 days'`)
    await tick()
    const righe = await conteggi()
    righe.length === 0
      ? ok('i conteggi più vecchi della conservazione vengono cancellati dall\'orologio')
      : fail('la tabella non si pulisce: ' + JSON.stringify(righe))
  }

  // ------------------------------------------ un ramo spento non resta zitto
  console.log('  -- se manca la configurazione, il ramo lo dice --')
  {
    await db.query("update app_config set value = null, value_text = 'spento' where key = 'calcom_signature_alert_threshold'")
    await tick()
    await nAlert('orologio_ramo_non_configurato') === 1
      ? ok('senza soglia il ramo è spento, e scrive che è spento')
      : fail('ramo spento in silenzio: è esattamente il guasto che questa migration chiude')
    await tick()
    await nAlert('orologio_ramo_non_configurato') === 1
      ? ok('e anche questo alert è uno solo')
      : fail('alert duplicato')
    await db.query("update app_config set value = 3, value_text = null where key = 'calcom_signature_alert_threshold'")
  }

  // ------------------------------------------------------------ la superficie
  console.log('  -- chi può leggere i conteggi --')
  for (const ruolo of ['anon', 'authenticated']) {
    const v = (await db.query(
      `select has_table_privilege($1, 'calcom_signature_rejections', 'SELECT') as v`, [ruolo])).rows[0].v
    v === false ? ok(`${ruolo} non può leggere calcom_signature_rejections`) : fail(`${ruolo} legge i conteggi`)
  }
  {
    const rls = (await db.query(
      `select relrowsecurity from pg_class where relname = 'calcom_signature_rejections'`)).rows[0].relrowsecurity
    rls === true ? ok('RLS accesa, come ogni tabella nuova') : fail('RLS spenta')
  }
}

console.log('\n== I testi delle mail ==')
{
  const rende = async (chiave, valori = {}, bh = {}, bt = {}) =>
    (await db.query('select * from render_template($1, $2, $3, $4)',
      [chiave, JSON.stringify(valori), JSON.stringify(bh), JSON.stringify(bt)])).rows[0]

  const solleva = async (label, fn, atteso) => {
    try { await fn(); fail(`${label} — non ha sollevato e doveva`) }
    catch (e) {
      String(e.message).toLowerCase().includes(atteso.toLowerCase())
        ? ok(label) : fail(`${label} — errore diverso: ${e.message}`)
    }
  }

  // ------------------------------------------------- i vincoli della tabella
  console.log('  -- cosa la tabella non lascia scrivere --')
  await expectFail('una mail senza oggetto', `
    insert into message_templates (key, template_kind, body_it)
    values ('prova_senza_oggetto', 'mail', 'corpo')`, 'ha_oggetto')
  await expectFail('un blocco con un oggetto', `
    insert into message_templates (key, template_kind, subject_it, body_it)
    values ('prova_blocco_oggetto', 'blocco', 'oggetto', 'corpo')`, 'ha_oggetto')
  await expectFail('un bottone su una mail intera', `
    insert into message_templates (key, template_kind, subject_it, body_it, button_label_it)
    values ('prova_bottone', 'mail', 'oggetto', 'corpo', 'Clicca')`, 'bottone_solo_sui_blocchi')

  // ------------------------------------------------------- la composizione
  console.log('  -- da prosa a mail --')
  await solleva('un testo che non esiste solleva invece di comporre il vuoto',
    () => rende('non_esiste_questo_testo'), 'non trovato')

  await solleva('un segnaposto non fornito solleva: «Ciao ,» lo vedrebbe solo il destinatario',
    () => rende('postcall_traveler', { designer: 'Marco' }), 'saluto')

  await db.exec(`
    insert into message_templates (key, template_kind, body_it, button_label_it, placeholders)
    values ('prova_blocco', 'blocco',
            'Un paragrafo con {{chi}} dentro.', 'Vai da {{chi}}', array['chi']);
    insert into message_templates (key, template_kind, subject_it, body_it, placeholders)
    values ('prova_mail', 'mail', 'Oggetto per {{chi}}',
            E'Primo paragrafo, con {{chi}}.\\nSeconda riga dello stesso paragrafo.\\n\\n{{inserto}}\\n\\nScrivici qui: https://xpetis.it/aiuto',
            array['chi', 'inserto']);`)

  {
    const b = await rende('prova_blocco', { chi: 'Marco' })
    b.body_html.includes('<p style=') && b.body_html.includes('Un paragrafo con Marco dentro.')
      ? ok('un paragrafo diventa un <p>') : fail('html del blocco: ' + b.body_html)
    b.button_label === 'Vai da Marco'
      ? ok('anche l\'etichetta del bottone accetta i segnaposto') : fail('etichetta: ' + b.button_label)
  }
  {
    const m = await rende('prova_mail', { chi: 'Marco' },
      { inserto: '<p>BLOCCO</p>' }, { inserto: 'BLOCCO' })
    m.subject === 'Oggetto per Marco' ? ok('l\'oggetto si compone') : fail('oggetto: ' + m.subject)
    m.body_html.includes('Primo paragrafo, con Marco.<br>Seconda riga')
      ? ok('un a capo singolo resta dentro il paragrafo, come <br>')
      : fail('a capo: ' + m.body_html)
    // Il blocco esce **senza** involucro: è la regola che impedisce a un
    // bottone di finire dentro un <p>, dove metà dei client lo stampa storto.
    !m.body_html.includes('<p style="margin:0 0 18px;font-size:16px;line-height:1.55"><p>BLOCCO')
      && m.body_html.includes('<p>BLOCCO</p>')
      ? ok('un blocco da solo sulla sua riga entra senza involucro')
      : fail('blocco impaginato male: ' + m.body_html)
    m.body_html.includes('<a href="https://xpetis.it/aiuto"')
      ? ok('un indirizzo scritto in chiaro diventa un link')
      : fail('link non riconosciuto: ' + m.body_html)
    m.body_text.includes('https://xpetis.it/aiuto') && !m.body_text.includes('<')
      ? ok('e la versione testuale resta testo, senza tag')
      : fail('testo: ' + m.body_text)
  }
  {
    // Il caso che conta: un nome con dentro caratteri che in HTML significano
    // qualcosa. Non deve aprire niente.
    const m = await rende('prova_mail', { chi: 'Rossi & <b>Co</b>' },
      { inserto: 'x' }, { inserto: 'x' })
    m.body_html.includes('Rossi &amp; &lt;b&gt;Co&lt;/b&gt;')
      ? ok('un nome con & e < non apre un tag: si stampa')
      : fail('escape mancato: ' + m.body_html)
    m.body_text.includes('Rossi & <b>Co</b>')
      ? ok('e nella versione testuale resta com\'è scritto') : fail('testo: ' + m.body_text)
  }
  {
    const doc = (await db.query(`select email_document('<p>ciao</p>', 'anteprima') as d`)).rows[0].d
    doc.startsWith('<!doctype html>') && doc.includes('anteprima') && doc.includes('#F0EEDF')
      ? ok('il documento ha involucro, anteprima e la palette del Figma')
      : fail('documento: ' + doc.slice(0, 120))
  }

  // ------------------------------------------------- i testi veri del seed
  console.log('  -- i testi seminati --')
  {
    const r = (await db.query(
      `select key, template_kind from message_templates where key not like 'prova_%' order by key`)).rows
    const attesi = ['blocco_firma', 'blocco_intro_servizi', 'blocco_servizio_all_inclusive',
                    'blocco_servizio_custom_itinerary', 'postcall_traveler', 'unpaid_cancelled_traveler']
    JSON.stringify(r.map(x => x.key)) === JSON.stringify(attesi)
      ? ok('le sei righe del seed ci sono') : fail('righe: ' + JSON.stringify(r.map(x => x.key)))
  }
  {
    // La regola 2 del seed: il credito si promette, non si quantifica. Nessun
    // testo deve contenere una cifra in euro.
    const r = (await db.query(
      `select key from message_templates
        where body_it ~ '[0-9]+\\s*€' or coalesce(subject_it,'') ~ '[0-9]+\\s*€'`)).rows
    r.length === 0
      ? ok('nessun testo nomina una cifra: il credito lo applica il designer, non il codice')
      : fail('testi con un importo dentro: ' + JSON.stringify(r))
  }
  await db.exec(`delete from message_templates where key like 'prova_%'`)
}

console.log('\n== La cerniera del dopo-call: la coda ==')
{
  const TD      = '11111111-1111-1111-1111-111111111111'   // Marco: su misura + All Inclusive
  const TD2     = '22222222-2222-2222-2222-222222222222'   // Giulia: solo All Inclusive
  const ANNA    = '44444444-4444-4444-4444-444444444444'
  const C = (n) => `c0dac0da-0000-4000-8000-00000000000${n}`

  const creaCall = async (n, td, finita, stato = 'confirmed') =>
    db.query(
      `insert into bookings (id, traveler_id, td_id, service_type, status, cal_booking_uid,
                             cal_event_type_slug, starts_at, ends_at, original_starts_at,
                             price_cents, confirmed_at, last_actor)
       values ($1, $2, $3, 'consultation', $4, 'uid-postcall-' || $5, 'consulenza-xpetis-30',
               ${finita} - interval '30 minutes', ${finita}, ${finita} - interval '30 minutes',
               6000, now(), 'n8n')`,
      [C(n), ANNA, td, stato, String(n)])

  const tick = async (limite = 100) =>
    (await db.query('select * from clock_tick($1)', [limite])).rows
  const coda = async (bookingId) =>
    (await db.query(
      `select * from outbound_messages where entity_type='booking' and entity_id=$1
        order by queued_at`, [bookingId])).rows
  const nAlert = async (kind) =>
    Number((await db.query(
      'select count(*) from team_alerts where kind = $1 and resolved_at is null', [kind])).rows[0].count)

  await db.query(`delete from team_alerts`)

  await creaCall(1, TD,  `now() - interval '10 minutes'`)   // finita da poco: parte
  await creaCall(2, TD,  `now() + interval '2 hours'`)      // non ancora finita
  await creaCall(3, TD,  `now() - interval '3 days'`)       // troppo vecchia
  await creaCall(4, TD,  `now() - interval '20 minutes'`, 'cancelled')  // non si è mai svolta

  // ------------------------------------------------------------- il grilletto
  console.log('  -- chi riceve la mail, e chi no --')
  await tick()
  {
    const righe = await coda(C(1))
    righe.length === 1 && righe[0].message_kind === 'postcall_traveler'
      ? ok('una call finita da poco produce la mail post-call')
      : fail('coda: ' + JSON.stringify(righe.map(r => r.message_kind)))
    righe[0]?.status === 'queued' && righe[0]?.sent_at === null
      ? ok('la riga nasce in coda, e sent_at è nullo: non si dichiara partita senza esserlo')
      : fail('stato: ' + JSON.stringify([righe[0]?.status, righe[0]?.sent_at]))
    righe[0]?.recipient === 'viaggiatore@example.com'
      ? ok('con il destinatario vero') : fail('destinatario: ' + righe[0]?.recipient)
  }
  {
    const n = (await coda(C(2))).length
    n === 0 ? ok('una call non ancora finita non produce niente') : fail('mail anticipata')
  }
  {
    const n = (await coda(C(4))).length
    n === 0 ? ok('una call annullata non riceve il "grazie per la call"') : fail('mail su una call annullata')
  }
  {
    const n = (await coda(C(3))).length
    n === 0 ? ok('una call finita tre giorni fa non riceve più la mail') : fail('mail vecchia partita')
    await nAlert('postcall_mail_non_partita') === 1
      ? ok('ma la cosa si dice: un alert, perché saltare in silenzio è il guasto')
      : fail('la call saltata non ha prodotto nessun alert')
  }

  // ------------------------------------------------ il vincolo che è un tetto
  console.log('  -- l\'orologio rigira --')
  {
    await tick(); await tick()
    const n = (await coda(C(1))).length
    n === 1
      ? ok('tre giri dell\'orologio, UNA mail: il vincolo di unicità è anche il tetto di spesa')
      : fail(`l'orologio ha accodato ${n} volte la stessa mail`)
  }

  // ------------------------------------------------------------- i bottoni
  console.log('  -- i bottoni, e i token che ci stanno dietro --')
  {
    const m = (await coda(C(1)))[0]
    const token = (await db.query(
      `select payload->>'service_type' as servizio, token, expires_at, single_use
         from access_tokens where booking_id = $1 and purpose = 'traveler_service_request'
        order by 1`, [C(1)])).rows

    token.length === 2
      ? ok('due servizi attivi, due token: uno per servizio, col servizio nel payload')
      : fail('token creati: ' + JSON.stringify(token.map(t => t.servizio)))
    token.every(t => t.expires_at === null)
      ? ok('e non scadono mai, come vuole il Flusso — è la ragione per cui sono una credenziale permanente')
      : fail('un token post-call con scadenza')
    token.every(t => m.body_html.includes('/servizio/' + t.token))
      ? ok('tutti e due i link sono nel corpo della mail')
      : fail('link mancanti nel corpo')
    m.body_html.includes('Chiedi l&#39;itinerario su misura') && m.body_html.includes('Chiedi l&#39;All Inclusive')
      ? ok('con le etichette dei bottoni dei soli servizi di quel designer')
      : fail('etichette: ' + m.body_html.slice(0, 400))
    m.body_text.includes('/servizio/') && !m.body_text.includes('<a ')
      ? ok('e la versione testuale porta i link in chiaro') : fail('testo: ' + m.body_text)
  }
  {
    // La 0012 ammetteva UN token attivo per scopo su ogni entità: con due
    // bottoni nella stessa mail quell'assunto non regge più, ed è il motivo per
    // cui l'indice è stato rifatto.
    const c = Number((await db.query(
      `select count(*) from access_tokens where booking_id = $1 and revoked_at is null`, [C(1)])).rows[0].count)
    c === 2 ? ok('l\'indice rifatto ammette due token attivi perché i servizi sono due') : fail('token attivi: ' + c)
  }
  {
    // Un designer che non vende niente dopo la call: la mail parte lo stesso ed
    // è un ringraziamento, senza una riga appesa che annunci bottoni assenti.
    await db.query(`update td_services set is_active = false where td_id = $1`, [TD2])
    await creaCall(5, TD2, `now() - interval '5 minutes'`)
    await tick()
    const m = (await coda(C(5)))[0]
    m ? ok('un designer senza servizi attivi: la mail parte lo stesso') : fail('nessuna mail')
    m && !m.body_html.includes('/servizio/')
      ? ok('e non porta nessun bottone') : fail('bottoni su un designer che non vende niente')
    m && !m.body_text.includes('ecco cosa potete fare insieme')
      ? ok('né la frase che li introduce: sta dentro il blocco, quindi sparisce con loro')
      : fail('frase appesa senza bottoni sotto')
    await db.query(`update td_services set is_active = true where td_id = $1`, [TD2])
  }

  // ------------------------------------------------------- l'interruttore
  console.log('  -- si compone sempre, si consegna solo se acceso --')
  {
    const compiti = (await tick()).filter(t => t.task === 'email_send')
    compiti.length === 0
      ? ok('con email_enabled a 0 nessuna mail esce: la coda si legge su Studio e basta')
      : fail('posta consegnata a interruttore spento')
  }
  await db.query(`update app_config set value = 1 where key = 'email_enabled'`)
  {
    const compiti = (await tick()).filter(t => t.task === 'email_send')
    compiti.length >= 2 ? ok('acceso, i compiti escono') : fail('compiti: ' + compiti.length)
    const idAtteso = (await coda(C(1)))[0].id
    const c = compiti.find(t => t.entity_id === idAtteso)
    const p = c?.payload ?? {}
    p.to === 'viaggiatore@example.com' && p.from && p.subject && p.html && p.text
      ? ok('il compito porta destinatario, mittente, oggetto e le due forme del corpo')
      : fail('compito: ' + JSON.stringify(Object.keys(p)))
    p.idempotency_key === c.entity_id
      ? ok('e la chiave di idempotenza, che impedisce il doppione se l\'ack si perde')
      : fail('chiave di idempotenza: ' + p.idempotency_key)
    Object.keys(p).length === 7
      ? ok('e niente di più: un corpo con un campo di troppo è come il ponte ha già preso un 400')
      : fail('campi nel payload: ' + JSON.stringify(Object.keys(p)))
  }
  {
    // Un compito appena consegnato non si riconsegna al giro dopo: stessa
    // regola del braccio che cancella su Cal.com.
    const compiti = (await tick()).filter(t => t.task === 'email_send')
    compiti.length === 0 ? ok('un giro subito dopo non riconsegna le mail già in mano al braccio')
                         : fail('mail riconsegnata mentre il braccio la aveva in mano')
  }

  // --------------------------------------------------------- il dirottamento
  console.log('  -- come si prova senza scrivere a nessuno --')
  {
    await db.query(`update app_config set value_text = 'prove@xpetis.it' where key = 'email_redirect_to'`)
    await db.query(`update outbound_messages set last_attempt_at = null, attempts = 0 where status = 'queued'`)
    // Si guarda una riga precisa: a questo punto in coda ce ne sono anche altre,
    // nate dalle prenotazioni dei due ponti.
    const idTest = (await coda(C(5)))[0].id
    const c = (await tick()).find(t => t.task === 'email_send' && t.entity_id === idTest)
    c.payload.to === 'prove@xpetis.it'
      ? ok('con email_redirect_to ogni mail va alla casella di prova') : fail('to: ' + c.payload.to)
    c.payload.subject.startsWith('[prova → viaggiatore@example.com]')
      ? ok('e l\'oggetto dice a chi sarebbe andata') : fail('oggetto: ' + c.payload.subject)
    const riga = (await db.query('select recipient, delivered_to from outbound_messages where id = $1',
      [idTest])).rows[0]
    riga.recipient === 'viaggiatore@example.com' && riga.delivered_to === 'prove@xpetis.it'
      ? ok('recipient resta la persona vera — il vincolo continua a significare quello che significa')
      : fail('riga: ' + JSON.stringify(riga))
    await db.query(`update app_config set value_text = '' where key = 'email_redirect_to'`)
  }

  // ------------------------------------------------------------- gli esiti
  console.log('  -- cosa significa la risposta di Resend --')
  const ack = async (id, stato, dettaglio) =>
    (await db.query('select clock_task_done($1, $2, $3, $4) as e',
      ['email_send', id, stato, dettaglio ?? null])).rows[0].e
  const riga = async (id) =>
    (await db.query('select * from outbound_messages where id = $1', [id])).rows[0]

  {
    const id = (await coda(C(1)))[0].id
    const e = await ack(id, 200, '{"id":"49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"}')
    const r = await riga(id)
    e.esito === 'inviata' && r.status === 'sent' && r.sent_at !== null
      ? ok('200: sent_at si valorizza adesso, e non un istante prima')
      : fail('esito 200: ' + JSON.stringify([e, r.status, r.sent_at]))
    r.provider_message_id === '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794'
      ? ok('insieme all\'identificativo che restituisce Resend: è il filo per cercarla nel loro pannello')
      : fail('id del provider: ' + r.provider_message_id)
    const e2 = await ack(id, 200, '{"id":"altro"}')
    e2.esito === 'gia_inviata' && (await riga(id)).provider_message_id === '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794'
      ? ok('e un secondo ack non la manda una seconda volta né riscrive l\'identificativo')
      : fail('doppio ack: ' + JSON.stringify(e2))
  }
  {
    const id = (await coda(C(5)))[0].id
    const e = await ack(id, 429, '{"message":"Too many requests"}')
    const r = await riga(id)
    e.esito === 'troppo_in_fretta' && r.status === 'queued'
      ? ok('429: è il limite di richieste al secondo, non un guasto — la riga resta in coda')
      : fail('429: ' + JSON.stringify([e, r.status]))
    await ack(id, 503, 'gateway')
    ;(await riga(id)).status === 'queued'
      ? ok('503: il provider non ha risposto, si riprova') : fail('503 ha chiuso la riga')
    const e4 = await ack(id, 422, '{"message":"Invalid `from` field"}')
    const r4 = await riga(id)
    e4.esito === 'rifiutata' && r4.status === 'failed' && r4.sent_at === null
      ? ok('422: definitivo. Un mittente non verificato non guarisce riprovando')
      : fail('422: ' + JSON.stringify([e4, r4.status]))
    await nAlert('email_rifiutata') === 1
      ? ok('e il team lo sa, con dentro il comando per rimetterla in coda dopo aver corretto')
      : fail('nessun alert su una mail rifiutata')
    r4.last_error?.includes('Invalid')
      ? ok('l\'errore resta scritto sulla riga') : fail('last_error: ' + r4.last_error)
  }
  {
    // Una riga `failed` non torna in coda da sola: ci vuole una mano.
    const idRifiutata = (await coda(C(5)))[0].id
    const c = (await tick()).filter(t => t.task === 'email_send')
    c.some(t => t.entity_id === idRifiutata)
      ? fail('una mail rifiutata definitivamente è stata riconsegnata al braccio')
      : ok('una mail rifiutata non si ritenta: resta lì, col suo errore, finché qualcuno guarda')
  }

  // ------------------------------------------------ la mail che mancava dal 20/9
  console.log('  -- la mail cortese di chi ha perso lo slot --')
  {
    const B = 'c0dac0da-0000-4000-8000-0000000000aa'
    await db.query(
      `insert into bookings (id, traveler_id, td_id, service_type, status, cal_booking_uid,
                             cal_event_type_slug, starts_at, ends_at, original_starts_at,
                             price_cents, payment_deadline_at, cancel_requested_at, cancel_attempts, last_actor)
       values ($1, $2, $3, 'consultation', 'pending_payment', 'uid-insoluto-mail',
               'consulenza-xpetis-30', now() + interval '2 days',
               now() + interval '2 days' + interval '30 minutes', now() + interval '2 days',
               6000, now() - interval '1 hour', now(), 1, 'traveler')`,
      [B, ANNA, TD])

    const e = (await db.query('select clock_task_done($1, $2, $3) as e',
      ['calcom_cancel_unpaid', B, 200])).rows[0].e
    e.esito === 'liberata' ? ok('lo slot si libera, come prima') : fail(JSON.stringify(e))

    const m = (await coda(B)).find(r => r.message_kind === 'unpaid_cancelled_traveler')
    m ? ok('e adesso parte anche la mail cortese, che dal 18 settembre era l\'unico pezzo mancante')
      : fail('nessuna mail sullo slot liberato')
    m && !/annullat|cancellat/i.test(m.subject)
      ? ok('l\'oggetto non ripete l\'annullamento che Cal.com sta già mandando')
      : fail('oggetto che ripete Cal.com: ' + m?.subject)
    m && m.body_html.includes('/designer/marco-rossi')
      ? ok('e porta il calendario del designer, cioè cosa fare adesso')
      : fail('nessun link alla vetrina')
  }

  await db.query(`update app_config set value = 0 where key = 'email_enabled'`)
}

console.log('\n== Le pagine a token ==')
{
  const TD   = '11111111-1111-1111-1111-111111111111'
  const ANNA = '44444444-4444-4444-4444-444444444444'
  const CALL = 'c0dac0da-0000-4000-8000-000000000001'   // la call di prova già finita

  const risolvi = async (t) =>
    (await db.query('select * from resolve_access_token_detail($1)', [t])).rows[0]
  const pagina = async (t) =>
    (await db.query('select service_request_page($1) as p', [t])).rows[0].p
  const chiedi = async (t) =>
    (await db.query('select create_order_from_token($1) as e', [t])).rows[0].e

  const tokenDi = async (servizio) =>
    (await db.query(
      `select token from access_tokens where booking_id = $1 and payload->>'service_type' = $2
         and revoked_at is null`, [CALL, servizio])).rows[0].token

  // ------------------------------------------------------- cinque risposte
  console.log('  -- cinque risposte, non una --')
  {
    const r = await risolvi('token-che-non-esiste-mai')
    r.esito === 'inesistente' && r.token === null
      ? ok('inesistente: e non torna niente da cui dedurre qualcosa')
      : fail('inesistente: ' + JSON.stringify(r))
    const n = Number((await db.query('select coalesce(sum(n),0) as n from access_token_misses')).rows[0].n)
    n >= 1 ? ok('e il tentativo a vuoto viene contato: la linea ha un testimone')
           : fail('il tentativo non è stato contato')
  }
  {
    const r = (await db.query(
      `insert into access_tokens (purpose, audience, booking_id, td_id, expires_at, payload)
       values ('traveler_review','traveler',$1,$2, now() - interval '1 day', '{"x":1}')
       returning token`, [CALL, TD])).rows[0]
    ;(await risolvi(r.token)).esito === 'scaduto'
      ? ok('scaduto: chi ha un link vecchio è una persona legittima, e lo sa')
      : fail('scaduto non riconosciuto')
    await db.query(`update access_tokens set revoked_at = now() where token = $1`, [r.token])
    ;(await risolvi(r.token)).esito === 'revocato' ? ok('revocato') : fail('revocato non riconosciuto')
  }
  {
    const r = (await db.query(
      `insert into access_tokens (purpose, audience, booking_id, td_id, single_use, used_at, payload)
       values ('traveler_review','traveler',$1,$2, true, now(), '{"y":1}')
       returning token`, [CALL, TD])).rows[0]
    ;(await risolvi(r.token)).esito === 'gia_usato'
      ? ok('monouso già usato') : fail('single_use non riconosciuto')
  }
  {
    const t = await tokenDi('custom_itinerary')
    const prima = (await db.query('select use_count from access_tokens where token=$1', [t])).rows[0].use_count
    const r = await risolvi(t)
    const dopo = (await db.query('select use_count from access_tokens where token=$1', [t])).rows[0].use_count
    r.esito === 'valido' && r.booking_id === CALL
      ? ok('valido: e torna il contesto già risolto') : fail('valido: ' + JSON.stringify(r))
    dopo === prima + 1
      ? ok('risolvere scrive (use_count, last_seen_at): per questo si chiama una volta per richiesta')
      : fail('use_count: ' + prima + ' → ' + dopo)
  }

  // ------------------------------------------------------- chi può chiamare
  console.log('  -- cosa vede il browser --')
  for (const ruolo of ['anon', 'authenticated']) {
    for (const f of ['resolve_access_token(text)', 'resolve_access_token_detail(text)',
                     'create_order_from_token(text)', 'service_request_page(text)',
                     'render_template(text,jsonb,jsonb,jsonb)', 'clock_tick(integer)']) {
      const v = (await db.query(`select has_function_privilege($1, $2, 'EXECUTE') as v`, [ruolo, f])).rows[0].v
      v === false ? ok(`${ruolo} non può eseguire ${f.split('(')[0]}()`) : fail(`${ruolo} esegue ${f}`)
    }
    for (const t of ['access_tokens', 'access_token_misses', 'outbound_messages', 'message_templates']) {
      const v = (await db.query(`select has_table_privilege($1, $2, 'SELECT') as v`, [ruolo, t])).rows[0].v
      v === false ? ok(`${ruolo} non può leggere ${t}`) : fail(`${ruolo} legge ${t}`)
    }
  }
  {
    const r = (await db.query(
      `select relrowsecurity from pg_class where relname in ('access_token_misses','message_templates')`)).rows
    r.length === 2 && r.every(x => x.relrowsecurity === true)
      ? ok('RLS accesa su tutte e due le tabelle nuove') : fail('RLS: ' + JSON.stringify(r))
  }

  // ------------------------------------------------------------ il clic
  console.log('  -- un clic, un ordine --')
  {
    const t = await tokenDi('custom_itinerary')
    const p = await pagina(t)
    p.esito === 'valido' && p.service_type === 'custom_itinerary' && p.td_name === 'Marco Rossi'
      ? ok('la pagina sa cosa mostrare prima del clic') : fail('pagina: ' + JSON.stringify(p))

    const e = await chiedi(t)
    e.ok === true && e.esito === 'creato' && /^XP-\d{5}$/.test(e.human_ref)
      ? ok('il clic crea l\'ordine, con il riferimento leggibile') : fail('clic: ' + JSON.stringify(e))

    const o = (await db.query('select * from orders where id = $1', [e.order_id])).rows[0]
    o.status === 'requested' && o.service_type === 'custom_itinerary' && o.source_booking_id === CALL
      ? ok('nasce in `requested`, sul servizio del payload e sulla call del token')
      : fail('ordine: ' + JSON.stringify([o.status, o.service_type]))
    o.consultation_credit_cents === 0
      ? ok('e il credito consulenza resta a zero: lo applica il TD nella proposta, non il codice')
      : fail('credito calcolato dal codice: ' + o.consultation_credit_cents)

    const h = (await db.query(
      `select actor, to_status from order_status_history where order_id = $1`, [e.order_id])).rows[0]
    h.actor === 'traveler'
      ? ok('l\'attore è `traveler`, e viene dal token: è l\'unica prova di chi ha agito')
      : fail('attore: ' + h.actor)

    const l = (await db.query(
      `select payload from event_log where entity_id = $1 and event = 'ordine_richiesto_da_mail_postcall'`,
      [e.order_id])).rows[0]
    l?.payload?.token === t ? ok('e il diario dice con quale token') : fail('event_log: ' + JSON.stringify(l))

    const a = (await db.query(
      `select message from team_alerts where kind = 'ordine_richiesto' and entity_id = $1`,
      [e.order_id])).rows[0]
    a?.message?.includes('gruppo WhatsApp')
      ? ok('il team è avvisato, e l\'alert dice qual è il gesto umano che tocca a lui')
      : fail('alert: ' + JSON.stringify(a))
  }
  {
    const t = await tokenDi('custom_itinerary')
    const e = await chiedi(t)
    e.ok === true && e.esito === 'gia_richiesto'
      ? ok('cliccare due volte non crea due richieste, e non è un errore da mostrare')
      : fail('doppio clic: ' + JSON.stringify(e))
    const n = Number((await db.query(
      `select count(*) from orders where source_booking_id = $1 and service_type = 'custom_itinerary'`,
      [CALL])).rows[0].count)
    n === 1 ? ok('un ordine solo') : fail('ordini: ' + n)
    ;(await pagina(t)).esito === 'gia_richiesto'
      ? ok('e la pagina racconta lo stesso, che è la verità') : fail('pagina dopo il clic')
  }
  {
    // Il servizio viene dal payload del token e da nessun'altra parte: due
    // token della stessa call portano a due ordini diversi, e non c'è nessun
    // parametro con cui scambiarli.
    const t = await tokenDi('all_inclusive')
    const e = await chiedi(t)
    e.esito === 'creato' && e.service_type === 'all_inclusive'
      ? ok('l\'altro bottone crea l\'altro servizio: il servizio sta nel token')
      : fail('all inclusive: ' + JSON.stringify(e))
  }

  // ------------------------------------------------ l'entità cambiata di stato
  console.log('  -- token buono, call che non lo è più --')
  {
    const CALL2 = 'c0dac0da-0000-4000-8000-000000000005'
    const t = (await db.query(
      `select token from access_tokens where booking_id = $1 and revoked_at is null limit 1`, [CALL2])).rows[0]
    // Su quella call il designer non aveva servizi attivi, quindi non c'è
    // nessun token: se ne fabbrica uno a mano, come si farebbe dal SQL Editor.
    const tok = t?.token ?? (await db.query(
      `insert into access_tokens (purpose, audience, booking_id, td_id, payload)
       values ('traveler_service_request','traveler',$1,
               (select td_id from bookings where id = $1),
               jsonb_build_object('service_type','all_inclusive'))
       returning token`, [CALL2])).rows[0].token

    await db.query(`update bookings set status = 'disputed', last_actor='team' where id = $1`, [CALL2])
    const e = await chiedi(tok)
    e.ok === false && e.esito === 'call_in_stato_non_ammesso'
      ? ok('un token valido su una call finita in disputa non crea niente, e lo dice')
      : fail('stato non ammesso: ' + JSON.stringify(e))
    ;(await pagina(tok)).esito === 'call_in_stato_non_ammesso'
      ? ok('e la pagina dice la stessa cosa, perché è la stessa funzione a rispondere')
      : fail('pagina in disaccordo con la funzione')

    // Rimessa in uno stato buono, ma nel frattempo il designer ha spento il
    // servizio: è il caso che un token permanente rende inevitabile, perché fra
    // la mail e il clic possono passare mesi.
    await db.query(`update bookings set status = 'completed', last_actor='team' where id = $1`, [CALL2])
    await db.query(`update td_services set is_active = false
                     where td_id = (select td_id from bookings where id = $1)
                       and service_type = 'all_inclusive'`, [CALL2])
    const e2 = await chiedi(tok)
    e2.esito === 'servizio_non_piu_attivo'
      ? ok('un servizio spento dopo che la mail è partita: il bottone smette di funzionare, e lo spiega')
      : fail('servizio spento: ' + JSON.stringify(e2))
    // E la pagina lo dice PRIMA del clic: un bottone che al clic risponde «non è
    // più disponibile» è un tasto che mente.
    ;(await pagina(tok)).esito === 'servizio_non_piu_attivo'
      ? ok('e la pagina non offre nemmeno il bottone')
      : fail('la pagina offre un bottone che non funzionerebbe')
  }
  {
    // Un token di un altro tipo non apre questa porta, anche se è validissimo.
    const t = (await db.query(
      `insert into access_tokens (purpose, audience, order_id, td_id)
       values ('td_order_page','td', (select id from orders where source_booking_id = $1 limit 1), $2)
       returning token`, [CALL, TD])).rows[0].token
    ;(await chiedi(t)).esito === 'token_di_altro_tipo'
      ? ok('un token di un altro scopo non apre questa porta') : fail('token di altro tipo accettato')
  }
}

console.log(failures === 0 ? '\nTutto verde.\n' : `\n${failures} asserzioni fallite.\n`)
process.exit(failures === 0 ? 0 : 1)
