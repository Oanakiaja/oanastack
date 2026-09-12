# Worktree Cleanup

**清理挂在 `oana feature done` 上，不手删路径。** 目标：合并或放弃后主 checkout 保持干净。删除不可逆，先分类再动手。

匹配：feature 已合并/放弃、「清 worktree」「`oana feature done`」、磁盘上残留隔离树。

## 步骤（原样抄到 todo）

1. **盘点，不猜路径。** `oana feature list`；对目标 slug 再 `oana feature paths <slug>`。路径来自 state / `git worktree list`，不要手打目录。
2. **逐仓分类 `safe` / `wip`。** 在对应 worktree 看 `git status --porcelain` 与是否仍被 session 使用。
   - `safe`：工作区干净，且 feature 已合并或明确放弃；分支提交仍在，删树可恢复。
   - `wip`：有未提交改动（tracked 或仍要留下的 untracked），或 session 还在用。
3. **`safe` 用 CLI 收掉。** `oana feature done <slug>`（内部 `wt remove`）。不要绕过 state 去 `rm -rf` worktree。
4. **`wip` 先确认。** 展示 `git status` / 关键 diff，等人决定：提交、stash、或确认丢弃后再 `--force`。没有确认不要 `oana feature done <slug> --force`。
5. **复检。** `oana feature list` 不再列出该 slug；各主 checkout `git status` 干净。缺树但 state 残留时，先报再清 state，不假装成功。

## 纪律

- dirty ≠ 可以 `--force`。`--force` 只表示「人已确认可丢」。
- 主 checkout 上的进行中工作不是本 playbook 的清理对象。
- 这是会删本地状态、且没有代码 review 兜底的流程，分类就是审查。

**回复：** 每个 slug/仓的分类、删了什么、扣下的 `wip`（附未提交摘要）、复检结果。
