# Babysit Lite

**你只负责 merge frontier 推到 merge-ready。** 先声明模式，一次清一个 PR，停在人决定 merge 的那条线之前。

匹配：「盯这个 PR」「变绿」「merge-ready」「看 CI」「处理 review / bugbot 评论」「check on PR X」。开 PR 本身不自动进入本 playbook。

要求 land / ship / merge 时**不要**在这里做：转到 `shipping-lite.md`。本 playbook 到 merge-ready 为止。

分类细则见 `../references/ci-classify.md`。

## 步骤（原样抄到 todo）

1. **先声明模式，再轮询。**
   - `drive`：循环修到 merge-ready（「babysit / 变绿 / merge-ready」；未声明时默认此项）。
   - `check`：只做一轮状态并汇报（「看看 X」「绿了吗」；小改动 / 纯文档默认用这个，不要 `drive`）。
   - `threads-only`：只处理 review 线程，不动 CI / 冲突（「回这些评论」）。
2. **只做 merge frontier。** 最低未合并 PR 是当前唯一工作对象。上游线程可以读、可以记，但不能为修上游而打断 frontier 的检查。
3. **顺序：冲突 → review → CI。** 已知修复打成一轮 push。冲突只上报（指出哪条分支要 rebase）并停下，不要为了显得忙去刷 CI。
4. **信任 forge 状态，不要自己拼绿灯清单。** 默认 `gh pr view` / `gh pr checks` / `gh pr status`。不要求 Graphite（`gt`）。Ready = forge 认为可以 merge，不是「checks 看起来都绿」。
5. **CI 先分类再重试。** 见下方规则与 `../references/ci-classify.md`。禁止盲 `re-run`。
6. **停在 merge-ready。** 不 `gh pr merge`，不代人点 merge。Owner 审批是等待，不是你去绕过的 blocker。

## CI 分类（重试前必做）

- **疑似 flake / 基建**：只给一次**新构建**（fresh build），不要对同一 snapshot 做 job retry。
- **同一失败出现第二次**：不是 flake。改分类，读子 job 日志，不要再盲重试。
- **失败点不在本 diff**：先当 stale base。用 `git merge-base --is-ancestor` 核对 base 是否仍是祖先；需要 rebase 就上报，不要用重试掩盖。
- **只有本 diff 内的失败才允许再提交。**

## 不做

- 不 merge、不 arm merge-when-ready（合入 / land / ship 走 `shipping-lite.md`）。
- 不改 stack topology（不改 base、不做整栈 rebase / force-push）；需要 rebase 时上报给 feature owner。
- 不引入 Graphite 作为前置。

**回复：** 模式、frontier PR 与 `gh` 状态、修了什么 / 驳回了什么（附原因）、还缺什么、需要人拍板的点。
