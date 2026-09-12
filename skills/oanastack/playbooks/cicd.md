# CI/CD

**先分类，再决定重试或改代码。** 盲 `re-run` 浪费时间还掩盖 stale base。细则 `../references/ci-classify.md`。盯整个 PR 到 merge-ready 走 `babysit.md`。

匹配：「CI 红了」「要不要重跑」「flake 还是真挂」「要不要 rebase」。

## 步骤（原样抄到 todo）

1. **读 forge 状态，不拼绿灯清单。** 默认 `gh pr checks` / `gh pr view`。Ready = forge 认为可以 merge。不要求 Graphite。
2. **写下失败签名。** job 名 + 关键断言/文件、第几次见到、是否落在本 diff 内。三项不齐就还没分类完。
3. **按分类行动（三选一）：**
   - **fresh-build**：疑似 flake / 基建 → 只给**一次**新构建，不要对同一 snapshot 做 job retry。
   - **fix**：失败就在本 diff → 修代码并提交。这是唯一允许「为 CI 再 commit」的情况。
   - **rebase-report**：失败点不在本 diff，或 base 已不是祖先 → 上报要 rebase，不要用重试掩盖。
4. **同一失败第二次：停重试。** 不是 flake。读子 job 日志，改分类。
5. **生产配置只读。** 禁止为了凑绿直接改生产环境配置。

## 不做

- 不对同一 snapshot 盲 retry。
- 不在这里 merge / land / ship（owner-only）。
- 不引入 Graphite。

**回复：** 失败签名、分类、采取的动作（fresh-build / fix / rebase-report）、还要人拍板的点。
