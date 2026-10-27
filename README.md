# Scrape Agent: React + Node + MongoDB + LangSmith + MCP, ready for Vercel

You give it a page URL and say what you want ("product names and prices"). It checks the site's rules, fetches the page, and an AI model (Groq) pulls out exactly that data. Every step is timed and traced.

```
 Browser (React)  ->  /api/scrape (Vercel function)
                          1. safety: block private addresses (SSRF)
                          2. read robots.txt  -> disallowed? STOP and explain
                          3. fetch page       -> 401/403/429? STOP and explain
                          4. clean HTML -> text (cheerio)
                          5. AI extracts what you asked (Groq)
                          6. save to MongoDB, send trace to LangSmith, return result + timings
 AI apps (Claude Desktop, Cursor) -> MCP server (mcp/server.js) -> same code as step 1-6
```

## What it will NOT do (on purpose)
It respects `robots.txt` and stops when a site refuses bots (403, 429, challenge pages). It does not try to get around Cloudflare or other blocks. When a site says no, use its official API, an RSS feed or sitemap, a data export, or ask the owner for permission. Also read the site's terms of use before scraping, especially for commercial use or personal data.

## Part 1: Run it on your computer
1. Install Node 18+. In this folder: `npm install`
2. Copy `.env.example` to `.env` and fill it in (see "Keys" below).
3. `npm run dev`, then open http://localhost:5173
4. Type your `ACCESS_KEY` in the first box, add a URL and a goal, press Scrape.

Good first tests: a page you own, `https://quotes.toscrape.com` (a site made for scraping practice), or `https://books.toscrape.com`.

## Keys
- `MONGODB_URI`: your Atlas connection string (create a NEW password, the old one was shared).
- `GROQ_API_KEY`: from console.groq.com (create a NEW key).
- `ACCESS_KEY`: any long random text. It is the password for your website. The API refuses everyone if it is empty.
- LangSmith: sign up at smith.langchain.com, create an API key, then set `LANGSMITH_TRACING=true`, `LANGSMITH_API_KEY=...`, `LANGSMITH_PROJECT=scrape-agent`.

## Part 2: See the latency
- **In the website:** each result shows bars for Fetch+robots, Parse, AI extract, Save, and the total.
- **In LangSmith:** open your project. Each scrape is one trace named `scrape_agent` with child steps `fetch_page`, `parse_html`, `llm_extract`, including time and the AI's input/output.
- **Where time usually goes:** the AI step and the page download. Things already done to keep it fast: robots.txt is cached for 10 minutes, the page is cut to 12,000 characters before the AI sees it, the page download is capped at 2 MB with a 10 s timeout, and the MongoDB connection is reused between requests. Ideas to try: a smaller Groq model via `GROQ_MODEL`, or fewer characters sent.

## Part 3: The MCP server
MCP lets an AI app call your code as a tool. This server has two tools: `scrape_page` and `list_recent_scrapes`. It runs on your computer.

1. Test it: `npm run mcp` (it prints one line to the error stream and waits; press Ctrl+C).
2. Claude Desktop: open Settings, Developer, Edit Config, and add (use your real folder path with double backslashes on Windows):
```json
{
  "mcpServers": {
    "scrape-agent": {
      "command": "node",
      "args": ["F:\\path\\to\\scrape-agent\\mcp\\server.js"]
    }
  }
}
```
The server reads your `.env` file by itself. Restart Claude Desktop, then ask: "Use scrape_page on https://quotes.toscrape.com to get the first 5 quotes and authors."
Rule for MCP code: never use `console.log` in it, because stdout carries the protocol. Use `console.error`.

## Part 4: Deploy on Vercel
1. Put the project on GitHub (the `.gitignore` already keeps `.env` out; double check it is not uploaded).
2. At vercel.com choose Add New Project, import the repo. Vercel detects Vite and the `api` folder.
3. Add these Environment Variables in the project settings: `MONGODB_URI`, `MONGODB_DB`, `GROQ_API_KEY`, `ACCESS_KEY`, `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`.
4. In MongoDB Atlas, Network Access: Vercel has no fixed IP, so you must allow `0.0.0.0/0`. This is only acceptable with a strong database password.
5. Deploy. Open the Vercel address, type your access key, and scrape.
Or with the CLI: `npm i -g vercel`, then `vercel`, then `vercel --prod`.

Vercel limits to know: functions here have a 30 second limit (`vercel.json`), so one page per request. If you meant the Vercel AI SDK by "Vercel AI", this project calls Groq directly with fetch, which works fine on Vercel. The AI SDK can replace that one function later.

## Limits of this simple version
- Only pages whose content is in the HTML. Sites that build their content with JavaScript need a headless browser (Playwright), which does not fit well in a simple Vercel function.
- One page per request, no crawling, no scheduling, no login pages.
- One shared access key, and no rate limiting. Anyone with the key can spend your Groq credit. Add per-user login and rate limits before sharing it.
- The AI can misread a page. Spot-check results, and treat page text as untrusted (the prompt tells the model not to follow instructions inside pages).

## Exercises
1. Add a "pages" field so the agent follows the "next" link up to 3 times (respect `crawlDelay` from robots).
2. Save results to CSV for download.
3. Add a LangSmith dataset of 10 test pages and compare two Groq models.
4. Add a rate limit stored in MongoDB.
