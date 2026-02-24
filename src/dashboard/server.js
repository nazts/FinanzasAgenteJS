import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { runMigrations } from '../database/migrations.js';
import {
    getOverviewMetrics,
    getUserMetrics,
    getInteractionMetrics,
    getFinanceMetrics,
    getFunnelMetrics,
    setDbGetter,
} from './dashboardService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');

// ── DB connection ──────────────────────────────────────────────────────────
const rawDbPath = process.env.DATABASE_PATH || './data/finanzas.db';
const DATABASE_PATH = path.isAbsolute(rawDbPath)
    ? rawDbPath
    : path.resolve(projectRoot, rawDbPath);

const dataDir = path.dirname(DATABASE_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db;
function getDb() {
    if (!db) {
        db = new Database(DATABASE_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        runMigrations(db);
    }
    return db;
}
function closeDb() { if (db) { db.close(); db = null; } }

setDbGetter(getDb);

// ── Config ─────────────────────────────────────────────────────────────────
const PORT = process.env.DASHBOARD_PORT || 3500;
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';
const app = express();

// ── Auth middleware ─────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
    const key = req.headers['x-admin-key'] || req.query.key;
    if (!key || key !== ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized. Provide a valid ADMIN_KEY.' });
    }
    next();
}

// ── Static files (public, no auth needed for CSS/JS/login page) ────────────
app.use('/admin', express.static(path.join(__dirname, 'public')));

// ── Auth check endpoint (public) ───────────────────────────────────────────
app.get('/admin/api/auth', (req, res) => {
    const key = req.headers['x-admin-key'] || req.query.key;
    if (key === ADMIN_KEY) return res.json({ ok: true });
    return res.status(401).json({ ok: false });
});

// ── Protected API routes ───────────────────────────────────────────────────

app.get('/admin/api/metrics/overview', adminAuth, (_req, res) => {
    try { res.json(getOverviewMetrics()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/api/metrics/users', adminAuth, (_req, res) => {
    try { res.json(getUserMetrics()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/api/metrics/interactions', adminAuth, (_req, res) => {
    try { res.json(getInteractionMetrics()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/api/metrics/finance', adminAuth, (_req, res) => {
    try { res.json(getFinanceMetrics()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/api/metrics/funnel', adminAuth, (_req, res) => {
    try { res.json(getFunnelMetrics()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ── SPA fallback ───────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`📊 Dashboard disponible en http://localhost:${PORT}/admin`);
});

process.once('SIGINT', () => { closeDb(); process.exit(0); });
process.once('SIGTERM', () => { closeDb(); process.exit(0); });
