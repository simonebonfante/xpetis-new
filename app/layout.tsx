import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'XPETIS',
  description: 'Consulenze di viaggio con i Travel Designer.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="antialiased">{children}</body>
    </html>
  )
}
