# `oana grokc`（本地 coding agent）

入口仍是本 skill（`../SKILL.md`）。本卡是工具章：用 `oana grokc` 驱动本地 Codex，不是第二套 skill。

Canonical invoke：`oana grokc …` / `oana agent …`。产品入口只在本仓 `packages/grokbot-coding-agent/`。独立 `grokc`（`bin/grokc` → `oana grokc`）只是薄别名。不要 clone / 指向独立 grokc CLI 仓库。

缺 `dist/cli.js` 时先 build（`oana grokc` 也会自动 bootstrap）：

```bash
cd packages/grokbot-coding-agent && npm install && npm run build
```

State dir：`~/.grokbot-coding-agent/`。

## 不要用本卡做这些

- Cursor Cloud Agent **remote** sessions（`repo_url` on github.com）
- 没人要求就 `npm publish` `@oana/grokbot-coding-agent`
- homemade worktree 目录；隔离只走 Worktrunk（`wt`）/ `oana feature`
- 第二套 worktree 平面。长 session 必须待在 feature worktree 里
- 自动 accept Codex approvals（`acceptForSession`），除非用户明确要 `--auto-approve`
- 两个 live session 指同一 dirty worktree
- 改 CloudAgent session verbs
- 把 `git worktree add` 当隔离平面
- 把独立 grokc CLI checkout 当产品入口

## Feature worktrees first

```bash
oana feature start <slug> [repo-alias...]
oana feature hint <slug>    # thread name + cwd
oana feature paths <slug>
```

Session cwd **必须**是 feature worktree，不是主 checkout。然后：

```bash
oana grokc launch --harness codex --cwd <feature-worktree> --prompt "…"
```

`oana grokc worktree` 仍走 `wt`，只在真需要额外 isolated checkout 做并发时用。不是第二套产品。

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

Also：`delete`、`models`、`list_artifacts`；相邻：`approve`。

- `--json` 给机器读。
- 默认 `launch` / `reply` **wait-for-settle**。`--no-wait` 立刻返回 `agent_id` + `url` 并 detach worker。
- `cwd` 是 CloudAgent `repo_url` 的本地对应。

## Worktree 平面 = Worktrunk / oana only

隔离 checkout 只走 **Worktrunk (`wt`)**。缺 `wt` 是 usage error（`brew install worktrunk`）。shell 把 `wt` wrap 成 function 时设 `WORKTRUNK_BIN`。

```bash
oana grokc worktree create --repo <git-root> --name <slug> [--base <ref>]
oana grokc worktree list --repo <git-root>
oana grokc worktree remove --repo <git-root> --name <slug> [--force]
```

`launch --worktree <slug> --repo <git-root>` 用 wt 确保 slug，并把 `cwd` 设成 JSON 路径。任务已经是 oanastack feature 时优先 `oana feature start`。

## Approvals：转给人工

默认 **不是** `acceptForSession`。Codex 发 `item/*/requestApproval` 时：

1. Persist pending approval（id、kind、command/path summary、thread/turn ids、raw payload）。
2. Emit `approval.needed`。`oana grokc get` 会显示 `pendingApprovals` 与 `waitingOnApproval`。
3. 没人拍板前不要回 JSON-RPC。

给 human 看 pending，然后：

```bash
oana grokc get <sessionId> --json
oana grokc approve <sessionId> --request <requestId> --decision accept
# accept | acceptForSession | decline | cancel
```

`--auto-approve`（或 `createClient({ autoApprove: true })`）只有用户明确要求 unattended run 才用。

## Concurrent（同一 wt 平面 + `--no-wait`）

两次连续 `oana grokc launch --no-wait` 就是并发。每个 session 自己的 worktree：feature worktree，或真需要两棵 dirty tree 时再加 wt slug。

```bash
oana grokc worktree create --repo <git-root> --name spike-a
oana grokc worktree create --repo <git-root> --name spike-b --base main

oana grokc launch --no-wait --worktree spike-a --repo <git-root> --prompt "Add tests"
oana grokc launch --no-wait --worktree spike-b --repo <git-root> --prompt "Fix lint"

oana grokc get <session-a> --json    # waitingOnApproval 就转给人工再 approve
oana grokc watch <session-a>
oana grokc watch <session-b>
```
