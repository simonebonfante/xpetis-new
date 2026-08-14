/**
 * "Cosa dice chi ha viaggiato con me" (Figma 171:68).
 *
 * **La sezione oggi non esiste, e non è una dimenticanza.** Le recensioni di un
 * designer possono venire da due posti, e nessuno dei due può alimentarla ora:
 *
 *  · `public_reviews` è la vista delle recensioni XPETIS, ed è **vuota**. Su
 *    `reviews` ogni riga pretende un ordine vero dietro — è quel vincolo a
 *    rendere impossibili le recensioni finte — e finché nessuno ha comprato una
 *    consulenza non c'è niente da mostrare. Si riempirà con la milestone 8.
 *
 *  · `td_showcase_reviews` sono le recensioni che il designer porta da fuori
 *    (il seed ne contiene, per i due designer di prova). **Nessuna vista le
 *    espone e `is_published` nasce a falso**, per una decisione del 6 agosto:
 *    se mostrarle, come distinguerle da quelle vere e se contarle nelle medie si
 *    decide alla milestone 8. Esporle da qui vorrebbe dire prendere quella
 *    decisione di nascosto, aggiungendo una vista pubblica di mia iniziativa.
 *
 * Quindi: niente sezione. Non dati inventati, non una fascia vuota con un
 * titolo che promette qualcosa. Quando la milestone 8 decide, questo file
 * diventa la sezione del Figma — fascia marrone, card con la frase-titolo rossa,
 * stelle, corpo, data e "Carica altre recensioni".
 *
 * Lo stesso ragionamento ha già tolto il bollo "4.9 valutazione media" da
 * `/ricerca` e il "4.6" dalla scheda hero di questa pagina.
 */
export function RecensioniVetrina() {
  return null
}
