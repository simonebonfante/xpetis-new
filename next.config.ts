import type { NextConfig } from 'next'

/**
 * Le foto dei Travel Designer vivono su Supabase Storage: è l'unico host da cui
 * ci aspettiamo immagini, e va dichiarato perché `next/image` le ottimizzi.
 *
 * Un URL su un altro host non è un caso da configurare, è una riga sbagliata nel
 * database: la card lo mostra senza ottimizzazione invece di far cadere tutta la
 * pagina risultati.
 */
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabase
      ? [{ protocol: 'https', hostname: new URL(supabase).hostname, pathname: '/storage/v1/**' }]
      : [],
  },

  /**
   * Le pagine a token non si indicizzano e non si raccontano in giro.
   *
   * L'indirizzo **è** la credenziale: chi ce l'ha è dentro. Da qui discendono
   * due header, e nessuno dei due è decorativo.
   *
   * `X-Robots-Tag` dice la stessa cosa del `meta robots` della pagina, ma vale
   * anche per chi non esegue l'HTML — ed è il caso di quasi tutti i crawler che
   * ci preoccupano davvero, quelli che raccolgono indirizzi.
   *
   * `Referrer-Policy: strict-origin` è quello che conta di più: senza, ogni
   * volta che da una pagina token si apre un link verso l'esterno, il browser
   * regala al sito di destinazione l'indirizzo da cui si arriva — cioè il token.
   * Il link WhatsApp in fondo a queste pagine è esattamente quel caso.
   * `strict-origin` manda solo schema e host, **mai il percorso**: il token non
   * esce, che è tutto lo scopo.
   *
   * ⚠️ **Non è `no-referrer`, e non va "rafforzato" in `no-referrer`.** Per la
   * specifica Fetch, su una richiesta non-GET fuori dalla modalità CORS — cioè
   * l'invio di un `<form>` HTML, che è come funziona il bottone del servizio —
   * `no-referrer` fa serializzare l'origine come `Origin: null`. Il controllo
   * anti-CSRF di `/servizio/[token]/richiedi` rifiuta `null` (è il segno di un
   * contesto opaco), quindi il bottone prenderebbe 403. È già successo: vedi
   * `REGISTRO.md`, 23 settembre 2026.
   */
  async headers() {
    const pagineToken = [
      { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
      { key: 'Referrer-Policy', value: 'strict-origin' },
      { key: 'Cache-Control', value: 'private, no-store' },
    ]
    // Dalla 0044 le pagine a token sono tre: il bottone post-call, la pagina
    // ordine del designer e la pagina gemella della proposta. La cassa della
    // proposta rimanda a Stripe con un 303: senza `strict-origin` il browser
    // manderebbe a Stripe, come Referer, l'indirizzo con dentro il token.
    return ['/servizio/:token*', '/ordine/:token*', '/proposta/:token*'].map((source) => ({
      source,
      headers: pagineToken,
    }))
  },
}

export default nextConfig
