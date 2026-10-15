# Babysit

**你只负责把 merge frontier 推到 merge-ready。** 先声明模式，一次清一个 PR，停在人决定 merge 的那条线之前。

匹配：「盯这个 PR」「变绿」「merge-ready」「看 CI」「处理 review / bugbot 评论」「check on PR X」。只看 diff、写评论走 `review.md`。纯 CI 分诊走 `cicd.md`。

连续 `drive` 的入口有两条：用户明确要求（「盯这个 PR」「变绿」），以及 `feat.md` 为 feature frontier 开出指向 `main` / `master` 的 PR/MR 之后交接到本卡。开一个无关 PR 不会自动进入 babysit。

merge / land / ship **不要**在这里做：到 merge-ready 后只通知 owner（oana），合入由 owner 做。没有 shipping 卡。

分类细则见 `../references/ci-classify.md`。e2e / 目标验证见 `test.md`；UI 可走 `../references/ui-state-testing.md`。

## 步骤（原样抄到 todo）

1. **先声明模式，再轮询。**
   - `drive`：连续做 review、e2e / 目标验证、修复，直到 merge-ready，然后只通知 owner（「babysit / 变绿 / merge-ready」；`feat.md` 交出 feature→`main` / `master` frontier 时也进这项；未声明时默认此项）。经 herdr 驱动时，done / blocked 回调可以唤醒本卡继续 `drive`（`../../herdr-grokbot/SKILL.md`）。不在这里写 webhook 或生产配置。
   - `check`：只做一轮状态并汇报（「看看 X」「绿了吗」；小改动 / 纯文档默认用这个，不要 `drive`）。
   - `threads-only`：只处理 review 线程，不动 CI / 冲突（「回这些评论」）。
2. **只做 merge frontier。** 最低未合并 PR 是当前唯一工作对象。上游线程可以读、可以记，但不能为修上游而打断 frontier 的检查。
3. **顺序：冲突 → review → CI。** 已知修复打成一轮 push。冲突只上报（指出哪条分支要 rebase）并停下，不要为了显得忙去刷 CI。review 是声称 merge-ready 之前的必过门：按 `review.md` 的看法自己审完（意图、风险、验证），或把 review 线程处理完。要改的留在本卡修。没过 review，不能报 ready。
4. **信任 forge 状态，不要自己拼绿灯清单。** 默认 `gh pr view` / `gh pr checks` / `gh pr status`。不要求 Graphite（`gt`）。forge 侧可以 merge，指的是 forge 认为可以 merge，不是「checks 看起来都绿」。e2e / 目标验证另算：验收标准要求的，或仓库里已经有的 e2e / 目标检查，都要有证据（命令、关键输出、head SHA）。跑法见 `test.md`；UI 见 `../references/ui-state-testing.md`。forge CI 全绿不能代替这道门。没有可跑的检查、验收也不要求时，留下 `skip: <原因>`。
5. **CI 先分类再重试。** 见 `cicd.md` 与 `../references/ci-classify.md`。禁止盲 `re-run`。
6. **停在 merge-ready，只通知 owner（oana）。** review 已过，且 e2e / 目标验证有证据（或按上一步留下 `skip`）时，在回复里请 oana merge。不 `gh pr merge`，不 arm merge-when-ready，不自己 merge。Owner 审批是等待，不是你去绕过的 blocker。

## CI 分类（重试前必做）

- **疑似 flake / 基建**：只给一次**新构建**（fresh build），不要对同一 snapshot 做 job retry。
- **同一失败出现第二次**：不是 flake。改分类，读子 job 日志，不要再盲重试。
- **失败点不在本 diff**：先当 stale base。用 `git merge-base --is-ancestor` 核对 base 是否仍是祖先；需要 rebase 就上报，不要用重试掩盖。
- **只有本 diff 内的失败才允许再提交。**

## 不做

- 不 merge、不 arm merge-when-ready、不自己 merge。merge / land / ship 是 owner-only；绿了只通知 oana。
- 不改 stack topology（不改 base、不做整栈 rebase / force-push）；需要 rebase 时上报给 feature owner。
- 不引入 Graphite 作为前置。
- 禁止直接改生产环境配置。

**回复：** 仍用散文。merge-ready 意味着 review 与 e2e / 目标验证都有证据，且 `stopped_before_merge: true`（只通知 owner，不 merge）。模式、frontier PR 与 `gh` 状态、修了什么 / 驳回了什么（附原因）、还缺什么、需要人拍板的点。结构化 `BabysitResult` 仍等 #16，本卡不改回复格式。
