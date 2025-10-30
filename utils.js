export function rowsToCsv(rows) {
  if (!rows || rows.length === 0) return '';
  const keys = Object.keys(rows[0] || {});
  const lines = [keys.join(',')];
  for (const r of rows) {
    lines.push(keys.map(k => JSON.stringify(r[k] ?? '')).join(','));
  }
  return lines.join('\n');
}
