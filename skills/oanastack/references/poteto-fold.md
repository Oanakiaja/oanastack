# 把 poteto 近期做法折进 oanastack

设计图。本 PR 只加厚 `principles.md`（思想），并在索引里指向本文。playbook 步骤不动。不要按本文直接开做；后续 PR 逐张落地。

不把 pstack 做成第二套栈：不复制 `/poteto-mode`，不 vendor 它的 skill 或脚本，不引入 Graphite，不加 shipping 卡。骨干仍是一个 feature、`oana` 多仓 worktree、做完再批量 merge。merge 仍是 owner 的事。

来源：

- poteto / [pstack](https://github.com/cursor/plugins/tree/main/pstack)：`/create-verification-skill`、`/maintain-verification-skill`、`/in-your-own-words`（[cursor/plugins#603](https://github.com/cursor/plugins/pull/603)）、`/no-comments`、`/poteto-help` 的路由顺序、原则「证明它能工作」「把教训写进结构」。
- [Magpie 的 LESSONS.md](https://github.com/yetone/magpie/blob/main/LESSONS.md)：同一类教训在不同日子见到第三次，升进 `docs/code-standards.md`。升进去的是 Magpie 自己的 Go / GUI 规则，oanastack 不抄那些规则。
- 本仓 [#16](https://github.com/Oanakiaja/oanastack/pull/16)（`cursor/rea-architecture-design-9bec`）：`references/evidence.schema.json` 与 `references/architecture.md`。Evidence 形状来自 REA，归属在那张草案，不在这里重写。

## 已经有的，补洞即可

| 已有 | 已经覆盖 | 不要另起 |
| --- | --- | --- |
| `playbooks/test.md` | 计划、目标验证、证据、逐条 PASS / FAIL | 第二张「验证 playbook」 |
| `references/ui-state-testing.md` | UI / Electron 的分层驱动和证据 | 用通用 verify skill 换掉这张卡 |
| `playbooks/babysit.md`、`review.md` | 散文回复；停在 merge-ready / 评论 | 第二套结论格式 |
| `playbooks/research.md` 第 1 步 | 收束问题、停止条件 | 独立的「理解 playbook」 |
| `playbooks/reflect.md` | 低 / 中 / 高门槛；证据 + 可复用规则 | 日记，或仓库根上的 `LESSONS.md` |
| `principles.md` | 思想（本 PR 已写入） | pstack 24 条原则的索引 |
| `playbooks/README.md` | 任务信号 → 一张卡 | pstack 技能菜单 |
| [#11](https://github.com/Oanakiaja/oanastack/pull/11) 技术写作 | 句子怎么写 | 在原则里再写一套文风 |
| [#6](https://github.com/Oanakiaja/oanastack/pull/6) `code-style.md` | 过门：跟周围走、最小改动、非显然的 why | 第二张风格卡 |

## 思想

落点是 `principles.md`，本 PR 已经写入。判断四条，外加原有的可验证工作单元，以及「第三次才升级」：

1. **够用，并且能被证伪。** 看起来干净排在后面。所有代码先按 slop 对待，生成的和手写的一样。为干净付出的抽象和代理检查是成本。
2. **工程师掌握解药。** 指出 slop 不算完成。解药是真实检查、删掉绕路，或让错误写不出来的结构。
3. **写下来才算想清楚。** 编码前用自己的话对齐目标、问题、假设和不确定。与 `/in-your-own-words` 是同一时机。句子工艺仍归 #11。
4. **注释是病毒。** 优先删临时 workaround 笔记，连它保护的绕路一起处理。留注释只留给改不了的外部原因。不引入 Comment Sicko，不全仓清扫。

「同一类错误第三次才成为标准」写在同一文件里，作为 reflect 的判断。计数步骤不在本 PR。

## 实操

四张后续 PR，都改现有卡。

### 1. 验证循环的入口

`test.md` 已经要求计划和证据。缺的是入口：目标仓没有一条可脚本化的用户路径时，计划无从跑起。

后续 PR 给 `playbooks/test.md` 加一步，并新增 `references/verification-loop.md` 作为它的细则（与 `bugfix.md` → `bug-fix.md` 相同，不新开 playbook）：

- 先问仓库，再问人：用户碰什么、怎么启动、已有 harness、能留下什么证据、能否两实例并排。
- 没有驱动时，在**目标仓**写项目本地的 verify 说明（启动、doctor、按用户路径驱动、证据、清理）。本仓不存放那份说明。
- 交出去之前自己跑通一次。清理之后证据还在。
- 地图会过期。维护只改 verify 说明自己的目录。产品行为坏了就报告，不改文档把洞盖上。
- UI 仓继续走 `ui-state-testing.md`。本循环不替换那张卡；那张卡是 UI 上的一种驱动。

形状来自 `/create-verification-skill` 与 `/maintain-verification-skill`。oanastack 写短卡，不复制这两份 SKILL.md。

### 2. 证据是 playbook 的出口

先看 [#16](https://github.com/Oanakiaja/oanastack/pull/16)，再改 babysit 和 review。schema 留在那张草案的 `references/evidence.schema.json`。不要把 schema 抄进 `skills/`。

#16 已经规定信封：`question`、`status`（`answered` / `partial` / `unresolved`）、`summary`、`what_was_done`、`evidence`、`unknowns`、`needs_human`、`normalized`。`coverage: uncovered` 表示未知，不表示失败。`confidence` 分 `observed` / `derived` / `inferred`。

typed body 只有两张，所以第一张实现 PR 只挂这两张：

- `babysit` → `BabysitResult`（`mode`、`frontier`、`actions`、`remaining`、`stopped_before_merge: true`）。
- `review` → `ReviewResult`（`intent_aligned`、`risks`、`test_gaps`、`comments`、`verdict`）。

其余 playbook 继续用 `DeferredResult`（`kind: deferred` + 今天的散文回复），直到有单独的需要。实现时对照 #16 的例子 `references/examples/babysit.conclusion.json` 和 `review.conclusion.json`。#16 还在草案上时，babysit / review 的散文回复保持原样。

### 3. 用自己的话对齐，再写代码

判断已在 `principles.md`。后续 PR 只加步骤，不新开 skill：

- `playbooks/feat.md`：在「写验收标准」之前。
- `playbooks/bugfix.md`：在「复现」之前。报告很吵时这一步尤其先做。
- `playbooks/research.md` 第 1 步「收束问题」收成同一种复述，不另加一张卡。

复述四段，120 词以内，专有名词和数字保持原样：目标、问题、假设、还不确定。不提出新计划。最多一个问题，而且要写明不同答案会改变什么。用户的原因理论保持为假设。对不上就停。

### 4. 教训升成标准

`playbooks/reflect.md` 与 `references/reflect.md` 加计数，低 / 中 / 高门槛不动。

- 教训记成：规则、为什么、证据、见到的日子。
- 同一类在三个不同的日子出现，提议升级。一个会话里说三遍算一天。
- 升级写进已有 reference（原则、验证、CI 分类，谁负责谁接收）。能编码成 lint、类型或测试的，散文就停。
- 人点头再改 skill 或标准。一次会话的轶事留在教训里。
- 开放列表变长时，用 `references/lessons.md`，由 reflect 指向它。不在仓库根再放一份 Magpie 式 `LESSONS.md`。

这是 `/correct` 与「把教训写进结构」的次序（结构先于文档），加上 Magpie 的三次门槛。不引入三评审并行 reflect，也不自动改 skill。

## 冷启动

后续 PR 新增 `references/cold-start.md`，`SKILL.md` 加一句指针。它不是第十一张 playbook。

用户不知道该问什么时：

1. 只问一个选择，选项就是 `playbooks/README.md` 里已有的信号：调研、修 bug、开 feature、验证、看 diff、盯 PR、复盘。
2. 帮对方说清目标和一条能失败的检查。做法留在目标仓，约束用对方的原话。
3. 用自己的话复述（上一节的四段）。复述对不上就停。
4. **复述之后**再按 `playbooks/README.md` 选卡，把步骤抄进 todo。路由发生在对齐之后，避免含糊的原话配错卡。这是 pstack「先说目标，再由 playbook 选步骤」的顺序，用 oanastack 已有的表，不另做技能目录。

选不出来时走 `research.md`，停在开做之前。

可选的 bot-to-bot 交接，下一位冷启动 Agent 先读再问人。不新做协议，不写进 `oana`：

```text
目标：
复述：
已匹配 playbook：
证据仍缺：
不要重做：
```

交接只在下一位 Agent 看不到这段对话时留下。`oana grokc` 会话和 herdr 状态已经在的，不再抄一份。

## 落点

| 洞 | 落点 | 本 PR | 后续 |
| --- | --- | --- | --- |
| 思想四条 + 第三次升级的判断 | `references/principles.md` | 已写入 | #6 合并后，`code-style.md` 的注释句指回这里 |
| 验证循环入口 | `playbooks/test.md` + `references/verification-loop.md` | 无 | PR A |
| 证据出口 | `playbooks/babysit.md`、`playbooks/review.md`，schema 用 #16 | 无 | PR B，先审 #16 |
| 编码前复述 | `playbooks/feat.md`、`bugfix.md`、`research.md` | 判断已在原则里 | PR C |
| 教训升标准 | `playbooks/reflect.md`、`references/reflect.md` | 判断已在原则里 | PR D |
| 冷启动 | `references/cold-start.md`，`SKILL.md` 一句 | 无 | PR E |

## 后续 PR

- **PR A.** `test.md` 增加「没有用户路径驱动」一步，细则写进 `references/verification-loop.md`。UI 继续用 `ui-state-testing.md`。
- **PR B.** 审完 #16 后，babysit 与 review 的回复改挂 `BabysitResult` / `ReviewResult`。其他卡保持 `DeferredResult`。不复制 schema。
- **PR C.** feat、bugfix、research 加上 120 词复述，对不上就停。不新开 skill。
- **PR D.** reflect 记录教训并在第三个不同的日子提议升级。升级写进已有 reference。人批准后再改。
- **PR E.** `references/cold-start.md`：一个选择、复述、然后才走现有路由。可选交接块。`SKILL.md` 加一句。

#6 合并之后，把 `code-style.md` 的注释句指回 `principles.md` 的保留清单。不单独开风格栈。
