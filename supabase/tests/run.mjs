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
// La tassonomia da cui è generato il seed 0002. Letta dal generatore, così
// harness e seed non possono guardare due file diversi.
const { SORGENTE: SORGENTE_GEO } = await import(path.join(root, 'scripts', 'genera_geo.mjs'))
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
  // Il nome del file lo dà il generatore, non questa riga: sono una cosa sola.
  const tax = JSON.parse(readFileSync(path.join(root, '..', SORGENTE_GEO), 'utf8'))
  const st = tax.statistics
  for (const [label, table, expected] of [
    ['continenti',  'geo_continents',  st.continents],
    ['macro-aree',  'geo_macro_areas', st.macro_areas],
    ['stati',       'geo_countries',   st.states],
    ['città',       'geo_cities',      st.cities],
  ]) {
    const n = Number((await q(`select count(*) from ${table}`)).rows[0].count)
    n === expected ? ok(`${label}: ${n}, come dichiara la tassonomia`)
                   : fail(`${label}: attesi ${expected}, trovati ${n}`)
  }
  // Le regioni non esistono più (0057, 4 ottobre 2026): né la tabella, né il
  // livello nel suggeritore, né nel file.
  const t = (await q(`select to_regclass('public.geo_regions') as t`)).rows[0].t
  const l = Number((await q(`select count(*) from geo_search where level = 'region'`)).rows[0].count)
  t === null && l === 0 && !('regions' in st) && !readFileSync(path.join(root, '..', SORGENTE_GEO), 'utf8').includes('"regions"')
    ? ok('nessuna regione: né la tabella, né nel suggeritore, né nel file della tassonomia (0057)')
    : fail(`regioni ancora presenti: tabella ${t}, nel suggeritore ${l}`)
}
{
  // selectable: macro_area, state. searchable_only: continent, city.
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

  // Fino al 4 ottobre l'unica differenza fra ciò che la tassonomia dichiara e
  // ciò che filtriamo erano le 20 regioni italiane (deviazione 7). Senza regioni
  // la tassonomia e il prodotto coincidono su ogni riga.
  const diff = (await q(`
    select level, count(*)::int as n from geo_search
     where is_selectable is distinct from is_filterable
     group by level order by level`)).rows
  diff.length === 0
    ? ok('tassonomia e prodotto coincidono: ciò che è selezionabile è ciò che filtra')
    : fail('differenze: ' + JSON.stringify(diff))

  const cittaItalia = Number((await q(`select count(*) from geo_cities where country_code='italia'`)).rows[0].count)
  cittaItalia === 20 ? ok('l\'Italia ha le sue 20 città, attaccate al paese') : fail('città italiane: ' + cittaItalia)
}
{
  // Dalla 0057 una città è unica dentro il suo paese.
  await expectOk('la stessa città in due paesi diversi', `
    insert into geo_cities (country_code, slug, name_it, is_selectable) values
      ('italia', 'citta-di-confine', 'Città di confine', false),
      ('francia', 'citta-di-confine', 'Città di confine', false)`)
  await expectFail('ma non due volte nello stesso paese', `
    insert into geo_cities (country_code, slug, name_it, is_selectable)
    values ('italia', 'citta-di-confine', 'Città di confine', false)`, 'unique')
}
{
  // LA POTATURA (v2, 27 settembre 2026). Sul database vero il seed si rigira
  // sopra la tassonomia vecchia: se fosse solo additivo le 1.032 città cadute
  // resterebbero nel suggeritore. Qui si simula: due città che il file non ha
  // più (quella inventata qui sopra, e Siena, che c'era nella v1), poi si
  // rigira il seed.
  await db.exec(`insert into geo_cities (country_code, slug, name_it, is_selectable)
                 values ('italia', 'siena', 'Siena', false)`)
  const seed = readFileSync(path.join(root, 'seed', '0002_geo.sql'), 'utf8')
  await expectOk('il seed geografico si rigira sopra dati esistenti', seed)
  const n = Number((await q('select count(*) from geo_cities')).rows[0].count)
  const s = Number((await q(`select count(*) from geo_cities where slug in ('siena','citta-di-confine')`)).rows[0].count)
  const tax = JSON.parse(readFileSync(path.join(root, '..', SORGENTE_GEO), 'utf8'))
  n === tax.statistics.cities && s === 0
    ? ok(`rigirato, converge: ${n} città come dichiara il file, quelle cadute se ne sono andate`)
    : fail(`dopo il secondo giro: ${n} città, ${s} cadute ancora dentro`)
  await expectOk('e un terzo giro non cambia niente', seed)
  const n3 = Number((await q('select count(*) from geo_cities')).rows[0].count)
  n3 === n ? ok('idempotente') : fail(`terzo giro: ${n3}`)

  // La guardia: una destinazione non sparisce senza dirlo.
  // Il seed è una transazione sola: dopo una guardia che ferma, il database è
  // com'era prima, e la transazione rimasta aperta si chiude a mano.
  await db.exec(`insert into geo_countries (code, macro_area_code, name_it, is_selectable, sort_order)
                 values ('atlantide', 'europa_sud', 'Atlantide', true, 999)`)
  await db.exec(`insert into geo_cities (country_code, slug, name_it, is_selectable)
                 values ('italia', 'siena', 'Siena', false)`)
  await expectFail('uno stato che il file non ha ferma il seed, e non viene cancellato', seed, 'atlantide')
  await db.exec('rollback')
  const dopo = (await q(`select (select count(*) from geo_countries where code='atlantide')::int as a,
                                (select count(*) from geo_cities where slug='siena')::int as s`)).rows[0]
  dopo.a === 1 && dopo.s === 1
    ? ok('fermato dalla guardia, il seed non ha potato niente: tutto o niente')
    : fail('seed fermato a metà: ' + JSON.stringify(dopo))
  await db.exec(`delete from geo_countries where code='atlantide'; delete from geo_cities where slug='siena'`)
}
{
  // I due designer demo non devono aver perso paesi: la potatura tocca solo
  // le città, e i paesi sono ciò su cui poggiano td_countries e il match.
  const r = (await q(`select td.slug, string_agg(tc.country_code, ',' order by tc.country_code) as paesi
                        from td_countries tc join travel_designers td on td.id = tc.td_id
                       where td.slug in ('marco-rossi','giulia-neri')
                       group by td.slug order by td.slug`)).rows
  JSON.stringify(r) === JSON.stringify([{ slug: 'giulia-neri', paesi: 'bolivia,peru' },
                                        { slug: 'marco-rossi', paesi: 'giappone,thailandia,vietnam' }])
    ? ok('i due designer demo hanno ancora tutti i loro paesi dopo la potatura')
    : fail('paesi dei demo: ' + JSON.stringify(r))
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
//
// Dalla 0048 lo slug non può più essere una stringa qualunque su un designer
// pubblicato: le due prove usano gli slug ammessi, e restano quello che erano.
// Dal seed 0006 (4 ottobre 2026) Marco ha già la sua approfondita, con questi
// stessi valori: la prova la riscrive invece di crearla, e prova la stessa cosa.
await expectOk('consulenza attiva senza Payment Link: ora si può', `
  insert into td_services (td_id, service_type, is_active, price_cents, duration_minutes, cal_event_type_slug)
  values ('11111111-1111-1111-1111-111111111111','consultation_deep',true,9000,90,'consulenza-xpetis-90')
  on conflict (td_id, service_type) do update
     set is_active = true, price_cents = 9000, duration_minutes = 90,
         cal_event_type_slug = 'consulenza-xpetis-90', stripe_payment_link_url = null`)
await expectFail('consulenza attiva senza prezzo', `
  insert into td_services (td_id, service_type, is_active, duration_minutes, cal_event_type_slug)
  values ('22222222-2222-2222-2222-222222222222','consultation_deep',true,60,'consulenza-xpetis-60')`, 'bookable_complete')
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

console.log('\n== Il quiz del viaggiatore: testi, ordine, verso (0049) ==')
{
  // Tre file fuori dal database, letti così come sono: il quiz, il form e un
  // JSON vero del form. Se uno dei tre cambia, queste prove lo dicono.
  const radice = path.join(root, '..')
  const QUIZ = JSON.parse(readFileSync(path.join(radice, 'xpetis_quiz_viaggiatore_.json'), 'utf8'))
  const form = readFileSync(path.join(radice, 'Vetrina TD (2).html'), 'utf8').replace(/\\"/g, '"')
  const CONCHI = JSON.parse(form.match(/const CONCHI = (\[.*?\]);/)[1])
  const VETRINA = JSON.parse(readFileSync(path.join(radice, 'vetrina_nuova.json'), 'utf8'))

  // La chiave del form → il codice dell'asse. È la tabella di MAPPATURA_VETRINA.md:
  // scritta a mano una volta sola, e qui sotto verificata sul verso.
  const ASSE = {
    controllo: 'planning_involvement', ritmo: 'pace', scomodita: 'comfort_wild',
    luogo: 'curated_vs_real', sociale: 'social_orientation', conChi: 'companions',
  }

  const assi = (await q(`select code, kind, question_it, sort_order, scale_min, scale_max,
                                label_min, label_max from quiz_axes order by sort_order`)).rows
  const opzioni = (await q(`select axis_code, value, label_it, answer_it from quiz_axis_options`)).rows
  const vista = Object.fromEntries((await q(`select code, options from public_quiz_axes`)).rows
    .map(r => [r.code, r.options]))

  QUIZ.questions.length === assi.length
    ? ok(`il quiz ha tante domande quanti assi (${assi.length})`)
    : fail(`domande ${QUIZ.questions.length}, assi ${assi.length}`)

  // L'ordine delle domande: quello del file, non quello di prima.
  const ordine = assi.map(a => a.code)
  const atteso = [...QUIZ.questions].sort((a, b) => a.order - b.order).map(d => ASSE[d.matching_axis])
  JSON.stringify(ordine) === JSON.stringify(atteso)
    ? ok('le sei domande nell\'ordine del file: ' + ordine.join(' → '))
    : fail('ordine: ' + JSON.stringify(ordine) + ' atteso ' + JSON.stringify(atteso))
  ordine[5] === 'companions'
    ? ok('"con chi viaggi" è la sesta domanda, non più la terza') : fail('companions in posizione ' + (ordine.indexOf('companions') + 1))

  for (const d of QUIZ.questions) {
    const codice = ASSE[d.matching_axis]
    const asse = assi.find(a => a.code === codice)
    if (!asse) { fail(`domanda ${d.id}: nessun asse ${codice}`); continue }

    asse.question_it === d.text
      ? ok(`${codice}: la domanda è quella del file`) : fail(`${codice}: domanda ${JSON.stringify(asse.question_it)}`)

    // Scala 1-4 ⇔ asse continuo; la sesta non produce un punteggio.
    const continuo = d.answer_type === 'scale_1_4'
    ;(continuo ? asse.kind === 'continuous' : asse.kind === 'categorical')
      ? ok(`${codice}: ${d.answer_type} ⇔ ${asse.kind}`) : fail(`${codice}: ${d.answer_type} ma kind=${asse.kind}`)

    if (continuo) {
      // OPZIONE PER OPZIONE, sul campo `score` e non sulla posizione nell'array.
      const sbagliate = d.options.filter(o => {
        const riga = opzioni.find(r => r.axis_code === codice && r.value === o.score)
        return !riga || riga.answer_it !== o.text || vista[codice]?.[String(o.score)] !== o.text
      })
      sbagliate.length === 0
        ? ok(`${codice}: le quattro risposte al loro score, in tabella e nella vista`)
        : fail(`${codice}: risposte fuori posto ${JSON.stringify(sbagliate.map(o => o.id + '=' + o.score))}`)
      // Il polo 1 è il valore più basso dell'asse: lo `score` minimo è `scale_min`.
      const scores = d.options.map(o => o.score)
      Math.min(...scores) === asse.scale_min && Math.max(...scores) === asse.scale_max
        ? ok(`${codice}: polo 1 = scale_min (${asse.label_min}), polo 4 = scale_max (${asse.label_max})`)
        : fail(`${codice}: score ${scores} contro scala ${asse.scale_min}-${asse.scale_max}`)
    } else {
      // "Con chi viaggi": il testo si aggancia alla chiave del form, e la chiave
      // non si tocca.
      const sbagliate = d.options.filter(o => {
        const riga = opzioni.find(r => r.axis_code === codice && r.label_it === o.td_value_match)
        return !riga || riga.answer_it !== o.text || vista[codice]?.[String(riga.value)] !== o.text
      })
      sbagliate.length === 0
        ? ok(`${codice}: le cinque risposte agganciate alla chiave del form (td_value_match)`)
        : fail(`${codice}: non agganciate ${JSON.stringify(sbagliate.map(o => o.id))}`)
    }
  }

  // TRAPPOLA (a): le chiavi del form, carattere per carattere.
  const chiavi = opzioni.filter(r => r.axis_code === 'companions')
    .sort((a, b) => a.value - b.value).map(r => r.label_it)
  JSON.stringify(chiavi) === JSON.stringify(CONCHI)
    ? ok('le cinque label_it di "con chi viaggi" sono ancora le CONCHI del form, byte per byte')
    : fail('label_it ' + JSON.stringify(chiavi) + ' contro form ' + JSON.stringify(CONCHI))
  const tdMatch = QUIZ.questions.find(d => d.matching_axis === 'conChi').options.map(o => o.td_value_match)
  JSON.stringify(tdMatch) === JSON.stringify(CONCHI)
    ? ok('le td_value_match del quiz sono le CONCHI del form: il quiz non ha cambiato una chiave')
    : fail('td_value_match divergono dal form: ' + JSON.stringify(tdMatch))
  const nonRiconosciute = (VETRINA.assi.conChi ?? []).filter(v => !chiavi.includes(v))
  nonRiconosciute.length === 0
    ? ok('le voci conChi di vetrina_nuova.json sono tutte riconosciute')
    : fail('conChi non riconosciute: ' + JSON.stringify(nonRiconosciute))

  const buchi = Object.entries(vista).flatMap(([c, o]) =>
    Object.entries(o).filter(([, t]) => !t || /DA SCRIVERE/i.test(t)).map(([v]) => c + ':' + v))
  buchi.length === 0 ? ok('nella vista del quiz nessun "DA SCRIVERE"') : fail('buchi: ' + buchi.join(', '))
  assi.every(a => a.question_it?.trim())
    ? ok('ogni asse ha la sua domanda: niente più etichetta interna in pagina')
    : fail('assi senza domanda')

  // IL VERSO DALL'INIZIO ALLA FINE, su `pace`. Si parte dalle PAROLE del file
  // ("Lento…", "Intenso…"), si passa dalla vista come fa la pagina del quiz per
  // trovare il valore, e il valore va in `match_designers()`. Marco è lento,
  // Giulia intensa: lo si legge dai dati invece di darlo per scontato.
  const ritmo = QUIZ.questions.find(d => d.matching_axis === 'ritmo')
  const valoreDiTesto = (inizio) => {
    const testo = ritmo.options.find(o => o.text.startsWith(inizio)).text
    return Number(Object.entries(vista.pace).find(([, t]) => t === testo)[0])
  }
  const valori = Object.fromEntries((await q(`
    select td.slug, v.value from td_axis_values v join travel_designers td on td.id = v.td_id
     where v.axis_code = 'pace' and td.slug in ('marco-rossi','giulia-neri')`)).rows.map(r => [r.slug, r.value]))
  const pace = assi.find(a => a.code === 'pace')
  pace.label_min === 'Slow' && valori['marco-rossi'] < valori['giulia-neri']
    ? ok(`premessa: Marco è più lento di Giulia (pace ${valori['marco-rossi']} contro ${valori['giulia-neri']}, 1 = ${pace.label_min})`)
    : fail('premessa sui designer demo: ' + JSON.stringify(valori))

  const posizioni = async (quiz) => Object.fromEntries((await q(`
    select slug, rank_position, salient_axes from match_designers(null, null, $1::jsonb)
     where slug in ('marco-rossi','giulia-neri')`, [JSON.stringify(quiz)])).rows.map(r => [r.slug, r]))

  const lento = valoreDiTesto('Lento')
  const intenso = valoreDiTesto('Intenso')
  lento === pace.scale_min && intenso === pace.scale_max
    ? ok(`"Lento" è il valore ${lento}, "Intenso" il ${intenso}`) : fail(`Lento=${lento} Intenso=${intenso}`)
  {
    const r = await posizioni({ pace: lento })
    r['marco-rossi'].rank_position < r['giulia-neri'].rank_position
      ? ok('rispondere "Lento" (polo 1) fa salire Marco sopra Giulia')
      : fail('polo 1 su pace: ' + JSON.stringify(r))
    r['marco-rossi'].salient_axes.includes('pace') && !r['giulia-neri'].salient_axes.includes('pace')
      ? ok('e la frase di Marco parla del ritmo, quella di Giulia no')
      : fail('salienza polo 1: ' + JSON.stringify(r))
  }
  {
    const r = await posizioni({ pace: intenso })
    r['giulia-neri'].rank_position < r['marco-rossi'].rank_position
      ? ok('rispondere "Intenso" (polo 4) fa salire Giulia sopra Marco')
      : fail('polo 4 su pace: ' + JSON.stringify(r))
  }

  // Lo stesso, meccanico, su tutti gli assi continui dove i due demo divergono:
  // il polo basso premia chi ha il valore basso, il polo alto l'opposto.
  const demo = (await q(`
    select v.axis_code, td.slug, v.value from td_axis_values v
      join travel_designers td on td.id = v.td_id join quiz_axes a on a.code = v.axis_code
     where a.kind = 'continuous' and td.slug in ('marco-rossi','giulia-neri')`)).rows
  for (const a of assi.filter(a => a.kind === 'continuous')) {
    const m = demo.find(r => r.axis_code === a.code && r.slug === 'marco-rossi')?.value
    const g = demo.find(r => r.axis_code === a.code && r.slug === 'giulia-neri')?.value
    if (m == null || g == null || m === g) continue
    const basso = m < g ? 'marco-rossi' : 'giulia-neri'
    const alto  = m < g ? 'giulia-neri' : 'marco-rossi'
    const r1 = await posizioni({ [a.code]: a.scale_min })
    const r4 = await posizioni({ [a.code]: a.scale_max })
    r1[basso].rank_position < r1[alto].rank_position && r4[alto].rank_position < r4[basso].rank_position
      ? ok(`${a.code}: polo "${a.label_min}" premia ${basso}, polo "${a.label_max}" premia ${alto}`)
      : fail(`${a.code}: verso rotto ${JSON.stringify({ r1, r4 })}`)
  }

  // La sesta non è una scala: 1 se il designer ha quella configurazione, 0 se
  // no — un valore "vicino" non vale mezzo punto.
  const conChi = (await q(`
    select td.slug, array_agg(v.value order by v.value) as valori from td_axis_values v
      join travel_designers td on td.id = v.td_id
     where v.axis_code = 'companions' and td.slug = 'marco-rossi' group by td.slug`)).rows[0].valori
  const vicino = [1, 2, 3, 4, 5].find(v => !conChi.includes(v) && (conChi.includes(v - 1) || conChi.includes(v + 1)))
  {
    const r = await posizioni({ companions: conChi[0] })
    r['marco-rossi'].salient_axes.includes('companions')
      ? ok(`"con chi viaggi" = ${conChi[0]}: Marco la dichiara, punto pieno`)
      : fail('companions posseduto senza punto: ' + JSON.stringify(r))
  }
  if (vicino == null) fail('prova di "con chi viaggi": nessun valore vicino libero per Marco ' + JSON.stringify(conChi))
  else {
    const r = await posizioni({ companions: vicino })
    !r['marco-rossi'].salient_axes.includes('companions')
      ? ok(`"con chi viaggi" = ${vicino}, accanto a ${JSON.stringify(conChi)}: zero, non una distanza`)
      : fail('companions trattato come scala: ' + JSON.stringify(r))
  }

  // LA 0049 SU UN DATABASE GIÀ POPOLATO. Qui sopra la migration ha girato su
  // tabelle vuote e i testi li ha portati il seed: il ramo che conta sul
  // database di sviluppo — gli UPDATE — non l'ha visto nessuno. Si rimette lo
  // stato di prima (testi vuoti, "con chi viaggi" terza) e si rigira.
  const migrazione = readFileSync(path.join(root, 'migrations', '0049_testi_quiz.sql'), 'utf8')
    .replace(/alter table quiz_axis_options add column answer_it text;/, '')
  const primaDella0049 = `
    update quiz_axis_options set answer_it = null;
    update quiz_axes set question_it = null;
    update quiz_axes set sort_order = case code
      when 'planning_involvement' then 1 when 'pace' then 2 when 'companions' then 3
      when 'comfort_wild' then 4 when 'curated_vs_real' then 5 else 6 end;`
  const fotografia = async () => JSON.stringify((await q(`
    select a.code, a.sort_order, a.question_it, a.label_min, a.label_max,
           (select jsonb_agg(jsonb_build_array(o.value, o.label_it, o.answer_it) order by o.value)
              from quiz_axis_options o where o.axis_code = a.code) as opzioni
      from quiz_axes a order by a.code`)).rows)
  const dopoIlSeed = await fotografia()
  await db.exec(primaDella0049)
  await expectOk('la 0049 si applica sopra le tabelle già popolate', migrazione)
  ;(await fotografia()) === dopoIlSeed
    ? ok('e lascia esattamente lo stato che porta il seed: testi, ordine, chiavi e verso')
    : fail('la 0049 e il seed non dicono la stessa cosa')

  // La guardia: una chiave del form ritoccata a mano da Studio non aggancia il
  // testo, e la migration si ferma invece di lasciare un'opzione muta.
  await db.exec('begin')
  await db.exec(primaDella0049 + `
    update quiz_axis_options set label_it = 'Viaggiatore  solo' where axis_code = 'companions' and value = 1;`)
  await expectFail('una chiave del form ritoccata ferma la 0049', migrazione, 'companions:1')
  await db.exec('rollback')
  ;(await fotografia()) === dopoIlSeed
    ? ok('fermata la migration, niente è cambiato') : fail('stato alterato dopo la guardia')
}

console.log('\n== I cinque servizi del form ==')
await expectOk('il designer attiva viaggio di gruppo e accompagnamento privato', `
  insert into td_services (td_id, service_type, is_active, sort_order) values
    ('11111111-1111-1111-1111-111111111111','group_trip',true,20),
    ('11111111-1111-1111-1111-111111111111','private_guiding',true,21)
  on conflict (td_id, service_type) do update set is_active = true`)
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
  gen.length === 4 && gen.every(c => c.is_generated === 'ALWAYS')
    ? ok('name_norm è una colonna generata su tutte e quattro le tabelle geo')
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
                         and indexname in ('geo_countries_norm_trgm', 'geo_cities_norm_trgm')`)).rows
  idx.length === 2
    ? ok('i due indici trigramma sulle tabelle grosse esistono')
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
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  const righe = (await q(`
    select name_it, name_norm from geo_continents
    union all select name_it, name_norm from geo_macro_areas
    union all select name_it, name_norm from geo_countries
    union all select name_it, name_norm from geo_cities`)).rows
  // Dalla 0058 la regola è la stessa da tutte e due le parti, punteggiatura
  // compresa: i due normalizzati devono essere **uguali**, non solo contenuti.
  const perse = righe.filter(r => r.name_norm !== normalizza(r.name_it))
  // Il numero dei nomi lo dà la tassonomia, non una soglia scritta a mano: con
  // la v1 era «> 1500», e la potatura della v2 (581 nomi) l'avrebbe fatto
  // diventare rosso per la ragione sbagliata.
  const st = JSON.parse(readFileSync(path.join(root, '..', SORGENTE_GEO), 'utf8')).statistics
  const attesi = st.continents + st.macro_areas + st.states + st.cities
  righe.length === attesi && perse.length === 0
    ? ok(`browser e database normalizzano allo stesso modo su tutti i ${righe.length} nomi della tassonomia`)
    : fail(`nomi su cui le due normalizzazioni divergono (${perse.length} su ${righe.length}): `
           + JSON.stringify(perse.slice(0, 5)))

  // **La tabella delle lettere, da sola.** Con la v2 i nove nomi che l'avevano
  // fatta nascere (Tromsø, Hveragerði, Płock, Kuşadası…) sono stati potati:
  // la prova qui sopra non la esercita più su nessun nome vero. Quindi ogni
  // lettera si confronta con `unaccent` direttamente, in minuscolo e in
  // maiuscolo, e insieme le lettere non ASCII che la tassonomia contiene oggi.
  // Se un nome futuro porta una lettera che il browser e il database trattano
  // in modo diverso, la prova sui nomi lo dice; questa dice che la tabella non
  // è marcita nel frattempo.
  const lettere = new Set(Object.keys(senzaSegno))
  for (const k of Object.keys(senzaSegno)) lettere.add(k.toUpperCase())
  for (const r of righe) for (const c of r.name_it) if (c.charCodeAt(0) > 127) lettere.add(c)
  const divergenti = []
  for (const c of lettere) {
    const d = (await q('select nome_cercabile($1) as n', [c])).rows[0].n
    if (d !== normalizza(c)) divergenti.push(`${c}: database «${d}», browser «${normalizza(c)}»`)
  }
  divergenti.length === 0
    ? ok(`${lettere.size} lettere non ASCII (la tabella e quelle della tassonomia): stessa traduzione nei due lati`)
    : fail('lettere divergenti: ' + divergenti.join('; '))
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

  // Dalla 0054 (decisione D3 del 3 ottobre 2026) le recensioni dichiarate si
  // mostrano, con una dicitura: **una sola** vista pubblica le legge, solo le
  // pubblicate, e mai con gli anni del recensore.
  const pub = (await q(`
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind='v'
       and has_table_privilege('anon', c.oid, 'SELECT')
       and pg_get_viewdef(c.oid) like '%td_showcase_reviews%'`)).rows.map(r => r.relname)
  JSON.stringify(pub) === JSON.stringify(['public_td_reviews'])
    ? ok('le recensioni dichiarate escono da una vista sola, public_td_reviews (D3)')
    : fail('viste che leggono td_showcase_reviews: ' + JSON.stringify(pub))
  const nonPubblicata = (await q(`select count(*) from public_td_reviews where author_name = 'Nico'`)).rows[0]
  Number(nonPubblicata.count) === 0
    ? ok('una recensione dichiarata non pubblicata non esce')
    : fail('public_td_reviews mostra una recensione con is_published = false')
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
         proposal_description='Giappone 15 giorni', departure_date=current_date + 90, last_actor='td'
   where id='77777777-7777-7777-7777-777777777777'`)
{
  // Dalla 0047 acconto e saldo non si scrivono: li calcola il database
  // all'invio, dal 30% di app_config.deposit_percent.
  const r = (await q(`select total_price_cents t, deposit_cents d, balance_cents b
                        from orders where id='77777777-7777-7777-7777-777777777777'`)).rows[0]
  r.t === 450000 && r.d === 135000 && r.b === 315000
    ? ok('acconto 30% e saldo per residuo, calcolati dal sistema') : fail(JSON.stringify(r))
}
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
// Dalla 0044 il token della pagina ordine non si crea a mano: nasce con
// l'ordine su misura, insieme alla mail che lo porta al designer.
{
  const n = Number((await q(`select count(*) from access_tokens
    where purpose='td_order_page' and audience='td' and revoked_at is null
      and order_id='66666666-6666-6666-6666-666666666666'
      and td_id='11111111-1111-1111-1111-111111111111'`)).rows[0].count)
  n === 1 ? ok('token pagina ordine del TD: nasce con l\'ordine, legato a ordine e designer')
          : fail('token pagina ordine del TD: ' + n)
}
{
  const t = (await q(`select token, length(token) as len from access_tokens
                       where purpose='td_order_page' limit 1`)).rows[0]
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
  const expected = ['geo_search','public_config','public_quiz_axes','public_reviews','public_tags',
                    'public_td_group_trip','public_td_ready_itinerary','public_td_reviews','public_td_showcase']
  JSON.stringify(views.sort()) === JSON.stringify(expected)
    ? ok('anon legge solo le 9 viste pubbliche')
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
    // marco-rossi ha l'approfondita da 90, giulia-neri quella da 60: lo slug da
    // 60 è dei nostri ma non di questo designer.
    const e = await chiama(variante(fx.created, { 'payload.type': 'consulenza-xpetis-60' }))
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
    const attesi = ['agency_confirmed_td', 'agency_proposal_confirm', 'agency_rejected_td',
                    'ai_balance_paid_td', 'ai_balance_traveler', 'ai_delivery_traveler',
                    'ai_proposal_traveler',
                    'blocco_firma', 'blocco_intro_servizi', 'blocco_servizio_all_inclusive',
                    'blocco_servizio_custom_itinerary', 'blocco_td_no_show', 'blocco_td_problema',
                    'blocco_whatsapp_ai_consegna', 'blocco_whatsapp_ai_proposta',
                    'blocco_whatsapp_consegna', 'blocco_whatsapp_proposta', 'delivery_traveler',
                    'order_new_td', 'order_new_td_ai', 'order_paid_td', 'postcall_td', 'postcall_traveler',
                    'proposal_traveler', 'revision_delivered_traveler', 'revision_requested_td',
                    'team_digest', 'team_notifica', 'unpaid_cancelled_traveler']
    JSON.stringify(r.map(x => x.key)) === JSON.stringify(attesi)
      ? ok('le ventinove righe del seed ci sono (sei della 0043, tre della 0044, due della 0045, sette della 0046, dieci della 0047, una della 0050)')
      : fail('righe: ' + JSON.stringify(r.map(x => x.key)))
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
  // Dalla 0046 sulla stessa call parte anche la mail al designer con i tasti
  // eccezione (`postcall_td`): questa sezione parla della mail al viaggiatore,
  // e la esclude. La mail al designer ha le sue prove, nella sezione della 0046.
  const coda = async (bookingId) =>
    (await db.query(
      `select * from outbound_messages where entity_type='booking' and entity_id=$1
          and message_kind <> 'postcall_td'
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
      `select count(*) from access_tokens where booking_id = $1 and revoked_at is null
          and purpose = 'traveler_service_request'`, [C(1)])).rows[0].count)
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
      `select token from access_tokens where booking_id = $1 and revoked_at is null
          and purpose = 'traveler_service_request' limit 1`, [CALL2])).rows[0]
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
    // Dalla 0044 l'ordine su misura nasce già col suo token della pagina ordine.
    const t = (await db.query(
      `select a.token from access_tokens a join orders o on o.id = a.order_id
        where a.purpose = 'td_order_page' and o.source_booking_id = $1 limit 1`, [CALL])).rows[0].token
    ;(await chiedi(t)).esito === 'token_di_altro_tipo'
      ? ok('un token di un altro scopo non apre questa porta') : fail('token di altro tipo accettato')
  }
}

// ===========================================================================
// L'ordine su misura, prima metà: proposta e pagamento (migration 0044)
// ===========================================================================
console.log('\n== L\'ordine su misura: proposta e pagamento ==')
{
  const TD     = '11111111-1111-1111-1111-111111111111'   // Marco
  const TD2    = '22222222-2222-2222-2222-222222222222'   // Giulia
  const ANNA   = '44444444-4444-4444-4444-444444444444'
  const B = (n) => `b0b0b0b0-0000-4000-8000-00000000000${n}`
  const O = (n) => `0dd0dd00-0000-4000-8000-00000000000${n}`

  const creaCall = (n) => db.query(
    `insert into bookings (id, traveler_id, td_id, service_type, status, cal_booking_uid,
                           cal_event_type_slug, starts_at, ends_at, original_starts_at,
                           price_cents, confirmed_at, last_actor)
     values ($1, $2, $3, 'consultation', 'completed', 'uid-sumisura-' || $4, 'consulenza-xpetis-30',
             now() - interval '2 days', now() - interval '2 days' + interval '30 minutes',
             now() - interval '2 days', 6000, now(), 'n8n')`, [B(n), ANNA, TD, String(n)])
  const creaOrdine = (n, booking, servizio = 'custom_itinerary', credito = 0) => db.query(
    `insert into orders (id, traveler_id, td_id, service_type, source_booking_id,
                         consultation_credit_cents, last_actor)
     values ($1, $2, $3, $4, $5, $6, 'traveler')`, [O(n), ANNA, TD, servizio, booking, credito])

  const rpc = async (sql, params) => (await db.query(sql, params)).rows[0].r
  const pagina   = (t) => rpc('select td_order_page($1) as r', [t])
  const salva    = (t, desc, prezzo, giorni, credito = 0) =>
    rpc('select save_proposal_draft($1,$2,$3,$4,$5) as r', [t, desc, prezzo, giorni, credito])
  const invia    = (t, prezzo) => rpc('select send_proposal($1,$2) as r', [t, prezzo])
  const gemella  = (t) => rpc('select proposal_public_page($1) as r', [t])
  const ordine   = async (id) => (await db.query('select * from orders where id=$1', [id])).rows[0]
  const tokenDi  = async (purpose, orderId) => (await db.query(
    `select token from access_tokens where purpose=$1 and order_id=$2 and revoked_at is null`,
    [purpose, orderId])).rows[0]?.token
  const storia   = async (id) => (await db.query(
    `select from_status, to_status, actor from order_status_history where order_id=$1 order by id`, [id])).rows
  const posta    = async (kind, entity) => (await db.query(
    `select * from outbound_messages where message_kind=$1 and entity_id=$2`, [kind, entity])).rows
  const nAlert   = async (kind) => Number((await db.query(
    `select count(*) from team_alerts where kind=$1 and resolved_at is null`, [kind])).rows[0].count)

  await creaCall(1); await creaCall(2); await creaCall(3)
  await creaOrdine(1, B(1))

  // --------------------------------------------------- nasce l'ordine
  console.log('  -- alla nascita: il link del designer, per mail --')
  const TOK = await tokenDi('td_order_page', O(1))
  TOK ? ok('l\'ordine su misura nasce col token della pagina ordine') : fail('nessun token td_order_page')
  {
    const m = await posta('order_new_td', O(1))
    m.length === 1 && m[0].recipient === 'marco@example.com' && m[0].status === 'queued'
      ? ok('e con la mail al designer, in coda, al suo indirizzo')
      : fail('mail al TD: ' + JSON.stringify(m.map(x => [x.recipient, x.status])))
    m[0]?.body_text.includes('/ordine/' + TOK) && m[0]?.body_html.includes('/ordine/' + TOK)
      ? ok('la mail porta il link della pagina ordine') : fail('link assente dalla mail al TD')
    m[0]?.body_text.includes('60,00 €')
      ? ok('e dice al designer quanto costava la call, che è quello che può scalare')
      : fail('prezzo della call assente: ' + m[0]?.body_text)
  }
  {
    // Dalla 0047 anche l'All Inclusive riceve il suo link, con il suo testo:
    // la pagina ordine lo sa trattare. La mail del su misura non parte.
    await creaOrdine(9, B(3), 'all_inclusive')
    const t = await tokenDi('td_order_page', O(9))
    const m = await posta('order_new_td', O(9))
    const mAI = await posta('order_new_td_ai', O(9))
    t && m.length === 0 && mAI.length === 1
      ? ok('un ordine All Inclusive riceve il token e la sua mail (0047), non quella del su misura')
      : fail('All Inclusive: ' + JSON.stringify([!!t, m.length, mAI.length]))
  }

  // --------------------------------------------------- la pagina del designer
  console.log('  -- la pagina del designer --')
  {
    const p = await pagina(TOK)
    p.esito === 'valido' && p.status === 'requested' && p.prezzo_call_cents === 6000 && p.human_ref
      ? ok('mostra stato, riferimento e prezzo della call da scalare')
      : fail('pagina: ' + JSON.stringify(p))
    const chiavi = JSON.stringify(Object.keys(p))
    !/email|telefono|phone|cognome|full_name/.test(chiavi)
      ? ok('e del viaggiatore solo il nome: niente mail, telefono, cognome')
      : fail('la pagina espone dati del viaggiatore: ' + chiavi)
  }

  // --------------------------------------------------- la bozza
  console.log('  -- la bozza: si corregge quanto si vuole --')
  {
    const e = await invia(TOK, 120000)
    e.ok === false && e.esito === 'bozza_mancante'
      ? ok('non si invia una proposta mai salvata: nessuno ha riletto quel prezzo')
      : fail('invio senza bozza: ' + JSON.stringify(e))
  }
  for (const [label, args, campo] of [
    ['descrizione vuota',                   ['   ', 120000, 10, 0], 'descrizione'],
    ['prezzo zero',                         ['Giappone', 0, 10, 0], 'prezzo'],
    ['prezzo sotto il minimo di Stripe',    ['Giappone', 49, 10, 0], 'prezzo'],
    ['giorni di consegna a zero',           ['Giappone', 120000, 0, 0], 'giorni'],
    ['credito oltre il prezzo della call',  ['Giappone', 120000, 10, 600000], 'credito'],
  ]) {
    const e = await salva(TOK, ...args)
    e.ok === false && e.esito === 'dati_non_validi' && e.campo === campo
      ? ok(`bozza rifiutata: ${label}`) : fail(`${label}: ` + JSON.stringify(e))
  }
  {
    const e = await salva(TOK, 'Giappone in 12 giorni, da Tokyo a Kyoto.', 120000, 10, 6000)
    const o = await ordine(O(1))
    e.ok && e.esito === 'salvata' && o.status === 'in_definition'
      ? ok('la prima bozza salvata porta l\'ordine in definizione')
      : fail('salvataggio: ' + JSON.stringify(e) + ' ' + o.status)
    const h = (await storia(O(1))).at(-1)
    h.to_status === 'in_definition' && h.actor === 'td'
      ? ok('e la storia dice che è stato il designer') : fail('storia: ' + JSON.stringify(h))
    o.proposal_price_cents === 120000 && o.consultation_credit_cents === 6000
      ? ok('⚠️ prezzo salvato così come scritto: 1.200 €, con 60 € di credito DICHIARATO e non sottratto')
      : fail('il codice ha toccato il prezzo: ' + o.proposal_price_cents)
  }
  {
    const e = await salva(TOK, 'Giappone in 12 giorni, da Tokyo a Kyoto.', 115000, 10, 6000)
    const o = await ordine(O(1))
    e.ok && o.proposal_price_cents === 115000 && o.status === 'in_definition'
      ? ok('una bozza si corregge prima dell\'invio, quante volte si vuole')
      : fail('correzione: ' + JSON.stringify(e))
    const n = Number((await db.query(
      `select count(*) from event_log where entity_id=$1 and event='proposta_bozza_salvata'`, [O(1)])).rows[0].count)
    n === 2 ? ok('e il diario tiene ogni versione, col token: il designer non ha login')
            : fail('versioni nel diario: ' + n)
  }

  // --------------------------------------------------- l'invio
  console.log('  -- l\'invio: ridichiara il prezzo, e poi non si torna indietro --')
  {
    const e = await invia(TOK, 120000)
    const o = await ordine(O(1))
    e.ok === false && e.esito === 'prezzo_cambiato' && o.status === 'in_definition'
      ? ok('un invio con un prezzo diverso da quello della bozza si rifiuta (due schede aperte)')
      : fail('prezzo cambiato: ' + JSON.stringify(e))
  }
  {
    const e = await invia(TOK, 115000)
    const o = await ordine(O(1))
    e.ok && e.esito === 'inviata' && o.status === 'proposal_sent' && o.proposal_sent_at
      ? ok('l\'invio porta l\'ordine a proposal_sent') : fail('invio: ' + JSON.stringify(e))
    const h = (await storia(O(1))).at(-1)
    h.to_status === 'proposal_sent' && h.actor === 'td'
      ? ok('attribuito al designer: è l\'unica prova che sia stato lui') : fail('storia: ' + JSON.stringify(h))
  }
  const PROP = (await db.query(`select * from order_proposals where order_id=$1`, [O(1)])).rows
  const TOKV = await tokenDi('traveler_public_proposal', O(1))
  {
    PROP.length === 1 && PROP[0].round === 1 && PROP[0].price_cents === 115000 && PROP[0].actor === 'td'
      ? ok('la proposta partita è fotografata in order_proposals') : fail('fotografia: ' + JSON.stringify(PROP))
    TOKV ? ok('e nasce la pagina gemella, col suo token') : fail('nessun token traveler_public_proposal')
    const m = await posta('proposal_traveler', PROP[0]?.id)
    m.length === 1 && m[0].recipient === 'viaggiatore@example.com' && m[0].entity_type === 'order_proposal'
      ? ok('la mail al viaggiatore è in coda, legata alla proposta e non all\'ordine')
      : fail('mail proposta: ' + JSON.stringify(m.map(x => [x.recipient, x.entity_type])))
    const t = m[0]?.body_text ?? ''
    t.includes('1.150,00 €') && t.includes('/proposta/' + TOKV) && t.includes('Giappone in 12 giorni')
      ? ok('con la descrizione, il prezzo all\'italiana e il link alla pagina gemella')
      : fail('corpo: ' + t)
    !t.includes('60,00') && !t.includes('1.210')
      ? ok('e nessuna cifra di credito: il prezzo è quello finale') : fail('cifra di credito nella mail')
  }
  {
    const e = await invia(TOK, 115000)
    const n = Number((await db.query(`select count(*) from order_proposals where order_id=$1`, [O(1)])).rows[0].count)
    const m = Number((await db.query(
      `select count(*) from outbound_messages where message_kind='proposal_traveler'
          and entity_id in (select id from order_proposals where order_id=$1)`, [O(1)])).rows[0].count)
    e.ok && e.esito === 'gia_inviata' && n === 1 && m === 1
      ? ok('il doppio clic su Invia: «già inviata», nessuna seconda proposta, nessuna seconda mail')
      : fail('doppio invio: ' + JSON.stringify(e) + ` proposte ${n} mail ${m}`)
  }
  {
    const e = await salva(TOK, 'Altro', 90000, 5, 0)
    e.ok === false && e.esito === 'proposta_gia_inviata'
      ? ok('dopo l\'invio la pagina non riscrive più la proposta') : fail('bozza dopo invio: ' + JSON.stringify(e))
  }
  await expectFail('e nemmeno la chiave secret da Studio: il prezzo di una proposta partita è congelato', `
    update orders set proposal_price_cents = 99000 where id = '${O(1)}'`, 'già partita')
  await expectFail('una proposta partita non si modifica neanche in order_proposals', `
    update order_proposals set price_cents = 1 where order_id = '${O(1)}'`, 'non si modifica')
  {
    const p = await pagina(TOK)
    p.status === 'proposal_sent' && p.link_proposta?.endsWith('/proposta/' + TOKV)
      && p.messaggio_pronto?.includes(p.link_proposta)
      ? ok('dopo l\'invio il designer trova il link e il messaggio pronto da copiare nel gruppo')
      : fail('pagina dopo invio: ' + JSON.stringify(p))
  }

  // --------------------------------------------------- la pagina gemella
  console.log('  -- la pagina gemella --')
  {
    const g = await gemella(TOKV)
    g.esito === 'valido' && g.fase === 'da_pagare' && g.prezzo_cents === 115000 && g.descrizione
      ? ok('mostra la proposta da pagare') : fail('gemella: ' + JSON.stringify(g))
    !/email|telefono|phone|nome_viaggiatore|full_name/.test(JSON.stringify(Object.keys(g)))
      ? ok('e niente del viaggiatore: è fatta per essere girata nel gruppo')
      : fail('la gemella espone dati del viaggiatore')
  }
  {
    ;(await gemella(TOK)).esito === 'token_di_altro_tipo'
      ? ok('il token del designer non apre la pagina gemella') : fail('token TD accettato dalla gemella')
    ;(await pagina(TOKV)).esito === 'token_di_altro_tipo'
      ? ok('e quello del viaggiatore non apre la pagina del designer') : fail('token viaggiatore accettato dal TD')
    ;(await pagina('token-inventato-di-sana-pianta')).esito === 'inesistente'
      ? ok('un token inventato riceve la risposta generica') : fail('token inventato')
  }

  // --------------------------------------------------- il conto
  console.log('  -- su quale conto --')
  {
    const r = (await db.query(`select * from payment_account('full')`)).rows[0]
    r.stripe_account === 'xpetis' && r.agency_id === null
      ? ok('payment_account(full) legge la sua riga di app_config: xpetis') : fail(JSON.stringify(r))
    const c = (await db.query(`select * from consultation_payment_account()`)).rows[0]
    c.stripe_account === 'xpetis' ? ok('e consultation_payment_account() risponde come prima, per involucro')
                                  : fail(JSON.stringify(c))
    await db.query(`update app_config set value_text = 'agency' where key = 'custom_itinerary_stripe_account'`)
    const a = (await db.query(`select * from payment_account('full')`)).rows[0]
    const c2 = (await db.query(`select * from consultation_payment_account()`)).rows[0]
    a.stripe_account === 'agency' && a.agency_id && c2.stripe_account === 'xpetis'
      ? ok('le due righe sono indipendenti: l\'agenzia può incassare il su misura prima delle consulenze')
      : fail(JSON.stringify([a, c2]))
    await db.query(`update app_config set value_text = 'xpetis' where key = 'custom_itinerary_stripe_account'`)
    const def = (await db.query(`select column_default from information_schema.columns
                                  where table_name='payments' and column_name='stripe_account'`)).rows[0]
    String(def.column_default).includes('xpetis')
      ? ok('e il default della colonna payments.stripe_account non è stato toccato')
      : fail('default cambiato: ' + def.column_default)
  }
  {
    // Dalla 0047 acconto e saldo hanno la loro riga, una per le due rate.
    const d = (await db.query(`select * from payment_account('deposit')`)).rows[0]
    const b = (await db.query(`select * from payment_account('balance')`)).rows[0]
    d.stripe_account === 'xpetis' && b.stripe_account === 'xpetis'
      ? ok('payment_account(deposit/balance) legge all_inclusive_stripe_account: xpetis in sandbox')
      : fail(JSON.stringify([d, b]))
  }

  // --------------------------------------------------- il ponte Stripe
  console.log('  -- il ponte Stripe riconosce un ordine --')
  const fxBase = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/stripe/checkout_session_completed.json'), 'utf8'))
  const SEG = 'whsec_parola_segreta_finta_per_l_harness'
  let nEvt = 0
  const evento = (sessione, orderId, importo, extra = {}) => {
    const b = JSON.parse(JSON.stringify(fxBase))
    for (const k of Object.keys(b)) if (k.startsWith('_')) delete b[k]
    b.id = `evt_sumisura_${String(++nEvt).padStart(4, '0')}`
    b.created = Math.floor(Date.now() / 1000)
    const o = b.data.object
    o.id = sessione
    o.amount_total = importo
    o.amount_subtotal = importo
    o.client_reference_id = orderId
    o.metadata = { order_id: orderId, xpetis: 'full' }
    Object.assign(o, extra)
    return b
  }
  const webhook = async (corpo) => {
    const raw = JSON.stringify(corpo)
    const t = Math.floor(Date.now() / 1000)
    const firma = `t=${t},v1=` + crypto.createHmac('sha256', SEG).update(`${t}.${raw}`, 'utf8').digest('hex')
    return (await db.query('select stripe_webhook($1,$2) as e', [raw, firma])).rows[0].e
  }
  const cassa = (orderId, sessione, importo) => db.query(
    `insert into payments (order_id, kind, status, amount_cents, currency, stripe_account,
                           client_reference_id, stripe_checkout_session_id, expires_at)
     values ($1::uuid, 'full', 'pending', $2, 'EUR', 'xpetis', $1::text, $3, now() + interval '31 minutes')`,
    [orderId, importo, sessione])

  await expectFail('un pagamento di ordine non può dichiararsi consulenza (vincolo della 0011)', `
    insert into payments (order_id, kind, amount_cents) values ('${O(1)}', 'consultation', 115000)`,
    'kind_matches_target')

  await cassa(O(1), 'cs_test_sumisura_01', 115000)
  {
    const e = await webhook(evento('cs_test_sumisura_01', O(1), 100000))
    const o = await ordine(O(1))
    e.esito === 'importo_non_combacia' && o.status === 'proposal_sent'
      ? ok('importo diverso dalla proposta: l\'ordine NON passa in lavorazione') : fail(JSON.stringify(e))
    const p = (await db.query(`select status from payments where stripe_checkout_session_id='cs_test_sumisura_01'`)).rows[0]
    p.status === 'pending' && await nAlert('stripe_importo_non_combacia') >= 1
      ? ok('la riga resta pending e il team riceve un alert critico') : fail('riga: ' + p.status)
  }
  {
    const e = await webhook(evento('cs_test_sumisura_01', O(1), 115000))
    const o = await ordine(O(1))
    e.ok && e.esito === 'ordine_pagato' && e.order_id === O(1) && o.status === 'in_progress'
      ? ok('importo giusto: l\'ordine passa in lavorazione') : fail(JSON.stringify(e))
    const h = (await storia(O(1))).at(-1)
    h.to_status === 'in_progress' && h.actor === 'traveler'
      ? ok('attribuito al viaggiatore: ha pagato lui') : fail('storia: ' + JSON.stringify(h))
    const p = (await db.query(`select status, paid_at from payments where stripe_checkout_session_id='cs_test_sumisura_01'`)).rows[0]
    p.status === 'paid' && p.paid_at ? ok('e la riga di pagamento è pagata') : fail(JSON.stringify(p))
  }
  {
    const e = await webhook(evento('cs_test_sumisura_01', O(1), 115000))
    e.ok && e.esito === 'gia_pagato' ? ok('lo stesso incasso raccontato due volte: innocuo') : fail(JSON.stringify(e))
  }
  {
    // Un secondo incasso sullo stesso ordine, da un'altra cassa: l'indice
    // payments_one_paid_per_kind vieta di segnarlo pagato, e il ponte non deve
    // sollevare — altrimenti Stripe ritenta per sempre.
    await cassa(O(1), 'cs_test_sumisura_02', 115000).catch(() => null)
    await db.query(`update payments set status='expired' where stripe_checkout_session_id='cs_test_sumisura_02'`)
    const e = await webhook(evento('cs_test_sumisura_02', O(1), 115000))
    e.esito === 'pagamento_su_ordine_non_in_attesa' && e.esito !== 'errore'
      ? ok('secondo incasso su un ordine già pagato: esito, non eccezione') : fail(JSON.stringify(e))
    const a = (await db.query(`select message from team_alerts where kind='stripe_pagamento_su_ordine_non_in_attesa'
                                order by created_at desc limit 1`)).rows[0]
    a?.message.includes('GIÀ PAGATO') && a.message.includes('NON è registrato')
      ? ok('e l\'alert dice che è un secondo incasso, e che non è in payments') : fail(a?.message)
  }
  {
    // Un ordine annullato che riceve un pagamento: lo slot già dato via, sugli ordini.
    await creaOrdine(2, B(2))
    const T2 = await tokenDi('td_order_page', O(2))
    await salva(T2, 'Islanda', 80000, 7, 0); await invia(T2, 80000)
    await cassa(O(2), 'cs_test_sumisura_03', 80000)
    await db.query(`update orders set status='cancelled', cancelled_at=now(), last_actor='team' where id=$1`, [O(2)])
    const e = await webhook(evento('cs_test_sumisura_03', O(2), 80000))
    const o = await ordine(O(2))
    const p = (await db.query(`select status from payments where stripe_checkout_session_id='cs_test_sumisura_03'`)).rows[0]
    e.esito === 'pagamento_su_ordine_non_in_attesa' && o.status === 'cancelled' && p.status === 'paid'
      ? ok('ordine annullato che riceve un pagamento: resta annullato, i soldi si registrano')
      : fail(JSON.stringify([e.esito, o.status, p.status]))
    const a = (await db.query(`select message from team_alerts where kind='stripe_pagamento_su_ordine_non_in_attesa'
                                and entity_id=$1`, [O(2)])).rows[0]
    a?.message.includes('ANNULLATO') ? ok('e l\'alert dice di rimborsare') : fail(a?.message)
  }
  {
    const fantasma = '0dd0dd00-0000-4000-8000-0000000000ff'
    const e = await webhook(evento('cs_test_sumisura_04', fantasma, 50000))
    e.esito === 'ordine_sconosciuto' && await nAlert('stripe_pagamento_senza_ordine') >= 1
      ? ok('pagamento su un ordine che non esiste: alert critico, niente eccezione') : fail(JSON.stringify(e))
  }
  {
    const e = await webhook(evento('cs_test_sumisura_05', O(9), 50000))
    const o = await ordine(O(9))
    // Dalla 0047 il ramo All Inclusive c'è, ma senza riga né metadata.xpetis
    // non sa se è l'acconto o il saldo: non indovina.
    e.esito === 'rata_non_riconosciuta' && o.status === 'requested'
      ? ok('pagamento su un All Inclusive senza rata riconoscibile: ordine fermo, e lo dice') : fail(JSON.stringify(e))
  }
  {
    // La cassa scaduta: solo la riga, l'ordine resta pagabile.
    await creaCall(4)
    await creaOrdine(3, B(4))
    const T3 = await tokenDi('td_order_page', O(3))
    await salva(T3, 'Portogallo', 60000, 5, 0); await invia(T3, 60000)
    await cassa(O(3), 'cs_test_sumisura_06', 60000)
    const e = await webhook(evento('cs_test_sumisura_06', O(3), 60000,
                                   { status: 'expired', payment_status: 'unpaid' }))
    // l'evento dice "expired" nel tipo
    const scad = evento('cs_test_sumisura_06', O(3), 60000, { status: 'expired', payment_status: 'unpaid' })
    scad.type = 'checkout.session.expired'
    const e2 = await webhook(scad)
    const o = await ordine(O(3))
    const p = (await db.query(`select status from payments where stripe_checkout_session_id='cs_test_sumisura_06'`)).rows[0]
    e.esito === 'pagamento_non_ancora_incassato' && e2.esito === 'scaduta' && p.status === 'expired'
      && o.status === 'proposal_sent'
      ? ok('cassa scaduta: la riga va a expired, la proposta resta pagabile')
      : fail(JSON.stringify([e.esito, e2.esito, p.status, o.status]))
  }
  {
    // La riga di pagamento che manca: il ponte la ricostruisce col conto giusto.
    const e = await webhook(evento('cs_test_sumisura_07', O(3), 60000))
    const p = (await db.query(`select kind, status, stripe_account from payments
                                where stripe_checkout_session_id='cs_test_sumisura_07'`)).rows[0]
    e.esito === 'ordine_pagato' && p?.kind === 'full' && p.status === 'paid' && p.stripe_account === 'xpetis'
      ? ok('sessione senza riga: la riga si ricostruisce, con il conto di payment_account(full)')
      : fail(JSON.stringify([e, p]))
  }

  // --------------------------------------------------- stati che non ammettono
  console.log('  -- proposte dove non si possono fare --')
  {
    const e = await salva(TOK, 'Ancora', 100000, 5, 0)   // O(1) è in lavorazione
    e.ok === false && e.esito === 'proposta_gia_inviata' ? ok('su un ordine in lavorazione: no')
                                                        : fail(JSON.stringify(e))
    const T2 = await tokenDi('td_order_page', O(2))      // O(2) è annullato
    const e2 = await salva(T2, 'Ancora', 100000, 5, 0)
    const e3 = await invia(T2, 100000)
    e2.esito === 'stato_non_ammesso' && e3.esito === 'stato_non_ammesso'
      ? ok('su un ordine annullato: né bozza né invio') : fail(JSON.stringify([e2, e3]))
  }
  // Un ordine creato a mano dal team, senza una call d'origine.
  await db.query(`insert into orders (id, traveler_id, td_id, service_type, last_actor)
                  values ($1, $2, $3, 'custom_itinerary', 'team')`, [O(5), ANNA, TD])
  await expectFail('una proposta senza descrizione non parte nemmeno da Studio', `
    update orders set status='proposal_sent', proposal_price_cents=50000, delivery_days=5
     where id='${O(5)}'`, 'senza descrizione')

  // --------------------------------------------------- il credito
  console.log('  -- il credito: dichiarato una volta, mai calcolato --')
  {
    // Sulla stessa call un All Inclusive ha già dichiarato il credito: il su
    // misura non può dichiararlo di nuovo, e la pagina lo dice prima.
    await creaCall(5)
    await creaOrdine(6, B(5), 'all_inclusive', 6000)
    await creaOrdine(7, B(5))
    const T7 = await tokenDi('td_order_page', O(7))
    const p = await pagina(T7)
    const hrAI = (await ordine(O(6))).human_ref
    p.credito_usato_su === hrAI
      ? ok('la pagina avvisa che il credito di questa call è già su un altro ordine')
      : fail('pagina: ' + JSON.stringify(p))
    const e = await salva(T7, 'Marocco', 90000, 7, 3000)
    e.ok === false && e.esito === 'credito_gia_usato' && e.su === hrAI
      ? ok('e il salvataggio con credito si rifiuta, dicendo su quale ordine è') : fail(JSON.stringify(e))
    const e2 = await salva(T7, 'Marocco', 90000, 7, 0)
    e2.ok ? ok('senza credito si salva') : fail(JSON.stringify(e2))
  }
  {
    // Un ordine creato dal team senza call non ha niente da scalare.
    const T5 = await tokenDi('td_order_page', O(5))
    const e = await salva(T5, 'Senza call', 50000, 5, 1000)
    e.esito === 'dati_non_validi' && e.motivo === 'senza_call'
      ? ok('senza una call d\'origine il credito non si può dichiarare') : fail(JSON.stringify(e))
  }

  // --------------------------------------------------- la proposta rifatta
  console.log('  -- la proposta riaperta dal team e rifatta --')
  {
    const T7 = await tokenDi('td_order_page', O(7))
    await invia(T7, 90000)
    const TV7 = await tokenDi('traveler_public_proposal', O(7))
    await expectFail('riaprire e correggere nello stesso colpo non si può', `
      update orders set status='in_definition', proposal_price_cents=85000, last_actor='team'
       where id='${O(7)}'`, 'già partita')
    await db.query(`update orders set status='in_definition', last_actor='team' where id=$1`, [O(7)])
    const g = await gemella(TV7)
    g.fase === 'in_aggiornamento' && g.prezzo_cents === null
      ? ok('riaperta: la pagina gemella dice «in aggiornamento» e non mostra la bozza nuova')
      : fail(JSON.stringify(g))
    await salva(T7, 'Marocco, rivisto', 85000, 7, 0)
    const e = await invia(T7, 85000)
    const prop = (await db.query(`select round, price_cents from order_proposals where order_id=$1 order by round`, [O(7)])).rows
    const mail = Number((await db.query(
      `select count(*) from outbound_messages where message_kind='proposal_traveler'
          and entity_id in (select id from order_proposals where order_id=$1)`, [O(7)])).rows[0].count)
    e.esito === 'inviata' && prop.length === 2 && prop[0].price_cents === 90000 && prop[1].price_cents === 85000
      ? ok('rifatta: seconda proposta, e la prima resta come prova di cosa era stato chiesto')
      : fail(JSON.stringify(prop))
    mail === 2 ? ok('e il viaggiatore riceve la seconda mail: il vincolo è per proposta, non per ordine')
               : fail('mail: ' + mail)
    ;(await tokenDi('traveler_public_proposal', O(7))) === TV7
      ? ok('con lo stesso link di prima: quello girato nel gruppo resta buono') : fail('token cambiato')
  }

  // --------------------------------------------------- il token riassegnato
  console.log('  -- il token è del designer, non dell\'ordine --')
  {
    const T7 = await tokenDi('td_order_page', O(7))
    await db.query(`update orders set td_id=$1, last_actor='team' where id=$2`, [TD2, O(7)])
    ;(await pagina(T7)).esito === 'token_di_altro_tipo'
      ? ok('ordine riassegnato a un altro designer: il link del primo non apre più niente')
      : fail('il token del designer precedente funziona ancora')
    await db.query(`update orders set td_id=$1, last_actor='team' where id=$2`, [TD, O(7)])
  }

  // --------------------------------------------------- la mail che non si compone
  console.log('  -- una mail rotta non ferma l\'invio --')
  {
    await db.query(`update team_alerts set resolved_at = now() where kind = 'email_composizione_fallita'`)
    await db.query(`update message_templates set body_it = body_it || E'\n\n{{segnaposto_inventato}}'
                     where key = 'proposal_traveler'`)
    await creaCall(6)
    await creaOrdine(8, B(6))
    const T8 = await tokenDi('td_order_page', O(8))
    await salva(T8, 'Norvegia', 70000, 5, 0)
    const e = await invia(T8, 70000)
    const o = await ordine(O(8))
    e.esito === 'inviata' && o.status === 'proposal_sent'
      ? ok('un testo rotto su Studio non blocca il designer: la proposta parte')
      : fail(JSON.stringify(e))
    await nAlert('email_composizione_fallita') === 1
      ? ok('e il team riceve l\'alert, con la funzione per rilanciarla') : fail('nessun alert')
    await db.query(`update message_templates set body_it = replace(body_it, E'\n\n{{segnaposto_inventato}}', '')
                     where key = 'proposal_traveler'`)
    await db.query(`update team_alerts set resolved_at = now() where kind = 'email_composizione_fallita'`)
  }

  // --------------------------------------------------- chi può chiamare cosa
  console.log('  -- anon e authenticated non arrivano a niente --')
  for (const f of ['td_order_page(text)', 'save_proposal_draft(text,text,integer,integer,integer)',
                   'send_proposal(text,integer)', 'proposal_public_page(text)',
                   'payment_account(payment_kind)', 'accoda_mail_proposta(uuid)',
                   'accoda_mail_ordine_td(uuid)', 'td_order_from_token(text,boolean)',
                   'stripe_checkout_ordine(text,jsonb,uuid,payments)', 'euro_it(integer)']) {
    const r = (await db.query(
      `select has_function_privilege('anon', $1, 'EXECUTE') as a,
              has_function_privilege('authenticated', $1, 'EXECUTE') as u`, [f])).rows[0]
    !r.a && !r.u ? ok(`${f}: chiusa ad anon e authenticated`) : fail(`${f} aperta: ${JSON.stringify(r)}`)
  }
  for (const f of ['td_order_page(text)', 'save_proposal_draft(text,text,integer,integer,integer)',
                   'send_proposal(text,integer)', 'proposal_public_page(text)']) {
    const v = (await db.query(`select has_function_privilege('service_role', $1, 'EXECUTE') as v`, [f])).rows[0].v
    v ? ok(`${f}: la chiama la route server`) : fail(`${f} non raggiungibile dalla chiave secret`)
  }
  for (const t of ['order_proposals', 'team_spot_check_proposte']) {
    const r = (await db.query(
      `select has_table_privilege('anon', $1, 'SELECT') as a,
              has_table_privilege('authenticated', $1, 'SELECT') as u`, [t])).rows[0]
    !r.a && !r.u ? ok(`${t}: non leggibile dal browser`) : fail(`${t} leggibile: ${JSON.stringify(r)}`)
  }
  {
    const r = (await db.query(`select * from team_spot_check_proposte where human_ref = $1`,
                              [(await ordine(O(1))).human_ref])).rows[0]
    r?.prezzo_call_cents === 6000 && r.credito_dichiarato_cents === 6000 && r.prezzo_proposta_cents === 115000
      ? ok('lo spot-check affianca prezzo call, credito dichiarato e prezzo proposto, senza sottrarre niente')
      : fail(JSON.stringify(r))
  }
  {
    // La bozza del designer non si legge dal browser del viaggiatore: my_orders
    // (0019) portava le colonne della proposta in ogni stato.
    await db.query(`update orders set status='in_definition', last_actor='team' where id=$1`, [O(8)])
    await db.query(`update orders set proposal_price_cents=99900, last_actor='td' where id=$1`, [O(8)])
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ANNA}', false)`)
    const righe = (await db.query(
      `select id, status, proposal_price_cents, proposal_description from my_orders where id in ($1, $2)`,
      [O(1), O(8)])).rows
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`)
    const bozza = righe.find(r => r.id === O(8))
    const pagata = righe.find(r => r.id === O(1))
    bozza && bozza.proposal_price_cents === null && bozza.proposal_description === null
      ? ok('my_orders: in definizione il viaggiatore non vede la bozza del designer')
      : fail('bozza leggibile dal viaggiatore: ' + JSON.stringify(bozza))
    pagata && pagata.proposal_price_cents === 115000
      ? ok('e vede la proposta quando è partita') : fail('proposta partita: ' + JSON.stringify(pagata))
  }
  {
    const v = (await db.query(`select euro_it(115000) a, euro_it(50) b, euro_it(123456789) c`)).rows[0]
    v.a === '1.150,00 €' && v.b === '0,50 €' && v.c === '1.234.567,89 €'
      ? ok('euro_it scrive gli importi all\'italiana') : fail(JSON.stringify(v))
  }

  // =================================================== 0045: gli importi negli alert
  console.log('  -- 0045: gli importi negli alert si leggono --')
  {
    // La regola, non il caso: nessuna funzione viva divide per 100.0. È il
    // controllo che fa diventare rosso il giro quando un alert nuovo ricade
    // nel difetto della prova 54, invece di scoprirlo leggendo l'alert.
    const r = (await db.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosrc ~ '/\\s*100\\.0'`)).rows
    r.length === 0
      ? ok('nessuna funzione scrive un importo con / 100.0: passano tutte da euro_it')
      : fail('funzioni che dividono ancora per 100.0: ' + r.map(x => x.proname).join(', '))
  }
  {
    const a = (await db.query(`select message from team_alerts where kind='stripe_importo_non_combacia'
                                and entity_id=$1 order by created_at limit 1`, [O(1)])).rows[0]
    a?.message.includes('arrivati 1.000,00 €') && a.message.includes('attesi 1.150,00 €')
      && !/\d\.\d{3,}0{4}/.test(a.message) && !a.message.includes('EUR')
      ? ok('l\'alert d\'importo scrive «1.000,00 €» e non «1000.0000000000000000 EUR»')
      : fail(a?.message)
  }

  // =================================================== 0045: chi viene avvisato
  console.log('  -- 0045: quando il viaggiatore paga, lo sanno designer e team --')
  const conf = (k, v) => db.query(`update app_config set value_text=$2 where key=$1`, [k, v])
  {
    // O(1) è stato pagato sopra, con il seed: destinatari interni vuoti.
    const m = await posta('order_paid_td', O(1))
    m.length === 1 && m[0].recipient === 'marco@example.com' && m[0].status === 'queued'
      ? ok('al pagamento parte la mail al designer, in coda e non spedita')
      : fail('mail pagata al TD: ' + JSON.stringify(m.map(x => [x.recipient, x.status])))
    const t = m[0]?.body_text ?? ''
    t.includes('/ordine/' + TOK) && t.includes('1.150,00 €') && /entro il \d{2}\/\d{2}\/\d{4}/.test(t)
      ? ok('con il link della pagina ordine, il prezzo all\'italiana e la data di consegna')
      : fail('corpo: ' + t)
    const team = await posta('team_ordine_pagato', O(1))
    team.length === 0 && await nAlert('notifica_team_non_configurata') === 1
      ? ok('senza destinatari interni non si perde in silenzio: un alert lo dice')
      : fail(JSON.stringify([team.length, await nAlert('notifica_team_non_configurata')]))
    await db.query(`update team_alerts set resolved_at=now() where kind='notifica_team_non_configurata'`)
  }
  await conf('team_notify_recipients', 'simone@xpetis.test, alessandro@xpetis.test,andrea@xpetis.test, simone@xpetis.test')
  await creaCall(7)
  await creaOrdine(4, B(7))
  const T4 = await tokenDi('td_order_page', O(4))
  await salva(T4, 'Giappone in autunno', 140000, 10, 0); await invia(T4, 140000)
  await cassa(O(4), 'cs_test_sumisura_45', 140000)
  {
    const e = await webhook(evento('cs_test_sumisura_45', O(4), 140000))
    const team = await posta('team_ordine_pagato', O(4))
    const dest = team.map(x => x.recipient).sort()
    e.esito === 'ordine_pagato'
      && JSON.stringify(dest) === JSON.stringify(['alessandro@xpetis.test', 'andrea@xpetis.test', 'simone@xpetis.test'])
      && team.every(x => x.status === 'queued')
      ? ok('una mail per amministratore, in coda, e l\'indirizzo ripetuto una volta sola')
      : fail(JSON.stringify([e.esito, dest]))
    const r = team[0]
    r?.subject.includes((await ordine(O(4))).human_ref) && r.subject.includes('1.400,00 €')
      && r.body_text.includes('Giulia') === false && r.body_text.includes('ha pagato la proposta')
      && r.body_text.includes('team_notify_events')
      ? ok('oggetto con riferimento e importo, corpo che dice cosa è successo e come si spegne')
      : fail(JSON.stringify(r && [r.subject, r.body_text]))
    const td = await posta('order_paid_td', O(4))
    td.length === 1 ? ok('e il designer riceve la sua') : fail('mail TD: ' + td.length)
  }
  {
    const e = await webhook(evento('cs_test_sumisura_45', O(4), 140000))
    const n = (await posta('team_ordine_pagato', O(4))).length + (await posta('order_paid_td', O(4))).length
    e.esito === 'gia_pagato' && n === 4
      ? ok('lo stesso pagamento raccontato due volte non raddoppia le mail') : fail(JSON.stringify([e.esito, n]))
  }
  {
    // Il punto aperto del PIANO: avvisare il team di ogni richiesta nuova è
    // una parola in team_notify_events, nessun deploy.
    const alert = async () => (await db.query(
      `insert into team_alerts (kind, severity, entity_type, entity_id, message)
       values ('ordine_richiesto', 'warning', 'order', $1, 'Nuova richiesta di prova') returning id`,
      [O(4)])).rows[0].id
    const a1 = await alert()
    const prima = await posta('team_ordine_richiesto', a1)
    await conf('team_notify_events', 'ordine_pagato, ordine_richiesto')
    const a2 = await alert()
    const dopo = await posta('team_ordine_richiesto', a2)
    prima.length === 0 && dopo.length === 3 && dopo.every(x => x.entity_type === 'team_alert')
      && dopo[0].subject.startsWith('[XPETIS · da guardare] Nuova richiesta di prova')
      ? ok('ordine_richiesto non notifica finché non è in elenco; aggiunto con una riga, notifica')
      : fail(JSON.stringify([prima.length, dopo.length, dopo[0]?.subject]))
  }
  {
    // Un testo rotto non fa ciclo: la notifica fallita scrive un alert che
    // per costruzione non si notifica, e l'alert d'origine resta scritto.
    await db.query(`update message_templates set body_it = body_it || ' {{inesistente}}' where key='team_notifica'`)
    let errore = null
    try {
      await db.query(`insert into team_alerts (kind, severity, message) values ('ordine_richiesto', 'warning', 'Testo rotto')`)
    } catch (e) { errore = e }
    const n = await nAlert('notifica_team_fallita')
    const scritto = Number((await db.query(`select count(*) from team_alerts where message='Testo rotto'`)).rows[0].count)
    !errore && n === 1 && scritto === 1
      ? ok('un testo di notifica rotto: un alert, nessuna eccezione, nessun ciclo')
      : fail(JSON.stringify([String(errore), n, scritto]))
    await db.query(`update message_templates set body_it = replace(body_it, ' {{inesistente}}', '') where key='team_notifica'`)
    await db.query(`update team_alerts set resolved_at=now() where kind='notifica_team_fallita'`)
  }
  {
    // Il ramo spento si dichiara: la riga degli eventi che manca del tutto.
    await db.query(`delete from app_config where key='team_notify_events'`)
    await db.query(`insert into team_alerts (kind, severity, message) values ('prova_qualunque', 'info', 'x')`)
    await nAlert('notifica_team_non_configurata') === 1
      ? ok('senza la riga team_notify_events: un alert, non il silenzio') : fail('nessun alert di configurazione')
    await db.query(`insert into app_config (key, value, value_text, config_group, label_it)
                    values ('team_notify_events', null, 'ordine_pagato', 'integrations', 'ripristino')`)
    await db.query(`update team_alerts set resolved_at=now() where kind='notifica_team_non_configurata'`)
  }
  await conf('team_notify_recipients', '')
  await conf('team_notify_events', 'ordine_pagato')
  for (const f of ['notifica_team(text,text,uuid,text,text)', 'accoda_mail_pagata_td(uuid)']) {
    const r = (await db.query(
      `select has_function_privilege('anon', $1, 'EXECUTE') as a,
              has_function_privilege('authenticated', $1, 'EXECUTE') as u`, [f])).rows[0]
    !r.a && !r.u ? ok(`${f}: chiusa ad anon e authenticated`) : fail(`${f} aperta: ${JSON.stringify(r)}`)
  }
}


