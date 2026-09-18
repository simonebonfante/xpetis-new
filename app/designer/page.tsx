import { redirect } from 'next/navigation'

/**
 * `/designer` → `/ricerca`.
 *
 * L'header linka qui con la voce "Scopri i Travel Designer", e fino all'8
 * settembre 2026 rispondeva 404. **Non c'è una pagina nuova da inventare**: la
 * pagina che scopre i Travel Designer esiste, si chiama `/ricerca` ed è
 * disegnata nel Figma (177:262). Una seconda vetrina-elenco non è nel Flusso e
 * non è nel disegno.
 *
 * Il reindirizzamento vive qui, e non solo cambiando il link dell'header, perché
 * `/designer` è già stato dato in giro come indirizzo — sta nell'HTML pubblicato
 * su Vercel dal 23 agosto — e un indirizzo dato una volta deve continuare a
 * portare da qualche parte. L'header punta a `/ricerca` direttamente, così il
 * salto in più lo fa solo chi arriva da un link vecchio.
 *
 * **307 e non 308**: la destinazione può cambiare. Se un giorno il Flusso
 * descriverà una pagina indice dei designer, si sostituisce questo file e
 * nessun browser si ricorda il vecchio salto.
 */
export default function Designer() {
  redirect('/ricerca')
}
