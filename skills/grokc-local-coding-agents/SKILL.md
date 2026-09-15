---
name: grokc local coding agents
description: use this when driving local coding-agent sessions via oana grokc (launch/reply/watch/approve), concurrent Codex turns, or forwarding Codex approvals to a human. Do not use for Cursor Cloud Agent remote sessions, npm publish, homemade worktree dirs, a second worktree plane besides oana/wt, or auto-approving Codex tool calls unless the user explicitly asked.
---

# grokc local coding agents

Drive **local** coding-agent sessions with **`oana grokc`**. The bot-facing surface mirrors Cursor CloudAgent verbs (`launch` / `reply` / `get` / `list` / `watch` / `dump` / `cancel` / `archive` / `unarchive` / `rename` / `approve`). Codex (`codex app-server` JSONL) is the first working harness.

Canonical invoke is `oana grokc …` (oanastack owns development skills). `oana agent …` is the same subcommand. Standalone `grokc` is an optional thin alias (`bin/grokc` → `oana grokc`).

Package: `packages/grokbot-coding-agent/` (`@oana/grokbot-coding-agent`). Build once if `dist/cli.js` is missing:

```bash
cd packages/grokbot-coding-agent && npm install && npm run build
```

`oana grokc` bootstraps that build when `dist/cli.js` is absent. State dir: `~/.grokbot-coding-agent/`.

## Anti-jobs

Do **not** use this skill for:

- Cursor Cloud Agent **remote** sessions (`repo_url` on github.com, CloudAgent MCP over the network)
- Publishing `@oana/grokbot-coding-agent` to npm unless the user asked
- Inventing a grokc-owned worktree directory — isolation is Worktrunk (`wt`) / `oana feature` only
- Opening a **parallel** worktree plane. Long sessions run **inside** feature worktrees
- Auto-accepting Codex approvals (`acceptForSession`) unless the user **explicitly** asked for `--auto-approve`
- Pointing two live sessions at the same dirty worktree
- Changing CloudAgent session verbs
- Teaching plain `git worktree add` as the isolation plane

## Feature worktrees first

Development isolation stays on the existing oana / Worktrunk plane:

```bash
oana feature start <slug> [repo-alias...]
oana feature hint <slug>    # thread name + cwd
oana feature paths <slug>
```

Session cwd **must** be the feature worktree, not the main checkout. Then drive the coding agent:

```bash
oana grokc launch --harness codex --cwd <feature-worktree> --prompt "…"
```

`oana grokc worktree` still exists and still shells out to `wt`. Use it only when you need an extra isolated checkout for concurrent sessions. Do not treat it as a second product or homemade layout.

## CloudAgent-shaped verbs

```bash
oana grokc launch --harness codex --cwd <dir> --prompt "…"
oana grokc reply <sessionId> --prompt "…" [--interrupt]
oana grokc get <sessionId> --json
oana grokc list --scope launched
oana grokc watch <sessionId>
oana grokc dump <sessionId> --out /tmp/transcript.jsonl
oana grokc cancel <sessionId>
oana grokc rename <sessionId> --title "…"
oana grokc archive <sessionId>
oana grokc unarchive <sessionId>
```

Also accepted: `delete`, `models`, `list_artifacts`. Adjacent: `approve` (below).

- `--json` for machine-readable results.
- Default CLI `launch` / `reply` **wait-for-settle**. `--no-wait` returns `agent_id` + `url` immediately and detaches a worker.
- `cwd` is the local analog of CloudAgent `repo_url`.

## Worktree plane = Worktrunk / oana only

Isolated checkouts are **Worktrunk (`wt`)**. grokc does not own a directory layout.

Install: `brew install worktrunk`. If the shell wraps `wt` as a function, set `WORKTRUNK_BIN` to the real binary (`command -v wt`).

```bash
oana grokc worktree create --repo <git-root> --name <slug> [--base <ref>]
oana grokc worktree list --repo <git-root>
oana grokc worktree remove --repo <git-root> --name <slug> [--force]
```

`launch --worktree <slug> --repo <git-root>` ensures the slug via wt and sets `cwd` to the path from JSON. Missing `wt` is a usage error (`brew install worktrunk`). Prefer `oana feature start` when the task is already an oanastack feature.

## Approvals: forward to the human

Default is **not** `acceptForSession`. When Codex sends `item/*/requestApproval`:

1. Persist a pending approval (id, kind, command/path summary, thread/turn ids, raw payload).
2. Emit `approval.needed`. `oana grokc get` shows `pendingApprovals` and `waitingOnApproval`.
3. Do **not** answer the JSON-RPC request until explicitly decided.

Show the pending approval to the human, then:

```bash
oana grokc get <sessionId> --json
oana grokc approve <sessionId> --request <requestId> --decision accept
# accept | acceptForSession | decline | cancel
```

`--auto-approve` (or `createClient({ autoApprove: true })`) only when the user explicitly asked for an unattended run.

## Concurrent recipe (same wt plane + `--no-wait`)

Two sequential `oana grokc launch --no-wait` calls are concurrent. Give each session its own worktree — either the feature worktree from `oana feature`, or an extra wt slug when you truly need two dirty trees.

```bash
oana grokc worktree create --repo <git-root> --name spike-a
oana grokc worktree create --repo <git-root> --name spike-b --base main

oana grokc launch --no-wait --worktree spike-a --repo <git-root> --prompt "Add tests"
oana grokc launch --no-wait --worktree spike-b --repo <git-root> --prompt "Fix lint"

oana grokc get <session-a> --json    # if waitingOnApproval, forward to the human, then approve
oana grokc watch <session-a>
oana grokc watch <session-b>
```
