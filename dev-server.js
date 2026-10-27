// Local stand-in for Vercel: runs the files in /api on port 3001 (Vite proxies /api to it).
import 'dotenv/config';
import http from 'node:http';
import scrape from './api/scrape.js';
import history from './api/history.js';

const routes = { '/api/scrape': scrape, '/api/history': history };

http.createServer(async (req, res) => {
  const handler = routes[req.url.split('?')[0]];
  if (!handler) { res.statusCode = 404; return res.end('not found'); }
  let raw = ''; for await (const c of req) raw += c;
  try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
  // Tiny copy of the helpers Vercel adds to res:
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
  handler(req, res);
}).listen(3001, () => console.log('API on http://localhost:3001'));
