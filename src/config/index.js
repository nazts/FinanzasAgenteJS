import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load dotenv
try {
  const dotenv = await import('dotenv');
  dotenv.config();
} catch {
  // dotenv optional
}

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || '';
const AI_MODEL = process.env.AI_MODEL || 'gpt-3.5-turbo';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Resolve database path relative to project root
const projectRoot = path.resolve(__dirname, '../../');
const rawDbPath = process.env.DATABASE_PATH || './data/finanzas.db';
const DATABASE_PATH = path.isAbsolute(rawDbPath)
  ? rawDbPath
  : path.resolve(projectRoot, rawDbPath);

// Auto-create data directory
const dataDir = path.dirname(DATABASE_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required. Set it in your .env file.');
}

export { BOT_TOKEN, OPENAI_API_KEY, OPENAI_BASE_URL, AI_MODEL, DATABASE_PATH, NODE_ENV };
