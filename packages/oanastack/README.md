# @oana/oanastack

Local progress dashboard for agent-driven work. Canonical command is **`oanastack`** (`bin/oanastack` in this repo). Skill: [`../../skills/oanastack-progress/SKILL.md`](../../skills/oanastack-progress/SKILL.md).

Agents register repos by absolute path, open a feature workspace with one git worktree per repo, and log targets plus completion records. `oanastack serve` opens a localhost page: a project → base branch → worktree tree on the left, a cross-project board at `#/`, a project overview after a project is chosen, and a worktree detail with rounds, targets, and a side-by-side diff when one is selected. That page is three draggable columns: the project tree, the worktree meta plus file tree, and the diff. Each side of the diff can pick a branch and a commit; until then it stays base versus the worktree. A side control switches that diff between 滚动 (the stacked right pane) and 全量 (the clicked file, in full). The project tree, the file tree, and the side-by-side columns can be dragged. Added files are marked `+` and deleted files `-`. Each target on that worktree also has a collapsible incremental diff: the first against base, later ones against the previous target's end commit. `target add` records HEAD as `startSha`; `target result` and `done` record HEAD as `endSha`. Agents log a turn with `round add`.

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
