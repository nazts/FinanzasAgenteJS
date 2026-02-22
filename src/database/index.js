import Database from 'better-sqlite3';
import { DATABASE_PATH } from '../config/index.js';
import { runMigrations } from './migrations.js';

let db;

export function getDb() {
  if (!db) {
    db = new Database(DATABASE_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
