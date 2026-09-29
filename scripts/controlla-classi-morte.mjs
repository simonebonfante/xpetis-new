// Guardia sui token morti del vecchio design system.
//
// Una classe Tailwind che usa un colore inesistente non fallisce: sparisce.
// Non la vedono tsc, l'harness né `next build`. Il 28 settembre 2026 il bottone
// «Entra con Google» era bianco su crema per un `bg-brand` sopravvissuto alla
// deviazione 8. Questo controllo fallisce se uno di quei nomi torna.
//
// È stretto di proposito: controlla solo i nomi qui sotto, che sono morti.
// Un controllo generico su tutte le classi sarebbe rumoroso e verrebbe spento.
// Se un token viene rinominato, il vecchio nome si aggiunge alla lista.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const TOKEN_MORTI = ['brand', 'brand-scuro']

const CARTELLE = ['app', 'components', 'lib']
const ESTENSIONI = /\.(tsx?|jsx?|mjs|css|mdx)$/

// `bg-brand`, `hover:text-brand-scuro`, `bg-brand/50`, `var(--color-brand)`:
// il token preceduto da un trattino e non seguito da altre lettere o trattini.
const nomi = TOKEN_MORTI.map((t) => t.replace(/[-]/g, '\\-')).join('|')
const regola = new RegExp(`[a-z]-(${nomi})(?![\\w-])`, 'g')

const radice = process.cwd()
const trovati = []

function scorri(cartella) {
  for (const voce of readdirSync(cartella)) {
    const percorso = join(cartella, voce)
    if (statSync(percorso).isDirectory()) scorri(percorso)
    else if (ESTENSIONI.test(voce)) controlla(percorso)
  }
}

function controlla(file) {
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((riga, i) => {
      for (const m of riga.matchAll(regola)) {
        trovati.push(`${relative(radice, file)}:${i + 1}  …${riga.slice(Math.max(0, m.index - 20), m.index + m[0].length + 10).trim()}…`)
      }
    })
}

for (const c of CARTELLE) scorri(join(radice, c))

if (trovati.length) {
  console.error(`\nToken del vecchio design system (${TOKEN_MORTI.join(', ')}): Tailwind li ignora in silenzio.`)
  console.error('Usa i token di app/globals.css (primario, scuro, crema, neutro).\n')
  for (const t of trovati) console.error('  ' + t)
  console.error('')
  process.exit(1)
}
console.log(`Classi morte: nessuna (${TOKEN_MORTI.join(', ')}).`)