// ===========================================================================
// Il silenzio-conferma, e i due modi di romperlo (migration 0046)
// ===========================================================================
console.log('\n== Il silenzio-conferma: 48 ore, consegna, revisione ==')
{
  const TD   = '11111111-1111-1111-1111-111111111111'   // Marco
  const ANNA = '44444444-4444-4444-4444-444444444444'
  const X = (n) => `e0e0e0e0-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
  const Q = (n) => `9e9e9e9e-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`

  const tick = async () => (await db.query('select * from clock_tick(100)')).rows
  const rpc  = async (sql, params) => (await db.query(sql, params)).rows[0].r
  const call = (n, inizio, fine, stato = 'confirmed') => db.query(
    `insert into bookings (id, traveler_id, td_id, service_type, status, cal_booking_uid,
                           cal_event_type_slug, starts_at, ends_at, original_starts_at,
                           price_cents, confirmed_at, last_actor)
     values ($1, $2, $3, 'consultation', $4, 'uid-silenzio-' || $5, 'consulenza-xpetis-30',
             ${inizio}, ${fine}, ${inizio}, 6000, now(), 'n8n')`, [X(n), ANNA, TD, stato, String(n)])
  const tokenCall = async (scopo, bookingId) => {
    await db.query(`insert into access_tokens (purpose, audience, booking_id, td_id)
                    values ($1, 'td', $2, $3) on conflict do nothing`, [scopo, bookingId, TD])
    return (await db.query(`select token from access_tokens where purpose=$1 and booking_id=$2
                             and revoked_at is null`, [scopo, bookingId])).rows[0].token
  }
  const paginaEcc = (t) => rpc('select td_exception_page($1) as r', [t])
  const segnala   = (t, min, nota) => rpc('select td_report_exception($1,$2,$3) as r', [t, min, nota])
  const prenot    = async (id) => (await db.query('select * from bookings where id=$1', [id])).rows[0]
  const nAlert    = async (kind) => Number((await db.query(
    `select count(*) from team_alerts where kind=$1 and resolved_at is null`, [kind])).rows[0].count)
  const posta     = async (kind, entity) => (await db.query(
    `select * from outbound_messages where message_kind=$1 and entity_id=$2`, [kind, entity])).rows

  // ====================================================== A · dopo la call
  console.log('  -- la mail al designer con i due tasti --')
  await call(1, `now() - interval '40 minutes'`, `now() - interval '10 minutes'`)
  await tick()
  const TNS = (await db.query(`select token, expires_at from access_tokens
                                where purpose='td_exception_no_show' and booking_id=$1`, [X(1)])).rows[0]
  const TPB = (await db.query(`select token from access_tokens
                                where purpose='td_exception_problem' and booking_id=$1`, [X(1)])).rows[0]
  {
    const m = await posta('postcall_td', X(1))
    m.length === 1 && m[0].recipient === 'marco@example.com' && m[0].status === 'queued'
      ? ok('a fine call parte la mail al designer, in coda, al suo indirizzo')
      : fail('postcall_td: ' + JSON.stringify(m.map(x => [x.recipient, x.status])))
    TNS && TPB && TNS.expires_at === null
      && m[0]?.body_html.includes('/eccezione/' + TNS.token) && m[0]?.body_html.includes('/eccezione/' + TPB.token)
      ? ok('con i due tasti, due token che non scadono: la finestra la fa valere la funzione')
      : fail('tasti: ' + JSON.stringify([!!TNS, !!TPB]))
    ;/48 ore/.test(m[0]?.body_text ?? '') && /non devi fare niente/.test(m[0]?.body_text ?? '')
      ? ok('e dice che non fare niente va bene, e fra quanto la call si chiude')
      : fail('testo: ' + m[0]?.body_text)
  }

  console.log('  -- il tasto no-show dichiara, non chiude --')
  {
    const p = await paginaEcc(TNS.token)
    p.esito === 'valido' && p.fase === 'aperta' && p.tipo === 'no_show' && p.nome_viaggiatore === 'Anna'
      ? ok('la pagina del tasto: aperta, col solo nome di chi ha prenotato')
      : fail('pagina: ' + JSON.stringify(p))
    !/viaggiatore@example|Bianchi/.test(JSON.stringify(p))
      ? ok('niente cognome né mail: il link vive in una casella inoltrabile') : fail('dati in più nella pagina')
    const e0 = await segnala(TNS.token, null, null)
    e0.ok === false && e0.esito === 'dati_non_validi' && e0.campo === 'minuti'
      ? ok('un no-show senza i minuti di attesa non si dichiara') : fail(JSON.stringify(e0))
  }
  {
    const e = await segnala(TNS.token, 20, 'Collegato alle 10:00, nessuno fino alle 10:22')
    const b = await prenot(X(1))
    e.ok && e.esito === 'segnalata' && b.status === 'disputed' && b.last_actor === 'td'
      ? ok('segnalato: la call va in disputed, attribuita al designer — non a no_show')
      : fail(JSON.stringify([e, b.status]))
    const h = (await db.query(`select to_status, actor from booking_status_history
                                where booking_id=$1 order by id desc limit 1`, [X(1)])).rows[0]
    h.to_status === 'disputed' && h.actor === 'td'
      ? ok('e la storia lo scrive col designer come attore: è l\'unica prova') : fail(JSON.stringify(h))
    const x = (await db.query(`select * from booking_exceptions where booking_id=$1`, [X(1)])).rows[0]
    x?.kind === 'no_show' && x.waited_minutes === 20 && x.minutes_after_start >= 39 && x.minutes_after_start <= 41
      ? ok('la segnalazione porta la dichiarazione e l\'ora misurata dal server (40 minuti dopo l\'inizio)')
      : fail('segnalazione: ' + JSON.stringify(x))
    const a = (await db.query(`select severity, message from team_alerts where kind='td_segnala_no_show'
                                and entity_id=$1`, [X(1)])).rows[0]
    a?.severity === 'critical' && a.message.includes('aspettato 20 minuti') && a.message.includes('la regola è 15')
      && /40 minuti dopo l'inizio/.test(a.message) && a.message.includes('nessuno fino alle 10:22')
      ? ok('l\'alert porta quello che serve per arbitrare: attesa dichiarata, regola, ora vera, cosa ha scritto')
      : fail('alert: ' + a?.message)
    a?.message.includes('NON è stato avvisato') && a.message.includes('viaggiatore@example.com')
      && a.message.includes('60,00 €')
      ? ok('e dice che il viaggiatore non sa niente, con i contatti per sentirlo, e quanto ha pagato')
      : fail('alert: ' + a?.message)
  }
  {
    const e = await segnala(TNS.token, 25, 'di nuovo')
    const e2 = await segnala(TPB.token, null, 'e anche un problema')
    const n = Number((await db.query(`select count(*) from booking_exceptions where booking_id=$1`, [X(1)])).rows[0].count)
    e.ok && e.esito === 'gia_segnalata' && e2.esito === 'gia_segnalata' && n === 1
      && await nAlert('td_segnala_no_show') === 1
      ? ok('no-show dichiarato due volte, e poi l\'altro tasto: una segnalazione, un alert')
      : fail(JSON.stringify([e.esito, e2.esito, n]))
    ;(await paginaEcc(TPB.token)).fase === 'gia_segnalata'
      ? ok('e la pagina dell\'altro tasto dice che la call è già segnalata') : fail('pagina altro tasto')
  }

  console.log('  -- il silenzio a 48 ore --')
  {
    // La call segnalata, invecchiata oltre le 48 ore: il silenzio non la tocca.
    await db.query(`update bookings set starts_at = now() - interval '3 days',
                    ends_at = now() - interval '3 days' + interval '30 minutes' where id=$1`, [X(1)])
    await tick()
    ;(await prenot(X(1))).status === 'disputed'
      ? ok('chiusura a 48 ore su una call con una segnalazione aperta: non la chiude')
      : fail('la call segnalata è stata chiusa dal silenzio')
    await db.query(`update bookings set status='no_show', last_actor='team' where id=$1`, [X(1)])
    const x = (await db.query(`select resolved_at, resolution from booking_exceptions where booking_id=$1`, [X(1)])).rows[0]
    x.resolved_at && x.resolution === 'no_show'
      ? ok('il team decide no_show: la segnalazione si chiude da sola con la decisione sopra')
      : fail(JSON.stringify(x))
  }
  await call(2, `now() - interval '49 hours 30 minutes'`, `now() - interval '49 hours'`)
  await call(3, `now() - interval '47 hours 30 minutes'`, `now() - interval '47 hours'`)
  await tick()
  {
    const b2 = await prenot(X(2)), b3 = await prenot(X(3))
    b2.status === 'completed' && b2.completed_at && b2.last_actor === 'system'
      ? ok('49 ore di silenzio: completed, dall\'orologio') : fail('b2: ' + b2.status)
    b3.status === 'confirmed' ? ok('47 ore: ancora aperta') : fail('b3 chiusa in anticipo: ' + b3.status)
  }
  {
    const t = await tokenCall('td_exception_no_show', X(2))
    const p = await paginaEcc(t)
    const e = await segnala(t, 20, 'tardi')
    p.fase === 'chiusa' && e.ok === false && e.esito === 'chiusa' && (await prenot(X(2))).status === 'completed'
      ? ok('segnalare una call già chiusa dal silenzio: pagina onesta, niente cambia')
      : fail(JSON.stringify([p.fase, e]))
  }
  {
    // Finestra passata, ma l'orologio non ci è ancora arrivato: vale la finestra.
    await call(4, `now() - interval '49 hours 30 minutes'`, `now() - interval '49 hours'`)
    const t = await tokenCall('td_exception_problem', X(4))
    const e = await segnala(t, null, 'un problema')
    e.esito === 'chiusa' && (await prenot(X(4))).status === 'confirmed'
      ? ok('oltre le 48 ore prima del giro dell\'orologio: chiusa lo stesso, niente disputa')
      : fail(JSON.stringify(e))
  }
  {
    await call(5, `now() - interval '5 minutes'`, `now() + interval '25 minutes'`)
    const tn = await tokenCall('td_exception_no_show', X(5))
    const tp = await tokenCall('td_exception_problem', X(5))
    const e = await segnala(tn, 5, 'non c\'è')
    e.esito === 'troppo_presto' && (await prenot(X(5))).status === 'confirmed'
      ? ok('no-show dichiarato prima dei 15 minuti di attesa: rifiutato') : fail(JSON.stringify(e))
    const e2 = await segnala(tp, null, '   ')
    e2.esito === 'dati_non_validi' && e2.campo === 'nota'
      ? ok('«altro problema» senza dire quale: non si segnala') : fail(JSON.stringify(e2))
    const e3 = await segnala(tp, null, 'La connessione è caduta tre volte')
    const a = (await db.query(`select message from team_alerts where kind='td_segnala_problema' and entity_id=$1`, [X(5)])).rows[0]
    e3.esito === 'segnalata' && (await prenot(X(5))).status === 'disputed' && a?.message.includes('caduta tre volte')
      ? ok('«altro problema» durante la call: disputa, alert con la nota')
      : fail(JSON.stringify([e3, a?.message]))
  }
  {
    // Gli alert dei tasti sono eventi del meccanismo della 0045: una parola in elenco.
    await db.query(`update app_config set value_text='simone@xpetis.test' where key='team_notify_recipients'`)
    await db.query(`update app_config set value_text='ordine_pagato, td_segnala_no_show' where key='team_notify_events'`)
    await call(6, `now() - interval '40 minutes'`, `now() - interval '10 minutes'`)
    const t = await tokenCall('td_exception_no_show', X(6))
    await segnala(t, 16, null)
    const a = (await db.query(`select id from team_alerts where kind='td_segnala_no_show' and entity_id=$1`, [X(6)])).rows[0]
    ;(await posta('team_td_segnala_no_show', a.id)).length === 1
      ? ok('il no-show si notifica al team con una parola in team_notify_events')
      : fail('nessuna notifica del no-show')
    await db.query(`update app_config set value_text='' where key='team_notify_recipients'`)
    await db.query(`update app_config set value_text='ordine_pagato' where key='team_notify_events'`)
  }

  // ====================================================== B · la consegna
  console.log('  -- la consegna --')
  const creaOrdine = async (n, callN) => {
    await call(callN, `now() - interval '3 days'`, `now() - interval '3 days' + interval '30 minutes'`, 'completed')
    await db.query(`insert into orders (id, traveler_id, td_id, service_type, source_booking_id, last_actor)
                    values ($1, $2, $3, 'custom_itinerary', $4, 'traveler')`, [Q(n), ANNA, TD, X(callN)])
    const t = (await db.query(`select token from access_tokens where purpose='td_order_page' and order_id=$1`, [Q(n)])).rows[0].token
    await db.query('select save_proposal_draft($1,$2,$3,$4,$5)', [t, 'Scozia', 90000, 7, 0])
    await db.query('select send_proposal($1,$2)', [t, 90000])
    const tv = (await db.query(`select token from access_tokens where purpose='traveler_public_proposal' and order_id=$1`, [Q(n)])).rows[0].token
    return { td: t, viaggiatore: tv }
  }
  const paga      = (id) => db.query(`update orders set status='in_progress', last_actor='traveler' where id=$1`, [id])
  const biglietto = (t, nome = 'Itinerario Scozia.pdf', size = 3_000_000, mime = 'application/pdf') =>
    rpc('select td_delivery_ticket($1,$2,$3,$4) as r', [t, nome, size, mime])
  const consegna  = (t, path, nome = 'Itinerario Scozia.pdf', size = 3_000_000, mime = 'application/pdf') =>
    rpc('select td_deliver($1,$2,$3,$4,$5) as r', [t, path, nome, size, mime])
  const ordine    = async (id) => (await db.query('select * from orders where id=$1', [id])).rows[0]
  const pagTd     = (t) => rpc('select td_order_page($1) as r', [t])
  const pagV      = (t) => rpc('select proposal_public_page($1) as r', [t])
  const file      = (t, id) => rpc('select order_file_for_token($1,$2) as r', [t, id])
  const revisione = (t, nota) => rpc('select request_revision($1,$2) as r', [t, nota])

  const T1 = await creaOrdine(1, 11)
  {
    const b = await biglietto(T1.td)
    const finto = `ordini/${Q(1)}/00000000-0000-4000-8000-000000000000.pdf`
    const e = await consegna(T1.td, finto)
    b.ok === false && b.esito === 'stato_non_ammesso' && e.esito === 'stato_non_ammesso'
      && (await ordine(Q(1))).status === 'proposal_sent'
      ? ok('consegna su un ordine non pagato: né biglietto né consegna, l\'ordine non si muove')
      : fail(JSON.stringify([b, e]))
  }
  await paga(Q(1))
  let PATH1
  {
    const b = await biglietto(T1.td)
    PATH1 = b.path
    b.ok && b.tipo === 'itinerary' && new RegExp(`^ordini/${Q(1)}/[0-9a-f-]{36}\\.pdf$`).test(b.path)
      ? ok('pagato: il biglietto c\'è, e il percorso lo sceglie il database') : fail(JSON.stringify(b))
    const bm = await biglietto(T1.td, 'x.html', 1000, 'text/html')
    const bs = await biglietto(T1.td, 'x.pdf', 60_000_000, 'application/pdf')
    bm.campo === 'tipo' && bs.campo === 'dimensione'
      ? ok('un tipo non ammesso o un file oltre i 50 MB: rifiutati prima di caricare')
      : fail(JSON.stringify([bm, bs]))
  }
  {
    const altro = `ordini/${Q(2)}/00000000-0000-4000-8000-000000000000.pdf`
    const e = await consegna(T1.td, altro)
    e.esito === 'dati_non_validi' && e.campo === 'percorso'
      ? ok('col token di un ordine non si registra il file di un altro') : fail(JSON.stringify(e))
  }
  {
    const e = await consegna(T1.td, PATH1)
    const o = await ordine(Q(1))
    e.ok && e.esito === 'consegnato' && o.status === 'delivered' && o.last_actor === 'td'
      ? ok('consegnato: l\'ordine è delivered, attribuito al designer') : fail(JSON.stringify([e, o.status]))
    const f = (await db.query(`select * from order_files where order_id=$1`, [Q(1)])).rows
    f.length === 1 && f[0].kind === 'itinerary' && f[0].uploaded_by === 'td' && f[0].filename === 'Itinerario Scozia.pdf'
      ? ok('il file è registrato: itinerario, caricato dal designer, col suo nome') : fail(JSON.stringify(f))
    const giorni = (new Date(o.revision_deadline_at) - new Date(o.delivered_at)) / 86400000
    Math.abs(giorni - 5) < 0.001 ? ok('la finestra della revisione: cinque giorni dalla consegna')
                                 : fail('finestra: ' + giorni)
    const e2 = await consegna(T1.td, PATH1)
    const n = Number((await db.query(`select count(*) from order_files where order_id=$1`, [Q(1)])).rows[0].count)
    e2.ok && e2.esito === 'gia_consegnato' && n === 1
      ? ok('il doppio «fatto» sullo stesso file: innocuo') : fail(JSON.stringify([e2, n]))
  }
  let FILE1
  {
    FILE1 = (await db.query(`select id from order_files where order_id=$1`, [Q(1)])).rows[0].id
    const m = await posta('delivery_traveler', FILE1)
    const t = m[0]?.body_text ?? ''
    m.length === 1 && m[0].recipient === 'viaggiatore@example.com' && t.includes('/proposta/' + T1.viaggiatore)
      ? ok('la mail al viaggiatore porta la pagina a token, che non scade')
      : fail('mail consegna: ' + t)
    !/storage|ordini\/|token=|sign/i.test(m[0]?.body_html + t)
      ? ok('e nessun link di Storage: una mail così funziona anche fra tre settimane')
      : fail('link di Storage nella mail')
    ;/entro il \d{2}\/\d{2}\/\d{4}/.test(t) ? ok('con la data limite della revisione') : fail('data limite assente')
  }
  {
    const p = await pagTd(T1.td)
    p.file?.length === 1 && p.messaggio_consegna?.includes('/proposta/' + T1.viaggiatore) && p.si_chiude_il
      ? ok('la pagina del designer: il file, il messaggio da girare nel gruppo, la data di chiusura')
      : fail(JSON.stringify(p))
    const v = await pagV(T1.viaggiatore)
    v.fase === 'consegnata' && v.file?.length === 1 && v.puo_chiedere_revisione === true
      ? ok('la pagina del viaggiatore: consegnata, col file e il tasto della revisione')
      : fail(JSON.stringify(v))
    !JSON.stringify([p, v]).includes('ordini/')
      ? ok('nessuna delle due pagine riceve un percorso di Storage, tantomeno un link')
      : fail('percorso esposto a una pagina')
  }
  {
    const fv = await file(T1.viaggiatore, FILE1)
    const ft = await file(T1.td, FILE1)
    fv.esito === 'valido' && fv.path === PATH1 && fv.nome === 'Itinerario Scozia.pdf' && ft.esito === 'valido'
      ? ok('scaricare: il permesso dà il percorso alla route, al viaggiatore e al designer')
      : fail(JSON.stringify([fv, ft]))
    !('url' in fv) ? ok('e restituisce un percorso, mai un URL firmato') : fail('URL restituito')
    const fx = await file(T1.viaggiatore, '00000000-0000-4000-8000-000000000000')
    fx.esito === 'file_sconosciuto' ? ok('un file che non è di questo ordine: sconosciuto') : fail(JSON.stringify(fx))
  }
  const T2 = await creaOrdine(2, 12)
  await paga(Q(2))
  {
    const f = await file(T2.viaggiatore, FILE1)
    f.esito === 'file_sconosciuto'
      ? ok('col token di un altro ordine il file non si scarica') : fail(JSON.stringify(f))
  }

  // ====================================================== C · la revisione
  console.log('  -- la revisione, una sola --')
  {
    const e0 = await revisione(T1.viaggiatore, '  ')
    e0.esito === 'dati_non_validi' ? ok('una revisione senza dire cosa: non si chiede') : fail(JSON.stringify(e0))
    const e = await revisione(T1.viaggiatore, 'Più giorni a Skye, meno a Edimburgo')
    const o = await ordine(Q(1))
    e.ok && e.esito === 'revisione_chiesta' && o.status === 'revision_requested' && o.last_actor === 'traveler'
      ? ok('revisione chiesta dentro la finestra: revision_requested, attribuita al viaggiatore')
      : fail(JSON.stringify([e, o.status]))
    const m = await posta('revision_requested_td', Q(1))
    m.length === 1 && m[0].recipient === 'marco@example.com' && m[0].body_text.includes('Più giorni a Skye')
      && m[0].body_text.includes('/ordine/' + T1.td)
      ? ok('il designer riceve la mail con cosa è stato chiesto e il link per riconsegnare')
      : fail('mail revisione: ' + JSON.stringify(m.map(x => x.body_text)))
    const e2 = await revisione(T1.viaggiatore, 'di nuovo')
    e2.ok && e2.esito === 'revisione_in_corso' ? ok('il doppio clic: è già in corso, ed è la verità')
                                               : fail(JSON.stringify(e2))
    ;(await pagV(T1.viaggiatore)).puo_chiedere_revisione === false
      ? ok('e la pagina non offre più il tasto') : fail('tasto ancora offerto')
  }
  {
    // Il silenzio non chiude un ordine che aspetta il designer.
    await db.query(`update orders set delivered_at = now() - interval '10 days' where id=$1`, [Q(1)])
    await tick()
    ;(await ordine(Q(1))).status === 'revision_requested'
      ? ok('una revisione chiesta e non consegnata: il silenzio non chiude') : fail('chiuso con la revisione aperta')
  }
  {
    // Una scadenza riconoscibile, lontana da «adesso + 5 giorni»: nell'harness
    // prima consegna e riconsegna cadono nello stesso secondo, e un confronto
    // fra le due date non vedrebbe una finestra rifatta.
    await db.query(`update orders set revision_deadline_at = now() + interval '1 day' where id=$1`, [Q(1)])
    const scadenzaPrima = (await ordine(Q(1))).revision_deadline_at
    const b = await biglietto(T1.td, 'Scozia v2.pdf')
    const e = await consegna(T1.td, b.path, 'Scozia v2.pdf')
    const o = await ordine(Q(1))
    b.tipo === 'revision' && e.esito === 'consegnato' && o.status === 'delivered' && o.revision_delivered_at
      ? ok('la riconsegna: di nuovo delivered, con la data della revisione') : fail(JSON.stringify([b, e, o.status]))
    new Date(o.revision_deadline_at).getTime() === new Date(scadenzaPrima).getTime()
      ? ok('e la finestra della revisione NON riparte: era una sola') : fail('finestra rifatta')
    const f = (await db.query(`select id, kind from order_files where order_id=$1 order by created_at desc`, [Q(1)])).rows
    f.length === 2 && f[0].kind === 'revision'
      ? ok('due file: l\'itinerario e la revisione, tutti e due scaricabili') : fail(JSON.stringify(f))
    ;(await posta('revision_delivered_traveler', f[0].id)).length === 1
      ? ok('e una seconda mail al viaggiatore, per la versione rivista') : fail('mail della riconsegna assente')
  }
  {
    const e = await revisione(T1.viaggiatore, 'e ancora una cosa')
    e.ok === false && e.esito === 'revisione_gia_chiesta' && e.chiesta_il && e.consegnata_il
      ? ok('seconda revisione: no, con le date della prima e della sua consegna')
      : fail(JSON.stringify(e))
    const v = await pagV(T1.viaggiatore)
    v.puo_chiedere_revisione === false && v.revisione_chiesta_il && v.revisione_consegnata_il
      ? ok('e la pagina lo sa prima del clic: niente tasto, le date per dirlo') : fail(JSON.stringify(v))
  }

  console.log('  -- due orologi sullo stesso stato --')
  {
    // La finestra della revisione è scaduta, la prima consegna è di dieci giorni
    // fa: ma la riconsegna è di adesso, e la chiusura riparte da lì.
    await db.query(`update orders set revision_deadline_at = now() - interval '5 days' where id=$1`, [Q(1)])
    await tick()
    ;(await ordine(Q(1))).status === 'delivered'
      ? ok('dopo la riconsegna la chiusura riparte: cinque giorni per leggere la versione nuova')
      : fail('chiuso contando dalla prima consegna')
    await db.query(`update orders set revision_delivered_at = now() - interval '5 days 1 minute' where id=$1`, [Q(1)])
    await tick()
    const o = await ordine(Q(1))
    const h = (await db.query(`select actor from order_status_history where order_id=$1 order by id desc limit 1`, [Q(1)])).rows[0]
    o.status === 'completed' && o.completed_at && h.actor === 'system'
      ? ok('cinque giorni dall\'ultima consegna: completed, dall\'orologio') : fail(o.status)
  }
  {
    const v = await pagV(T1.viaggiatore)
    const f = await file(T1.viaggiatore, FILE1)
    v.fase === 'chiusa' && v.file.length === 2 && f.esito === 'valido'
      ? ok('chiuso è chiuso, ma i file si scaricano ancora: sono pagati')
      : fail(JSON.stringify([v.fase, f.esito]))
    const b = await biglietto(T1.td)
    b.esito === 'stato_non_ammesso' ? ok('su un ordine chiuso non si consegna più') : fail(JSON.stringify(b))
  }
  {
    // Fuori finestra: consegnato, finestra scaduta, orologio della chiusura non
    // ancora arrivato.
    const b = await biglietto(T2.td)
    await consegna(T2.td, b.path)
    await db.query(`update orders set revision_deadline_at = now() - interval '1 minute' where id=$1`, [Q(2)])
    const e = await revisione(T2.viaggiatore, 'troppo tardi?')
    e.ok === false && e.esito === 'finestra_chiusa' && e.scaduta_il && (await ordine(Q(2))).status === 'delivered'
      ? ok('revisione chiesta fuori finestra: no, con la data in cui si è chiusa')
      : fail(JSON.stringify(e))
    ;(await pagV(T2.viaggiatore)).puo_chiedere_revisione === false
      ? ok('e la pagina non offre il tasto fuori finestra') : fail('tasto fuori finestra')
    await db.query(`update orders set delivered_at = now() - interval '6 days' where id=$1`, [Q(2)])
    await tick()
    const e2 = await revisione(T2.viaggiatore, 'e adesso?')
    e2.esito === 'ordine_chiuso' ? ok('a ordine chiuso: «chiuso», non un tasto che non fa niente')
                                 : fail(JSON.stringify(e2))
  }

  // ====================================================== D · il link firmato
  console.log('  -- il link firmato non esce mai --')
  {
    // Il link firmato di Storage si genera nella route, al clic, e scade in un
    // minuto: qui non si può far scadere davvero (PGlite non ha Storage), si
    // prova la cosa che lo rende innocuo — non sta scritto da nessuna parte.
    const r = (await db.query(
      `select count(*) from outbound_messages
        where coalesce(body_html,'') || coalesce(body_text,'') ~* '/storage/v1/|[?&]token='`)).rows[0]
    Number(r.count) === 0
      ? ok('nessuna mail in coda contiene un link di Storage o un token firmato')
      : fail(r.count + ' mail con un link di Storage')
    const c = (await db.query(
      `select table_name, column_name from information_schema.columns
        where table_schema='public' and column_name ~ '(signed|firmat)'`)).rows
    c.length === 0 ? ok('e nessuna colonna ne conserva uno') : fail(JSON.stringify(c))
  }

  // ====================================================== E · chi arriva a cosa
  console.log('  -- anon e authenticated non arrivano a niente --')
  for (const f of ['td_exception_page(text)', 'td_report_exception(text,integer,text)',
                   'td_delivery_ticket(text,text,bigint,text)', 'td_deliver(text,text,text,bigint,text)',
                   'order_file_for_token(text,uuid)', 'request_revision(text,text)',
                   'clock_ramo_chiusura_call()', 'clock_ramo_chiusura_ordini()', 'clock_ramo_postcall_td()']) {
    const r = (await db.query(
      `select has_function_privilege('anon', $1, 'EXECUTE') as a,
              has_function_privilege('authenticated', $1, 'EXECUTE') as u`, [f])).rows[0]
    !r.a && !r.u ? ok(`${f}: chiusa ad anon e authenticated`) : fail(`${f} aperta: ${JSON.stringify(r)}`)
  }
  for (const f of ['td_exception_page(text)', 'td_report_exception(text,integer,text)',
                   'td_delivery_ticket(text,text,bigint,text)', 'td_deliver(text,text,text,bigint,text)',
                   'order_file_for_token(text,uuid)', 'request_revision(text,text)']) {
    const v = (await db.query(`select has_function_privilege('service_role', $1, 'EXECUTE') as v`, [f])).rows[0].v
    v ? ok(`${f}: la chiama la route server`) : fail(`${f} non raggiungibile dalla chiave secret`)
  }
  {
    const r = (await db.query(
      `select has_table_privilege('anon', 'booking_exceptions', 'SELECT') as a,
              has_table_privilege('authenticated', 'booking_exceptions', 'SELECT') as u`)).rows[0]
    !r.a && !r.u ? ok('booking_exceptions: non leggibile dal browser') : fail(JSON.stringify(r))
  }
}

// ===========================================================================
// L'All Inclusive: l'agenzia entra nel flusso (migration 0047)
// ===========================================================================
console.log('\n== L\'All Inclusive: agenzia, acconto, saldo, documento finale ==')
{
  const TD   = '11111111-1111-1111-1111-111111111111'   // Marco
  const ANNA = '44444444-4444-4444-4444-444444444444'
  const ALTRO_UTENTE = '99999999-9999-4999-8999-999999999999'
  const B = (n) => `a1a1a1a1-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
  const O = (n) => `a7a7a7a7-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`
  const giorno = (fra) => new Date(Date.now() + fra * 86400e3).toISOString().slice(0, 10)
  const PARTENZA = giorno(90)

  const rpc      = async (sql, params) => (await db.query(sql, params)).rows[0].r
  const tick     = async () => (await db.query('select * from clock_tick(100)')).rows
  const ordine   = async (id) => (await db.query('select * from orders where id=$1', [id])).rows[0]
  const tokenDi  = async (purpose, orderId) => (await db.query(
    `select token from access_tokens where purpose=$1 and order_id=$2 and revoked_at is null`,
    [purpose, orderId])).rows[0]?.token
  const posta    = async (kind, entity) => (await db.query(
    `select * from outbound_messages where message_kind=$1 and entity_id=$2`, [kind, entity])).rows
  const postaOrdine = async (kind, orderId) => (await db.query(
    `select m.* from outbound_messages m
      where m.message_kind = $1
        and (m.entity_id = $2
             or m.entity_id in (select id from order_proposals where order_id = $2)
             or m.entity_id in (select id from order_files where order_id = $2)
             or m.entity_id in (select (payload->>'invio')::uuid from access_tokens
                                 where order_id = $2 and purpose = 'agency_proposal_confirm'))`,
    [kind, orderId])).rows
  const nAlert   = async (kind, entity) => Number((await db.query(
    `select count(*) from team_alerts where kind=$1 and resolved_at is null
       and ($2::uuid is null or entity_id = $2)`, [kind, entity ?? null])).rows[0].count)
  const alert    = async (kind, entity) => (await db.query(
    `select * from team_alerts where kind=$1 and entity_id=$2 order by created_at desc limit 1`,
    [kind, entity])).rows[0]
  const ultimaStoria = async (id) => (await db.query(
    `select from_status, to_status, actor from order_status_history where order_id=$1 order by id desc limit 1`,
    [id])).rows[0]

  const pagina   = (t) => rpc('select td_order_page($1) as r', [t])
  const bozza    = (t, desc, prezzo, partenza = PARTENZA, ritorno = null, credito = 0) =>
    rpc('select ai_save_draft($1,$2,$3,$4::date,$5::date,$6) as r', [t, desc, prezzo, partenza, ritorno, credito])
  const invia    = (t, prezzo) => rpc('select ai_send_to_agency($1,$2) as r', [t, prezzo])
  const biglietto = (t, nome = 'Proposta Giappone.pdf') =>
    rpc(`select td_delivery_ticket($1,$2,1000,'application/pdf') as r`, [t, nome])
  const carica   = (t, path, nome = 'Proposta Giappone.pdf') =>
    rpc(`select td_deliver($1,$2,$3,1000,'application/pdf') as r`, [t, path, nome])
  const caricaDoc = async (t, nome) => {
    const b = await biglietto(t, nome)
    return { b, e: await carica(t, b.path, nome) }
  }
  const pagAg    = (t) => rpc('select agency_page($1) as r', [t])
  const decidi   = (t, d, nota = null) => rpc('select agency_decide($1,$2,$3) as r', [t, d, nota])
  const pagV     = (t) => rpc('select proposal_public_page($1) as r', [t])
  const file     = (t, id) => rpc('select order_file_for_token($1,$2) as r', [t, id])
  const finale   = (id, chi) => rpc('select final_document_for_traveler($1,$2) as r', [id, chi])
  const conf     = (k, v) => db.query(`update app_config set value_text=$2 where key=$1`, [k, v])

  // L'agenzia partner di oggi. Le prove della 0039 l'hanno cambiata: si legge.
  const AG = (await db.query(`select id, operational_email from agencies where is_default_partner`)).rows[0]

  const call = (n) => db.query(
    `insert into bookings (id, traveler_id, td_id, service_type, status, cal_booking_uid,
                           cal_event_type_slug, starts_at, ends_at, original_starts_at,
                           price_cents, confirmed_at, last_actor)
     values ($1, $2, $3, 'consultation', 'completed', 'uid-ai-' || $4, 'consulenza-xpetis-30',
             now() - interval '3 days', now() - interval '3 days' + interval '30 minutes',
             now() - interval '3 days', 6000, now(), 'n8n')`, [B(n), ANNA, TD, String(n)])
  const nuovoOrdine = async (n) => {
    await call(n)
    await db.query(`insert into orders (id, traveler_id, td_id, service_type, source_booking_id, last_actor)
                    values ($1, $2, $3, 'all_inclusive', $4, 'traveler')`, [O(n), ANNA, TD, B(n)])
    return tokenDi('td_order_page', O(n))
  }
  // Un ordine portato fino all'agenzia in quattro gesti, per le prove storte.
  const finoAllAgenzia = async (n, prezzo = 200000) => {
    const t = await nuovoOrdine(n)
    await db.query(`update orders set agency_id=$2 where id=$1`, [O(n), AG.id])
    await bozza(t, 'Islanda in camper', prezzo)
    await caricaDoc(t, 'Islanda.pdf')
    const e = await invia(t, prezzo)
    if (!e.ok) throw new Error('finoAllAgenzia: ' + JSON.stringify(e))
    return { td: t, ag: await tokenDi('agency_proposal_confirm', O(n)) }
  }

  // Il ponte Stripe, come nelle prove della 0044, con la rata in metadata.xpetis.
  const fxBase = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/stripe/checkout_session_completed.json'), 'utf8'))
  const SEG = 'whsec_parola_segreta_finta_per_l_harness'
  let nEvt = 0
  const evento = (sessione, orderId, importo, rata, extra = {}) => {
    const b = JSON.parse(JSON.stringify(fxBase))
    for (const k of Object.keys(b)) if (k.startsWith('_')) delete b[k]
    b.id = `evt_ai_${String(++nEvt).padStart(4, '0')}`
    b.created = Math.floor(Date.now() / 1000)
    const o = b.data.object
    o.id = sessione
    o.amount_total = importo
    o.amount_subtotal = importo
    o.client_reference_id = orderId
    o.metadata = { order_id: orderId, xpetis: rata }
    Object.assign(o, extra)
    return b
  }
  const webhook = async (corpo) => {
    const raw = JSON.stringify(corpo)
    const t = Math.floor(Date.now() / 1000)
    const firma = `t=${t},v1=` + crypto.createHmac('sha256', SEG).update(`${t}.${raw}`, 'utf8').digest('hex')
    return (await db.query('select stripe_webhook($1,$2) as e', [raw, firma])).rows[0].e
  }
  const cassa = (orderId, rata, sessione, importo) => db.query(
    `insert into payments (order_id, kind, status, amount_cents, currency, stripe_account,
                           client_reference_id, stripe_checkout_session_id, expires_at)
     values ($1::uuid, $2::payment_kind, 'pending', $3, 'EUR', 'xpetis', $1::text, $4,
             now() + interval '31 minutes')`, [orderId, rata, importo, sessione])

  // ====================================================== A · la nascita
  console.log('  -- la nascita: il designer riceve il suo link --')
  const T1 = await nuovoOrdine(1)
  {
    const m = await posta('order_new_td_ai', O(1))
    T1 && m.length === 1 && m[0].recipient === 'marco@example.com' && m[0].body_text.includes('/ordine/' + T1)
      && (await posta('order_new_td', O(1))).length === 0
      ? ok('l\'ordine All Inclusive nasce col token del designer e con la sua mail, non quella del su misura')
      : fail('nascita: ' + JSON.stringify([!!T1, m.length]))
    ;/passa dall.agenzia|va prima all.agenzia/.test(m[0]?.body_text ?? '') && m[0]?.body_text.includes('60,00 €')
      ? ok('e la mail dice che la proposta passa dall\'agenzia, e quanto costava la call')
      : fail('testo: ' + m[0]?.body_text)
    const p = await pagina(T1)
    p.esito === 'valido' && p.servizio === 'all_inclusive' && p.status === 'requested' && p.agenzia === null
      ? ok('la pagina ordine riconosce l\'All Inclusive: stato, e nessuna agenzia ancora')
      : fail('pagina: ' + JSON.stringify(p))
    !/email|telefono|phone|cognome|full_name|Bianchi/.test(JSON.stringify(p))
      ? ok('e del viaggiatore solo il nome') : fail('dati in più: ' + JSON.stringify(p))
    const s = await rpc(`select save_proposal_draft($1,'x',50000,5,0) as r`, [T1])
    s.esito === 'servizio_non_gestito'
      ? ok('le funzioni del su misura non lavorano su un All Inclusive') : fail(JSON.stringify(s))
  }

  // ====================================================== B · la bozza
  console.log('  -- la bozza e il documento --')
  {
    const e = await invia(T1, 450000)
    e.esito === 'bozza_mancante' ? ok('non si invia una proposta mai salvata') : fail(JSON.stringify(e))
  }
  for (const [label, args, campo] of [
    ['partenza nel passato',       ['Giappone', 450000, giorno(-1)], 'partenza'],
    ['partenza oggi',              ['Giappone', 450000, giorno(0)], 'partenza'],
    ['rientro prima della partenza', ['Giappone', 450000, PARTENZA, giorno(10)], 'ritorno'],
    ['prezzo che non regge due casse', ['Giappone', 80], 'prezzo'],
    ['descrizione vuota',          ['   ', 450000], 'descrizione'],
  ]) {
    const e = await bozza(T1, ...args)
    e.ok === false && e.esito === 'dati_non_validi' && e.campo === campo
      ? ok(`bozza con ${label}: rifiutata sul campo ${campo}`) : fail(`${label}: ` + JSON.stringify(e))
  }
  {
    const e = await bozza(T1, 'Giappone 15 giorni, ryokan e treni', 450000, PARTENZA, giorno(105))
    const o = await ordine(O(1))
    e.ok && o.status === 'in_definition' && o.departure_date && o.last_actor === 'td'
      ? ok('bozza salvata: in_definition, con la data di partenza, attribuita al designer')
      : fail(JSON.stringify([e, o.status]))
    const i = await invia(T1, 450000)
    i.esito === 'documento_mancante' ? ok('senza documento di proposta non parte') : fail(JSON.stringify(i))
  }
  let DOC1
  {
    const { b, e } = await caricaDoc(T1, 'Giappone v1.pdf')
    const o = await ordine(O(1))
    DOC1 = e.file
    b.tipo === 'proposal_document' && e.ok && e.esito === 'caricato' && o.status === 'in_definition'
      ? ok('il documento si carica col meccanismo della consegna (0046), e lo stato non cambia')
      : fail(JSON.stringify([b, e, o.status]))
    const p = await pagina(T1)
    p.documenti.length === 1 && p.documenti[0].nome === 'Giappone v1.pdf' && !('path' in p.documenti[0])
      ? ok('la pagina lo elenca, senza percorso di Storage') : fail(JSON.stringify(p.documenti))
    const i = await invia(T1, 450000)
    i.esito === 'agenzia_non_assegnata'
      ? ok('senza agenzia assegnata: la pagina dice che manca l\'agenzia, non che il designer ha sbagliato')
      : fail(JSON.stringify(i))
  }
  // Il caso del prompt: un ordine senza agenzia che arriva alla proposta per
  // un'altra strada (Studio, un workflow sbagliato). Lo ferma la 0009.
  await expectFail('All Inclusive senza agenzia assegnata che arriva alla proposta: lo ferma il trigger', `
    update orders set status='proposal_pending_agency', last_actor='team' where id='${O(1)}'`,
    'senza agenzia assegnata')

  // ====================================================== C · l'invio
  console.log('  -- l\'invio all\'agenzia --')
  await db.query(`update orders set agency_id=$2, last_actor='team' where id=$1`, [O(1), AG.id])
  let TA1
  {
    const e0 = await invia(T1, 999999)
    e0.esito === 'prezzo_cambiato' && e0.prezzo_cents === 450000
      ? ok('l\'invio ridichiara il prezzo riletto: se è cambiato, si rifiuta') : fail(JSON.stringify(e0))
    const e = await invia(T1, 450000)
    const o = await ordine(O(1))
    e.ok && e.esito === 'inviata' && o.status === 'proposal_pending_agency'
      && o.total_price_cents === 450000 && o.deposit_cents === 135000 && o.balance_cents === 315000
      ? ok('inviata: in verifica dell\'agenzia, con acconto 30% e saldo per residuo calcolati dal database')
      : fail(JSON.stringify([e, o.status, o.deposit_cents, o.balance_cents]))
    const pr = (await db.query(`select * from order_proposals where order_id=$1`, [O(1)])).rows
    pr.length === 1 && pr[0].round === 1 && pr[0].document_file_id === DOC1 && pr[0].deposit_cents === 135000
      && pr[0].delivery_days === null
      ? ok('la fotografia della proposta: invio 1, col documento verificato e le due rate')
      : fail(JSON.stringify(pr))
    const t = (await db.query(`select * from access_tokens where purpose='agency_proposal_confirm' and order_id=$1`, [O(1)])).rows
    TA1 = t[0]?.token
    const giorni = t[0] ? (new Date(t[0].expires_at) - Date.now()) / 86400e3 : 0
    t.length === 1 && t[0].audience === 'agency' && t[0].single_use && t[0].agency_id === AG.id
      && giorni > 6.9 && giorni < 7.1 && t[0].payload.proposta === pr[0].id
      ? ok('un token per l\'agenzia: monouso, legato a lei e alla proposta, scade in agency_confirm_valid_days')
      : fail(JSON.stringify(t))
    const m = await postaOrdine('agency_proposal_confirm', O(1))
    m.length === 1 && m[0].recipient === AG.operational_email && m[0].body_text.includes('/agenzia/' + TA1)
      && m[0].body_text.includes('4.500,00 €') && m[0].body_text.includes('1.350,00 €')
      && m[0].body_text.includes('30%') && m[0].body_text.includes('Giappone v1.pdf')
      ? ok('la mail all\'agenzia: all\'indirizzo operativo, con totale, acconto, percentuale, documento e link')
      : fail('mail agenzia: ' + JSON.stringify(m.map(x => [x.recipient, x.body_text])))
    !/Anna|Bianchi|viaggiatore@example/.test(m[0]?.body_text ?? '')
      ? ok('e senza niente del viaggiatore') : fail('dati del viaggiatore nella mail all\'agenzia')
    ;(await tokenDi('traveler_public_proposal', O(1))) === undefined
      && (await postaOrdine('ai_proposal_traveler', O(1))).length === 0
      ? ok('al viaggiatore non è arrivato niente: la proposta non verificata non lo raggiunge')
      : fail('il viaggiatore ha già qualcosa')
  }
  await expectFail('dopo l\'invio il prezzo non si tocca, nemmeno da Studio', `
    update orders set proposal_price_cents=100000 where id='${O(1)}'`, 'già partita')
  await expectFail('e nemmeno l\'agenzia assegnata', `
    update orders set agency_id='33333333-3333-3333-3333-333333333333' where id='${O(1)}'`, 'già partita')
  await expectFail('e nemmeno l\'acconto', `
    update orders set deposit_cents=1 where id='${O(1)}'`, 'già partita')
  {
    const e = await bozza(T1, 'ritocco', 400000)
    e.esito === 'in_verifica_agenzia' ? ok('bozza durante la verifica: no, e la risposta dice perché')
                                      : fail(JSON.stringify(e))
    const i = await invia(T1, 450000)
    i.ok && i.esito === 'gia_inviata' ? ok('il doppio clic su Invia: già inviata, nessun secondo token')
                                      : fail(JSON.stringify(i))
    const n = Number((await db.query(`select count(*) from access_tokens where purpose='agency_proposal_confirm'
                                       and order_id=$1`, [O(1)])).rows[0].count)
    n === 1 ? ok('ancora un token solo') : fail(n + ' token')
  }
  {
    // my_orders: la proposta non verificata non si legge nemmeno dal browser.
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [ANNA])
    const r = (await db.query(`select * from my_orders where id=$1`, [O(1)])).rows[0]
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`)
    r && r.proposal_price_cents === null && r.deposit_cents === null && r.total_price_cents === null
      ? ok('my_orders maschera prezzo e acconto finché l\'agenzia non ha confermato')
      : fail('my_orders: ' + JSON.stringify(r))
  }

  // ====================================================== D · la pagina dell'agenzia
  console.log('  -- la pagina dell\'agenzia --')
  {
    const p = await pagAg(TA1)
    p.esito === 'valido' && p.fase === 'da_decidere' && p.totale_cents === 450000 && p.acconto_cents === 135000
      && p.documento?.id === DOC1 && p.invio_n === 1
      ? ok('da decidere: totale, rate, invio e documento') : fail(JSON.stringify(p))
    !/Anna|Bianchi|viaggiatore@example|traveler/.test(JSON.stringify(p))
      ? ok('e niente del viaggiatore') : fail('dati del viaggiatore: ' + JSON.stringify(p))
    const f = await file(TA1, DOC1)
    f.esito === 'valido' && f.path.startsWith('ordini/') ? ok('l\'agenzia scarica il documento della sua proposta')
                                                         : fail(JSON.stringify(f))
    ;(await pagina(TA1)).esito === 'token_di_altro_tipo' && (await pagAg(T1)).esito === 'token_di_altro_tipo'
      ? ok('il token dell\'agenzia non apre la pagina del designer, e viceversa') : fail('token scambiati')
    ;(await pagAg('agenzia-inventata')).esito === 'inesistente'
      ? ok('un token inventato riceve la risposta generica') : fail('token inventato')
  }

  // ====================================================== E · l'agenzia rifiuta
  console.log('  -- l\'agenzia non conferma --')
  {
    const e0 = await decidi(TA1, 'non_fattibile', '  ')
    e0.ok === false && e0.esito === 'dati_non_validi' && e0.campo === 'nota'
      ? ok('«non fattibile» senza dire perché: no') : fail(JSON.stringify(e0))
    const e1 = await decidi(TA1, 'boh')
    e1.esito === 'dati_non_validi' && e1.campo === 'decisione' ? ok('una decisione che non esiste: no')
                                                              : fail(JSON.stringify(e1))
    ;(await pagAg(TA1)).fase === 'da_decidere' ? ok('e un tentativo sbagliato non consuma il link')
                                              : fail('link consumato da un errore')
  }
  {
    const e = await decidi(TA1, 'non_fattibile', 'Il ryokan di Kyoto è pieno ad aprile')
    const o = await ordine(O(1))
    const h = await ultimaStoria(O(1))
    e.ok && e.esito === 'non_fattibile' && o.status === 'in_definition' && o.last_actor === 'agency'
      && o.agency_rejection_note.includes('ryokan') && h.actor === 'agency'
      ? ok('non fattibile: la proposta torna al designer, con la nota, attribuita all\'agenzia')
      : fail(JSON.stringify([e, o.status, h]))
    const d = (await db.query(`select * from agency_decisions where order_id=$1`, [O(1)])).rows
    d.length === 1 && d[0].decision === 'rejected' && d[0].actor === 'agency'
      ? ok('la decisione resta scritta, una per proposta') : fail(JSON.stringify(d))
    const m = await postaOrdine('agency_rejected_td', O(1))
    m.length === 1 && m[0].recipient === 'marco@example.com' && m[0].body_text.includes('ryokan')
      && m[0].body_text.includes('/ordine/' + T1)
      ? ok('il designer riceve la nota dell\'agenzia e il link per correggere') : fail('mail rifiuto: ' + m.length)
    ;(await postaOrdine('ai_proposal_traveler', O(1))).length === 0 && !(await tokenDi('traveler_public_proposal', O(1)))
      ? ok('e al viaggiatore, ancora, niente') : fail('il viaggiatore ha ricevuto una proposta rifiutata')
    const p = await pagina(T1)
    p.ultimo_invio?.decisione === 'rejected' && p.ultimo_invio.nota.includes('ryokan')
      ? ok('la pagina del designer dice cosa ha scritto l\'agenzia') : fail(JSON.stringify(p.ultimo_invio))
  }
  {
    // L'agenzia che risponde di nuovo sullo stesso link: la prima risposta vince.
    const e = await decidi(TA1, 'conferma')
    e.ok === false && e.esito === 'gia_decisa' && e.decisione === 'non_fattibile' && e.deciso_il
      ? ok('un secondo clic, sull\'altro tasto: «già deciso», con la decisione e la data') : fail(JSON.stringify(e))
    const p = await pagAg(TA1)
    p.fase === 'non_fattibile' && p.documento === null && p.nota.includes('ryokan')
      ? ok('e la pagina dice com\'è andata, senza più il documento da scaricare') : fail(JSON.stringify(p))
    ;(await file(TA1, DOC1)).esito === 'gia_usato'
      ? ok('un link consumato non scarica più il documento') : fail('documento ancora scaricabile')
    ;(await ordine(O(1))).status === 'in_definition' ? ok('e l\'ordine non si è mosso') : fail('ordine mosso')
  }

  // ====================================================== F · secondo invio, conferma
  console.log('  -- il secondo invio, e la conferma --')
  let TA2, TV, DOC2
  {
    const e = await bozza(T1, 'Giappone 15 giorni, Kyoto a maggio', 480000, PARTENZA, giorno(105))
    const { e: c } = await caricaDoc(T1, 'Giappone v2.pdf')
    DOC2 = c.file
    const i = await invia(T1, 480000)
    const pr = (await db.query(`select * from order_proposals where order_id=$1 order by round`, [O(1)])).rows
    TA2 = await tokenDi('agency_proposal_confirm', O(1))
    e.ok && i.ok && pr.length === 2 && pr[1].round === 2 && pr[1].document_file_id === DOC2
      && pr[1].deposit_cents === 144000 && TA2 && TA2 !== TA1
      ? ok('corretta e rimandata: invio 2, col documento nuovo, acconto ricalcolato, token nuovo')
      : fail(JSON.stringify([e, i, pr.length]))
    ;(await pagAg(TA1)).esito === 'revocato'
      ? ok('il link del primo invio risponde «annullato»') : fail('link vecchio ancora vivo')
    ;(await postaOrdine('agency_proposal_confirm', O(1))).length === 2
      ? ok('e l\'agenzia ha la sua seconda mail') : fail('seconda mail all\'agenzia assente')
  }
  {
    const e = await decidi(TA2, 'conferma')
    const o = await ordine(O(1))
    e.ok && e.esito === 'confermata' && o.status === 'awaiting_deposit' && o.agency_confirmed_at
      && o.last_actor === 'agency'
      ? ok('confermata: in attesa dell\'acconto, con la data della conferma') : fail(JSON.stringify([e, o.status]))
    TV = await tokenDi('traveler_public_proposal', O(1))
    const m = await postaOrdine('ai_proposal_traveler', O(1))
    TV && m.length === 1 && m[0].recipient === 'viaggiatore@example.com' && m[0].body_text.includes('/proposta/' + TV)
      && m[0].body_text.includes('1.440,00 €') && m[0].body_text.includes('4.800,00 €')
      ? ok('la cascata: il viaggiatore riceve la proposta con l\'acconto e il link della sua pagina')
      : fail('mail viaggiatore: ' + JSON.stringify(m.map(x => x.body_text)))
    const mt = await postaOrdine('agency_confirmed_td', O(1))
    mt.length === 1 && mt[0].body_text.includes('/ordine/' + T1)
      ? ok('e il designer la conferma, con il link alla pagina dove sta il messaggio pronto')
      : fail('mail conferma al designer: ' + mt.length)
    const p = await pagina(T1)
    p.messaggio_pronto?.includes('/proposta/' + TV) && p.link_pagina?.includes(TV)
      ? ok('sulla pagina del designer: il messaggio da girare nel gruppo commerciale') : fail(JSON.stringify(p.messaggio_pronto))
  }
  {
    // «Agenzia che conferma due volte.»
    const e = await decidi(TA2, 'conferma')
    const d = Number((await db.query(`select count(*) from agency_decisions where order_id=$1`, [O(1)])).rows[0].count)
    e.ok === true && e.esito === 'gia_decisa' && e.decisione === 'conferma' && d === 2
      && (await postaOrdine('ai_proposal_traveler', O(1))).length === 1
      ? ok('l\'agenzia conferma due volte: «già confermata», una decisione, una mail al viaggiatore')
      : fail(JSON.stringify([e, d]))
    ;(await pagAg(TA2)).fase === 'confermata' ? ok('e la pagina dice «confermata»') : fail('pagina agenzia')
  }
  await expectFail('confermata, la proposta non si tocca più', `
    update orders set proposal_description='altro' where id='${O(1)}'`, 'già partita')

  // ====================================================== G · la pagina del viaggiatore
  console.log('  -- la pagina del viaggiatore --')
  {
    const v = await pagV(TV)
    v.esito === 'valido' && v.servizio === 'all_inclusive' && v.fase === 'da_pagare_acconto'
      && v.cassa?.rata === 'deposit' && v.cassa.importo_cents === 144000 && v.totale_cents === 480000
      && v.documento?.id === DOC2
      ? ok('da pagare l\'acconto: la cassa la dice il database, col documento verificato')
      : fail(JSON.stringify(v))
    !/Anna|Bianchi|viaggiatore@example/.test(JSON.stringify(v))
      ? ok('niente del viaggiatore: la pagina si gira nel gruppo') : fail('dati del viaggiatore in pagina')
    ;(await file(TV, DOC2)).esito === 'valido' && (await file(TV, DOC1)).esito === 'file_sconosciuto'
      ? ok('scarica il documento confermato, non quello rifiutato') : fail('documenti sbagliati')
    ;(await rpc('select request_revision($1,$2) as r', [TV, 'x'])).esito === 'servizio_non_gestito'
      ? ok('la revisione inclusa è del su misura: qui non esiste') : fail('revisione su un All Inclusive')
  }

  // ====================================================== H · due casse
  console.log('  -- acconto e saldo: due casse sullo stesso ordine --')
  await expectOk('una cassa acconto e una cassa saldo aperte insieme: payments_one_pending_per_kind le regge', `
    insert into payments (order_id, kind, status, amount_cents, stripe_account)
    values ('${O(1)}', 'deposit', 'pending', 144000, 'xpetis'),
           ('${O(1)}', 'balance', 'pending', 336000, 'xpetis')`)
  await expectFail('ma non due casse acconto', `
    insert into payments (order_id, kind, status, amount_cents, stripe_account)
    values ('${O(1)}', 'deposit', 'pending', 144000, 'xpetis')`, 'payments_one_pending_per_kind')
  await db.query(`delete from payments where order_id=$1`, [O(1)])

  // ====================================================== I · l'acconto
  console.log('  -- l\'acconto --')
  await conf('team_notify_recipients', 'simone@xpetis.test')
  await conf('team_notify_events', 'ordine_pagato, acconto_pagato, saldo_pagato, agenzia_ha_confermato')
  await cassa(O(1), 'deposit', 'cs_test_ai_01', 144000)
  {
    const e = await webhook(evento('cs_test_ai_01', O(1), 100000, 'deposit'))
    e.esito === 'importo_non_combacia' && (await ordine(O(1))).status === 'awaiting_deposit'
      && (await alert('stripe_importo_non_combacia', O(1)))?.message.includes('acconto')
      ? ok('acconto con l\'importo sbagliato: l\'ordine non si muove, alert che dice «acconto»')
      : fail(JSON.stringify(e))
  }
  {
    const ev = evento('cs_test_ai_01', O(1), 144000, 'deposit')
    const e = await webhook(ev)
    const o = await ordine(O(1))
    const p = (await db.query(`select status, kind from payments where stripe_checkout_session_id='cs_test_ai_01'`)).rows[0]
    e.ok && e.esito === 'ordine_pagato' && o.status === 'deposit_paid' && o.last_actor === 'traveler'
      && p.status === 'paid' && p.kind === 'deposit'
      ? ok('acconto giusto: deposit_paid, attribuito al viaggiatore, riga pagata') : fail(JSON.stringify([e, o.status]))
    const n = (await db.query(`select * from outbound_messages where message_kind='team_acconto_pagato'
                                and entity_id=$1`, [O(1)])).rows
    n.length === 1 && n[0].body_text.includes('Mancano i tempi del saldo')
      ? ok('il team lo sa, se «acconto_pagato» è fra gli eventi, e sa che mancano i tempi del saldo')
      : fail('notifica acconto: ' + JSON.stringify(n.map(x => x.body_text)))
    const r = await webhook(ev)
    r.esito === 'duplicato' ? ok('lo stesso evt_ due volte: duplicato') : fail(JSON.stringify(r))
    const r2 = await webhook(evento('cs_test_ai_01', O(1), 144000, 'deposit'))
    r2.ok && r2.esito === 'gia_pagato' ? ok('un altro evt_ per la stessa sessione: già pagato, non è un guasto')
                                       : fail(JSON.stringify(r2))
  }

  // ====================================================== J · i tempi del saldo
  console.log('  -- i tempi del saldo, scritti dal team --')
  await expectFail('«balance_due_at mancante quando serve»: il saldo non si chiede senza i suoi tempi', `
    update orders set status='awaiting_balance', last_actor='team' where id='${O(1)}'`, 'senza i suoi tempi')
  await expectFail('tempi del saldo nel passato: no', `
    update orders set balance_due_at = now() - interval '1 day' where id='${O(1)}'`, 'nel passato')
  await expectFail('tempi del saldo dopo la partenza: no', `
    update orders set balance_due_at = '${giorno(100)}'::date + time '12:00' where id='${O(1)}'`, 'dopo la partenza')
  {
    await db.query(`update orders set balance_due_at = $2::date + time '18:00' where id=$1`, [O(1), giorno(60)])
    const o = await ordine(O(1))
    const h = (await db.query(`select from_status, to_status, actor from order_status_history
                                where order_id=$1 order by id desc limit 2`, [O(1)])).rows
    o.status === 'awaiting_balance' && h[0].to_status === 'awaiting_balance' && h[0].actor === 'system'
      && h[1].to_status === 'deposit_paid'
      ? ok('scritti i tempi, il saldo si chiede da solo: awaiting_balance, e la storia è in ordine')
      : fail(JSON.stringify([o.status, h]))
    const m = await posta('ai_balance_traveler', O(1))
    m.length === 1 && m[0].recipient === 'viaggiatore@example.com' && m[0].body_text.includes('3.360,00 €')
      && m[0].body_text.includes(giorno(60).split('-').reverse().join('/'))
      ? ok('il viaggiatore riceve la richiesta del saldo, con l\'importo e la data')
      : fail('mail saldo: ' + JSON.stringify(m.map(x => x.body_text)))
    const l = (await db.query(`select actor from event_log where entity_id=$1 and event='tempi_saldo_inseriti'`, [O(1)])).rows
    l.length === 1 && l[0].actor === 'team' ? ok('e il diario dice che i tempi li ha scritti il team')
                                            : fail(JSON.stringify(l))
    const v = await pagV(TV)
    v.fase === 'da_pagare_saldo' && v.cassa?.rata === 'balance' && v.cassa.importo_cents === 336000 && v.saldo_entro
      ? ok('la pagina del viaggiatore apre la cassa del saldo') : fail(JSON.stringify(v))
  }

  // ====================================================== K · il saldo
  console.log('  -- il saldo --')
  await cassa(O(1), 'balance', 'cs_test_ai_02', 336000)
  {
    const e = await webhook(evento('cs_test_ai_02', O(1), 336000, 'balance'))
    const o = await ordine(O(1))
    e.esito === 'ordine_pagato' && o.status === 'balance_paid'
      ? ok('saldo pagato: balance_paid') : fail(JSON.stringify([e, o.status]))
    const m = await posta('ai_balance_paid_td', O(1))
    m.length === 1 && m[0].recipient === 'marco@example.com' && m[0].body_text.includes('/ordine/' + T1)
      ? ok('il designer riceve la mail: adesso il documento finale') : fail('mail saldato: ' + m.length)
    ;(await db.query(`select 1 from outbound_messages where message_kind='team_saldo_pagato' and entity_id=$1`, [O(1)])).rows.length === 1
      ? ok('e il team la sua notifica') : fail('notifica saldo')
    const p = (await db.query(`select kind, status from payments where order_id=$1 order by kind`, [O(1)])).rows
    p.length === 2 && p.every(x => x.status === 'paid')
      ? ok('due incassi riusciti sullo stesso ordine, uno per rata') : fail(JSON.stringify(p))
  }
  await expectFail('saldato, i tempi del saldo non si cambiano più', `
    update orders set balance_due_at = '${giorno(50)}'::date + time '12:00' where id='${O(1)}'`, 'già pagato')

  // ====================================================== L · il documento finale
  console.log('  -- il documento finale --')
  let FIN
  {
    const b = await biglietto(T1, 'Giappone - documento di viaggio.pdf')
    const e = await carica(T1, b.path, 'Giappone - documento di viaggio.pdf')
    const o = await ordine(O(1))
    FIN = e.file
    b.tipo === 'final_document' && e.ok && e.esito === 'consegnato' && o.status === 'delivered'
      && o.delivered_at && o.last_actor === 'td'
      ? ok('a saldo pagato il designer carica il documento finale: delivered, attribuito a lui')
      : fail(JSON.stringify([b, e, o.status]))
    const m = await posta('ai_delivery_traveler', FIN)
    m.length === 1 && m[0].body_text.includes('/proposta/' + TV) && /Google/.test(m[0].body_text)
      ? ok('il viaggiatore riceve la mail con la sua pagina, e sa che per scaricare si entra con Google')
      : fail('mail consegna: ' + JSON.stringify(m.map(x => x.body_text)))
    const p = await pagina(T1)
    p.messaggio_consegna?.includes('/proposta/' + TV) && p.file_finale.length === 1
      ? ok('il designer ha il messaggio per il gruppo, e il file nella sua pagina') : fail(JSON.stringify(p.messaggio_consegna))
    const v = await pagV(TV)
    v.fase === 'consegnata' && v.file_finale.length === 1 && v.file_finale[0].id === FIN && !v.cassa
      ? ok('la pagina del viaggiatore elenca il documento finale, senza cassa') : fail(JSON.stringify(v))
  }
  {
    ;(await file(TV, FIN)).esito === 'file_sconosciuto'
      ? ok('dal link girato nel gruppo il documento finale NON si scarica') : fail('documento finale via token')
    ;(await file(T1, FIN)).esito === 'valido'
      ? ok('il designer sì, col suo token') : fail('il designer non scarica il suo file')
    const a = await finale(FIN, null)
    const b = await finale(FIN, ALTRO_UTENTE)
    const c = await finale(FIN, ANNA)
    a.esito === 'serve_accesso' && b.esito === 'file_sconosciuto' && c.esito === 'valido' && c.path.startsWith('ordini/')
      ? ok('col login: senza sessione «accedi», un altro account «non esiste», il viaggiatore dell\'ordine sì')
      : fail(JSON.stringify([a, b, c]))
    ;(await finale(DOC2, ANNA)).esito === 'file_sconosciuto'
      ? ok('e da lì esce solo il documento finale, non la proposta') : fail('proposta dalla porta del login')
    const bb = await biglietto(T1)
    bb.esito === 'stato_non_ammesso' ? ok('consegnato: non si carica altro') : fail(JSON.stringify(bb))
  }
  {
    await tick()
    ;(await ordine(O(1))).status === 'delivered'
      ? ok('il silenzio non chiude l\'All Inclusive: la sua chiusura è un punto aperto') : fail('chiuso dall\'orologio')
  }

  // ====================================================== M · i casi storti
  console.log('  -- acconto pagato su un ordine rifiutato --')
  {
    const { ag } = await finoAllAgenzia(2)
    const acconto = (await ordine(O(2))).deposit_cents
    await decidi(ag, 'non_fattibile', 'Prezzi dei voli cambiati')
    // Una cassa acconto che non avrebbe dovuto esistere (aperta a mano, o da un
    // giro che la route non fa): il ponte non deve portare avanti niente.
    await cassa(O(2), 'deposit', 'cs_test_ai_03', acconto)
    const e = await webhook(evento('cs_test_ai_03', O(2), acconto, 'deposit'))
    const o = await ordine(O(2))
    const a = await alert('stripe_pagamento_su_ordine_non_in_attesa', O(2))
    e.ok === false && e.esito === 'pagamento_su_ordine_non_in_attesa' && o.status === 'in_definition'
      && a?.severity === 'critical' && a.message.includes('NON CONFERMATA') && a.message.includes('dashboard Stripe')
      ? ok('acconto su una proposta rifiutata: ordine fermo, alert critico che dice di rimborsare dalla dashboard')
      : fail(JSON.stringify([e, o.status, a?.message]))
    const p = (await db.query(`select status from payments where stripe_checkout_session_id='cs_test_ai_03'`)).rows[0]
    p.status === 'paid' ? ok('e i soldi, che sono veri, restano registrati') : fail(p.status)
  }

  console.log('  -- saldo pagato prima dell\'acconto --')
  {
    const { ag } = await finoAllAgenzia(3, 300000)
    await decidi(ag, 'conferma')
    const o0 = await ordine(O(3))
    await cassa(O(3), 'balance', 'cs_test_ai_04', o0.balance_cents)
    const e = await webhook(evento('cs_test_ai_04', O(3), o0.balance_cents, 'balance'))
    const o = await ordine(O(3))
    const a = await alert('stripe_pagamento_su_ordine_non_in_attesa', O(3))
    e.esito === 'pagamento_su_ordine_non_in_attesa' && o.status === 'awaiting_deposit'
      && a?.message.includes('SALDO PAGATO PRIMA DEL TEMPO') && a.message.includes('acconto non è ancora stato pagato')
      ? ok('saldo prima dell\'acconto: ordine fermo in attesa dell\'acconto, alert che lo dice')
      : fail(JSON.stringify([e, o.status, a?.message]))

    // Il seguito: il team rimborsa il saldo anticipato, arriva l'acconto, poi
    // i tempi, poi il saldo vero. L'indice dei pagamenti riusciti conta anche
    // il rimborsato: il ponte non deve esplodere, deve fermarsi e dirlo.
    await db.query(`update payments set status='refunded', refunded_at=now() where stripe_checkout_session_id='cs_test_ai_04'`)
    await cassa(O(3), 'deposit', 'cs_test_ai_05', o0.deposit_cents)
    const d = await webhook(evento('cs_test_ai_05', O(3), o0.deposit_cents, 'deposit'))
    await db.query(`update orders set balance_due_at = $2::date + time '12:00' where id=$1`, [O(3), giorno(30)])
    await cassa(O(3), 'balance', 'cs_test_ai_06', o0.balance_cents)
    const s = await webhook(evento('cs_test_ai_06', O(3), o0.balance_cents, 'balance'))
    const o2 = await ordine(O(3))
    d.esito === 'ordine_pagato' && s.ok === false && s.esito === 'rata_gia_registrata'
      && o2.status === 'awaiting_balance' && await nAlert('stripe_rata_gia_registrata', O(3)) === 1
      ? ok('il saldo vero dopo uno anticipato e rimborsato: niente errore da ritentare, ordine fermo, alert')
      : fail(JSON.stringify([d.esito, s, o2.status]))
    const w = (await db.query(`select processed_at, error from webhook_events where id=$1`, [s.webhook_event_id])).rows[0]
    w.processed_at && !w.error ? ok('e il messaggio è chiuso: Stripe non ritenta per sempre') : fail(JSON.stringify(w))
  }

  console.log('  -- la rata non si indovina --')
  {
    const e = await webhook(evento('cs_test_ai_07', O(3), 1000, 'full'))
    e.esito === 'rata_non_riconosciuta' && (await ordine(O(3))).status === 'awaiting_balance'
      && await nAlert('stripe_rata_non_riconosciuta', O(3)) === 1
      ? ok('un pagamento senza riga e con metadata.xpetis = full su un All Inclusive: alert, ordine fermo')
      : fail(JSON.stringify(e))
  }

  console.log('  -- il link dell\'agenzia scade, il team lo rinnova --')
  {
    const { ag } = await finoAllAgenzia(4)
    await db.query(`update access_tokens set expires_at = now() - interval '1 minute' where token=$1`, [ag])
    await tick(); await tick()
    const a = await alert('verifica_agenzia_scaduta', O(4))
    a && await nAlert('verifica_agenzia_scaduta', O(4)) === 1 && a.message.includes(`rinnova_verifica_agenzia('${O(4)}')`)
      ? ok('link scaduto senza risposta: un alert per ordine, con la riga per rinnovarlo')
      : fail('alert: ' + a?.message)
    ;(await pagAg(ag)).esito === 'scaduto' && (await decidi(ag, 'conferma')).esito === 'scaduto'
      && (await ordine(O(4))).status === 'proposal_pending_agency'
      ? ok('e il link scaduto non conferma: la proposta resta in verifica') : fail('link scaduto che conferma')
    const nuovo = await rpc(`select rinnova_verifica_agenzia($1) as r`, [O(4)])
    ;(await pagAg(ag)).esito === 'revocato' && (await pagAg(nuovo)).fase === 'da_decidere'
      && (await postaOrdine('agency_proposal_confirm', O(4))).length === 2
      ? ok('rinnovato: il vecchio è annullato, il nuovo vale, e l\'agenzia ha una mail nuova')
      : fail('rinnovo')

    // Il team conferma da Studio (l'agenzia al telefono): la cascata parte lo
    // stesso, e la decisione dice chi è stato.
    await db.query(`update orders set status='awaiting_deposit', last_actor='team' where id=$1`, [O(4)])
    const d = (await db.query(`select decision, actor from agency_decisions where order_id=$1`, [O(4)])).rows
    d.length === 1 && d[0].decision === 'confirmed' && d[0].actor === 'team'
      && (await postaOrdine('ai_proposal_traveler', O(4))).length === 1
      && (await pagAg(nuovo)).esito === 'revocato'
      ? ok('confermata da Studio: la cascata parte, la decisione è del team, il link dell\'agenzia si spegne')
      : fail(JSON.stringify(d))
    let esploso = false
    try { await rpc(`select rinnova_verifica_agenzia($1) as r`, [O(4)]) } catch { esploso = true }
    esploso ? ok('e non si rinnova un link su una proposta che non è più in verifica') : fail('rinnovo fuori stato')
  }

  console.log('  -- il saldo scaduto, e la consegna senza documento finale --')
  {
    await db.query(`update orders set status='deposit_paid', last_actor='team' where id=$1`, [O(4)])
    await db.query(`update orders set balance_due_at = $2::date + time '12:00' where id=$1`, [O(4), giorno(20)])
    // Una scadenza passata si fabbrica spegnendo i trigger per un attimo:
    // quello delle regole, giustamente, non la lascerebbe scrivere.
    await db.exec(`set session_replication_role = replica;
                   update orders set balance_due_at = now() - interval '1 hour' where id='${O(4)}';
                   set session_replication_role = origin;`)
    await tick(); await tick()
    const a = await alert('saldo_scaduto', O(4))
    a?.severity === 'critical' && await nAlert('saldo_scaduto', O(4)) === 1
      && (await ordine(O(4))).status === 'awaiting_balance'
      ? ok('saldo non arrivato in tempo: un alert critico al team, e il sistema non annulla niente')
      : fail('saldo scaduto: ' + a?.message)
    await db.query(`update orders set status='balance_paid', last_actor='team' where id=$1`, [O(4)])
  }
  await expectFail('consegnato senza il documento finale: no (c\'è solo quello di proposta)', `
    update orders set status='delivered', last_actor='td' where id='${O(4)}'`, 'consegnato senza')

  console.log('  -- le regole dell\'invio, anche da Studio --')
  {
    const t = await nuovoOrdine(5)
    await db.query(`update orders set agency_id=$2 where id=$1`, [O(5), AG.id])
    await bozza(t, 'Norvegia', 100)
    await caricaDoc(t, 'Norvegia.pdf')
    const e = await invia(t, 100)
    e.esito === 'dati_non_validi' && e.campo === 'prezzo'
      ? ok('un totale il cui acconto o saldo scende sotto 0,50 €: no, due casse Stripe non si aprono')
      : fail(JSON.stringify(e))
    await db.query(`update app_config set value = null, value_text = 'x' where key = 'agency_confirm_valid_days'`)
    await bozza(t, 'Norvegia', 150000)
    const e2 = await invia(t, 150000)
    await db.query(`update app_config set value = 7, value_text = null where key = 'agency_confirm_valid_days'`)
    e2.esito === 'non_configurato' && (await ordine(O(5))).status === 'in_definition'
      ? ok('senza agency_confirm_valid_days l\'invio non parte: la vita del link non si inventa')
      : fail(JSON.stringify(e2))
  }
  await expectFail('da Studio, una proposta senza data di partenza non parte verso l\'agenzia', `
    update orders set departure_date = null where id='${O(5)}';
    update orders set status='proposal_pending_agency', last_actor='team' where id='${O(5)}'`, 'senza data di partenza')

  // ====================================================== N · la chiave ristretta
  console.log('  -- la chiave Stripe dell\'agenzia, da Vault --')
  {
    let esploso = ''
    try { await rpc(`select agency_stripe_key($1) as r`, [AG.id]) } catch (e) { esploso = e.message }
    esploso.includes('stripe_credential_ref') ? ok('senza riferimento: nessuna chiave, e la frase dice cosa manca')
                                              : fail(esploso || 'chiave senza riferimento')
    await db.query(`insert into vault.decrypted_secrets (name, decrypted_secret)
                    values ('stripe_key_prova', 'rk_test_finta'), ('stripe_sk_prova', 'sk_test_finta')`)
    await db.query(`update agencies set stripe_credential_ref='stripe_key_prova' where id=$1`, [AG.id])
    const k = await rpc(`select agency_stripe_key($1) as r`, [AG.id])
    k === 'rk_test_finta' ? ok('con il riferimento: la chiave ristretta dal Vault') : fail(k)
    await db.query(`update agencies set stripe_credential_ref='stripe_sk_prova' where id=$1`, [AG.id])
    esploso = ''
    try { await rpc(`select agency_stripe_key($1) as r`, [AG.id]) } catch (e) { esploso = e.message }
    esploso.includes('non è una chiave ristretta')
      ? ok('una secret key al posto della ristretta: rifiutata, niente rimborsi via API')
      : fail(esploso || 'secret key accettata')
    await db.query(`update agencies set stripe_credential_ref=null where id=$1`, [AG.id])
    const c = (await db.query(`select column_name from information_schema.columns
                                where table_name='agencies' and column_name ~ '(secret|key|password)'`)).rows
    c.length === 0 ? ok('e in agencies nessuna colonna porta una chiave: solo il riferimento')
                   : fail(JSON.stringify(c))
  }

  // ====================================================== O · chi arriva a cosa
  console.log('  -- anon e authenticated non arrivano a niente --')
  const chiuse = ['agency_page(text)', 'agency_decide(text,text,text)', 'agency_stripe_key(uuid)',
    'ai_save_draft(text,text,integer,date,date,integer)', 'ai_send_to_agency(text,integer)',
    'final_document_for_traveler(uuid,uuid)', 'rinnova_verifica_agenzia(uuid)',
    'agency_token_context(text)', 'td_ai_order_page(uuid)', 'ai_traveler_page(uuid)',
    'stripe_checkout_ai(jsonb,uuid,payments,orders)', 'emetti_verifica_agenzia(uuid)',
    'clock_ramo_verifica_agenzia()', 'clock_ramo_saldo_scaduto()', 'td_order_token(text,boolean)',
    'ai_ticket(uuid,text,bigint,text)', 'ai_deliver(uuid,text,text,text,bigint,text)']
  for (const f of chiuse) {
    const r = (await db.query(
      `select has_function_privilege('anon', $1, 'EXECUTE') as a,
              has_function_privilege('authenticated', $1, 'EXECUTE') as u`, [f])).rows[0]
    !r.a && !r.u ? ok(`${f}: chiusa ad anon e authenticated`) : fail(`${f} aperta: ${JSON.stringify(r)}`)
  }
  for (const f of ['agency_page(text)', 'agency_decide(text,text,text)', 'agency_stripe_key(uuid)',
                   'ai_save_draft(text,text,integer,date,date,integer)', 'ai_send_to_agency(text,integer)',
                   'final_document_for_traveler(uuid,uuid)', 'rinnova_verifica_agenzia(uuid)']) {
    const v = (await db.query(`select has_function_privilege('service_role', $1, 'EXECUTE') as v`, [f])).rows[0].v
    v ? ok(`${f}: la chiama la route server (o il team)`) : fail(`${f} non raggiungibile dalla chiave secret`)
  }
  {
    const r = (await db.query(
      `select has_table_privilege('anon', 'agency_decisions', 'SELECT') as a,
              has_table_privilege('authenticated', 'agency_decisions', 'SELECT') as u,
              (select relrowsecurity from pg_class where relname = 'agency_decisions') as rls`)).rows[0]
    !r.a && !r.u && r.rls ? ok('agency_decisions: RLS accesa e non leggibile dal browser') : fail(JSON.stringify(r))
  }
  {
    const r = (await db.query(
      `select count(*) from outbound_messages
        where coalesce(body_html,'') || coalesce(body_text,'') ~* '/storage/v1/|[?&]token='`)).rows[0]
    Number(r.count) === 0 ? ok('nessuna mail All Inclusive porta un link di Storage') : fail(r.count + ' mail')
  }
  await conf('team_notify_recipients', '')
  await conf('team_notify_events', 'ordine_pagato')
}

// ===========================================================================
// Tre event type, tre reti, e i viaggi di gruppo (migration 0048)
// ===========================================================================
// Le tre reti si provano sui casi storti, uno per rete: due servizi sullo
// stesso slug, uno slug fuori elenco su un servizio attivo, una prenotazione la
// cui durata non combacia col listino.
console.log('\n== Tre event type e tre reti (0048) ==')
{
  const DRAFT = '99999999-0048-4048-8048-000000000001'
  await db.exec(`
    insert into travel_designers (id, slug, status, display_name, email, bio, photo_url, cal_username)
    values ('${DRAFT}','td-slug-storti','draft','TD Slug Storti','storti@example.com',
            'Bio lunga abbastanza da superare il controllo di completezza del profilo.',
            'https://example.com/s.jpg','td-slug-storti-xpetis');
    insert into td_countries (td_id, country_code, level) values ('${DRAFT}','peru',1);
    insert into td_axis_values (td_id, axis_code, value)
    select '${DRAFT}', code, 2 from quiz_axes;`)

  // ------------------------------------------------------------- a. unicità
  console.log('  -- a. un designer, uno slug --')
  await expectOk('consulenza breve sullo slug da 30', `
    insert into td_services (td_id, service_type, is_active, price_cents, duration_minutes, cal_event_type_slug)
    values ('${DRAFT}','consultation',true,6000,30,'consulenza-xpetis-30')`)
  // Su un designer in bozza il trigger degli slug non guarda: è proprio il
  // caso in cui l'unicità è l'ultima difesa prima del prezzo sbagliato.
  await expectFail('approfondita sullo STESSO slug dello stesso designer', `
    insert into td_services (td_id, service_type, is_active, price_cents, duration_minutes, cal_event_type_slug)
    values ('${DRAFT}','consultation_deep',true,15000,60,'consulenza-xpetis-30')`,
    'td_services_one_service_per_slug')
  {
    const n = Number((await q(`
      select count(*) from td_services s
       where s.cal_event_type_slug = 'consulenza-xpetis-30'
         and s.td_id in (select id from travel_designers where slug in ('marco-rossi','giulia-neri'))`)).rows[0].count)
    n === 2 ? ok('lo stesso slug su due designer diversi resta ammesso (la chiave è la coppia)')
            : fail('slug condiviso fra designer: ' + n)
  }
  {
    // La migration controlla i doppioni prima di creare il vincolo, e li nomina.
    // Il blocco si rigioca qui su un doppione vero, col vincolo tolto per un
    // attimo dentro una transazione che poi torna indietro.
    const src = readFileSync(path.join(root, 'migrations', '0048_tre_event_type_e_gruppi.sql'), 'utf8')
    const guardia = src.slice(src.indexOf('do $$'), src.indexOf('end $$;') + 'end $$;'.length)
    let msg = ''
    try {
      await db.exec(`begin;
        alter table td_services drop constraint td_services_one_service_per_slug;
        insert into td_services (td_id, service_type, is_active, price_cents, duration_minutes, cal_event_type_slug)
        values ('${DRAFT}','consultation_deep',true,15000,60,'consulenza-xpetis-30');
        ${guardia}`)
    } catch (e) { msg = e.message } finally { await db.exec('rollback') }
    msg.includes('td-slug-storti → consulenza-xpetis-30')
      ? ok('la guardia della migration nomina designer e slug doppi: ' + msg.slice(msg.indexOf('td-slug')))
      : fail('guardia: ' + msg)
    const c = Number((await q(`select count(*) from pg_constraint where conname='td_services_one_service_per_slug'`)).rows[0].count)
    c === 1 ? ok('e il vincolo è tornato al suo posto') : fail('vincolo perso nel rollback')
  }

  // ------------------------------------------------------- b. slug fuori elenco
  console.log('  -- b. slug fuori elenco --')
  const blocchi = async (id) => (await q('select td_publish_blockers($1) as b', [id])).rows[0].b
  await db.exec(`update td_services set cal_event_type_slug = 'consulenza-xpetis-30-min'
                  where td_id = '${DRAFT}' and service_type = 'consultation'`)
  {
    const b = await blocchi(DRAFT)
    b.some(x => x.includes('«consulenza-xpetis-30-min» fuori elenco'))
      ? ok('lo slug che Cal.com inventa dal titolo è un blocco: ' + b.find(x => x.includes('fuori elenco')))
      : fail('blockers: ' + JSON.stringify(b))
  }
  await expectFail('e il profilo non si pubblica', `
    update travel_designers set status='published' where id='${DRAFT}'`, 'fuori elenco')
  // L'errore che la regola vecchia lascia in eredità: la breve collegata al 60.
  await db.exec(`update td_services set cal_event_type_slug = 'consulenza-xpetis-60', duration_minutes = 60
                  where td_id = '${DRAFT}' and service_type = 'consultation'`)
  {
    const b = await blocchi(DRAFT)
    b.some(x => x.startsWith('consultation: slug Cal.com «consulenza-xpetis-60»'))
      ? ok('la breve sul 60 (regola del 21 settembre) è bloccata: lo slug è giusto, il tipo no')
      : fail('breve sul 60: ' + JSON.stringify(b))
  }
  await db.exec(`update td_services set cal_event_type_slug = 'consulenza-xpetis-30', duration_minutes = 30
                  where td_id = '${DRAFT}' and service_type = 'consultation';
                 insert into td_services (td_id, service_type, is_active, cal_event_type_slug)
                 values ('${DRAFT}','consultation_deep', false, 'consulenza-xpetis-approfondita');`)
  {
    const b = await blocchi(DRAFT)
    !b.some(x => x.includes('slug')) ? ok('un servizio SPENTO con slug vecchio non blocca (può avere prenotazioni in volo)')
                                    : fail('spento che blocca: ' + JSON.stringify(b))
  }
  await expectOk('slug giusti: il profilo si pubblica', `
    update travel_designers set status='published' where id='${DRAFT}'`)
  await expectFail('accendere lo slug vecchio su un designer GIÀ pubblicato', `
    update td_services set is_active = true, price_cents = 15000, duration_minutes = 60
     where td_id='${DRAFT}' and service_type='consultation_deep'`, 'non ammesso')
  await expectFail('cambiare lo slug di un designer pubblicato fuori elenco', `
    update td_services set cal_event_type_slug = 'consulenza-xpetis-30-min'
     where td_id='${DRAFT}' and service_type='consultation'`, 'non ammesso')
  await expectOk('cambiare il prezzo non tocca la rete', `
    update td_services set price_cents = 6500 where td_id='${DRAFT}' and service_type='consultation'`)
  {
    await q(`update app_config set value_text = null, value = 0 where key = 'calcom_slugs_consultation'`)
    const b = await blocchi(DRAFT)
    b.some(x => x.includes('manca app_config.calcom_slugs_consultation'))
      ? ok('senza la riga di configurazione il servizio è bloccato, e il motivo lo dice')
      : fail('config assente: ' + JSON.stringify(b))
    await q(`update app_config set value = null, value_text = 'consulenza-xpetis-30' where key = 'calcom_slugs_consultation'`)
  }
  {
    const r = (await q(`select count(*) from td_publish_readiness
                         where slug in ('marco-rossi','giulia-neri') and can_publish`)).rows[0]
    Number(r.count) === 2 ? ok('i due designer demo restano pubblicabili con gli slug nuovi')
                          : fail('demo non pubblicabili: ' + r.count)
  }
  for (const f of ['calcom_expected_slugs(service_type)', 'enforce_service_slug_on_published()']) {
    const r = (await q(`select has_function_privilege('anon', $1, 'EXECUTE') as a,
                               has_function_privilege('authenticated', $1, 'EXECUTE') as u`, [f])).rows[0]
    !r.a && !r.u ? ok(`${f}: chiusa ad anon e authenticated`) : fail(`${f} aperta`)
  }

  // ------------------------------------------------------- c. durata vera
  console.log('  -- c. durata dichiarata contro durata vera --')
  const base = JSON.parse(readFileSync(path.join(root, 'tests', 'fixtures', 'calcom', 'booking_created.json'), 'utf8'))
  let n = 0
  const creata = async (slug, minuti) => {
    const b = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(base).filter(([k]) => !k.startsWith('_')))))
    n++
    b.createdAt = `2026-09-27T10:0${n}:00.000Z`
    b.payload.uid = `durata-0048-${n}`
    b.payload.type = slug
    b.payload.startTime = '2026-10-20T09:00:00.000Z'
    b.payload.endTime = new Date(Date.parse(b.payload.startTime) + minuti * 60000).toISOString()
    const raw = JSON.stringify(b)
    const firma = crypto.createHmac('sha256', segretoCalcom.valore).update(raw, 'utf8').digest('hex')
    return (await q('select calcom_webhook($1, $2) as e', [raw, firma])).rows[0].e
  }
  const nDurata = async () => Number((await q(
    `select count(*) from team_alerts where kind = 'calcom_durata_non_combacia'`)).rows[0].count)
  {
    const e = await creata('consulenza-xpetis-30', 30)
    e.esito === 'creata' && await nDurata() === 0
      ? ok('30 a listino, slot da 30: creata, nessun alert')
      : fail('durata giusta: ' + JSON.stringify(e))
  }
  {
    // marco-rossi ha l'approfondita da 90 (prove sui vincoli, più su). Lo slot
    // che arriva è da 30: l'event type è quello sbagliato.
    const e = await creata('consulenza-xpetis-90', 30)
    const b = (await q('select status, price_cents, service_type from bookings where id = $1', [e.booking_id])).rows[0]
    const a = (await q(`select severity, entity_type, entity_id, message from team_alerts
                         where kind = 'calcom_durata_non_combacia'`)).rows
    e.esito === 'creata' && b?.status === 'pending_payment' && b.price_cents === 9000
      ? ok('90 a listino, slot da 30: la prenotazione si crea COMUNQUE, col suo prezzo (lo slot è vero)')
      : fail('durata storta, prenotazione: ' + JSON.stringify({ e, b }))
    a.length === 1 && a[0].severity === 'critical' && a[0].entity_type === 'booking'
      && a[0].entity_id === e.booking_id && a[0].message.includes('90 minuti')
      && a[0].message.includes('ne dura 30')
      ? ok('e alza un alert critico sulla prenotazione: ' + a[0].message.slice(0, 110) + '…')
      : fail('alert durata: ' + JSON.stringify(a))
    e.dettaglio?.includes('slot di 30 min') ? ok('il dettaglio della risposta a n8n lo dice')
                                           : fail('dettaglio: ' + e.dettaglio)
  }
}

console.log('\n== I viaggi di gruppo (0048) ==')
{
  const r = (await q(`select slug, group_trips from public_td_showcase
                       where slug in ('marco-rossi','giulia-neri') order by slug`)).rows
  // Dal seed 0006 Marco è il demo completo e Giulia quello minimo, senza viaggi
  // di gruppo: la vetrina di Giulia deve reggere con l'elenco vuoto.
  const quanti = Object.fromEntries(r.map(x => [x.slug, x.group_trips.length]))
  quanti['marco-rossi'] === 3 && quanti['giulia-neri'] === 0
    ? ok('tre viaggi di gruppo per Marco (demo completo), nessuno per Giulia (demo minimo)')
    : fail('group_trips: ' + JSON.stringify(quanti))
  const g = r.find(x => x.slug === 'marco-rossi').group_trips[0]
  // I sei campi del form, lo slug dell'indirizzo dalla 0051, e dalla 0054 i
  // campi della card del tool v6 (paesi, partecipanti, prossima partenza).
  const chiavi = ['slug', 'title', 'dates_label', 'duration_label', 'group_size_label', 'price_label', 'image_path',
                  'countries', 'participants_min', 'participants_max', 'next_departure']
  JSON.stringify(Object.keys(g).sort()) === JSON.stringify([...chiavi].sort())
    ? ok('ogni viaggio porta i campi della card e lo slug, nient\'altro: ' + g.title + ' · ' + g.dates_label)
    : fail('chiavi: ' + JSON.stringify(Object.keys(g)))
  const t = (await q(`select has_table_privilege('anon','td_group_trips','SELECT') as a,
                             has_table_privilege('authenticated','td_group_trips','SELECT') as u,
                             (select relrowsecurity from pg_class where relname='td_group_trips') as rls`)).rows[0]
  !t.a && !t.u && t.rls ? ok('td_group_trips: RLS accesa, la tabella non è leggibile dal browser')
                        : fail(JSON.stringify(t))
  const v = (await q(`select has_table_privilege('anon','public_td_showcase','SELECT') as a`)).rows[0]
  v.a ? ok('la vista pubblica non ha perso il grant nel create or replace') : fail('grant perso')
  await expectFail('un viaggio di gruppo senza titolo', `
    insert into td_group_trips (td_id, position, title)
    values ('11111111-1111-1111-1111-111111111111', 9, '  ')`, 'check')
  // I percorsi delle immagini vivono nel seed e i file in seed-immagini/: il
  // generatore legge i primi, e un percorso senza file è una card vuota.
  const percorsi = (await q(`select image_path from td_group_trips where image_path is not null`)).rows
  const mancanti = percorsi.filter(p => !existsSync(path.join(root, '..', 'seed-immagini', p.image_path)))
  mancanti.length === 0 ? ok(`le ${percorsi.length} immagini finte dei viaggi di gruppo esistono in seed-immagini/`)
                        : fail('immagini mancanti: ' + mancanti.map(p => p.image_path).join(', '))
}

console.log('\n== Lo slug dei viaggi di gruppo (0051) ==')
{
  const M = '11111111-1111-1111-1111-111111111111'
  const G = '22222222-2222-2222-2222-222222222222'
  const slug = async (td, pos) =>
    (await q(`select slug from td_group_trips where td_id = $1 and position = $2`, [td, pos])).rows[0]?.slug

  // Il seed: i viaggi sono nati dopo la migration, quindi dal trigger. Dal seed
  // 0006 Giulia non ne ha più (demo minimo): l'accento lo prova il Nakasendō.
  const s1 = await slug(M, 3)
  s1 === 'giappone-in-autunno-lungo-il-nakasendo'
    ? ok('gli slug del seed nascono dal titolo, senza accenti né apostrofi: ' + s1)
    : fail('slug del seed: ' + s1)

  // La collisione del Figma: tre viaggi che si chiamano tutti uguale.
  await expectOk('tre viaggi con lo stesso titolo sullo stesso designer', `
    insert into td_group_trips (td_id, position, title) values
      ('${M}', 91, 'Argentina: Trekking in Patagonia'),
      ('${M}', 92, 'Argentina: Trekking in Patagonia'),
      ('${M}', 93, 'Argentina: Trekking in Patagonia')`)
  const c = [await slug(M, 91), await slug(M, 92), await slug(M, 93)]
  JSON.stringify(c) === JSON.stringify(['argentina-trekking-in-patagonia',
                                        'argentina-trekking-in-patagonia-2',
                                        'argentina-trekking-in-patagonia-3'])
    ? ok('le collisioni prendono il suffisso: ' + c.join(', '))
    : fail('collisioni: ' + JSON.stringify(c))

  await expectOk('lo stesso titolo su un altro designer', `
    insert into td_group_trips (td_id, position, title)
    values ('${G}', 91, 'Argentina: Trekking in Patagonia')`)
  ;(await slug(G, 91)) === 'argentina-trekking-in-patagonia'
    ? ok("l'unicità è per designer, non globale") : fail('slug su Giulia: ' + await slug(G, 91))

  // Le due proprietà per cui esiste la colonna: né il titolo né l'ordine
  // muovono l'indirizzo.
  await q(`update td_group_trips set title = 'Argentina, la Patagonia a piedi' where td_id = $1 and position = 92`, [M])
  ;(await slug(M, 92)) === 'argentina-trekking-in-patagonia-2'
    ? ok('correggere il titolo non muove lo slug') : fail('slug dopo il titolo: ' + await slug(M, 92))
  await q(`update td_group_trips set position = 99 where td_id = $1 and position = 91`, [M])
  await q(`update td_group_trips set position = 91 where td_id = $1 and position = 93`, [M])
  ;(await slug(M, 91)) === 'argentina-trekking-in-patagonia-3' && (await slug(M, 99)) === 'argentina-trekking-in-patagonia'
    ? ok('riordinare i viaggi non muove gli slug: il link vecchio porta allo stesso viaggio')
    : fail('slug dopo il riordino: ' + (await slug(M, 91)) + ' / ' + (await slug(M, 99)))

  await expectOk('uno slug scritto a mano si rispetta', `
    insert into td_group_trips (td_id, position, title, slug)
    values ('${M}', 94, 'Titolo qualunque', 'patagonia-2027')`)
  ;(await slug(M, 94)) === 'patagonia-2027' ? ok('lo slug esplicito non viene riscritto')
                                            : fail('slug esplicito: ' + await slug(M, 94))
  await expectFail('due slug identici sullo stesso designer', `
    insert into td_group_trips (td_id, position, title, slug)
    values ('${M}', 95, 'Doppione', 'patagonia-2027')`, 'unique')
  await expectOk('un titolo fatto solo di segni', `
    insert into td_group_trips (td_id, position, title) values ('${M}', 96, '《》')`)
  ;/^[0-9a-f]{8}$/.test(await slug(M, 96)) ? ok('ripiega su un pezzo dell\'uuid invece di uno slug vuoto')
                                           : fail('slug di soli segni: ' + await slug(M, 96))

  const v = (await q(`select group_trips from public_td_showcase where slug = 'marco-rossi'`)).rows[0].group_trips
  v.every(x => typeof x.slug === 'string' && x.slug.length > 0)
    ? ok('la vetrina pubblica serve lo slug di ogni viaggio di gruppo')
    : fail('viaggi senza slug: ' + JSON.stringify(v))
  const a = (await q(`select has_table_privilege('anon','public_td_showcase','SELECT') as a,
                             has_table_privilege('anon','td_group_trips','SELECT') as t`)).rows[0]
  a.a && !a.t ? ok('la vista resta leggibile, la tabella no') : fail(JSON.stringify(a))
  await q(`delete from td_group_trips where position > 90`)
}

console.log('\n== Il quiz non mostra mai la chiave del form (0051) ==')
{
  // Più su l'harness rigioca la 0049 su tabelle popolate, e quella riscrive
  // public_quiz_axes con la ricaduta su label_it. Su un database vero l'ordine
  // è uno solo (0049, poi 0051): qui si rimette la vista della 0051, presa dal
  // file, così la prova guarda quello che il database vero avrà.
  const m0051 = readFileSync(path.join(root, 'migrations', '0051_slug_viaggi_di_gruppo.sql'), 'utf8')
  await db.exec(m0051.slice(m0051.indexOf('create or replace view public_quiz_axes')))
  const opz = async () => (await q(`select options from public_quiz_axes where code = 'companions'`)).rows[0].options
  const o = await opz()
  const attese = ['Da solo/a', 'In coppia', 'Famiglia con bambini/ragazzi',
                  'Gruppo di amici / piccolo gruppo', 'Gruppo organizzato con altri viaggiatori']
  JSON.stringify([1, 2, 3, 4, 5].map(n => o[String(n)])) === JSON.stringify(attese)
    ? ok('«con chi viaggi» ha cinque risposte, con le parole del quiz')
    : fail('opzioni companions: ' + JSON.stringify(o))
  const k = (await q(`select kind, scale_min, scale_max, sort_order from public_quiz_axes where code = 'companions'`)).rows[0]
  k.kind === 'categorical' && k.scale_min === 1 && k.scale_max === 5 && k.sort_order === 6
    ? ok('ed è categoriale, scala 1-5, sesta: la pagina la distingue da kind, non contando')
    : fail('companions: ' + JSON.stringify(k))
  const cont = (await q(`select code from public_quiz_axes where kind = 'continuous' and scale_max <> 4`)).rows
  cont.length === 0 ? ok('i cinque assi continui hanno quattro risposte') : fail('continui fuori scala: ' + JSON.stringify(cont))

  // Un testo che manca: prima la vista mostrava la chiave, ora un buco.
  await q(`update quiz_axis_options set answer_it = null where axis_code = 'companions' and value = 1`)
  const buco = (await opz())['1']
  buco === null ? ok('una risposta senza testo arriva null, non come «Viaggiatore solo»')
                : fail('ricaduta: ' + JSON.stringify(buco))
  await q(`update quiz_axis_options set answer_it = 'Da solo/a' where axis_code = 'companions' and value = 1`)
  const g = (await q(`select has_table_privilege('anon','public_quiz_axes','SELECT') as a`)).rows[0]
  g.a ? ok('public_quiz_axes non ha perso il grant') : fail('grant perso sul quiz')
}

// ===========================================================================
// Il cruscotto del team (migration 0050)
// ===========================================================================
// Le viste si provano davvero facendole leggere a una persona (PIANO,
// milestone 9). Qui si prova quello che una persona non vede: che non
// espongano credenziali, che la spunta chiuda e riapra, che il digest parta una
// volta sola e solo se c'è qualcosa, che un rimborso dimenticato si veda.
console.log('\n== Il cruscotto del team (0050) ==')
{
  const TD   = '11111111-1111-1111-1111-111111111111'
  const ANNA = '44444444-4444-4444-4444-444444444444'
  const VISTE = ['team_coda_alert', 'team_ordini_aperti', 'team_prenotazioni_in_corso',
                 'team_checklist_pubblicazione', 'team_pagamenti', 'team_rimborsi_stripe']

  // ---------------------------------------------------------------- superficie
  console.log('  -- cosa non si vede --')
  for (const v of VISTE) {
    const r = (await q(`select has_table_privilege('anon', $1, 'SELECT') as a,
                               has_table_privilege('authenticated', $1, 'SELECT') as u`, [v])).rows[0]
    !r.a && !r.u ? ok(`${v}: chiusa ad anon e authenticated`) : fail(`${v} aperta al browser`)
  }
  for (const t of ['team_alert_kinds', 'team_digests']) {
    const r = (await q(`select has_table_privilege('anon',$1,'SELECT') as a,
                               has_table_privilege('authenticated',$1,'SELECT') as u,
                               (select relrowsecurity from pg_class where relname=$1) as rls`, [t])).rows[0]
    !r.a && !r.u && r.rls ? ok(`${t}: RLS accesa, privilegi revocati`) : fail(`${t}: ` + JSON.stringify(r))
  }
  {
    const vietate = /uid|token|video|client_reference|phone|telefono|email|secret|chiave|session/i
    const r = (await q(`select table_name, column_name from information_schema.columns
                         where table_schema = 'public' and table_name = any($1)`, [VISTE])).rows
    const male = r.filter(c => vietate.test(c.column_name))
    male.length === 0 ? ok(`nessuna colonna delle ${VISTE.length} viste ha la forma di una credenziale o di un contatto`)
                      : fail('colonne vietate: ' + JSON.stringify(male))
  }
  for (const v of VISTE) {
    try { await q(`select * from ${v}`); ok(`${v} si legge senza errori`) }
    catch (e) { fail(`${v} non si legge`, e) }
  }
  {
    const cal = 'hXBtFar1ZUCZci4qszEbs2', tok = 'aB3dE5gH7jK9mN1pQ3sT5vX7zA9cE1gH'
    const uuid = '66666666-6666-6666-6666-666666666666'
    const t = (await q(`select alert_testo_sicuro($1) as t`, [
      `uid ${cal}, link /ordine/${tok}, select f('${uuid}'); sessione cs_test_a1B2c3D4e5F6g7H8i9J0k1L2 pi_3NabcdefGHIJKLmn0123 {{x}}`])).rows[0].t
    !t.includes(cal) && !t.includes(tok) ? ok('il testo sicuro nasconde UID Cal.com e token') : fail('non nasconde: ' + t)
    t.includes(uuid) && t.includes('cs_test_a1B2c3D4e5F6g7H8i9J0k1L2') && t.includes('pi_3NabcdefGHIJKLmn0123')
      ? ok('e lascia UUID e id Stripe, che servono a chi agisce') : fail('toglie troppo: ' + t)
    !t.includes('{{') ? ok('e disinnesca le graffe doppie, che render_template prenderebbe per segnaposto')
                      : fail('graffe: ' + t)
  }

  // ---------------------------------------------------------------- catalogo
  console.log('  -- il catalogo degli alert --')
  {
    const src = (await q(`select string_agg(p.prosrc, E'\n') as s from pg_proc p
                            join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).rows[0].s
    const kinds = new Set([...src.matchAll(/'([a-z][a-z0-9_]+)',\s*'(critical|warning|info)'/g)].map(m => m[1]))
    kinds.delete('info')   // `case … when 'info' then` non è un kind
    const noti = new Set((await q(`select kind from team_alert_kinds`)).rows.map(r => r.kind))
    const mancanti = [...kinds].filter(k => !noti.has(k))
    kinds.size > 30 && mancanti.length === 0
      ? ok(`tutti i ${kinds.size} kind scritti dalle funzioni sono nel catalogo, con titolo e cosa fare`)
      : fail('kind non catalogati: ' + mancanti.join(', '))
  }

  // --------------------------------------------------------------- la spunta
  console.log('  -- chiudere è una spunta --')
  await q(`update team_alerts set risolto = true where not risolto`)
  await q(`insert into team_alerts (kind, severity, entity_type, entity_id, message)
           values ('calcom_cancellazione_orfana', 'warning', 'webhook_event', gen_random_uuid(),
                   'Cancellazione Cal.com di una prenotazione che non abbiamo: uid hXBtFar1ZUCZci4qszEbs2, designer marco')`)
  await q(`insert into team_alerts (kind, severity, message) values ('token_inventati', 'warning', 'prova')`)
  await q(`insert into team_alerts (kind, severity, message) values ('stripe_importo_non_combacia', 'critical', 'prova soldi')`)
  await q(`insert into team_alerts (kind, severity, message) values ('kind_inventato_per_la_prova', 'warning', 'prova ignoto')`)
  {
    const r = (await q(`select costo, kind, messaggio, cosa_fare from team_coda_alert`)).rows
    r.map(x => x.kind).join(',') === 'stripe_importo_non_combacia,kind_inventato_per_la_prova,calcom_cancellazione_orfana,token_inventati'
      ? ok('la coda è in ordine di costo: soldi, poi il tipo sconosciuto (a 2, non in fondo), igiene, da sapere')
      : fail('ordine: ' + r.map(x => x.costo + ' ' + x.kind).join(' | '))
    const orfana = r.find(x => x.kind === 'calcom_cancellazione_orfana')
    orfana && !orfana.messaggio.includes('hXBtFar1ZUCZci4qszEbs2')
      ? ok('l\'UID Cal.com dell\'alert orfano non esce dalla vista: ' + orfana.messaggio)
      : fail('UID in vista: ' + orfana?.messaggio)
    r.find(x => x.kind === 'kind_inventato_per_la_prova')?.cosa_fare.includes('team_alert_kinds')
      ? ok('un tipo non catalogato dice di catalogarlo') : fail('tipo ignoto')
  }
  {
    await q(`update team_alerts set risolto = true where kind = 'token_inventati' and not risolto`)
    const a = (await q(`select risolto, resolved_at, resolved_by from team_alerts where kind='token_inventati' order by created_at desc limit 1`)).rows[0]
    a.risolto && a.resolved_at && a.resolved_by === 'team (Studio)'
      ? ok('spuntare risolto riempie resolved_at e resolved_by da sé') : fail('spunta: ' + JSON.stringify(a))
    await q(`update team_alerts set risolto = false where kind = 'token_inventati' and resolved_by = 'team (Studio)'`)
    const b = (await q(`select risolto, resolved_at, resolved_by from team_alerts where kind='token_inventati' order by created_at desc limit 1`)).rows[0]
    !b.risolto && b.resolved_at === null && b.resolved_by === null
      ? ok('togliere la spunta lo riapre') : fail('riapertura: ' + JSON.stringify(b))
    await q(`update team_alerts set resolved_at = now(), resolved_by = 'orologio' where kind = 'token_inventati' and not risolto`)
    const c = (await q(`select risolto from team_alerts where kind='token_inventati' order by created_at desc limit 1`)).rows[0]
    c.risolto ? ok('una funzione che scrive resolved_at (come l\'orologio) accende la spunta') : fail('coerenza')
    const n = (await q(`select chiudi_alert('kind_inventato_per_la_prova', 'prova') as n`)).rows[0].n
    const d = (await q(`select resolved_by, resolution_note from team_alerts where kind='kind_inventato_per_la_prova'`)).rows[0]
    n === 1 && d.resolved_by === 'team (chiudi_alert)' && d.resolution_note === 'prova'
      ? ok('chiudi_alert chiude tutti quelli di un tipo e lo dice') : fail('chiudi_alert: ' + n + JSON.stringify(d))
  }
  {
    // Il riarmo: un alert aperto zittisce i successivi dello stesso tipo.
    await q(`update app_config set value = 1 where key = 'calcom_signature_alert_threshold'`)
    await q(`insert into calcom_signature_rejections (bucket_at, n, last_at) values (date_trunc('hour', now()), 5, now())`)
    await q(`select clock_ramo_firme_calcom()`); await q(`select clock_ramo_firme_calcom()`)
    const n1 = Number((await q(`select count(*) from team_alerts where kind='calcom_firme_rifiutate' and not risolto`)).rows[0].count)
    await q(`select chiudi_alert('calcom_firme_rifiutate')`)
    await q(`select clock_ramo_firme_calcom()`)
    const n2 = Number((await q(`select count(*) from team_alerts where kind='calcom_firme_rifiutate' and not risolto`)).rows[0].count)
    n1 === 1 && n2 === 1 ? ok('chiudere riarma: aperto ne tiene uno solo, chiuso ne lascia scrivere uno nuovo')
                         : fail(`riarmo: ${n1} poi ${n2}`)
    await q(`select chiudi_alert('calcom_firme_rifiutate')`)
    await q(`delete from calcom_signature_rejections`)
    await q(`update app_config set value = 3 where key = 'calcom_signature_alert_threshold'`)
  }

  // --------------------------------------------------------- chiusura da sé
  console.log('  -- gli alert che si chiudono da soli --')
  {
    const o = (await q(`insert into orders (traveler_id, td_id, service_type, last_actor)
                        values ($1, $2, 'custom_itinerary', 'traveler') returning id, human_ref`, [ANNA, TD])).rows[0]
    await q(`insert into team_alerts (kind, severity, entity_type, entity_id, message)
             values ('ordine_richiesto', 'warning', 'order', $1, 'Nuova richiesta')`, [o.id])
    {
      const v = (await q(`select chi, cosa_manca, tocca_a from team_ordini_aperti where ordine = $1`, [o.human_ref])).rows[0]
      v?.tocca_a === 'team' && v.chi.startsWith('Tocca a noi') && v.cosa_manca.includes('gruppo WhatsApp')
        ? ok('ordine richiesto nella vista: «' + v.chi + '» — ' + v.cosa_manca) : fail('vista ordine: ' + JSON.stringify(v))
    }
    await q(`select clock_ramo_alert_superati()`)
    let a = (await q(`select risolto from team_alerts where entity_id = $1`, [o.id])).rows[0]
    !a.risolto ? ok('finché l\'ordine è richiesto, l\'alert resta aperto') : fail('chiuso troppo presto')
    await q(`update orders set status = 'in_definition', last_actor = 'td' where id = $1`, [o.id])
    await q(`select clock_ramo_alert_superati()`)
    a = (await q(`select risolto, resolved_by from team_alerts where entity_id = $1`, [o.id])).rows[0]
    a.risolto && a.resolved_by.startsWith('orologio')
      ? ok('uscito da «richiesto», l\'orologio lo chiude: ' + a.resolved_by) : fail('non chiuso: ' + JSON.stringify(a))
    const v = (await q(`select tocca_a, cosa_manca from team_ordini_aperti where ordine = $1`, [o.human_ref])).rows[0]
    v?.tocca_a === 'designer' && v.cosa_manca === 'Scrivere la proposta'
      ? ok('e la vista ora dice che aspetta il designer: ' + v.cosa_manca) : fail('vista dopo: ' + JSON.stringify(v))
    await q(`update orders set status = 'cancelled', cancelled_at = now(), last_actor = 'team' where id = $1`, [o.id])
  }
  {
    const r = (await q(`select count(*) filter (where cosa_manca is null or chi is null) as vuote, count(*) as n
                          from team_ordini_aperti`)).rows[0]
    Number(r.n) > 0 && Number(r.vuote) === 0
      ? ok(`ogni ordine aperto (${r.n}) dice chi deve muoversi e cosa manca`) : fail('righe mute: ' + JSON.stringify(r))
    const s = (await q(`select count(*) filter (where cosa_succede is null) as vuote, count(*) as n
                          from team_prenotazioni_in_corso`)).rows[0]
    Number(s.vuote) === 0 ? ok(`ogni prenotazione in corso (${s.n}) dice cosa succede`) : fail('prenotazioni mute')
    const c = (await q(`select count(*) as n, count(*) filter (where stato = 'Pronto: si può pubblicare'
                                                             and come_si_pubblica is null) as senza from team_checklist_pubblicazione`)).rows[0]
    const t = (await q(`select count(*) as n from travel_designers`)).rows[0]
    c.n === t.n && Number(c.senza) === 0
      ? ok(`la checklist ha una riga per designer (${c.n}), e chi è pronto porta la riga per pubblicarlo`)
      : fail('checklist: ' + JSON.stringify(c))
  }

  // ---------------------------------------------------------------- rimborsi
  console.log('  -- i rimborsi --')
  const BR = 'b0b0b0b0-0050-4050-8050-000000000001'
  await q(`insert into bookings (id, traveler_id, td_id, service_type, status, cal_booking_uid, cal_event_type_slug,
                                 starts_at, ends_at, original_starts_at, price_cents, confirmed_at, last_actor)
           values ($1, $2, $3, 'consultation', 'confirmed', 'uid-rimborso-0050', 'consulenza-xpetis-30',
                   now() + interval '3 days', now() + interval '3 days 30 minutes', now() + interval '3 days',
                   6000, now(), 'n8n')`, [BR, ANNA, TD])
  const PAY = (await q(`insert into payments (booking_id, kind, status, amount_cents, stripe_payment_intent_id,
                                              client_reference_id, paid_at)
                        values ($1, 'consultation', 'paid', 6000, 'pi_prova0050', 'uid-rimborso-0050', now())
                        returning id`, [BR])).rows[0].id
  {
    const r = (await q(`select * from team_pagamenti where payment_id = $1`, [PAY])).rows[0]
    r && r.id_stripe === 'pi_prova0050' && !JSON.stringify(r).includes('uid-rimborso-0050')
      ? ok('team_pagamenti mostra l\'id Stripe da cercare sulla dashboard, e non l\'UID Cal.com del riferimento')
      : fail('team_pagamenti: ' + JSON.stringify(r))
  }
  // Il messaggio che il ponte scrive dalla 0044 per un charge.refunded.
  await q(`insert into event_log (entity_type, entity_id, event, actor, payload)
           values ('webhook_event', gen_random_uuid(), 'stripe_rimborso', 'system',
                   jsonb_build_object('tipo', 'charge.refunded', 'oggetto',
                     jsonb_build_object('object', 'charge', 'payment_intent', 'pi_prova0050',
                                        'amount_refunded', 2000, 'refunded', false)))`)
  await q(`select clock_ramo_rimborsi_non_annotati()`); await q(`select clock_ramo_rimborsi_non_annotati()`)
  {
    const a = (await q(`select message from team_alerts where kind = 'rimborso_non_annotato' and entity_id = $1 and not risolto`, [PAY])).rows
    a.length === 1 && a[0].message.includes('20,00') && a[0].message.includes("annota_rimborso('pi_prova0050', 2000")
      ? ok('un rimborso fatto su Stripe e non annotato alza un alert, uno solo, con la riga pronta')
      : fail('alert rimborso: ' + JSON.stringify(a))
    const r = (await q(`select da_fare from team_pagamenti where payment_id = $1`, [PAY])).rows[0]
    r.da_fare?.startsWith('DA ANNOTARE') ? ok('e team_pagamenti lo mette in cima con la riga da eseguire')
                                         : fail('da_fare: ' + JSON.stringify(r))
  }
  await expectFail('annotare senza nota', `select annota_rimborso('pi_prova0050', 2000, '')`, 'nota')
  await expectFail('annotare più dell\'incasso', `select annota_rimborso('pi_prova0050', 7000, 'x')`, 'controlla')
  await expectFail('annotare un pagamento che non esiste', `select annota_rimborso('pi_inesistente', 100, 'x')`, 'nessun pagamento')
  {
    const t = (await q(`select annota_rimborso('pi_prova0050', 2000, 'Call spostata dal designer, rimborso parziale') as t`)).rows[0].t
    const p = (await q(`select status, refund_amount_cents, refunded_at, refund_note from payments where id = $1`, [PAY])).rows[0]
    const b = (await q(`select status, refund_amount_cents from bookings where id = $1`, [BR])).rows[0]
    p.status === 'partially_refunded' && p.refund_amount_cents === 2000 && p.refunded_at && p.refund_note.includes('20,00 €')
      ? ok('annotato: pagamento parzialmente rimborsato, con data e nota') : fail('pagamento: ' + JSON.stringify(p))
    b.status === 'confirmed' && b.refund_amount_cents === 2000
      ? ok('la prenotazione porta l\'importo ma NON cambia stato: quella è una decisione a parte')
      : fail('prenotazione: ' + JSON.stringify(b))
    t.includes('decidi lo stato') ? ok('e la risposta lo ricorda') : fail('risposta: ' + t)
  }
  await q(`select clock_ramo_alert_superati()`)
  {
    const a = (await q(`select risolto from team_alerts where kind = 'rimborso_non_annotato' and entity_id = $1`, [PAY])).rows[0]
    a.risolto ? ok('annotato il rimborso, l\'alert si chiude da solo') : fail('alert rimborso ancora aperto')
  }
  await q(`select annota_rimborso($1, 4000, 'Resto rimborsato')`, [PAY])
  {
    const p = (await q(`select status, refund_amount_cents from payments where id = $1`, [PAY])).rows[0]
    p.status === 'refunded' && p.refund_amount_cents === 6000
      ? ok('il secondo rimborso si somma, per id della riga: pagamento rimborsato per intero') : fail(JSON.stringify(p))
  }
  await expectFail('rimborsare un pagamento già rimborsato per intero', `select annota_rimborso('pi_prova0050', 1, 'x')`, 'niente da rimborsare')

  // ------------------------------------------------------------------ digest
  console.log('  -- il digest --')
  const salva = (await q(`select key, value, value_text from app_config
                           where key in ('team_digest_hour', 'team_notify_recipients')`)).rows
  const digest = async () => (await q(`select clock_ramo_digest_team() as n`)).rows[0].n
  const posta = async () => (await q(`select * from outbound_messages where message_kind = 'team_digest' order by recipient`)).rows
  await q(`update team_alerts set risolto = true where not risolto`)
  await q(`delete from team_digests`)
  await q(`update app_config set value = 0 where key = 'team_digest_hour'`)
  await q(`update app_config set value_text = 'uno@example.com, due@example.com' where key = 'team_notify_recipients'`)
  {
    const n = await digest()
    const g = (await q(`select inviato from team_digests`)).rows
    n === 0 && g.length === 1 && !g[0].inviato && (await posta()).length === 0
      ? ok('nessun alert aperto: il giorno è segnato e nessuna mail parte') : fail(`digest vuoto: ${n} ${JSON.stringify(g)}`)
  }
  await q(`delete from team_digests`)
  await q(`insert into team_alerts (kind, severity, message, created_at)
           values ('calcom_designer_sconosciuto', 'warning', 'vecchio: account mario-xpetis', now() - interval '12 days')`)
  await q(`insert into team_digests (giorno, created_at) values (current_date - 1, now() - interval '1 day')`)
  await q(`insert into team_alerts (kind, severity, entity_type, entity_id, message)
           values ('calcom_cancellazione_orfana', 'warning', 'webhook_event', gen_random_uuid(),
                   'Cancellazione orfana: uid hXBtFar1ZUCZci4qszEbs2, designer marco')`)
  {
    const n = await digest()
    const m = await posta()
    n === 2 && m.length === 2 && m.map(x => x.recipient).join(',') === 'due@example.com,uno@example.com'
      ? ok('due destinatari, due mail in coda') : fail(`digest: ${n} ` + JSON.stringify(m.map(x => x.recipient)))
    const t = m[0]?.body_text ?? ''
    ;/1 nuovi, 1 ancora aperti/.test(m[0]?.subject ?? '') ? ok('l\'oggetto conta nuovi e vecchi: ' + m[0].subject) : fail('oggetto: ' + m[0]?.subject)
    t.includes('Cancellazione di una call che non abbiamo') && t.includes('Cosa fare:')
      && t.includes('Prenotazione da un account Cal.com che non conosciamo — da 12 giorni')
      && !t.includes('vecchio: account mario')
      ? ok('i nuovi per esteso con cosa fare, i vecchi in una riga con l\'età') : fail('corpo: ' + t)
    !t.includes('hXBtFar1ZUCZci4qszEbs2') && !m[0].body_html.includes('hXBtFar1ZUCZci4qszEbs2')
      ? ok('l\'UID Cal.com non arriva nelle caselle') : fail('UID nel digest')
    t.includes('colonna risolto') ? ok('la mail dice come si zittisce un alert') : fail('manca come si chiude')
    const again = await digest()
    again === 0 && (await posta()).length === 2 ? ok('secondo giro nello stesso giorno: niente') : fail('digest doppio')
  }
  {
    await q(`delete from team_digests where giorno = (now() at time zone 'Europe/Rome')::date`)
    await q(`update app_config set value = -1 where key = 'team_digest_hour'`)
    const n = await digest()
    const g = Number((await q(`select count(*) from team_digests where giorno = (now() at time zone 'Europe/Rome')::date`)).rows[0].count)
    n === 0 && g === 0 ? ok('ora negativa: spento per scelta, nessuna riga') : fail('spento: ' + n + ' ' + g)
    await q(`update app_config set value = 0 where key = 'team_digest_hour'`)
    await q(`update app_config set value_text = '' where key = 'team_notify_recipients'`)
    await digest()
    const a = Number((await q(`select count(*) from team_alerts where kind = 'notifica_team_non_configurata' and not risolto`)).rows[0].count)
    a === 1 ? ok('senza destinatari il digest non si perde in silenzio: lo dice un alert') : fail('destinatari vuoti: ' + a)
  }
  {
    await q(`delete from app_config where key = 'team_digest_hour'`)
    await q(`select * from clock_tick(0)`)
    const a = (await q(`select message from team_alerts where kind = 'orologio_ramo_non_configurato' and not risolto`)).rows[0]
    a?.message.includes('team_digest_hour') ? ok('senza la riga il ramo è dichiarato spento dall\'orologio')
                                           : fail('ramo digest non dichiarato: ' + a?.message)
    await q(`insert into app_config (key, value, config_group, label_it) values ('team_digest_hour', 8, 'integrations', 'x')`)
    await q(`select * from clock_tick(0)`)
  }
  for (const r of salva) await q(`update app_config set value = $2, value_text = $3 where key = $1`, [r.key, r.value, r.value_text])
  await q(`update team_alerts set risolto = true where not risolto`)

  for (const f of ['chiudi_alert(text, text)', 'annota_rimborso(text, integer, text)', 'clock_ramo_digest_team()',
                   'clock_ramo_alert_superati()', 'clock_ramo_rimborsi_non_annotati()', 'alert_testo_sicuro(text)']) {
    const r = (await q(`select has_function_privilege('anon', $1, 'EXECUTE') as a,
                               has_function_privilege('authenticated', $1, 'EXECUTE') as u`, [f])).rows[0]
    !r.a && !r.u ? ok(`${f}: chiusa ad anon e authenticated`) : fail(`${f} aperta`)
  }
}

