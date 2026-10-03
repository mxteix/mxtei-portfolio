'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/today', label: 'Today' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/sequences', label: 'Sequences' },
  { href: '/mailboxes', label: 'Mailboxes' },
  { href: '/stats', label: 'Hit rates' },
  { href: '/settings', label: 'Settings' },
]

export function Nav({ todayCount }: { todayCount: number }) {
  const path = usePathname()
  return (
    <nav className="nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? 'page' : undefined}>
          {l.label}
          {l.href === '/today' && todayCount > 0 && <span className="pill ember">{todayCount}</span>}
        </Link>
      ))}
    </nav>
  )
}
