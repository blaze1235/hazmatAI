const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
    })
  : null;

async function initDb() {
  if (!pool) {
    console.warn('DATABASE_URL not set; analysis logging and admin panel data will be unavailable.');
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS analyses (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      session_id TEXT,
      message TEXT,
      file_count INTEGER NOT NULL DEFAULT 0,
      file_types TEXT,
      reply TEXT,
      error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS analyses_created_at_idx ON analyses (created_at DESC);`);
  console.log('Database initialized');
}

async function logAnalysis({ source, sessionId, message, fileCount, fileTypes, reply, error }) {
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO analyses (source, session_id, message, file_count, file_types, reply, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        source,
        sessionId || null,
        (message || '').slice(0, 2000),
        fileCount || 0,
        fileTypes || null,
        (reply || '').slice(0, 8000),
        error || null,
      ]
    );
  } catch (err) {
    console.error('Failed to log analysis:', err.message);
  }
}

async function getStats() {
  if (!pool) return null;
  const [totalRes, last24hRes, bySourceRes] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM analyses`),
    pool.query(`SELECT COUNT(*)::int AS count FROM analyses WHERE created_at > now() - interval '24 hours'`),
    pool.query(`SELECT source, COUNT(*)::int AS count FROM analyses GROUP BY source ORDER BY count DESC`),
  ]);
  return {
    total: totalRes.rows[0].count,
    last24h: last24hRes.rows[0].count,
    bySource: bySourceRes.rows,
  };
}

async function getRecentAnalyses(limit = 100, offset = 0) {
  if (!pool) return [];
  const res = await pool.query(
    `SELECT id, source, session_id, message, file_count, file_types, reply, error, created_at
     FROM analyses ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return res.rows;
}

module.exports = { pool, initDb, logAnalysis, getStats, getRecentAnalyses };
