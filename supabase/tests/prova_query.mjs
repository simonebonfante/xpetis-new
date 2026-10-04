// Prova le query delle tabelle di PIANO.md prima di scriverle: ricostruisce
// il database come fa l'harness (stesso stub di Supabase, tutte le migration,
// tutti i seed) e stampa il risultato di ogni query passata come argomento.
// Uso: node supabase/tests/prova_query.mjs "select …;" "select …;"
// Non asserisce niente: è il banco di prova delle query, l'harness resta run.mjs.
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const harness = readFileSync(path.join(root, 'tests', 'run.mjs'), 'utf8')
const stub = harness.match(/\/\/ Stub dell'ambiente Supabase[^\n]*\nawait db\.exec\(`([\s\S]*?)`\)/)[1]
const db = await PGlite.create({ extensions: { pg_trgm, pgcrypto, unaccent } })
await db.exec(stub)
for (const d of ['migrations', 'seed'])
  for (const f of readdirSync(path.join(root, d)).filter(f => f.endsWith('.sql')).sort())
    await db.exec(readFileSync(path.join(root, d, f), 'utf8'))
for (const sql of process.argv.slice(2)) {
  console.log('\n> ' + sql)
  console.table((await db.query(sql)).rows)
}