console.log('\n== I dieci paesi del tool vetrina v6 (3 ottobre 2026) ==')
{
  // La lista del tool (stati.ts, di Alessandro) ha dieci paesi che la v2 non
  // aveva. Nessuna città (e dal 4 ottobre nessuna regione, per nessuno).
  const attesi = {
    andorra: 'europa_sud', angola: 'africa_sub_sahariana', eritrea: 'africa_sub_sahariana',
    gambia: 'africa_sub_sahariana', bangladesh: 'asia_centrale_e_subcontinente_indiano',
    antigua_e_barbuda: 'centro_america_e_caraibi', barbados: 'centro_america_e_caraibi',
    saint_lucia: 'centro_america_e_caraibi', saint_vincent_e_grenadine: 'centro_america_e_caraibi',
    sint_maarten: 'centro_america_e_caraibi',
  }
  const r = (await q(`
    select k.code, k.macro_area_code, k.is_selectable,
           (select count(*) from geo_cities c where c.country_code = k.code)::int as citta
      from geo_countries k where k.code = any($1)`, [Object.keys(attesi)])).rows
  const storti = Object.keys(attesi).filter(c => {
    const x = r.find(y => y.code === c)
    return !x || x.macro_area_code !== attesi[c] || !x.is_selectable || x.citta !== 0
  })
  storti.length === 0
    ? ok('i dieci paesi nuovi ci sono, sotto la macro-area del tool, senza città')
    : fail('paesi nuovi storti: ' + JSON.stringify(storti) + ' ' + JSON.stringify(r))
}

