/**
 * Dashboard routes — Express Router.
 * Can be mounted into any Express app with: app.use(dashboardRouter)
 */
import { Router } from 'express';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    getOverviewMetrics,
    getUserMetrics,
    getInteractionMetrics,
    getFinanceMetrics,
    getFunnelMetrics,
    getBehavioralMetrics,
    getSuggestionsMetrics,
    setDbGetter,
} from './dashboardService.js';
import { getDb } from '../database/index.js';
import { isAIEnabled, setAIEnabled } from '../services/aiService.js';
import { findAllTelegramIds } from '../database/queries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Wire the shared DB getter
setDbGetter(getDb);

const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';

// ── Bot instance (injected from bot.js) ────────────────────────────────────
let _bot = null;
export function setBotInstance(bot) { _bot = bot; }

// ── Auth middleware ─────────────────────────────────────────────────────────
function adminAuth(req, res, next) {
    const key = req.headers['x-admin-key'] || req.query.key;
    if (!key || key !== ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized. Provide a valid ADMIN_KEY.' });
    }
    next();
}

const router = Router();

// JSON body parser for POST routes
router.use(express.json());

// ── Static files ────────────────────────────────────────────────────────────
router.use('/admin', (req, res, next) => {
    if (req.path === '/' || req.path === '') {
        return res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
    next();
});
router.use('/admin', express.static(path.join(__dirname, 'public')));

// ── Auth check (public) ────────────────────────────────────────────────────
router.get('/admin/api/auth', (req, res) => {
    const key = req.headers['x-admin-key'] || req.query.key;
    if (key === ADMIN_KEY) return res.json({ ok: true });
    return res.status(401).json({ ok: false });
});

// ── Protected API routes (metrics) ──────────────────────────────────────────
router.get('/admin/api/metrics/overview', adminAuth, (_req, res) => {
    try { res.json(getOverviewMetrics()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/api/metrics/users', adminAuth, (_req, res) => {
    try { res.json(getUserMetrics()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/api/metrics/interactions', adminAuth, (_req, res) => {
    try { res.json(getInteractionMetrics()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/api/metrics/finance', adminAuth, (_req, res) => {
    try { res.json(getFinanceMetrics()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/api/metrics/funnel', adminAuth, (_req, res) => {
    try { res.json(getFunnelMetrics()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/api/metrics/behavioral', adminAuth, (_req, res) => {
    try { res.json(getBehavioralMetrics()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/admin/api/metrics/suggestions', adminAuth, (_req, res) => {
    try { res.json(getSuggestionsMetrics()); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Admin Actions ───────────────────────────────────────────────────────────

// AI Toggle: GET status, POST to toggle
router.get('/admin/api/ai/status', adminAuth, (_req, res) => {
    res.json({ enabled: isAIEnabled() });
});

router.post('/admin/api/ai/toggle', adminAuth, (req, res) => {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Body must include { enabled: true|false }' });
    }
    setAIEnabled(enabled);
    console.log(`🧠 [Admin] IA ${enabled ? 'ACTIVADA' : 'DESACTIVADA'} desde dashboard`);
    res.json({ ok: true, enabled: isAIEnabled() });
});

// Broadcast: POST message to all registered users
router.post('/admin/api/broadcast', adminAuth, async (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Body must include { message: "..." }' });
    }
    if (!_bot) {
        return res.status(500).json({ error: 'Bot instance not available.' });
    }

    try {
        const users = findAllTelegramIds();
        let sent = 0;
        let failed = 0;

        for (const u of users) {
            try {
                await _bot.telegram.sendMessage(u.telegram_id, message, { parse_mode: 'Markdown' });
                sent++;
            } catch (err) {
                failed++;
                console.warn(`[Broadcast] Failed for ${u.telegram_id}: ${err.message}`);
            }
        }

        console.log(`📢 [Admin] Broadcast enviado: ${sent} exitosos, ${failed} fallidos`);
        res.json({ ok: true, sent, failed, total: users.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export { router as dashboardRouter };
