// Turn scraped items into files, entirely inside the browser (no server needed).

// Items are chosen by the AI, so each row can have different fields. We use the union of all field names as columns.
export function toCsv(items) {
  const rows = items.map((i) => (i && typeof i === 'object' && !Array.isArray(i) ? i : { value: i }));
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];

  const cell = (v) => {
    if (v == null) return '';
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    // Safety: text from websites is untrusted. A cell starting with = + @ could run as a formula in Excel.
    if (typeof v === 'string' && /^([=+@\t\r]|-(?!\d))/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [columns.map(cell).join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))];
  return '\ufeff' + lines.join('\r\n'); // the BOM makes Excel read accented/Urdu characters correctly
}

export function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function fileBase(url) {
  let host = 'scrape';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* keep default */ }
  return `${host.replace(/[^a-z0-9.-]/gi, '-')}-${new Date().toISOString().slice(0, 10)}`;
}