console.log('\n== Vetrina v6: il profilo (0052) ==')
{
  const M = MARCO
  await expectFail('axis_sides deve essere un oggetto',
    `update travel_designers set axis_sides = '["dynamic"]' where id = '${M}'`, 'axis_sides_object')
  await expectFail('card_phrases deve essere un oggetto',
    `update travel_designers set card_phrases = '"frase"' where id = '${M}'`, 'card_phrases_object')
  await expectOk('i tre jsonb chiusi accettano un oggetto',
    `update travel_designers set axis_sides = '{"ritmo":"dynamic"}', card_phrases = '{"chiusura":"x"}',
            card_phrases_status = '{"chiusura":"bozza"}', legal_name = 'Marco Rossi Anagrafico'
      where id = '${M}'`)

  // Le destinazioni in evidenza: 1-3, una per posizione, e sempre di livello 1.
  const paesi = (await q(`select country_code, level from td_countries where td_id = '${M}' order by country_code`)).rows
  const forte = paesi.find(p => p.level === 1), base = paesi.find(p => p.level === 2)
  await expectFail('highlight_position fuori da 1-3',
    `update td_countries set highlight_position = 4 where td_id = '${M}' and country_code = '${forte.country_code}'`)
  await expectOk('una destinazione di livello 1 in evidenza',
    `update td_countries set highlight_position = 1 where td_id = '${M}' and country_code = '${forte.country_code}'`)
  if (base) {
    await expectFail('una destinazione in evidenza di livello 2 non esiste',
      `update td_countries set highlight_position = 2 where td_id = '${M}' and country_code = '${base.country_code}'`,
      'highlight_is_level_1')
  } else fail('Marco senza paesi di livello 2: il test del vincolo non ha su cosa girare')
  const altroForte = paesi.find(p => p.level === 1 && p.country_code !== forte.country_code)
  if (altroForte) {
    await expectFail('due destinazioni nella stessa posizione',
      `update td_countries set highlight_position = 1 where td_id = '${M}' and country_code = '${altroForte.country_code}'`,
      'highlight_position')
  }
  await q(`update td_countries set highlight_position = null where td_id = '${M}'`)

  await expectFail('il prezzo «da» non sta su una consulenza',
    `update td_services set price_from_cents = 7000 where td_id = '${M}' and service_type = 'consultation'`,
    'price_from_after_call')
  await expectFail('il prezzo «da» non è negativo',
    `update td_services set price_from_cents = -1 where td_id = '${M}' and service_type = 'custom_itinerary'`)
  await expectOk('il prezzo «da» sull\'itinerario su misura',
    `update td_services set price_from_cents = 7000 where td_id = '${M}' and service_type = 'custom_itinerary'`)
  await expectFail('anni del recensore fuori scala',
    `update td_showcase_reviews set author_years = 101 where td_id = '${M}'`)
  await expectFail('paese del viaggio firma che la tassonomia non ha',
    `update td_signature_trips set country_code = 'atlantide' where td_id = '${M}'`)
}

