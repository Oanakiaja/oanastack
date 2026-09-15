# Feature Session 协作规范

步骤卡见 `../playbooks/feat.md`。清理纪律见 `../playbooks/cleanup.md`。

## 1) 工作单元
- 一个 feature = 一个 agent / Codex 线程。
- 线程命名建议：`<repo>-<feature>`，多仓可共用同一个 feature slug。

## 2) 多仓 feature 必须隔离
- 每个相关仓库创建一个 worktree。
- session 的 cwd 必须指向 worktree，不能指向主 checkout。

## 3) 工具选择
- 短任务可使用 `codex exec`。
- 长 feature 持续在 feature session 推进；本地 coding-agent 会话用 `oana grokc`（在 feature worktree cwd 内）。
- 优先使用 `wt` / `oana`：
  - `oana feature start <slug> [repo-alias...]`
  - `oana feature paths <slug>`
  - `oana feature done <slug>`
  - `oana grokc launch|reply|get|list|watch|dump|cancel|archive|rename|approve …`
- 不要用 grokc 再造一套 worktree 目录；Worktrunk / `oana feature` 仍是唯一隔离平面。细则见 `../../grokc-local-coding-agents/SKILL.md`。
- grokc 只在 oanastack：`oana grokc` / `packages/grokbot-coding-agent/`。不要把独立 grokc CLI 仓库当产品入口。

## 4) 清理
- 合并或放弃后，立即清理 worktree，保持主 checkout 干净。
- `oana feature done <slug> [--force]`

## 5) 推荐操作顺序
1. `oana feature start <slug> ...`
2. 用 `oana feature hint <slug>` 获取线程命名与 cwd 提示。
3. 在各 repo worktree 中开发、验证。
4. 合并/放弃后 `oana feature done <slug>`。
