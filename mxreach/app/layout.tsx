import type { Metadata } from 'next'
import { Instrument_Sans } from 'next/font/google'
import './globals.css'

const sans = Instrument_Sans({ subsets: ['latin', 'latin-ext'] })

export const metadata: Metadata = {
  title: { default: 'mxReach', template: '%s · mxReach' },
  description: 'Find the right people, write the first message, follow up until they answer.',
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.className}>
      <body>{children}</body>
    </html>
  )
}