console.log('\n== Vetrina v6: itinerari e gruppi nel dettaglio (0053) ==')
{
  const M = MARCO
  // Righe di prova proprie: quelle del demo (seed 0006) hanno già foto, paesi
  // e partenze, e le prove qui sotto non devono dipendere da loro.
  const it = (await q(`insert into td_ready_itineraries (td_id, position, title) values ('${M}', 88, 'Prova 0053 itinerario') returning id`)).rows[0].id
  const gt = (await q(`insert into td_group_trips (td_id, position, title) values ('${M}', 88, 'Prova 0053 gruppo') returning id`)).rows[0].id

  await expectFail('punteggio «fa per me» sopra 5', `update td_ready_itineraries set fit_nature = 6 where id = '${it}'`)
  await expectFail('notti negative', `update td_group_trips set nights = -1 where id = '${gt}'`)
  await expectFail('partecipanti minimi sopra i massimi',
    `update td_group_trips set participants_min = 10, participants_max = 6 where id = '${gt}'`, 'participants_order')
  await expectFail('una foto con due padri',
    `insert into td_trip_images (ready_itinerary_id, group_trip_id, position, storage_path)
     values ('${it}', '${gt}', 1, 'td-media/x.jpg')`, 'one_parent')
  await expectFail('una foto senza padre',
    `insert into td_trip_images (position, storage_path) values (1, 'td-media/x.jpg')`, 'one_parent')
  await expectOk('una foto per l\'itinerario e una per il gruppo, entrambe in posizione 1',
    `insert into td_trip_images (ready_itinerary_id, position, storage_path) values ('${it}', 1, 'td-media/marco-rossi/itinerario/a-1.jpg');
     insert into td_trip_images (group_trip_id, position, storage_path) values ('${gt}', 1, 'td-media/marco-rossi/gruppo/b-1.jpg')`)
  await expectFail('due foto nella stessa posizione',
    `insert into td_trip_images (ready_itinerary_id, position, storage_path) values ('${it}', 1, 'td-media/y.jpg')`)
  await expectFail('lo stesso paese due volte sullo stesso viaggio',
    `insert into td_trip_countries (ready_itinerary_id, position, country_code) values ('${it}', 1, 'giappone');
     insert into td_trip_countries (ready_itinerary_id, position, country_code) values ('${it}', 2, 'giappone')`)
  await expectFail('una tappa vuota',
    `insert into td_trip_stops (ready_itinerary_id, position, days_label, title, description) values ('${it}', 1, '1', ' ', null)`,
    'not_empty')
  await expectFail('una partenza che finisce prima di cominciare',
    `insert into td_group_trip_departures (group_trip_id, starts_on, ends_on) values ('${gt}', '2027-03-10', '2027-03-01')`,
    'departures_order')
  await expectFail('uno stato di partenza inventato',
    `insert into td_group_trip_departures (group_trip_id, starts_on, status) values ('${gt}', '2027-03-10', 'soldOut')`)

  for (const t of ['td_trip_images', 'td_trip_countries', 'td_trip_stops', 'td_group_trip_departures']) {
    const r = (await q(`select has_table_privilege('anon', $1, 'SELECT') as a,
                               has_table_privilege('authenticated', $1, 'SELECT') as u,
                               (select relrowsecurity from pg_class where relname = $1) as rls`, [t])).rows[0]
    !r.a && !r.u && r.rls ? ok(`${t}: RLS accesa e chiusa ad anon e authenticated`) : fail(`${t}: ${JSON.stringify(r)}`)
  }
  await q(`delete from td_ready_itineraries where id = '${it}'`)
  await q(`delete from td_group_trips where id = '${gt}'`)
}

