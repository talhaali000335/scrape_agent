import { traceable } from 'langsmith/traceable';
import { lsClient } from './trace.js';
import { fetchPage, ScrapeError } from './safeFetch.js';
import { parsePage, extractWithLLM } from './extract.js';
import { getDb } from './db.js';

// Each step is wrapped with traceable(): LangSmith then shows it as a child "run" with its own timing.
const tFetch = traceable(fetchPage, { name: 'fetch_page', run_type: 'tool', client: lsClient });
const tParse = traceable(async (html, url) => parsePage(html, url), { name: 'parse_html', run_type: 'chain', client: lsClient });
const tExtract = traceable(extractWithLLM, { name: 'llm_extract', run_type: 'llm', client: lsClient });

// Runs fn and records how many milliseconds it took.
async function timed(timings, name, fn) {
  const t0 = performance.now();
  try { return await fn(); }
  finally { timings[name] = Math.round(performance.now() - t0); }
}

async function save(record) {
  try {
    const { insertedId } = await (await getDb()).collection('scrapes').insertOne(record);
    return insertedId;
  } catch (e) { return null; } // a database problem should not hide the scrape result
}

export const runScrape = traceable(async function scrapeAgent({ url, goal }) {
  const started = performance.now();
  const timings = {};
  const record = { url, goal, createdAt: new Date() };

  try {
    if (!goal?.trim()) throw new ScrapeError('bad_request', 'Tell me what you want to scrape.');
    const page = await timed(timings, 'fetchMs', () => tFetch(url));          // includes robots.txt check
    const parsed = await timed(timings, 'parseMs', () => tParse(page.html, page.finalUrl));
    const result = await timed(timings, 'llmMs', () => tExtract({ goal, url: page.finalUrl, ...parsed }));

    Object.assign(record, {
      status: 'ok', finalUrl: page.finalUrl, title: parsed.title, found: !!result.found,
      summary: result.summary ?? '', items: Array.isArray(result.items) ? result.items : [],
      tokens: result.tokens, likelyJsRendered: parsed.likelyJsRendered, robots: page.robots,
    });
  } catch (err) {
    // Expected problems (robots, blocked, bad URL) are results, not crashes.
    Object.assign(record, { status: err.code ?? 'error', message: err.message });
  }

  record.timings = timings;
  record.totalMs = Math.round(performance.now() - started);
  const id = await timed(timings, 'saveMs', () => save(record));
  return { ...record, _id: id };
}, { name: 'scrape_agent', run_type: 'chain', client: lsClient });
