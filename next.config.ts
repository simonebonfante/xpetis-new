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
}

export default nextConfig
