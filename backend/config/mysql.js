const mysql = require('mysql2/promise');

let pool;

const getMySqlPool = () => {
  const {
    DB_HOST,
    DB_PORT = 3306,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    DB_SSL,
    DB_STUDENTS_TABLE,
  } = process.env;

  if (pool) {
    return pool;
  }

  if (!DB_HOST || !DB_USER || !DB_NAME) {
    console.warn(
      '[MySQL] Missing required environment variables. Expected DB_HOST, DB_USER, DB_NAME.',
    );
    return null;
  }

  try {
    pool = mysql.createPool({
      host: DB_HOST,
      port: Number(DB_PORT) || 3306,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 10000,
      ssl:
        typeof DB_SSL === 'string' && DB_SSL.toLowerCase() === 'true'
          ? { rejectUnauthorized: false }
          : undefined,
    });
    console.log('[MySQL] Connection pool created.');
    if (DB_STUDENTS_TABLE) {
      console.log(`[MySQL] Using table override: ${DB_STUDENTS_TABLE}`);
    }
    pool.on('error', (err) => {
      console.error('[MySQL] Pool error:', err);
    });
  } catch (error) {
    console.error('[MySQL] Failed to create connection pool:', error);
    pool = null;
  }

  return pool;
};

const connectMySQL = async () => {
  try {
    const pool = getMySqlPool();
    if (!pool) {
       console.error('[MySQL] Failed to initialize pool (missing config?)');
       return;
    }
    const connection = await pool.getConnection();
    console.log('[MySQL] Connected successfully ✅');
    connection.release();
  } catch (error) {
    console.error('[MySQL] Connection failed:', error.message);
    // process.exit(1); // Optional: Exit if SQL is critical
  }
};

module.exports = {
  getMySqlPool,
  connectMySQL,
};

