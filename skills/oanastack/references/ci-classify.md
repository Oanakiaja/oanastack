# CI 分类卡

盯 PR / CI 时先分类，再决定重试或改代码。Babysit 流程见 `../playbooks/babysit-lite.md`。

状态以 `gh pr checks` / `gh pr view` 为准，不要求 Graphite。

| 观察 | 判定 | 动作 |
| --- | --- | --- |
| 失败像超时、lost runner、无关 job 抖动 | flake / 基建 | **一次** fresh build；不要对同一 snapshot 做 job retry |
| 同一失败签名出现第二次 | 不是 flake | 停重试；读子 job 日志，改分类 |
| 失败栈 / 文件不在本 PR diff | stale base 或环境 | `git merge-base --is-ancestor <base> <head>`；要 rebase 就上报，不要再烧重试 |
| 失败就在本 diff 改过的路径 / 行为 | 自己的回归 | 修代码并提交；这是唯一允许「为 CI 再 commit」的情况 |
| forge 已 mergeable，只是列表 squint 起来不绿 | 以 forge 为准 | 不要为了对齐绿灯清单去重跑 |

记录每次判定：失败签名（job 名 + 关键断言/文件）、第几次见到、是否落在 diff 内。没有这三项就还没分类完。
