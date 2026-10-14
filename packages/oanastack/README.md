# @oana/oanastack

Local progress dashboard for agent-driven work. Canonical command is **`oanastack`** (`bin/oanastack` in this repo). Skill: [`../../skills/oanastack-progress/SKILL.md`](../../skills/oanastack-progress/SKILL.md).

Agents register repos by absolute path, open a feature workspace with one git worktree per repo, and log targets plus completion records. `oanastack serve` opens a localhost page: a project → base branch → worktree tree on the left, a project overview on the right, and a worktree detail with a side-by-side diff when one is selected.

- Package: `@oana/oanastack` (private, not published)
- Node.js: >= 22.13 (`node:sqlite`, no native addon)
- Root: `~/.oanastack/` (`oanastack config root <path>`)
- Database: `<root>/oanastack.sqlite`
- Feature workspace: `<root>/projects/<project>/features/<feature>/<repo>/` plus `AGENTS.md`
- Dashboard: `http://127.0.0.1:4747`

```bash
cd packages/oanastack
npm install
npm test
npm run build
```

`bin/oanastack` builds `dist/cli.js` on first use when it is missing.

Stack: `node:sqlite` for the file database, [citty](https://github.com/unjs/citty) for typed argv, Hono for the localhost API, Vite + React for the page bundled into `dist/web`. Drizzle's `node:sqlite` driver is still a 1.0 beta, so this package talks to SQLite directly instead of taking a native `better-sqlite3` build.
