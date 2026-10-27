import { runScrape } from '../lib/agent.js';
import { flushTraces } from '../lib/trace.js';

// Vercel runs every file in /api as a serverless function: export default (req, res).
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  // Fail closed: if ACCESS_KEY is not configured, nobody gets in (the scraper costs money to run).
  if (!process.env.ACCESS_KEY || req.headers['x-access-key'] !== process.env.ACCESS_KEY) {
    return res.status(401).json({ error: 'Wrong or missing access key.' });
  }
  const { url, goal } = req.body ?? {};
  if (typeof url !== 'string' || typeof goal !== 'string') return res.status(400).json({ error: 'url and goal are required' });

  try {
    const result = await runScrape({ url: url.trim(), goal: goal.trim() });
    await flushTraces(); // send LangSmith traces before the function can be frozen
    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
