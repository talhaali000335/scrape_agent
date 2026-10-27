import { Client } from 'langsmith';

// One shared LangSmith client. Tracing turns on by itself when these env vars exist:
//   LANGSMITH_TRACING=true   LANGSMITH_API_KEY=...   LANGSMITH_PROJECT=scrape-agent
export const lsClient = new Client();

// IMPORTANT on Vercel: traces are sent in the background, and a serverless function can be
// frozen right after it replies. Waiting here makes sure the traces are really sent.
export const flushTraces = () => lsClient.awaitPendingTraceBatches().catch(() => {});
