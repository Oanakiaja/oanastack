# UI lint 模板

**pstack 没有** `.oxlintrc.json`，也没有 react-scan / React Doctor 配置。oanastack 自备这份模板，拷到产品仓当起步。

| 文件 | 何时用 |
| --- | --- |
| `oxlintrc.react.json` | 先拷这份成 `.oxlintrc.json` |
| `oxlintrc.react-extended.json` | 仓准备好再加 `react-perf` + `oxlint-plugin-react-doctor` |

用法见 `../ui-state-oxlint.md`。不要在这两份之外编规则 ID。

## AGENTS 片段

`AGENTS.md` 的正文是 `oana setup` / `oanastack setup` 应追加进目标项目 `AGENTS.md` 的片段。重复 setup 时先查找标记 `oanastack:review-before-change`，已存在则跳过，避免同一段再贴一遍。

该追加尚未接到 `bin/oana`：仓库里没有 `setup` 子命令。