console.log('\n== Vetrina v6: la superficie pubblica (0054) ==')
{
  const M = MARCO
  const VISTE = ['public_td_showcase', 'public_td_ready_itinerary', 'public_td_group_trip', 'public_td_reviews']

  // Le colonne chiuse non sono colonne di nessuna vista leggibile da anon…
  const CHIUSE_COLONNE = ['legal_name', 'axis_sides', 'card_phrases', 'card_phrases_status', 'highlight_position',
    'level', 'legal_coverage', 'group_trips_readiness', 'group_trips_timing', 'xpetis_note', 'td_terms_text',
    'author_years', 'joined_at', 'email', 'phone']
  const colonne = (await q(`
    select c.table_name, c.column_name from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name in (select relname from pg_class where relkind = 'v' and has_table_privilege('anon', oid, 'SELECT'))
       and c.column_name = any($1)`, [CHIUSE_COLONNE])).rows
    // geo_search.level è il livello della gerarchia geografica (città, regione,
    // paese), non il livello di copertura di un designer: vedi più sopra.
    .filter(c => !(c.table_name === 'geo_search' && c.column_name === 'level'))
  colonne.length === 0
    ? ok('nessuna vista leggibile da anon ha una colonna chiusa (nome anagrafico, assi, livelli, note, condizioni, anni…)')
    : fail('colonne chiuse esposte: ' + JSON.stringify(colonne))
  // …né le nomina dentro un jsonb. `joined_at` sì, ma solo per calcolarne gli
  // anni; `legal_name` pure, ma solo per il nome corto della 0056 (lì sotto c'è
  // la prova che il suo valore non esce).
  const CHIUSE_TESTO = ['axis_sides', 'card_phrases', 'highlight_position', 'legal_coverage',
    'group_trips_readiness', 'group_trips_timing', 'xpetis_note', 'td_terms_text', 'author_years']
  const defs = (await q(`select relname, pg_get_viewdef(oid) as d from pg_class
                          where relkind = 'v' and has_table_privilege('anon', oid, 'SELECT')`)).rows
  const perdite = defs.flatMap(v => CHIUSE_TESTO.filter(c => v.d.includes(c)).map(c => v.relname + '.' + c))
  perdite.length === 0
    ? ok('nessuna vista pubblica nomina le colonne chiuse, nemmeno dentro un jsonb')
    : fail('viste che nominano colonne chiuse: ' + JSON.stringify(perdite))
  for (const v of VISTE) {
    const r = (await q(`select has_table_privilege('anon', $1, 'SELECT') as a, has_table_privilege('authenticated', $1, 'SELECT') as u`, [v])).rows[0]
    r.a && r.u ? ok(`${v}: leggibile da anon e authenticated`) : fail(`${v}: ${JSON.stringify(r)}`)
  }

  // Un itinerario e un gruppo completi su Marco, con una nota XPETIS che non
  // deve uscire da nessuna parte.
  const SEGRETO = 'NOTA-RISERVATA-XPETIS-42'
  const it = (await q(`insert into td_ready_itineraries (td_id, position, title) values ('${M}', 89, 'Prova 0054 itinerario') returning id, slug`)).rows[0]
  const gt = (await q(`insert into td_group_trips (td_id, position, title) values ('${M}', 89, 'Prova 0054 gruppo') returning id, slug`)).rows[0]
  await q(`update td_ready_itineraries set intro = 'Racconto', nights = 11, price_note = 'volo incluso',
             main_stops = '{Tokyo,Kyoto}', price_includes = '{Hotel}', price_excludes = '{Visto}',
             packing_list = '{Scarpe}', health_visa_info = 'Nessun visto', fit_nature = 4,
             xpetis_note = '${SEGRETO}', td_terms_text = '${SEGRETO}' where id = '${it.id}'`)
  await q(`insert into td_trip_images (ready_itinerary_id, position, storage_path) values
             ('${it.id}', 2, 'td-media/marco-rossi/itinerario/seconda.jpg'),
             ('${it.id}', 1, 'td-media/marco-rossi/itinerario/copertina.jpg')`)
  await q(`insert into td_trip_countries (ready_itinerary_id, position, country_code) values
             ('${it.id}', 1, 'giappone'), ('${it.id}', 2, 'bangladesh')`)
  await q(`insert into td_trip_stops (ready_itinerary_id, position, days_label, title, description) values
             ('${it.id}', 2, '4-6', 'Kyoto', 'templi'), ('${it.id}', 1, '1-3', 'Tokyo', null)`)
  await q(`update td_group_trips set participants_min = 6, participants_max = 12, age_range = '25-40 anni',
             guide_name = 'Desiree', xpetis_note = '${SEGRETO}', td_terms_text = '${SEGRETO}' where id = '${gt.id}'`)
  const oggi = (await q(`select (now() at time zone 'Europe/Rome')::date as d`)).rows[0].d
  const giorni = async (n) => (await q(`select ((now() at time zone 'Europe/Rome')::date + $1::int)::text as d`, [n])).rows[0].d
  const ieri = await giorni(-1), fra10 = await giorni(10), fra20 = await giorni(20), fra30 = await giorni(30)
  await q(`insert into td_group_trip_departures (group_trip_id, starts_on, ends_on, status) values
             ('${gt.id}', '${ieri}', '${fra10}', 'confirmed'),
             ('${gt.id}', '${fra10}', '${fra20}', 'sold_out'),
             ('${gt.id}', '${fra30}', null, 'last_seats')`)

  const ri = (await q(`select * from public_td_ready_itinerary where td_slug = 'marco-rossi' and slug = $1`, [it.slug])).rows[0]
  ri && ri.images[0] === 'td-media/marco-rossi/itinerario/copertina.jpg' && ri.images.length === 2
    ? ok('dettaglio itinerario: le foto in ordine, la prima è la copertina')
    : fail('foto: ' + JSON.stringify(ri?.images))
  JSON.stringify(ri?.countries) === JSON.stringify(['Giappone', 'Bangladesh'])
    ? ok('dettaglio itinerario: i paesi del viaggio per nome, in ordine (anche uno dei dieci nuovi)')
    : fail('paesi: ' + JSON.stringify(ri?.countries))
  ri?.stops.map(s => s.days_label).join('|') === '1-3|4-6' && ri.nights === 11 && ri.main_stops.length === 2
    ? ok('dettaglio itinerario: tappe in ordine, notti, tappe principali')
    : fail('tappe: ' + JSON.stringify(ri?.stops))
  const rg = (await q(`select * from public_td_group_trip where td_slug = 'marco-rossi' and slug = $1`, [gt.slug])).rows[0]
  rg?.departures.length === 2 && rg.departures.every(d => d.starts_on >= String(oggi).slice(0, 10) || d.starts_on > ieri)
    && !rg.departures.some(d => d.starts_on === ieri)
    ? ok('dettaglio gruppo: solo le partenze future, la passata non esce')
    : fail('partenze: ' + JSON.stringify(rg?.departures))
  rg?.next_departure?.starts_on === fra30 && rg.next_departure.status === 'last_seats'
    ? ok('prossima partenza: la prima futura non sold out, anche se una sold out viene prima')
    : fail('prossima: ' + JSON.stringify(rg?.next_departure))
  rg?.participants_min === 6 && rg.participants_max === 12 && rg.age_range === '25-40 anni' && rg.guide_name === 'Desiree'
    ? ok('dettaglio gruppo: partecipanti, fascia d\'età, accompagnatore')
    : fail('gruppo: ' + JSON.stringify(rg))
  const tutto = JSON.stringify([ri, rg, (await q(`select * from public_td_showcase where slug = 'marco-rossi'`)).rows[0]])
  !tutto.includes(SEGRETO)
    ? ok('la nota XPETIS e le condizioni del designer non escono da nessuna vista')
    : fail('il testo chiuso è leggibile da una vista pubblica')

  const card = (await q(`select group_trips, ready_itineraries from public_td_showcase where slug = 'marco-rossi'`)).rows[0]
  const cg = card.group_trips.find(g => g.slug === gt.slug), ci = card.ready_itineraries.find(i => i.slug === it.slug)
  ci?.image_path === 'td-media/marco-rossi/itinerario/copertina.jpg' && ci.countries[0] === 'Giappone'
    ? ok('card itinerario: la copertina vera e i paesi del viaggio')
    : fail('card itinerario: ' + JSON.stringify(ci))
  cg?.next_departure?.starts_on === fra30 && cg.participants_max === 12
    ? ok('card gruppo: prossima partenza e partecipanti')
    : fail('card gruppo: ' + JSON.stringify(cg))

  await q(`update td_group_trip_departures set status = 'sold_out' where group_trip_id = '${gt.id}'`)
  const tuttiSoldOut = (await q(`select next_departure from public_td_group_trip where slug = $1 and td_slug = 'marco-rossi'`, [gt.slug])).rows[0]
  tuttiSoldOut.next_departure?.starts_on === fra10
    ? ok('tutte sold out: la prossima è la prima futura')
    : fail('sold out: ' + JSON.stringify(tuttiSoldOut))
  await q(`delete from td_group_trip_departures where group_trip_id = '${gt.id}' and starts_on >= '${fra10}'`)
  const nessuna = (await q(`select next_departure, departures from public_td_group_trip where slug = $1 and td_slug = 'marco-rossi'`, [gt.slug])).rows[0]
  nessuna.next_departure === null && nessuna.departures.length === 0
    ? ok('nessuna partenza futura: niente prossima partenza, mai una passata')
    : fail('nessuna futura: ' + JSON.stringify(nessuna))

  // Anni di appartenenza: compiuti, mai la data, mai negativi.
  const anni = async (sqlData) => {
    await q(`update travel_designers set joined_at = ${sqlData} where id = '${M}'`)
    return (await q(`select member_years from public_td_showcase where slug = 'marco-rossi'`)).rows[0].member_years
  }
  const originale = (await q(`select joined_at from travel_designers where id = '${M}'`)).rows[0].joined_at
  const a2 = await anni(`(now() at time zone 'Europe/Rome')::date - interval '2 years' - interval '1 day'`)
  const a1 = await anni(`(now() at time zone 'Europe/Rome')::date - interval '2 years' + interval '1 day'`)
  const a0 = await anni(`(now() at time zone 'Europe/Rome')::date + 30`)
  a2 === 2 && a1 === 1 && a0 === 0
    ? ok('member_years: anni compiuti (2, poi 1 il giorno prima dell\'anniversario), mai negativi')
    : fail(`member_years: ${a2} ${a1} ${a0}`)
  await q(`update travel_designers set joined_at = $1 where id = '${M}'`, [originale])

  // Il voto: solo verificate, solo sopra soglia, soglia letta da app_config.
  const st = (await q(`select reviews_count, avg_overall from td_review_stats where td_id = '${M}'`)).rows[0]
  const voto = async () => (await q(`select rating_avg from public_td_showcase where slug = 'marco-rossi'`)).rows[0].rating_avg
  if (st && Number(st.reviews_count) >= 1) {
    const v1 = await voto()
    Number(v1) === Number(st.avg_overall) ? ok(`voto con ${st.reviews_count} recensione/i verificata/e e soglia 1: ${v1}`) : fail('voto: ' + v1)
    await q(`update app_config set value = $1 where key = 'showcase_rating_min_reviews'`, [Number(st.reviews_count) + 1])
    ;(await voto()) === null ? ok('sotto soglia il voto non esce') : fail('voto sotto soglia esposto')
    await q(`delete from app_config where key = 'showcase_rating_min_reviews'`)
    ;(await voto()) === null ? ok('senza la riga di soglia il voto non esce') : fail('voto senza soglia esposto')
    await q(`insert into app_config (key, value, config_group, label_it) values ('showcase_rating_min_reviews', 1, 'showcase', 'x')`)
  } else {
    ;(await voto()) === null ? ok('nessuna recensione verificata: nessun voto') : fail('voto senza recensioni')
  }
  const giulia = (await q(`select rating_avg from public_td_showcase where slug = 'giulia-neri'`)).rows[0]
  const stG = (await q(`select count(*) from td_review_stats where td_id = '${GIULIA}'`)).rows[0]
  Number(stG.count) > 0 || giulia.rating_avg === null
    ? ok('le recensioni dichiarate non fanno media: chi ha solo quelle non ha voto')
    : fail('voto da recensioni dichiarate')

  // Le recensioni della vetrina.
  await q(`update td_showcase_reviews set is_published = true, author_years = 3 where td_id = '${M}' and position = 1`)
  const rec = (await q(`select * from public_td_reviews where td_slug = 'marco-rossi' and source = 'td_declared'`)).rows
  rec.length >= 1 && !('author_years' in rec[0]) && rec.every(r => r.stars >= 1)
    ? ok('public_td_reviews: le dichiarate pubblicate escono, con source td_declared e senza gli anni')
    : fail('recensioni: ' + JSON.stringify(rec))
  await q(`update td_showcase_reviews set is_published = false, author_years = null where td_id = '${M}'`)

  // Un designer in bozza non esce da nessuna delle viste nuove.
  const B = '99999999-0000-0000-0000-000000000054'
  await q(`insert into travel_designers (id, slug, display_name, email) values ('${B}', 'bozza-v6', 'Bozza', 'bozza@example.com')`)
  await q(`insert into td_ready_itineraries (td_id, position, title) values ('${B}', 1, 'Segreto in bozza')`)
  await q(`insert into td_group_trips (td_id, position, title) values ('${B}', 1, 'Gruppo in bozza')`)
  await q(`insert into td_showcase_reviews (td_id, position, author_name, stars, body, is_published)
           values ('${B}', 1, 'Qualcuno', 5, 'Bello', true)`)
  const bozza = (await q(`select (select count(*) from public_td_ready_itinerary where td_slug = 'bozza-v6')
                               + (select count(*) from public_td_group_trip where td_slug = 'bozza-v6')
                               + (select count(*) from public_td_reviews where td_slug = 'bozza-v6') as n`)).rows[0]
  Number(bozza.n) === 0 ? ok('un designer in bozza non esce da nessuna vista di dettaglio') : fail('bozza esposta: ' + bozza.n)

  // td_publish_blockers: i due motivi nuovi.
  await q(`insert into td_services (td_id, service_type, is_active, price_cents, duration_minutes, cal_event_type_slug)
           values ('${B}', 'consultation', false, null, 30, 'consulenza-xpetis-30'),
                  ('${B}', 'consultation_deep', true, 9000, 45, 'consulenza-xpetis-90')`)
  const bl = (await q(`select td_publish_blockers('${B}') as b`)).rows[0].b
  bl.some(b => b.startsWith('consulenza breve senza prezzo'))
    ? ok('blocco: consulenza breve senza prezzo') : fail('blocchi: ' + JSON.stringify(bl))
  bl.some(b => b.includes('durata di 45 minuti non ammessa (ammesse: 60, 90)'))
    ? ok('blocco: Sessione approfondita con una durata fuori elenco') : fail('blocchi: ' + JSON.stringify(bl))
  await q(`update td_services set duration_minutes = 90 where td_id = '${B}' and service_type = 'consultation_deep'`)
  !(await q(`select td_publish_blockers('${B}') as b`)).rows[0].b.some(b => b.includes('minuti non ammessa'))
    ? ok('Sessione da 90 minuti: nessun blocco sulla durata') : fail('90 minuti bloccati')
  const salvaMin = (await q(`select * from app_config where key = 'calcom_minutes_consultation_deep'`)).rows[0]
  await q(`delete from app_config where key = 'calcom_minutes_consultation_deep'`)
  ;(await q(`select td_publish_blockers('${B}') as b`)).rows[0].b.some(b => b.includes('manca app_config.calcom_minutes_consultation_deep'))
    ? ok('senza la riga delle durate la Sessione attiva è bloccata, e il motivo lo dice')
    : fail('riga delle durate assente e nessun blocco')
  await q(`insert into app_config (key, value, value_text, config_group, label_it) values ($1, null, $2, $3, $4)`,
          [salvaMin.key, salvaMin.value_text, salvaMin.config_group, salvaMin.label_it])
  const fn = (await q(`select has_function_privilege('anon', 'calcom_expected_minutes(service_type)', 'EXECUTE') as a`)).rows[0]
  !fn.a ? ok('calcom_expected_minutes(): chiusa ad anon') : fail('calcom_expected_minutes aperta')
  await q(`delete from travel_designers where id = '${B}'`)

  // Le righe di app_config: i testi della vetrina passano da public_config, la
  // soglia del voto pure; le condizioni dei gruppi nascono vuote.
  const cfg = (await q(`select key, value, value_text from public_config
                         where key in ('showcase_rating_min_reviews', 'showcase_declared_reviews_note',
                                       'ready_itinerary_price_prefix', 'group_trip_price_prefix',
                                       'group_trip_terms_text', 'showcase_price_on_request')`)).rows
  cfg.length === 6 && cfg.find(c => c.key === 'group_trip_terms_text').value_text === ''
    ? ok('le sei righe showcase della vetrina v6 sono in public_config; group_trip_terms_text nasce vuota')
    : fail('righe showcase: ' + JSON.stringify(cfg))

  // Pulizia: Marco torna com'era per chi viene dopo.
  await q(`delete from td_ready_itineraries where id = '${it.id}'`)
  await q(`delete from td_group_trips where id = '${gt.id}'`)
  await q(`update td_services set price_from_cents = 9000 where td_id = '${M}' and service_type = 'custom_itinerary'`)
  await q(`update travel_designers set axis_sides = null, card_phrases = null, card_phrases_status = null,
             legal_name = null where id = '${M}'`)
}

