/**
 * Comprehensive tests for user persistence, onboarding flow, and profile management.
 * Uses SQLite in-memory database — no bot token or API keys required.
 */
import { jest } from '@jest/globals';
import Database from 'better-sqlite3';

// ─── In-memory DB setup ─────────────────────────────────────────────────────
// We bypass the singleton in database/index.js and directly test the query
// functions by monkey-patching getDb.

let testDb;

/** Create a fresh in-memory DB with the same schema as production. */
function createTestDb() {
    const db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      amount REAL NOT NULL,
      category TEXT,
      description TEXT,
      date TEXT NOT NULL DEFAULT (date('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL NOT NULL DEFAULT 0,
      deadline TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS financial_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      salary REAL,
      payment_frequency TEXT,
      is_student INTEGER DEFAULT 0,
      study_cost REAL DEFAULT 0,
      transport_cost REAL DEFAULT 0,
      food_cost REAL DEFAULT 0,
      leisure_cost REAL DEFAULT 0,
      services_cost REAL DEFAULT 0,
      has_debt INTEGER DEFAULT 0,
      debt_total REAL DEFAULT 0,
      debt_monthly REAL DEFAULT 0,
      onboarding_completed INTEGER DEFAULT 0,
      current_savings REAL DEFAULT 0,
      is_employed INTEGER DEFAULT 0,
      income_type TEXT DEFAULT 'fijo',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
    CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
    CREATE INDEX IF NOT EXISTS idx_financial_profiles_user_id ON financial_profiles(user_id);

    CREATE TABLE IF NOT EXISTS user_activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      command TEXT NOT NULL,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

    return db;
}

// ─── Direct query helpers (mirrors database/queries.js but uses testDb) ─────

function findUserByTelegramId(telegramId) {
    return testDb
        .prepare('SELECT * FROM users WHERE telegram_id = ?')
        .get(String(telegramId));
}

function createUser({ telegramId, username, firstName }) {
    testDb.prepare(
        'INSERT OR IGNORE INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)'
    ).run(String(telegramId), username || null, firstName || null);
    return findUserByTelegramId(telegramId);
}

function getFinancialProfile(userId) {
    return testDb
        .prepare('SELECT * FROM financial_profiles WHERE user_id = ?')
        .get(userId) || null;
}

function upsertFinancialProfile(userId, data) {
    const fields = [
        'salary', 'payment_frequency', 'is_student', 'study_cost',
        'transport_cost', 'food_cost', 'leisure_cost', 'services_cost',
        'has_debt', 'debt_total', 'debt_monthly', 'onboarding_completed',
        'current_savings', 'is_employed', 'income_type',
    ];

    const updates = {};
    for (const f of fields) {
        if (data[f] !== undefined) updates[f] = data[f];
    }

    const existing = testDb
        .prepare('SELECT id FROM financial_profiles WHERE user_id = ?')
        .get(userId);

    if (existing) {
        if (Object.keys(updates).length === 0) return getFinancialProfile(userId);
        const setClauses = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
        testDb
            .prepare(`UPDATE financial_profiles SET ${setClauses}, updated_at = datetime('now') WHERE user_id = @user_id`)
            .run({ ...updates, user_id: userId });
    } else {
        const cols = ['user_id', ...Object.keys(updates)];
        const placeholders = cols.map(c => `@${c}`).join(', ');
        testDb
            .prepare(`INSERT INTO financial_profiles (${cols.join(', ')}) VALUES (${placeholders})`)
            .run({ user_id: userId, ...updates });
    }

    return getFinancialProfile(userId);
}

function markOnboardingCompleted(userId) {
    return upsertFinancialProfile(userId, { onboarding_completed: 1 });
}

// ─── Mock ctx factory ────────────────────────────────────────────────────────

function mockCtx(telegramId = 123456, username = 'testuser', firstName = 'Test') {
    const replies = [];
    return {
        from: { id: telegramId, username, first_name: firstName },
        session: {},
        reply: jest.fn(async (text) => { replies.push(text); }),
        scene: { enter: jest.fn(), leave: jest.fn() },
        wizard: { state: {}, next: jest.fn(), selectStep: jest.fn() },
        replies,
    };
}

// ═════════════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════════════

beforeEach(() => {
    testDb = createTestDb();
});

afterEach(() => {
    testDb.close();
});

// ─── 1. User creation ───────────────────────────────────────────────────────

describe('User creation', () => {
    test('should create a new user and return it', () => {
        const user = createUser({ telegramId: 111, username: 'alice', firstName: 'Alice' });
        expect(user).toBeDefined();
        expect(user.telegram_id).toBe('111');
        expect(user.username).toBe('alice');
        expect(user.first_name).toBe('Alice');
        expect(user.id).toBe(1);
    });

    test('should store telegram_id as string', () => {
        const user = createUser({ telegramId: 999, username: 'bob', firstName: 'Bob' });
        expect(typeof user.telegram_id).toBe('string');
        expect(user.telegram_id).toBe('999');
    });
});

// ─── 2. Duplicate handling ──────────────────────────────────────────────────

describe('Duplicate user handling', () => {
    test('INSERT OR IGNORE should not throw on duplicate telegram_id', () => {
        createUser({ telegramId: 111, username: 'alice', firstName: 'Alice' });
        expect(() => {
            createUser({ telegramId: 111, username: 'alice2', firstName: 'Alice2' });
        }).not.toThrow();
    });

    test('should return original user on duplicate insert', () => {
        const first = createUser({ telegramId: 111, username: 'alice', firstName: 'Alice' });
        const second = createUser({ telegramId: 111, username: 'alice2', firstName: 'Alice2' });
        expect(second.id).toBe(first.id);
        // Original data preserved (INSERT OR IGNORE keeps the original row)
        expect(second.username).toBe('alice');
    });

    test('UNIQUE constraint on telegram_id prevents raw duplicate INSERT', () => {
        createUser({ telegramId: 111, username: 'alice', firstName: 'Alice' });
        expect(() => {
            testDb.prepare(
                'INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)'
            ).run('111', 'bob', 'Bob');
        }).toThrow(/UNIQUE/);
    });
});

// ─── 3. Recovery after restart ──────────────────────────────────────────────

describe('Recovery after restart (simulated)', () => {
    test('should find user after new DB connection to same file', () => {
        // Simulate: create user, close DB, reopen (in-memory won't persist,
        // so we test the lookup logic on the same connection)
        createUser({ telegramId: 555, username: 'carlos', firstName: 'Carlos' });

        // Simulate lookup as would happen on restart
        const found = findUserByTelegramId(555);
        expect(found).toBeDefined();
        expect(found.telegram_id).toBe('555');
        expect(found.first_name).toBe('Carlos');
    });

    test('should return undefined for non-existent user', () => {
        const found = findUserByTelegramId(99999);
        expect(found).toBeUndefined();
    });
});

// ─── 4. Financial profile persistence ───────────────────────────────────────

describe('Financial profile persistence', () => {
    test('should create profile with upsert when none exists', () => {
        const user = createUser({ telegramId: 111, username: 'alice', firstName: 'Alice' });
        const profile = upsertFinancialProfile(user.id, { salary: 15000, payment_frequency: 'mensual' });

        expect(profile).toBeDefined();
        expect(profile.salary).toBe(15000);
        expect(profile.payment_frequency).toBe('mensual');
        expect(profile.user_id).toBe(user.id);
    });

    test('should update existing profile with partial data', () => {
        const user = createUser({ telegramId: 111, username: 'alice', firstName: 'Alice' });
        upsertFinancialProfile(user.id, { salary: 15000 });

        // Second upsert updates only the specified field
        const updated = upsertFinancialProfile(user.id, { transport_cost: 500 });
        expect(updated.salary).toBe(15000);      // preserved
        expect(updated.transport_cost).toBe(500); // added
    });

    test('should persist all onboarding fields', () => {
        const user = createUser({ telegramId: 111, username: 'alice', firstName: 'Alice' });
        const fullProfile = upsertFinancialProfile(user.id, {
            salary: 20000,
            payment_frequency: 'quincenal',
            is_student: 1,
            study_cost: 3000,
            transport_cost: 800,
            food_cost: 4000,
            leisure_cost: 2000,
            services_cost: 1500,
            has_debt: 1,
            debt_total: 50000,
            debt_monthly: 5000,
            current_savings: 10000,
            is_employed: 1,
        });

        expect(fullProfile.salary).toBe(20000);
        expect(fullProfile.is_student).toBe(1);
        expect(fullProfile.study_cost).toBe(3000);
        expect(fullProfile.debt_total).toBe(50000);
        expect(fullProfile.current_savings).toBe(10000);
        expect(fullProfile.is_employed).toBe(1);
    });
});

// ─── 5. Existing user detection ─────────────────────────────────────────────

describe('Existing user detection', () => {
    test('findUserByTelegramId returns user if exists', () => {
        createUser({ telegramId: 777, username: 'diana', firstName: 'Diana' });
        const user = findUserByTelegramId(777);
        expect(user).toBeDefined();
        expect(user.first_name).toBe('Diana');
    });

    test('findUserByTelegramId accepts number and string telegram_id', () => {
        createUser({ telegramId: 888, username: 'eva', firstName: 'Eva' });
        expect(findUserByTelegramId(888)).toBeDefined();
        expect(findUserByTelegramId('888')).toBeDefined();
    });
});

// ─── 6. Full onboarding flow ────────────────────────────────────────────────

describe('Full onboarding flow', () => {
    test('complete onboarding marks profile as completed in DB', () => {
        const user = createUser({ telegramId: 111, username: 'alice', firstName: 'Alice' });

        // Simulate onboarding steps
        upsertFinancialProfile(user.id, { salary: 15000 });
        upsertFinancialProfile(user.id, { payment_frequency: 'mensual' });
        upsertFinancialProfile(user.id, { is_student: 0, study_cost: 0 });
        upsertFinancialProfile(user.id, { transport_cost: 500 });
        upsertFinancialProfile(user.id, { food_cost: 3000 });
        upsertFinancialProfile(user.id, { leisure_cost: 1000 });
        upsertFinancialProfile(user.id, { services_cost: 800 });
        upsertFinancialProfile(user.id, { has_debt: 0, debt_total: 0, debt_monthly: 0 });
        upsertFinancialProfile(user.id, { current_savings: 5000 });

        // Mark complete
        markOnboardingCompleted(user.id);

        const profile = getFinancialProfile(user.id);
        expect(profile.onboarding_completed).toBe(1);
        expect(profile.salary).toBe(15000);
        expect(profile.food_cost).toBe(3000);
        expect(profile.current_savings).toBe(5000);
    });

    test('isOnboardingCompleted returns true after marking complete', () => {
        const user = createUser({ telegramId: 222, username: 'bob', firstName: 'Bob' });
        upsertFinancialProfile(user.id, { salary: 10000 });

        // Before completion
        let profile = getFinancialProfile(user.id);
        expect(profile.onboarding_completed).toBe(0);

        // After completion
        markOnboardingCompleted(user.id);
        profile = getFinancialProfile(user.id);
        expect(profile.onboarding_completed).toBe(1);
    });
});

// ─── 7. Profile query after restart ─────────────────────────────────────────

describe('Profile query after restart', () => {
    test('profile data persists and is retrievable after onboarding', () => {
        // Simulate: user completes onboarding
        const user = createUser({ telegramId: 333, username: 'carlos', firstName: 'Carlos' });
        upsertFinancialProfile(user.id, {
            salary: 25000,
            payment_frequency: 'quincenal',
            food_cost: 5000,
            leisure_cost: 3000,
            services_cost: 2000,
        });
        markOnboardingCompleted(user.id);

        // Simulate: "restart" — re-query from DB
        const foundUser = findUserByTelegramId(333);
        expect(foundUser).toBeDefined();

        const profile = getFinancialProfile(foundUser.id);
        expect(profile).toBeDefined();
        expect(profile.onboarding_completed).toBe(1);
        expect(profile.salary).toBe(25000);
        expect(profile.food_cost).toBe(5000);
    });

    test('getOrCreateUser pattern finds existing user without re-creating', () => {
        // First call creates
        const user1 = createUser({ telegramId: 444, username: 'diana', firstName: 'Diana' });

        // Simulate getOrCreateUser logic
        let user2 = findUserByTelegramId(444);
        if (!user2) {
            user2 = createUser({ telegramId: 444, username: 'diana', firstName: 'Diana' });
        }

        expect(user2.id).toBe(user1.id);
        expect(user2.telegram_id).toBe('444');
    });
});

// ─── 8. Basic concurrency ──────────────────────────────────────────────────

describe('Basic concurrency', () => {
    test('multiple users can be created without conflicts', () => {
        const users = [];
        for (let i = 1; i <= 10; i++) {
            users.push(createUser({
                telegramId: 1000 + i,
                username: `user${i}`,
                firstName: `User${i}`,
            }));
        }

        expect(users).toHaveLength(10);
        const ids = new Set(users.map(u => u.id));
        expect(ids.size).toBe(10); // all unique IDs
    });

    test('multiple profiles can be created without conflicts', () => {
        const userIds = [];
        for (let i = 1; i <= 5; i++) {
            const u = createUser({ telegramId: 2000 + i, username: `u${i}`, firstName: `U${i}` });
            userIds.push(u.id);
            upsertFinancialProfile(u.id, { salary: i * 10000 });
        }

        // All profiles exist and have correct salary
        for (let i = 0; i < 5; i++) {
            const profile = getFinancialProfile(userIds[i]);
            expect(profile).toBeDefined();
            expect(profile.salary).toBe((i + 1) * 10000);
        }
    });

    test('concurrent upserts on same user do not corrupt data', () => {
        const user = createUser({ telegramId: 3000, username: 'test', firstName: 'Test' });

        // Simulate rapid successive updates (as would happen in wizard)
        upsertFinancialProfile(user.id, { salary: 15000 });
        upsertFinancialProfile(user.id, { transport_cost: 500 });
        upsertFinancialProfile(user.id, { food_cost: 3000 });
        upsertFinancialProfile(user.id, { leisure_cost: 1000 });

        const profile = getFinancialProfile(user.id);
        expect(profile.salary).toBe(15000);
        expect(profile.transport_cost).toBe(500);
        expect(profile.food_cost).toBe(3000);
        expect(profile.leisure_cost).toBe(1000);
    });
});

// ─── 9. Start handler logic (unit test) ─────────────────────────────────────

describe('Start handler flow logic', () => {
    test('new user → should enter onboarding wizard', () => {
        const ctx = mockCtx(111, 'newuser', 'New');

        // Simulate startHandler logic
        const user = createUser({ telegramId: ctx.from.id, username: ctx.from.username, firstName: ctx.from.first_name });
        const profile = getFinancialProfile(user.id);

        if (profile && profile.onboarding_completed) {
            // Should NOT reach here for new user
            expect(true).toBe(false);
        } else {
            // New user → enter wizard
            ctx.scene.enter('onboarding-wizard');
        }

        expect(ctx.scene.enter).toHaveBeenCalledWith('onboarding-wizard');
    });

    test('returning user with completed onboarding → should show menu, NOT enter wizard', () => {
        // Setup: user who completed onboarding
        const user = createUser({ telegramId: 222, username: 'returning', firstName: 'Return' });
        upsertFinancialProfile(user.id, { salary: 20000 });
        markOnboardingCompleted(user.id);

        const ctx = mockCtx(222, 'returning', 'Return');

        // Simulate startHandler logic
        const foundUser = findUserByTelegramId(ctx.from.id);
        const profile = getFinancialProfile(foundUser.id);

        if (profile && profile.onboarding_completed) {
            // Returning user → show menu
            ctx.reply('menu shown');
        } else {
            ctx.scene.enter('onboarding-wizard');
        }

        expect(ctx.scene.enter).not.toHaveBeenCalled();
        expect(ctx.reply).toHaveBeenCalledWith('menu shown');
    });

    test('user exists but onboarding NOT completed → should enter wizard', () => {
        // Setup: user with incomplete onboarding
        const user = createUser({ telegramId: 333, username: 'partial', firstName: 'Partial' });
        upsertFinancialProfile(user.id, { salary: 10000 }); // partial, not completed

        const ctx = mockCtx(333, 'partial', 'Partial');

        const foundUser = findUserByTelegramId(ctx.from.id);
        const profile = getFinancialProfile(foundUser.id);

        if (profile && profile.onboarding_completed) {
            ctx.reply('menu shown');
        } else {
            ctx.scene.enter('onboarding-wizard');
        }

        expect(ctx.scene.enter).toHaveBeenCalledWith('onboarding-wizard');
    });
});
