import { useEffect, useState } from 'react';
import { toCsv, download, fileBase } from './export.js';

// The access key is typed by you and kept only in this browser tab. It is NOT inside the website's code.
const getKey = () => sessionStorage.getItem('accessKey') || '';

async function call(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-access-key': getKey() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const STATUS_TEXT = {
  ok: 'Done',
  robots_disallowed: 'Blocked by robots.txt',
  access_denied: 'Site refused automated access',
  bad_url: 'Bad URL',
  blocked_host: 'Address not allowed',
  llm_error: 'AI step failed',
};

export default function App() {
  const [key, setKey] = useState(getKey());
  const [url, setUrl] = useState('');
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const loadHistory = async () => {
    try { setHistory(await call('/api/history')); } catch { /* shown when you press Scrape */ }
  };
  useEffect(() => { if (key) loadHistory(); }, []);

  const saveKey = (v) => { setKey(v); sessionStorage.setItem('accessKey', v); };

  const scrape = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setResult(null);
    try {
      setResult(await call('/api/scrape', { method: 'POST', body: JSON.stringify({ url, goal }) }));
      loadHistory();
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div className="app">
      <h1>Scrape Agent</h1>
      <p className="muted">Gives you the data you ask for from one public page. It follows robots.txt and stops if a site says no.</p>

      <form className="card" onSubmit={scrape}>
        <input type="password" placeholder="Access key" value={key} onChange={(e) => saveKey(e.target.value)} />
        <input placeholder="Page URL, e.g. https://example.com/products" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <textarea placeholder="What should I scrape? e.g. product names and prices" value={goal} onChange={(e) => setGoal(e.target.value)} required />
        <button disabled={busy}>{busy ? 'Working...' : 'Scrape'}</button>
      </form>

      {error && <p className="msg error">{error}</p>}
      {result && <Result r={result} />}

      {history.length > 0 && (
        <>
          <h2>Recent</h2>
          {history.map((h) => (
            <div key={h._id} className="card clickable" onClick={() => setResult(h)}>
              <strong>{h.goal}</strong>
              <span className="muted">{h.url}</span>
              <span className="muted">{STATUS_TEXT[h.status] || h.status} · {h.totalMs} ms · {new Date(h.createdAt).toLocaleString()}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function Result({ r }) {
  const [copied, setCopied] = useState(false);
  const t = r.timings || {};
  const hasItems = r.items?.length > 0;
  const source = r.finalUrl || r.url;
  // Every exported row carries the page it came from, so you can always trace the data back.
  const rows = (r.items || []).map((i) => ({ ...(i && typeof i === 'object' ? i : { value: i }), source_url: source }));

  const copyJson = async () => {
    await navigator.clipboard.writeText(JSON.stringify(rows, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const steps = [['Fetch + robots', t.fetchMs], ['Parse HTML', t.parseMs], ['AI extract', t.llmMs], ['Save', t.saveMs]].filter(([, v]) => v != null);
  const max = Math.max(1, ...steps.map(([, v]) => v));

  return (
    <div className="card">
      <h2>{STATUS_TEXT[r.status] || r.status}</h2>
      {r.message && <p className="msg">{r.message}</p>}
      {r.summary && <p>{r.summary}</p>}
      {r.likelyJsRendered && <p className="msg">This page has very little text. It may load its content with JavaScript, which this simple version cannot run.</p>}
      {r.status === 'ok' && !r.found && <p className="muted">I could not find that on the page.</p>}
      {hasItems && <pre>{JSON.stringify(r.items, null, 2)}</pre>}
      {hasItems && (
        <div className="row">
          <button type="button" onClick={() => download(`${fileBase(source)}.csv`, toCsv(rows), 'text/csv;charset=utf-8')}>Download CSV</button>
          <button type="button" className="secondary" onClick={() => download(`${fileBase(source)}.json`, JSON.stringify(rows, null, 2), 'application/json')}>Download JSON</button>
          <button type="button" className="secondary" onClick={copyJson}>{copied ? 'Copied!' : 'Copy JSON'}</button>
        </div>
      )}

      <h3>Latency ({r.totalMs} ms total)</h3>
      {steps.map(([name, ms]) => (
        <div key={name} className="bar-row">
          <span className="bar-label">{name}</span>
          <div className="bar"><div style={{ width: `${(ms / max) * 100}%` }} /></div>
          <span className="muted">{ms} ms</span>
        </div>
      ))}
      {r.tokens != null && <p className="muted">{r.tokens} tokens used</p>}
    </div>
  );
}
