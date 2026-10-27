import { getDb } from '../lib/db.js';

export default async function handler(req, res) {
  if (!process.env.ACCESS_KEY || req.headers['x-access-key'] !== process.env.ACCESS_KEY) {
    return res.status(401).json({ error: 'Wrong or missing access key.' });
  }
  try {
    const rows = await (await getDb()).collection('scrapes').find().sort({ createdAt: -1 }).limit(20).toArray();
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not read history.' });
  }
}