console.log('\n== L\'importatore delle vetrine v6 (0055) ==')
{
  const imp = await import(path.join(root, 'scripts', 'importa_vetrina.mjs'))
  const LUCA = path.join(root, '..', 'vetrina-luca-ferraina')
  const URL_FINTO = (p) => 'https://progetto.supabase.co/storage/v1/object/public/' + p
  const prepara = (cartella, slug, email = null) => {
    const letto = imp.leggiPacchetto(cartella)
    return imp.preparaImport(letto.json, { cartella, slug, email, urlPubblica: URL_FINTO })
  }
  const importa = async (payload, scrivi) =>
    (await q('select td_import_showcase($1::jsonb, $2) as r', [JSON.stringify(payload), scrivi])).rows[0].r
  const archivio = async () => Number((await q('select count(*) from td_import_runs')).rows[0].count)
  const tdId = async (slug) => (await q('select id from travel_designers where slug = $1', [slug])).rows[0]?.id

  // ------------------------------------------------ il formato vecchio
  for (const [nome, cartella] of [['Dennis', path.join(root, '..', 'vetrina-dennis-milello')]]) {
    const { payload } = prepara(cartella, 'dennis-milello', 'dennis@example.com')
    payload.errors.some(e => e.startsWith('Formato vecchio'))
      ? ok(`${nome}: formato vecchio riconosciuto dallo script («riesportalo dal tool v6»)`)
      : fail(`${nome}: ${JSON.stringify(payload.errors)}`)
    const r = await importa(payload, true)
    const runs = (await q(`select outcome from td_import_runs where td_slug = 'dennis-milello'`)).rows
    r.esito === 'rifiutato' && !(await tdId('dennis-milello')) && runs.length === 1 && runs[0].outcome === 'rifiutato'
      ? ok(`${nome} con --scrivi: rifiutato, nessun designer creato, il rifiuto è in archivio`)
      : fail(`${nome}: ${JSON.stringify(r)} ${JSON.stringify(runs)}`)
  }
  {
    const vecchio = JSON.parse(readFileSync(path.join(root, '..', 'vetrina_nuova.json'), 'utf8'))
    const { payload } = imp.preparaImport(vecchio, { cartella: path.join(root, '..'), slug: 'x' })
    payload.errors.some(e => e.startsWith('Formato vecchio'))
      ? ok('vetrina_nuova.json (form vecchio): rifiutato anche lui') : fail(JSON.stringify(payload.errors))
  }

  // ------------------------------------------------ Luca: prova a secco
  const { payload: luca, foto } = prepara(LUCA, 'luca-ferraina', 'luca@example.com')
  luca.errors.length === 0 ? ok('Luca: nessun errore lato script') : fail('Luca: ' + JSON.stringify(luca.errors))
  foto.size === 22 && [...foto.keys()].every(p => /^td-media\/luca-ferraina\/(profilo|firma|itinerario|gruppo)\/[0-9a-f]{16}\.(jpg|png|webp)$/.test(p))
    ? ok('foto: 22 percorsi nostri (td-media/<designer>/<tipo>/<impronta>.<ext>), niente del percorso originale')
    : fail('foto: ' + JSON.stringify([...foto.keys()]))
  const prima = await archivio()
  const secco = await importa(luca, false)
  secco.esito === 'ok' && secco.nuovo && secco.modifiche > 0 && !(await tdId('luca-ferraina')) && (await archivio()) === prima
    ? ok(`prova a secco: ${secco.modifiche} modifiche previste, niente scritto, archivio intatto`)
    : fail('prova a secco: ' + JSON.stringify(secco).slice(0, 300))
  secco.gruppi?.length === 7 && secco.gruppi[0].slug === 'vietnam-ha-giang-loop-e-la-magia-del-nord'
    ? ok('la prova a secco dice gli slug che le voci prenderanno') : fail('slug: ' + JSON.stringify(secco.gruppi))

  const senzaEmail = await importa({ ...luca, email: null }, false)
  senzaEmail.esito === 'rifiutato' && senzaEmail.errori.some(e => e.includes('serve --email'))
    ? ok('designer nuovo senza --email: rifiutato') : fail(JSON.stringify(senzaEmail.errori))

  // ------------------------------------------------ Luca: scrittura
  const scritto = await importa(luca, true)
  const L = await tdId('luca-ferraina')
  scritto.esito === 'ok' && scritto.scritto && L ? ok('scrittura: Luca importato') : fail('scrittura: ' + JSON.stringify(scritto).slice(0, 400))
  const td = (await q(`select * from travel_designers where id = $1`, [L])).rows[0]
  td.status === 'draft' && td.display_name === 'Luca Ferraina' && td.legal_name === 'Luca Ferraina'
    && td.instagram_handle === 'pianetaferra' && td.years_experience === 6 && td.languages.length === 4
    && td.photo_url.startsWith('https://progetto.supabase.co/storage/v1/object/public/td-media/luca-ferraina/profilo/')
    && td.axis_sides.ritmo === 'dynamic' && td.card_phrases.chiusura && td.legal_coverage.startsWith('Ho già')
    ? ok('profilo: in bozza, nome, Instagram senza @, anni, lingue, foto, campi chiusi')
    : fail('profilo: ' + JSON.stringify(td).slice(0, 500))

  const paesi = (await q(`select country_code, level, highlight_position from td_countries where td_id = $1 order by country_code`, [L])).rows
  const forti = paesi.filter(p => p.level === 1).map(p => `${p.country_code}:${p.highlight_position}`).join(' ')
  paesi.length === 7 && forti === 'filippine:2 thailandia:3 vietnam:1'
    ? ok('livelli: le tre in evidenza sono di livello 1, nell\'ordine del pacchetto; gli altri quattro (tutti «Base») di livello 2')
    : fail('paesi: ' + JSON.stringify(paesi))
  const tagVietnam = Number((await q(`select count(*) from td_destination_tags where td_id = $1 and country_code = 'vietnam'`, [L])).rows[0].count)
  tagVietnam === 13 ? ok('tag del Vietnam: 7 temi e 6 contesti, tutti agganciati') : fail('tag Vietnam: ' + tagVietnam)

  const assi = (await q(`select axis_code, array_agg(value order by value) as v from td_axis_values where td_id = $1 group by axis_code order by 1`, [L])).rows
  const assiStr = assi.map(a => `${a.axis_code}=${a.v.join(',')}`).join(' ')
  assiStr === 'comfort_wild=4 companions=1,2 curated_vs_real=1 pace=3 planning_involvement=2 social_orientation=3'
    ? ok('assi: i cinque valori e «con chi viaggi» (solo, coppia), controprova passata')
    : fail('assi: ' + assiStr)

  const sv = (await q(`select service_type, is_active, price_cents, price_from_cents, duration_minutes, cal_event_type_slug,
                              (select count(*) from td_service_bullets b where b.service_id = s.id)::int as punti
                         from td_services s where td_id = $1 order by sort_order`, [L])).rows
  const s = Object.fromEntries(sv.map(x => [x.service_type, x]))
  s.consultation?.price_cents === 3000 && s.consultation.duration_minutes === 30 && s.consultation.cal_event_type_slug === 'consulenza-xpetis-30'
    && s.consultation.is_active && s.consultation.punti === 4
    ? ok('consulenza breve: 30€, 30 minuti, consulenza-xpetis-30, attiva, quattro punti') : fail('breve: ' + JSON.stringify(s.consultation))
  s.consultation_deep?.price_cents === 9000 && s.consultation_deep.duration_minutes === 90
    && s.consultation_deep.cal_event_type_slug === 'consulenza-xpetis-90' && s.consultation_deep.is_active
    ? ok('Sessione approfondita: 90€, 90 minuti, consulenza-xpetis-90') : fail('approfondita: ' + JSON.stringify(s.consultation_deep))
  s.custom_itinerary?.price_from_cents === 7000 && s.custom_itinerary.price_cents === null
    && ['all_inclusive', 'group_trip', 'private_guiding'].every(t => s[t]?.is_active)
    ? ok('servizi dopo la call: i quattro attivi; «da 70€» in price_from_cents, non in price_cents (D5)')
    : fail('dopo la call: ' + JSON.stringify(sv))

  const firma = (await q(`select title, country_code, (select count(*) from td_signature_trip_images i where i.trip_id = t.id)::int as foto
                            from td_signature_trips t where td_id = $1 order by position`, [L])).rows
  firma.length === 3 && firma.every(f => f.foto === 3) && firma.map(f => f.country_code).join(',') === 'vietnam,filippine,thailandia'
    ? ok('viaggi firma: tre, ognuno col suo paese e tre foto') : fail('firma: ' + JSON.stringify(firma))

  const g = (await q(`select g.title, g.position, g.participants_min, g.participants_max, g.age_range, g.xpetis_note, g.td_terms_text,
                             (select string_agg(d.status, ',' order by d.starts_on) from td_group_trip_departures d where d.group_trip_id = g.id) as stati,
                             (select count(*) from td_trip_images i where i.group_trip_id = g.id)::int as foto,
                             (select count(*) from td_trip_stops t where t.group_trip_id = g.id)::int as tappe
                        from td_group_trips g where td_id = $1 order by position`, [L])).rows
  g.length === 7 && g[0].stati === 'sold_out,open,open' && g[0].participants_max === 15 && g[0].participants_min === null
    && g[3].participants_min === 6 && g[5].age_range === '18-50 anni' && g[0].xpetis_note && g[0].td_terms_text
    && g[0].tappe === 7 && g.every(x => x.foto === 1)
    ? ok('viaggi di gruppo: sette, con partenze e stati, partecipanti, fascia d\'età, tappe, foto, e i due testi chiusi')
    : fail('gruppi: ' + JSON.stringify(g).slice(0, 600))
  const it = (await q(`select title, nights, fit_on_the_road, price_includes,
                              (select string_agg(country_code, ',' order by position) from td_trip_countries c where c.ready_itinerary_id = r.id) as paesi
                         from td_ready_itineraries r where td_id = $1 order by position`, [L])).rows
  it.length === 2 && it[0].nights === 11 && it[0].fit_on_the_road === 5 && it[0].paesi === 'laos,thailandia' && it[0].price_includes.length === 3
    ? ok('itinerari: due, con notti, punteggi, quota e i paesi del viaggio') : fail('itinerari: ' + JSON.stringify(it))
  const rec = (await q(`select author_name, stars, is_published from td_showcase_reviews where td_id = $1 order by position`, [L])).rows
  rec.length === 2 && rec.every(r => r.is_published && r.stars === 5)
    ? ok('recensioni dichiarate: due, pubblicate all\'import (D3)') : fail('recensioni: ' + JSON.stringify(rec))
  const run = (await q(`select outcome, raw ? 'frasiCard' as raw_ok, report->>'esito' as esito from td_import_runs where td_slug = 'luca-ferraina'`)).rows
  run.length === 1 && run[0].outcome === 'scritto' && run[0].raw_ok
    ? ok('archivio: una riga «scritto» col JSON grezzo intero') : fail('archivio: ' + JSON.stringify(run))

  // ------------------------------------------------ secondo lancio: niente cambia
  const fotografia = async () => (await q(`
    select md5(string_agg(x, '|' order by x)) as h from (
      select to_jsonb(t)::text as x from travel_designers t where id = $1
      union all select to_jsonb(c)::text from td_countries c where td_id = $1
      union all select to_jsonb(d)::text from td_destination_tags d where td_id = $1
      union all select to_jsonb(a)::text from td_axis_values a where td_id = $1
      union all select to_jsonb(s)::text from td_services s where td_id = $1
      union all select to_jsonb(b)::text from td_service_bullets b join td_services s on s.id = b.service_id where s.td_id = $1
      union all select to_jsonb(f)::text from td_signature_trips f where td_id = $1
      union all select to_jsonb(i)::text from td_signature_trip_images i join td_signature_trips f on f.id = i.trip_id where f.td_id = $1
      union all select to_jsonb(r)::text from td_ready_itineraries r where td_id = $1
      union all select to_jsonb(g)::text from td_group_trips g where td_id = $1
      union all select to_jsonb(i)::text from td_trip_images i
                 where ready_itinerary_id in (select id from td_ready_itineraries where td_id = $1)
                    or group_trip_id in (select id from td_group_trips where td_id = $1)
      union all select to_jsonb(c)::text from td_trip_countries c
                 where ready_itinerary_id in (select id from td_ready_itineraries where td_id = $1)
                    or group_trip_id in (select id from td_group_trips where td_id = $1)
      union all select to_jsonb(t)::text from td_trip_stops t
                 where ready_itinerary_id in (select id from td_ready_itineraries where td_id = $1)
                    or group_trip_id in (select id from td_group_trips where td_id = $1)
      union all select to_jsonb(d)::text from td_group_trip_departures d
                 where group_trip_id in (select id from td_group_trips where td_id = $1)
      union all select to_jsonb(r)::text from td_showcase_reviews r where td_id = $1) z`, [L])).rows[0].h
  const h1 = await fotografia()
  const di_nuovo = await importa(luca, true)
  const h2 = await fotografia()
  di_nuovo.esito === 'ok' && di_nuovo.modifiche === 0 && h1 === h2
    ? ok('secondo lancio sullo stesso pacchetto: zero modifiche, tutte le righe identiche (updated_at compresi)')
    : fail(`secondo lancio: ${di_nuovo.modifiche} modifiche, righe ${h1 === h2 ? 'uguali' : 'diverse'}`)

  // ------------------------------------------------ cosa non tocca mai
  await q(`update travel_designers set phone = '+39 333', cal_username = 'luca-ferraina-xpetis',
                  cal_webhook_ok_at = now(), joined_at = '2025-02-01', email = 'vera@example.com' where id = $1`, [L])
  await importa({ ...luca, email: 'altra@example.com' }, true)
  const intatto = (await q(`select status, phone, cal_username, joined_at::text, email, cal_webhook_ok_at is not null as wh
                              from travel_designers where id = $1`, [L])).rows[0]
  intatto.status === 'draft' && intatto.phone === '+39 333' && intatto.cal_username === 'luca-ferraina-xpetis'
    && intatto.joined_at === '2025-02-01' && intatto.email === 'vera@example.com' && intatto.wh
    ? ok('reimport: stato, telefono, Cal.com, joined_at ed email non si toccano') : fail('toccati: ' + JSON.stringify(intatto))

  // ------------------------------------------------ un prezzo cambiato non si sovrascrive
  {
    const p = structuredClone(luca)
    p.services.find(x => x.type === 'consultation').price_cents = 4000
    const r = await importa(p, true)
    const prezzo = (await q(`select price_cents from td_services where td_id = $1 and service_type = 'consultation'`, [L])).rows[0].price_cents
    r.avvisi.some(a => a.includes('prezzo nel database 3000 centesimi, nel pacchetto 4000. Non sovrascritto')) && prezzo === 3000
      ? ok('prezzo della breve cambiato nel pacchetto: report, e nel database resta 30€')
      : fail('prezzo: ' + prezzo + ' ' + JSON.stringify(r.avvisi))
  }

  // ------------------------------------------------ voci rinominate, sparite, riordinate
  {
    const p = structuredClone(luca)
    const slugPrima = (await q(`select title, slug from td_group_trips where td_id = $1 order by position`, [L])).rows
    p.itineraries[0].title = 'Brasile: Rio e Ilha Grande'             // un titolo cambiato davvero
    p.group_trips = [p.group_trips[2], p.group_trips[0], ...p.group_trips.slice(3)]  // via il secondo, primi due scambiati
    const r = await importa(p, true)
    const dopo = (await q(`select title, slug, position from td_group_trips where td_id = $1 order by position`, [L])).rows
    const itin = (await q(`select slug from td_ready_itineraries where td_id = $1 order by position`, [L])).rows.map(x => x.slug)
    const slugDi = (rows, t) => rows.find(x => x.title === t)?.slug
    r.esito === 'ok' && dopo.length === 6 && dopo[0].title.startsWith('Filippine') && dopo[1].title.startsWith('Vietnam')
      && slugDi(dopo, p.group_trips[0].title) === slugDi(slugPrima, p.group_trips[0].title)
      && slugDi(dopo, p.group_trips[1].title) === slugDi(slugPrima, p.group_trips[1].title)
      && !dopo.some(x => x.title === 'Avventura e relax in Thailandia del Sud')
      ? ok('voci riordinate: lo slug segue il titolo, non la posizione; la voce sparita non c\'è più')
      : fail('riordino: ' + JSON.stringify(dopo))
    itin[0] === 'brasile-rio-e-ilha-grande'
      ? ok('titolo cambiato: è una voce nuova con uno slug nuovo, il vecchio indirizzo non risponde più')
      : fail('slug itinerario: ' + JSON.stringify(itin))
    const vecchio = (await q(`select count(*) from td_ready_itineraries where td_id = $1 and slug = 'brasile-rio-de-janeiro'`, [L])).rows[0]
    Number(vecchio.count) === 0 ? ok('nessuna riga risponde più allo slug vecchio') : fail('slug vecchio ancora presente')
    await importa(luca, true) // torna come il pacchetto
  }

  // ------------------------------------------------ i rifiuti
  {
    const p = structuredClone(luca)
    p.group_trips[0].countries = ['atlantide']
    p.signature_trips[0].country_code = 'lemuria'
    const h = await fotografia()
    const r = await importa(p, true)
    r.esito === 'rifiutato' && r.errori.some(e => e === 'Paesi che la tassonomia non ha: atlantide, lemuria') && (await fotografia()) === h
      ? ok('paese sconosciuto: rifiutato con l\'elenco completo, niente toccato') : fail('paese: ' + JSON.stringify(r.errori))
  }
  {
    const p = structuredClone(luca)
    p.axes.find(a => a.axis === 'curated_vs_real').side = 'vita reale'   // valore 1, cioè «Estetica curata»
    const r = await importa(p, false)
    r.esito === 'rifiutato' && r.errori.some(e => e.startsWith('Asse curated_vs_real: il valore 1 sta dal lato «Estetica curata»'))
      ? ok('asse in contraddizione con assiLato: l\'import si ferma con l\'asse e i due valori') : fail('asse: ' + JSON.stringify(r.errori))
  }
  {
    const p = structuredClone(luca)
    p.td.legal_coverage = 'Ho un\'agenzia'
    const r = await importa(p, false)
    r.esito === 'rifiutato' && r.errori[0].includes('legal_coverage')
      ? ok('copertura legale con parole diverse dal form: rifiutato in modo visibile') : fail('copertura: ' + JSON.stringify(r.errori))
  }
  {
    const p = structuredClone(luca)
    p.services.find(x => x.type === 'consultation_deep').minutes = 45
    p.services.find(x => x.type === 'consultation_deep').minutes_label = '45 minuti'
    const r = await importa(p, false)
    r.esito === 'ok' && r.avvisi.some(a => a.startsWith('Sessione approfondita: durata «45 minuti» non ammessa (ammesse: 60, 90)'))
      ? ok('Sessione da 45 minuti: quel servizio si ferma con un messaggio, il resto passa') : fail('45: ' + JSON.stringify(r.avvisi))
  }

  // ------------------------------------------------ un designer nuovo col prezzo illeggibile
  {
    const j = structuredClone(JSON.parse(readFileSync(path.join(LUCA, 'vetrina.json'), 'utf8')))
    j.callPrezzo = 'trenta'
    j.nomeProfessionale = 'Pianeta Ferra'
    j.fotoProfilo = 'https://xyz.supabase.co/storage/v1/object/public/vetrine-td/CODICE-SEGRETO/pacchetto/foto.jpg'
    j.chiaveDelFuturo = 'qualcosa'
    j.paesi.forEach(x => { x.livello = 'Base' })
    j.topDestinazioniId = []
    const { payload: p } = imp.preparaImport(j, { cartella: LUCA, slug: 'pianeta-ferra', email: 'p@example.com', urlPubblica: URL_FINTO })
    p.warnings.some(a => a.startsWith('callPrezzo «trenta» non si legge'))
      && p.warnings.some(a => a.includes('foto con URL assoluto (xyz.supabase.co…)') && !a.includes('CODICE-SEGRETO'))
      && p.warnings.some(a => a.startsWith('Chiave sconosciuta «chiaveDelFuturo»'))
      && p.warnings.some(a => a.startsWith('Nessun paese di livello 1'))
      ? ok('report: prezzo illeggibile, URL assoluto (senza il codice segreto), chiave sconosciuta, nessun livello 1')
      : fail('avvisi: ' + JSON.stringify(p.warnings))
    const r = await importa(p, true)
    const P = await tdId('pianeta-ferra')
    const nuovo = (await q(`select display_name, legal_name, photo_url from travel_designers where id = $1`, [P])).rows[0]
    const breve = (await q(`select is_active, price_cents from td_services where td_id = $1 and service_type = 'consultation'`, [P])).rows[0]
    nuovo?.display_name === 'Pianeta Ferra' && nuovo.legal_name === 'Luca Ferraina' && nuovo.photo_url === null
      ? ok('nome professionale in pagina, nome anagrafico chiuso, nessuna foto da un URL assoluto (D8)')
      : fail('nuovo: ' + JSON.stringify(nuovo))
    breve && !breve.is_active && breve.price_cents === null
      && r.blocchi_pubblicazione.includes('consulenza breve senza prezzo: la cassa non si può aprire')
      && r.blocchi_pubblicazione.includes('nessun paese di livello 1: il designer non prenderebbe mai il badge')
      ? ok('breve senza prezzo: creata spenta, e i blocchi alla pubblicazione lo dicono')
      : fail('breve: ' + JSON.stringify(breve) + ' ' + JSON.stringify(r.blocchi_pubblicazione))
    await q(`delete from travel_designers where id = $1`, [P])
  }

  // ------------------------------------------------ chiusure
  {
    const f = (await q(`select has_function_privilege('anon', 'td_import_showcase(jsonb, boolean)', 'EXECUTE') as a,
                               has_function_privilege('authenticated', 'td_import_showcase(jsonb, boolean)', 'EXECUTE') as u,
                               has_function_privilege('service_role', 'td_import_showcase(jsonb, boolean)', 'EXECUTE') as s`)).rows[0]
    !f.a && !f.u && f.s ? ok('td_import_showcase(): solo service_role') : fail('privilegi import: ' + JSON.stringify(f))
    const t = (await q(`select has_table_privilege('anon', 'td_import_runs', 'SELECT') as a,
                               has_table_privilege('authenticated', 'td_import_runs', 'SELECT') as u,
                               (select relrowsecurity from pg_class where relname = 'td_import_runs') as rls`)).rows[0]
    !t.a && !t.u && t.rls ? ok('td_import_runs: RLS accesa, chiusa ad anon e authenticated') : fail('archivio: ' + JSON.stringify(t))
  }

  await q(`delete from travel_designers where slug = 'luca-ferraina'`)
  await q(`delete from td_import_runs`)
}


