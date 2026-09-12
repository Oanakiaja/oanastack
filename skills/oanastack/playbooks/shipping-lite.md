# Shipping Lite

**你只负责把已 merge-ready、且经独立验证的连续 run 合入。** 先声明对象，一次 squash 一个，停在验证天花板。

匹配：「合入」「land」「ship」「merge 这个 / 这批」「把 slug 落地」。未到 merge-ready 的先走 `babysit-lite.md`。

本 playbook 在 babysit 之后：绿灯不是合入许可。作者自己信 CI 绿不算独立验证。

## 步骤（原样抄到 todo）

1. **只接 merge-ready。** 未就绪的 PR 退回 babysit。按 feature slug 盘点多仓 / 多 PR（`oana feature paths` + `gh pr view` / `gh pr status`）。默认 `gh`，不要求 Graphite。
2. **独立验证，不是作者自证。** 每个 PR 由**没写这段 diff 的**人/agent 对真实行为做一次验证，留下证据。CI 绿、bot approve、作者口头「没问题」都不是 verdict。Verdict：`PASS` / `PASS+NOTES` / `FAIL`，并记下 head SHA、base SHA、`git patch-id`（base..head）。
3. **只合入自底向上的连续已验证 run。** 从最低未合并 PR（或 slug 内依赖最底层）往上走，停在第一个没有通过 verdict 的。上面已验证、下面有缺口的不能跳过合入。天花板用 PR 号报出，并说明链在哪断。
4. **rebase / retarget 后再核 patch 身份。** 合入前对比当前 head 与记录的 patch-id。patch 变了 → 重新独立验证。只是 SHA 重写、patch-id 相同 → 保留代码 verdict，但要在当前 head 重看 mergeability / CI。不要用旧 SHA 的绿灯或相同 commit message 顶替。
5. **一次 squash 一个。** 默认 `gh pr merge --squash`。不要 `gt`。不要一次合多个。合入后 fetch trunk，确认 merged SHA 在主干上，再处理下一个。停在天花板，汇报已落地的 PR。
6. **对齐骨干：一个 feature、多仓 worktree、做完再批量合入。** slug 内各仓 PR 都过独立验证后才开始这轮批量；合入或放弃后清理走 `cleanup.md`。

## 不做

- 未 merge-ready 不合入（回 `babysit-lite.md`）。
- 作者单独信任 CI 绿就 merge。
- 引入 Graphite；不 vendor pstack 脚本。
- 跳过缺口去合上面的已验证 PR。
- 把 rebase 当无副作用：做完必须重核 patch-id / head。

**回复：** slug 与 PR 列表、每个 PR 的 verdict / 验证者 / patch-id、合入了什么、天花板与缺口、下一步。
