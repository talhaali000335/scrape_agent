import { MongoClient } from 'mongodb';

// Serverless functions start and stop all the time. Keeping the connection promise on
// globalThis lets a warm function reuse it instead of reconnecting on every request.
export async function getDb() {
  globalThis._mongo ??= new MongoClient(process.env.MONGODB_URI)
    .connect()
    .catch((e) => { globalThis._mongo = undefined; throw e; });
  return (await globalThis._mongo).db(process.env.MONGODB_DB || 'scrape_agent');
}