console.log('\n== Il nome corto delle frasi (0056) ==')
{
  const M = MARCO
  const salva = (await q(`select display_name, legal_name from travel_designers where id = '${M}'`)).rows[0]
  const corto = async () => (await q(`select * from public_td_showcase where slug = 'marco-rossi'`)).rows[0]
  await q(`update travel_designers set display_name = 'Studio Viaggi Lenti', legal_name = 'Marco Anagrafico Rossi' where id = '${M}'`)
  const a = await corto()
  a.short_name === 'Studio Viaggi Lenti' && !JSON.stringify(a).includes('Anagrafico')
    ? ok('nome professionale: le frasi lo usano intero, e il nome anagrafico non esce dalla vista (D8)')
    : fail('professionale: ' + a.short_name)
  await q(`update travel_designers set display_name = 'Marco Rossi', legal_name = 'Marco Rossi' where id = '${M}'`)
  const b = await corto()
  await q(`update travel_designers set legal_name = null where id = '${M}'`)
  const c = await corto()
  b.short_name === 'Marco' && c.short_name === 'Marco'
    ? ok('nome anagrafico in pagina, o nessun nome anagrafico: la prima parola, come nel tool')
    : fail(`nome corto: ${b.short_name} ${c.short_name}`)
  await q(`update travel_designers set display_name = $1, legal_name = $2 where id = '${M}'`, [salva.display_name, salva.legal_name])
}


console.log('\n== I demo sulla struttura v6 (seed 0006) ==')
{
  const M = MARCO, G = GIULIA
  const oggi = (await q(`select (now() at time zone 'Europe/Rome')::date::text as d`)).rows[0].d
  // Lo stato dei due demo, senza gli id: le figlie si riscrivono a ogni giro e
  // cambiano id, ma il contenuto deve restare identico.
  const stato = async () => (await q(`
    select md5(string_agg(x, '|' order by x)) as h from (
      select (to_jsonb(t) - 'updated_at')::text as x from travel_designers t where id in ($1, $2)
      union all select (to_jsonb(s) - 'id')::text from td_services s where td_id in ($1, $2)
      union all select (to_jsonb(b) - 'id' - 'service_id')::text || s.service_type || s.td_id
                  from td_service_bullets b join td_services s on s.id = b.service_id where s.td_id in ($1, $2)
      union all select (to_jsonb(r) - 'id' - 'updated_at' - 'created_at')::text from td_ready_itineraries r where td_id in ($1, $2)
      union all select (to_jsonb(g) - 'id' - 'updated_at' - 'created_at')::text from td_group_trips g where td_id in ($1, $2)
      union all select (to_jsonb(i) - 'id' - 'ready_itinerary_id' - 'group_trip_id')::text || coalesce(r.slug, g.slug)
                  from td_trip_images i left join td_ready_itineraries r on r.id = i.ready_itinerary_id
                  left join td_group_trips g on g.id = i.group_trip_id
                 where coalesce(r.td_id, g.td_id) in ($1, $2)
      union all select (to_jsonb(d) - 'id' - 'group_trip_id')::text || g.slug
                  from td_group_trip_departures d join td_group_trips g on g.id = d.group_trip_id where g.td_id in ($1, $2)
      union all select (to_jsonb(v) - 'created_at')::text from td_showcase_reviews v where td_id in ($1, $2)) z`, [M, G])).rows[0].h
  // Le prove di prima hanno toccato i demo: un giro di seed li riporta allo
  // stato voluto, e il secondo giro non deve cambiare niente.
  await db.exec(readFileSync(path.join(root, 'seed', '0006_demo_v6.sql'), 'utf8'))
  const prima = await stato()
  await db.exec(readFileSync(path.join(root, 'seed', '0006_demo_v6.sql'), 'utf8'))
  prima === await stato()
    ? ok('seed 0006 rilanciato: stesso stato dei due demo (convergente)')
    : fail('seed 0006 non convergente')

  const vm = (await q(`select * from public_td_showcase where slug = 'marco-rossi'`)).rows[0]
  const tipi = vm.services.map(x => x.service_type).sort().join(',')
  tipi === 'all_inclusive,consultation,consultation_deep,custom_itinerary,group_trip,private_guiding'
    && vm.services.find(x => x.service_type === 'custom_itinerary').price_from_cents === 9000
    && vm.travel_philosophy && vm.expertise_areas && vm.signature_trips.slice(0, 3).every(t => t.country)
    ? ok('Marco: Sessione, i quattro servizi dopo la call con «da 90€», testo di «viaggiare per me», viaggi firma col paese')
    : fail('Marco: ' + JSON.stringify({ tipi, f: vm.signature_trips.map(t => t.country) }))
  // Le tre del seed (posizioni 1-3); le prove di prima ne aggiungono altre.
  const rm = (await q(`select count(*)::int as n from public_td_reviews
                        where td_slug = 'marco-rossi' and source = 'td_declared' and position <= 3`)).rows[0].n
  rm === 3 ? ok('Marco: tre recensioni dichiarate in vetrina') : fail('recensioni di Marco: ' + rm)

  const it1 = (await q(`select * from public_td_ready_itinerary where td_slug = 'marco-rossi' order by position limit 1`)).rows[0]
  it1.images.length === 4 && it1.stops.length === 5 && it1.price_includes.length > 0 && it1.fit_nature > 0
    && it1.countries[0] === 'Vietnam' && it1.health_visa_info
    ? ok('Marco: un itinerario completo in ogni campo (4 foto, 5 tappe, quota, fa per me, paese, visti)')
    : fail('itinerario completo: ' + JSON.stringify(it1).slice(0, 300))
  const it3 = (await q(`select * from public_td_ready_itinerary where td_slug = 'marco-rossi' order by position offset 2 limit 1`)).rows[0]
  it3.images.length === 0 && it3.price_label === null
    ? ok('Marco: un itinerario senza foto né prezzo («Prezzo su richiesta»)') : fail('itinerario vuoto: ' + JSON.stringify(it3).slice(0, 200))

  const gr = (await q(`select slug, departures, next_departure, participants_min, participants_max
                         from public_td_group_trip where td_slug = 'marco-rossi' order by position`)).rows
  const attese = [['2026-03-07', 'confirmed'], ['2026-11-14', 'sold_out'], ['2027-03-06', 'last_seats'], ['2027-10-09', 'open']]
    .filter(([d]) => d >= oggi)
  JSON.stringify(gr[0].departures.map(d => [d.starts_on, d.status])) === JSON.stringify(attese)
    ? ok(`Marco, primo gruppo: delle quattro partenze escono solo le ${attese.length} future (la passata no)`)
    : fail('partenze: ' + JSON.stringify(gr[0].departures))
  const prossimaAttesa = attese.find(([, st]) => st !== 'sold_out')?.[0] ?? attese[0]?.[0] ?? null
  ;(gr[0].next_departure?.starts_on ?? null) === prossimaAttesa
    ? ok('Marco, primo gruppo: la prossima partenza salta la sold out: ' + prossimaAttesa)
    : fail('prossima: ' + JSON.stringify(gr[0].next_departure))
  gr[1].participants_min === null && gr[1].participants_max === 10
    && gr[2].departures.length === 0 && gr[2].next_departure === null
    ? ok('Marco: un gruppo col solo massimo dei partecipanti, uno con le sole partenze passate (nessuna in pagina)')
    : fail('gruppi: ' + JSON.stringify(gr.slice(1)))

  const vg = (await q(`select * from public_td_showcase where slug = 'giulia-neri'`)).rows[0]
  const rg = (await q(`select count(*)::int as n from public_td_reviews where td_slug = 'giulia-neri'`)).rows[0].n
  vg.ready_itineraries.length === 0 && vg.group_trips.length === 0 && rg === 0
    && !vg.services.some(x => x.service_type === 'consultation_deep')
    ? ok('Giulia: demo minimo, senza Sessione, itinerari, gruppi e recensioni')
    : fail('Giulia: ' + JSON.stringify({ it: vg.ready_itineraries.length, gr: vg.group_trips.length, rg, s: vg.services.map(x => x.service_type) }))
  const bl = (await q(`select td_publish_blockers($1) as b`, [G])).rows[0].b
  bl.length === 0 ? ok('Giulia minima resta pubblicabile: nessun blocco') : fail('blocchi di Giulia: ' + JSON.stringify(bl))
}


console.log('\n== La ricerca senza regioni e senza punteggiatura (0057, 0058) ==')
{
  // Il testo come lo prepara il browser (`normalizzaRicerca`, lib/geo.ts).
  const cerca = async (testo) => {
    const n = testo.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    return (await q(`select level, name_it from geo_search where name_norm like $1 order by level, name_it`, ['%' + n + '%'])).rows
  }
  const sea = await cerca('sud est asiatico')
  const seaTrattino = await cerca('Sud-Est')
  sea.some(r => r.level === 'macro_area' && r.name_it.includes('Sud-Est Asiatico'))
    && seaTrattino.some(r => r.level === 'macro_area' && r.name_it.includes('Sud-Est Asiatico'))
    ? ok('«sud est asiatico» e «Sud-Est» trovano la macro-area «…Sud-Est Asiatico» (era il difetto)')
    : fail('sud est: ' + JSON.stringify(sea))
  const ci = await cerca("costa d'avorio")
  ci.length === 1 && ci[0].name_it === "Costa d'Avorio"
    ? ok("l'apostrofo non conta: «costa d'avorio» trova la Costa d'Avorio") : fail('costa: ' + JSON.stringify(ci))
  const bb = await cerca('barbados')
  bb.length === 1 && bb[0].level === 'country'
    ? ok('«barbados» compare una volta sola, come paese: niente più eco della regione omonima')
    : fail('barbados: ' + JSON.stringify(bb))
  const to = await cerca('toscana')
  to.length === 0 ? ok('«toscana» non trova niente: le regioni italiane non ci sono più') : fail('toscana: ' + JSON.stringify(to))
  const f = (await q(`select has_function_privilege('anon', 'nome_cercabile(text)', 'EXECUTE') as a`)).rows[0]
  !f.a ? ok('nome_cercabile(): chiusa ad anon (la usano solo le colonne generate)') : fail('nome_cercabile aperta')
}

console.log(failures === 0 ? '\nTutto verde.\n' : `\n${failures} asserzioni fallite.\n`)
process.exit(failures === 0 ? 0 : 1)
