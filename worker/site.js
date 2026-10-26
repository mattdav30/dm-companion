/* Public, crawlable pages. Signed out visitors and search engines get the static home page at "/".
   Signed in visitors get the app. robots.txt, sitemap.xml and llms.txt use the live domain. */

const PUBLIC_PAGES = [
  { path: '/', file: '/home', priority: '1.0' },
  { path: '/privacy', file: '/privacy', priority: '0.3' },
]
const SESSION_COOKIE = 'dmc_session'
const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot',
  'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'DuckAssistBot', 'meta-externalagent', 'CCBot',
]

function hasSession(request) {
  return (request.headers.get('cookie') || '').split(/;\s*/).some((c) => c.startsWith(SESSION_COOKIE + '=') && c.length > SESSION_COOKIE.length + 1)
}

/* The address search engines should treat as the real one. Set CANONICAL_HOST once a domain is live. */
export function siteOrigin(env, url) {
  return env.CANONICAL_HOST ? `https://${env.CANONICAL_HOST}` : url.origin
}

/* Send the workers.dev address (and www) to the main domain so there is one copy of every page. */
export function canonicalRedirect(request, env, url) {
  const host = env.CANONICAL_HOST
  if (!host || url.hostname === host || url.hostname === 'localhost' || url.pathname.startsWith('/api/')) return null
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  return Response.redirect(`https://${host}${url.pathname}${url.search}`, 301)
}

const text = (body, type) => new Response(body, { headers: { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'public, max-age=3600' } })

async function page(request, env, url, file) {
  const res = await env.ASSETS.fetch(new Request(new URL(file, url), { headers: request.headers }))
  if (!res.ok) return res
  const origin = siteOrigin(env, url)
  const html = (await res.text()).replaceAll('https://__ORIGIN__', origin)
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      vary: 'Cookie',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    },
  })
}

export async function handleSite(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const origin = siteOrigin(env, url)

  if (path === '/') {
    // Signed in: the app's campaign list. Everyone else, including search engines: the home page.
    if (hasSession(request)) {
      const res = await env.ASSETS.fetch(new Request(new URL('/index.html', url), { headers: request.headers }))
      const out = new Response(res.body, res)
      out.headers.set('cache-control', 'private, no-store')
      out.headers.set('vary', 'Cookie')
      out.headers.set('x-robots-tag', 'noindex')
      return out
    }
    return page(request, env, url, '/home')
  }
  if (path === '/privacy') return page(request, env, url, '/privacy')

  if (path === '/robots.txt') {
    const lines = [
      '# Public pages are open to all search engines and AI assistants.',
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      'Disallow: /c/',
      '',
      ...AI_CRAWLERS.flatMap((bot) => [`User-agent: ${bot}`, 'Allow: /', 'Disallow: /api/', 'Disallow: /c/', '']),
      `Sitemap: ${origin}/sitemap.xml`,
      '',
    ]
    return text(lines.join('\n'), 'text/plain')
  }

  if (path === '/sitemap.xml') {
    const urls = PUBLIC_PAGES.map((p) => `  <url><loc>${origin}${p.path === '/' ? '/' : p.path}</loc><changefreq>weekly</changefreq><priority>${p.priority}</priority></url>`)
    return text(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`, 'application/xml')
  }

  if (path === '/llms.txt') {
    const res = await env.ASSETS.fetch(new Request(new URL('/llms-source.txt', url)))
    return text((await res.text()).replaceAll('https://__ORIGIN__', origin), 'text/plain')
  }

  return null
}
