# React Doctor：Agent 可脚本自循环

编码 Agent 改 React 时，**主循环是 React Doctor**（scan → fix → rescan），不是 react-scan。react-scan 作者把 Doctor 当作 Agent 向的入口；react-scan 只做运行时高亮（`ui-state-react-scan.md`）。

**pstack 没有**这份配置。官方 Agent playbook：[react-doctor-agent.md](https://www.react.doctor/prompts/react-doctor-agent.md)。CLI：[cli-reference](https://www.react.doctor/docs/reference/cli-reference)。

## 怎么接

优先用产品仓 **钉死的本地** `react-doctor`（`pnpm add -D react-doctor` 后走 `pnpm exec react-doctor`）。没有再 `npx`，且全程同一个可执行文件 / 版本。

可选：给人类 Agent 装 skill / hook（会改检测的到的 Agent 目录，不要默默装进无关仓）：

```bash
npx react-doctor@latest install
```

`-y` / `--yes`：跳过提示。扫描时表示扫所有检测到的 workspace 项目；`install` 时表示给所有检测到的 Agent 装 skill。

## scan / fix / rescan

解析 JSON 前先看 `schemaVersion === 3`，不是 3 就停，不要猜字段。官方默认就是 v3（[JSON report](https://github.com/millionco/react-doctor/blob/main/docs/json-report.md)）。不管进程退出码，先 parse；`ok !== true` 当扫描失败。

```bash
# 初扫：advisory，别让 exit code 打断 Agent
npx react-doctor@latest -y --json --blocking none --scope changed --base main \
  > /tmp/rd-initial.json

# 确认 schemaVersion === 3 且 ok === true
# 按 diagnostics 修（owner / 派生优先，见 ui-state.md）

# 同一可执行文件、同一 scope / base 再扫，证明目标消失
npx react-doctor@latest -y --json --scope changed --base main \
  > /tmp/rd-rescan.json
```

`--scope changed`：相对 `--base` 的**新引入**问题。`--blocking none`：只出报告、不靠退出码当门。修完 rescan 可以拿掉 `--blocking none`，或继续 none 只看 JSON。

单条不懂：`npx react-doctor@latest why path/to/File.tsx:12` 或 `rules explain react-doctor/<id>`。

## Agent 循环（抄到 todo）

1. 选定可执行文件（本地 pin，否则一次 resolve 的 `npx react-doctor@<ver>`），之后不换
2. `-y --json --blocking none --scope changed --base <default-branch>` → `rd-initial.json`
3. `schemaVersion === 3` 且 `ok === true`，再读 `diagnostics`
4. 按规则修；先 owner / 派生，不要编规则 ID
5. 同一命令 rescan → `rd-rescan.json`；目标 id 必须消失
6. 受影响项目再跑一次未过滤扫描，确认没引入别类诊断
7. `pnpm lint:react`（`ui-state-oxlint.md`）
8. 用户流若仍卡：浏览器走 `ui-state-react-scan.md`；有行为风险走 `ui-state-testing.md`

```md
- [ ] 同一 pin 的 react-doctor 可执行文件
- [ ] 初扫 JSON：schemaVersion 3、ok true
- [ ] 按 diagnostics 修，不编 ID
- [ ] 同 scope rescan，目标消失
- [ ] `pnpm lint:react`
- [ ] 需要时 react-scan 浏览器环 + feature e2e
```

不要在生产构建里开 react-scan。Doctor 是源码扫描，不是运行时注入。
