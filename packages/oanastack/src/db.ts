import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLOutputValue, type StatementSync } from "node:sqlite";

const SCHEMA_V2 = `
CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE targets (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  feature_id INTEGER,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'success', 'failed', 'rejected')),
  summary TEXT,
  worktree_path TEXT,
  branch TEXT,
  herdr_status TEXT,
  herdr_result TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE completions (
  id INTEGER PRIMARY KEY,
  target_id INTEGER NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  changed TEXT NOT NULL,
  why TEXT NOT NULL,
  verified TEXT NOT NULL,
  risks TEXT,
  review TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE repos (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL UNIQUE,
  test_command TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE features (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'review', 'done', 'abandoned')),
  goal TEXT,
  workspace_path TEXT,
  archive_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, slug)
);

CREATE TABLE feature_repos (
  id INTEGER PRIMARY KEY,
  feature_id INTEGER NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL REFERENCES repos(id),
  base_branch TEXT NOT NULL,
  branch TEXT NOT NULL,
  worktree_path TEXT,
  pr_url TEXT,
  UNIQUE(feature_id, repo_id)
);

CREATE INDEX targets_project_idx ON targets(project_id);
CREATE INDEX targets_feature_idx ON targets(feature_id);
CREATE INDEX completions_target_idx ON completions(target_id);
CREATE INDEX features_project_idx ON features(project_id);
CREATE INDEX feature_repos_feature_idx ON feature_repos(feature_id);
`;

const ROUNDS_TABLE = `
CREATE TABLE rounds (
  id INTEGER PRIMARY KEY,
  feature_repo_id INTEGER NOT NULL REFERENCES feature_repos(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  outcome TEXT NOT NULL,
  instruction TEXT NOT NULL,
  reply TEXT NOT NULL,
  tools TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX rounds_feature_repo_idx ON rounds(feature_repo_id);
`;

const SCHEMA_V3 = `${SCHEMA_V2}${ROUNDS_TABLE}`;
const SCHEMA_V2_TO_V3 = ROUNDS_TABLE;

const SCHEMA_V1_TO_V2 = `
ALTER TABLE targets ADD COLUMN feature_id INTEGER;
CREATE INDEX targets_feature_idx ON targets(feature_id);

CREATE TABLE repos (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  path TEXT NOT NULL UNIQUE,
  test_command TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE features (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'review', 'done', 'abandoned')),
  goal TEXT,
  workspace_path TEXT,
  archive_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, slug)
);

CREATE TABLE feature_repos (
  id INTEGER PRIMARY KEY,
  feature_id INTEGER NOT NULL REFERENCES features(id) ON DELETE CASCADE,
  repo_id INTEGER NOT NULL REFERENCES repos(id),
  base_branch TEXT NOT NULL,
  branch TEXT NOT NULL,
  worktree_path TEXT,
  pr_url TEXT,
  UNIQUE(feature_id, repo_id)
);

CREATE INDEX features_project_idx ON features(project_id);
CREATE INDEX feature_repos_feature_idx ON feature_repos(feature_id);
`;

export function openDatabase(dbPath: string): DatabaseSync {
  if (dbPath !== ":memory:") {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 5000;");
  if (dbPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const row = db.prepare("PRAGMA user_version").get();
  const version = row && typeof row.user_version === "number" ? row.user_version : 0;
  if (version >= 3) return;
  db.exec("BEGIN");
  try {
    if (version < 1) db.exec(SCHEMA_V3);
    else {
      if (version < 2) db.exec(SCHEMA_V1_TO_V2);
      db.exec(SCHEMA_V2_TO_V3);
    }
    db.exec("PRAGMA user_version = 3;");
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function text(row: Record<string, SQLOutputValue>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`expected text column ${key}`);
  }
  return value;
}

export function integer(row: Record<string, SQLOutputValue>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`expected integer column ${key}`);
  }
  return value;
}

export function integerOrNull(row: Record<string, SQLOutputValue>, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  return integer(row, key);
}

export function textOrNull(row: Record<string, SQLOutputValue>, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`expected text column ${key}`);
  }
  return value;
}

export function rows(stmt: StatementSync, ...params: Array<string | number | null>): Record<string, SQLOutputValue>[] {
  return stmt.all(...params);
}

export function rowId(value: number | bigint): number {
  const id = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(id)) {
    throw new Error("row id is not a safe integer");
  }
  return id;
}
