import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  agent TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('codex', 'claude')),
  status TEXT NOT NULL,
  summary TEXT,
  text TEXT,
  cwd TEXT,
  worktree TEXT,
  ts TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'sent', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT,
  created_at TEXT NOT NULL,
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS agents (
  agent TEXT PRIMARY KEY,
  kind TEXT,
  generation INTEGER NOT NULL DEFAULT 0,
  last_status TEXT,
  last_forwarded_status TEXT,
  last_forwarded_hash TEXT,
  cwd TEXT,
  worktree TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_log (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id),
  attempt INTEGER NOT NULL,
  at TEXT NOT NULL,
  ok INTEGER NOT NULL,
  status_code INTEGER,
  error TEXT
);

CREATE INDEX IF NOT EXISTS events_state_idx ON events(state, next_attempt_at);
CREATE INDEX IF NOT EXISTS events_agent_idx ON events(agent, id);
`;

export function openDatabase(dbPath: string): DatabaseSync {
  mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}
