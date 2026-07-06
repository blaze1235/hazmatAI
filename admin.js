const { getStats, getRecentAnalyses } = require('./db');

function basicAuth(req, res, next) {
  const user = process.env.ADMIN_USERNAME;
  const pass = process.env.ADMIN_PASSWORD;

  if (!user || !pass) {
    return res.status(503).send('Admin panel is not configured. Set ADMIN_USERNAME and ADMIN_PASSWORD.');
  }

  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');

  if (scheme === 'Basic' && encoded) {
    const [reqUser, reqPass] = Buffer.from(encoded, 'base64').toString().split(':');
    if (reqUser === user && reqPass === pass) return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="PlacardBot Admin"');
  return res.status(401).send('Authentication required.');
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function renderAdminPage(req, res) {
  try {
    const [stats, rows] = await Promise.all([getStats(), getRecentAnalyses(100)]);

    if (!stats) {
      return res.status(503).send('DATABASE_URL is not configured — no data to show.');
    }

    const sourceBadges = stats.bySource
      .map((s) => `<span class="badge">${escapeHtml(s.source)}: ${s.count}</span>`)
      .join(' ');

    const tableRows = rows
      .map((r) => `
        <tr>
          <td>${escapeHtml(r.id)}</td>
          <td><span class="tag tag-${escapeHtml(r.source)}">${escapeHtml(r.source)}</span></td>
          <td>${escapeHtml(r.session_id)}</td>
          <td class="truncate" title="${escapeHtml(r.message)}">${escapeHtml(r.message)}</td>
          <td>${r.file_count}${r.file_types ? ` (${escapeHtml(r.file_types)})` : ''}</td>
          <td class="truncate" title="${escapeHtml(r.reply)}">${escapeHtml(r.reply)}</td>
          <td>${r.error ? `<span class="error">${escapeHtml(r.error)}</span>` : ''}</td>
          <td title="${new Date(r.created_at).toISOString()}">${timeAgo(r.created_at)}</td>
        </tr>`)
      .join('');

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>PlacardBot Admin</title>
<style>
  :root { color-scheme: dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f1419; color: #e8edf3; margin: 0; padding: 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  p.sub { color: #8a97a8; margin: 0 0 24px; font-size: 13px; }
  .stats { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat-card { background: #171d26; border: 1px solid #2a3341; border-radius: 10px; padding: 14px 18px; min-width: 120px; }
  .stat-card .value { font-size: 24px; font-weight: 700; }
  .stat-card .label { font-size: 12px; color: #8a97a8; }
  .badge { display: inline-block; background: #24304a; border-radius: 6px; padding: 2px 8px; font-size: 12px; margin-right: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #2a3341; vertical-align: top; }
  th { color: #8a97a8; font-weight: 600; position: sticky; top: 0; background: #0f1419; }
  .truncate { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tag { padding: 2px 8px; border-radius: 6px; font-size: 11px; }
  .tag-web { background: #2b6cff33; color: #7ba7ff; }
  .tag-telegram { background: #29a3ff33; color: #6fc8ff; }
  .error { color: #ff8a2b; }
  .table-wrap { overflow-x: auto; background: #171d26; border: 1px solid #2a3341; border-radius: 10px; }
</style>
</head>
<body>
  <h1>PlacardBot Admin</h1>
  <p class="sub">Recent analyses across web and Telegram. Auto-refresh by reloading.</p>

  <div class="stats">
    <div class="stat-card"><div class="value">${stats.total}</div><div class="label">Total analyses</div></div>
    <div class="stat-card"><div class="value">${stats.last24h}</div><div class="label">Last 24h</div></div>
    <div class="stat-card"><div class="value">${sourceBadges || '—'}</div><div class="label">By source</div></div>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>ID</th><th>Source</th><th>Session</th><th>Message</th><th>Files</th><th>Reply</th><th>Error</th><th>When</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows || '<tr><td colspan="8">No analyses yet.</td></tr>'}
      </tbody>
    </table>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error('Admin panel error:', err);
    res.status(500).send('Failed to load admin data.');
  }
}

module.exports = { basicAuth, renderAdminPage };
