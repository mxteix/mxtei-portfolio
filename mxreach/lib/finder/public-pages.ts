import { contactLinks, extractEmails, type Candidate } from '@/lib/finder/extract'
import { PageFetcher } from '@/lib/finder/fetch-page'

const MAX_START_PAGES = 3
// A bare address in page text from some other domain (a designer credit,
// say) scores 1. Anything we'd act on needs a bit more evidence.
const MIN_SCORE = 2

type Fetcher = Pick<PageFetcher, 'page'>

/**
 * Read the pages the person publishes (site, link-in-bio) and, if needed,
 * one hop to a same-site contact/about page. Returns the best published
 * business address.
 */
export async function findOnPublicPages(
  urls: string[],
  fetcher: Fetcher = new PageFetcher(),
): Promise<{ email: string; url: string } | null> {
  const found: { best: (Candidate & { url: string }) | null } = { best: null }
  const consider = (cands: Candidate[], url: string) => {
    const top = cands[0]
    if (top && (!found.best || top.score > found.best.score)) found.best = { ...top, url }
  }
  const strong = () => (found.best?.score ?? 0) >= 5
  const visited = new Set<string>()

  for (const raw of urls.slice(0, MAX_START_PAGES)) {
    const start = raw.includes('://') ? raw : `https://${raw}`
    if (visited.has(start)) continue
    visited.add(start)

    const page = await fetcher.page(start).catch(() => null)
    if (!page) continue
    consider(extractEmails(page.html, page.url), page.url)
    if (strong()) break

    for (const link of contactLinks(page.html, page.url)) {
      if (visited.has(link)) continue
      visited.add(link)
      const sub = await fetcher.page(link).catch(() => null)
      if (sub) consider(extractEmails(sub.html, sub.url), sub.url)
    }
    if (strong()) break
  }

  const best = found.best
  return best && best.score >= MIN_SCORE ? { email: best.email, url: best.url } : null
}
