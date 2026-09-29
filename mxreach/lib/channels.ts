/**
 * Channel handoff — turning a drafted message into "one click".
 *
 * Assisted channels can't send via API, so the handoff is:
 *   copy body to clipboard → open the conversation → user pastes, sends.
 *
 * The deep links below are the shortest path to an open compose box on
 * each platform. LinkedIn has no public "new message to X" URL, so it
 * lands on the profile and the user hits Message — one extra click we
 * can't remove.
 */

export type Channel = 'email' | 'discord' | 'instagram' | 'linkedin'

export type HandoffMode = 'auto' | 'assisted'

export const CHANNEL_MODE: Record<Channel, HandoffMode> = {
  email: 'auto',
  discord: 'assisted',
  instagram: 'assisted',
  linkedin: 'assisted',
}

export const CHANNEL_LABEL: Record<Channel, string> = {
  email: 'Email',
  discord: 'Discord',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
}

/**
 * Build the URL that opens the conversation with this contact.
 * `handle` comes from contact_channels.handle for the matching channel.
 */
export function conversationUrl(channel: Channel, handle: string): string | null {
  if (!handle) return null

  switch (channel) {
    case 'discord':
      // Web fallback; the desktop client intercepts this and opens the DM.
      return `https://discord.com/users/${encodeURIComponent(handle)}`

    case 'instagram':
      // ig.me is Instagram's own DM deep link. Handle stored without '@'.
      return `https://ig.me/m/${encodeURIComponent(handle.replace(/^@/, ''))}`

    case 'linkedin':
      // No public compose URL. Profile URL stored whole; user clicks Message.
      return handle.startsWith('http')
        ? handle
        : `https://www.linkedin.com/in/${encodeURIComponent(handle)}/`

    case 'email':
      // Only reachable when the user opted into reviewing email before send.
      return `mailto:${encodeURIComponent(handle)}`
  }
}

/**
 * What the user copies. Email keeps the subject on the first line so a
 * paste into a fresh compose window carries it; social channels don't
 * have subjects.
 */
export function clipboardPayload(
  channel: Channel,
  subject: string | null,
  body: string,
): string {
  if (channel === 'email' && subject) return `${subject}\n\n${body}`
  return body
}
