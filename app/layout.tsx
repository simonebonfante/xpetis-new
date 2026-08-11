import type { Metadata } from 'next'
import { Merriweather } from 'next/font/google'
import './globals.css'

const merriweather = Merriweather({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-merriweather',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'XPETIS · Il viaggio giusto nasce dall’incontro giusto',
  description:
    'Trova il Travel Designer più affine al tuo modo di viaggiare e progetta con lui il tuo viaggio.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={merriweather.variable}>
      <body className="bg-crema text-scuro antialiased">{children}</body>
    </html>
  )
}
