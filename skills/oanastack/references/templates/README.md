# UI lint 模板

**pstack 没有** `.oxlintrc.json`，也没有 react-scan / React Doctor 配置。oanastack 自备这份模板，拷到产品仓当起步。

| 文件 | 何时用 |
| --- | --- |
| `oxlintrc.react.json` | 先拷这份成 `.oxlintrc.json` |
| `oxlintrc.react-extended.json` | 仓准备好再加 `react-perf` + `oxlint-plugin-react-doctor` |

用法见 `../ui-state-oxlint.md`。不要在这两份之外编规则 ID。
