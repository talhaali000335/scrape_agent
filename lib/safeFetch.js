import dns from 'node:dns/promises';
import net from 'node:net';
import robotsParser from 'robots-parser';

export const BOT_NAME = 'LearnScrapeBot';
const USER_AGENT = `${BOT_NAME}/1.0 (learning project; honours robots.txt)`;
const MAX_BYTES = 2_000_000;
const robotsCache = new Map(); // origin -> { parsed, status, exp }  (saves a network call = lower latency)

export class ScrapeError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/* ---------- Safety 1: never let the tool reach private or local addresses (SSRF) ---------- */
function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l.startsWith('::ffff:')) { const v4 = l.slice(7); return net.isIPv4(v4) ? isPrivateIp(v4) : true; }
    return l === '::1' || l === '::' || /^f[cd]/.test(l) || l.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export async function assertPublicUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new ScrapeError('bad_url', 'That is not a valid URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ScrapeError('bad_url', 'Only http and https URLs are allowed.');
  if (process.env.ALLOW_PRIVATE_HOSTS !== 'true') { // the flag exists only so we can test on localhost
    let addrs;
    try { addrs = await dns.lookup(url.hostname, { all: true }); }
    catch { throw new ScrapeError('bad_url', `Could not find the site "${url.hostname}".`); }
    if (addrs.some((a) => isPrivateIp(a.address))) throw new ScrapeError('blocked_host', 'Private or local addresses are not allowed.');
  }
  return url;
}

/* ---------- Safety 2: obey robots.txt ---------- */
export async function checkRobots(url) {
  let entry = robotsCache.get(url.origin);
  if (!entry || entry.exp < Date.now()) {
    let body = '', status = 0;
    try {
      const res = await fetch(`${url.origin}/robots.txt`, {
        headers: { 'User-Agent': USER_AGENT }, redirect: 'manual', signal: AbortSignal.timeout(5000),
      });
      status = res.status;
      if (res.status === 200) body = (await res.text()).slice(0, 500_000);
      else if (res.status >= 500 || (res.status >= 300 && res.status < 400)) body = 'User-agent: *\nDisallow: /'; // cannot read the rules -> be careful
      // 404 and other 4xx mean "no rules": everything is allowed
    } catch {
      body = 'User-agent: *\nDisallow: /'; // robots.txt unreachable -> be careful
    }
    entry = { parsed: robotsParser(`${url.origin}/robots.txt`, body), status, exp: Date.now() + 10 * 60_000 };
    robotsCache.set(url.origin, entry);
  }
  return {
    allowed: entry.parsed.isAllowed(url.href, BOT_NAME) !== false,
    robotsStatus: entry.status,
    crawlDelay: entry.parsed.getCrawlDelay(BOT_NAME) ?? null,
  };
}

/* ---------- Fetch the page politely ---------- */
export async function fetchPage(startUrl) {
  let url = await assertPublicUrl(startUrl);

  for (let hop = 0; hop < 4; hop++) {            // follow redirects ourselves so every hop is re-checked
    const robots = await checkRobots(url);
    if (!robots.allowed) {
      throw new ScrapeError('robots_disallowed',
        `${url.origin}/robots.txt does not allow automated access to this page, so the agent stopped.`);
    }
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,text/plain' },
      redirect: 'manual', signal: AbortSignal.timeout(10_000),
    });

    const next = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && next) { url = await assertPublicUrl(new URL(next, url).href); continue; }

    if ([401, 403, 429, 503].includes(res.status)) {
      throw new ScrapeError('access_denied',
        `The site refused automated access (HTTP ${res.status}). This tool does not try to get around that. ` +
        'Look for an official API, an RSS feed or sitemap, or ask the site owner for permission.');
    }
    if (!res.ok) throw new ScrapeError('http_error', `The site answered with HTTP ${res.status}.`);
    if (!/html|text/.test(res.headers.get('content-type') || '')) throw new ScrapeError('not_html', 'That URL is not a web page.');

    const chunks = []; let total = 0;             // read at most MAX_BYTES, so a huge page cannot hurt us
    for await (const chunk of res.body) { chunks.push(chunk); total += chunk.length; if (total > MAX_BYTES) break; }
    return { finalUrl: url.href, html: Buffer.concat(chunks).toString('utf8').slice(0, MAX_BYTES), robots };
  }
  throw new ScrapeError('too_many_redirects', 'The page redirected too many times.');
}
