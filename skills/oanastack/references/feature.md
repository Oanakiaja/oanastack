# 功能开发

开始编码前，先按 `feature-session.md` 建立 feature session 与隔离 worktree（多仓时每仓一个）。步骤卡见 `../playbooks/feat.md`。探索性任务先走 `../playbooks/research.md`。

建议流程：
1. 明确验收标准与边界。
2. 小步提交，优先可验证改动。长 session 在 feature worktree 内用 `oana grokc`，不要另起 worktree 平面。
3. 提交前完成目标验证并记录关键证据。
