# UI oxlint：模板与修复循环

静态抓 hooks / 派生 state / render 期 setState。Agent 可脚本的 scan/fix/rescan 走 **React Doctor CLI**（`ui-state-react-doctor.md`）；react-scan 只负责浏览器里高亮（`ui-state-react-scan.md`）。

**pstack 没有** oxlint / react-scan / React Doctor 配置。从本仓模板拷，不要去 pstack 找。

规则 ID 以 [Oxlint rules](https://oxc.rs/docs/guide/usage/linter/rules.html)、本机 `oxlint --help`、以及 `templates/` 里写明的为准。**不要编名字**（虚构 ID 可能被静默忽略）。五条 `react/*` 已在 **oxlint 1.83.0** 对过真实文件。`react/rules-of-hooks`、`react/exhaustive-deps` 输出前缀是 `react-hooks(...)`，配置仍写 `react/...`。

## 拷模板

起步（React 专项：`plugins` 只开 `react`，`correctness` 关上再点名五条）：

```bash
cp skills/oanastack/references/templates/oxlintrc.react.json .oxlintrc.json
```

完整 JSON 见 `templates/oxlintrc.react.json`：

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react"],
  "categories": { "correctness": "off" },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "error",
    "react/set-state-in-effect": "error",
    "react/no-deriving-state-in-effects": "error",
    "react/set-state-in-render": "error"
  }
}
```

这是给 `lint:react` 用的专项 config。全仓通用 lint 若还要 eslint / unicorn / oxc，另写一份或 `overrides`，不要默默覆盖默认插件集。

仓准备好再换 `templates/oxlintrc.react-extended.json`（加 `react-perf` + `oxlint-plugin-react-doctor` 的 `no-fetch-in-effect` / `no-derived-state`）。先 `pnpm add -D oxlint-plugin-react-doctor`，规则页核对后再开。不要在模板之外发明 ID。

```json
{
  "scripts": {
    "lint:react": "oxlint",
    "lint:react:fix": "oxlint --fix"
  },
  "devDependencies": {
    "oxlint": "^1.81.0"
  }
}
```

路径按产品仓改，例如 `oxlint packages/*/src apps/*/src`。

## 修复原则

- 派生在 render；用户动作在事件处理。
- 身份变化要重置的本地草稿：render 期条件更新可以，必须收敛；这条路径不写 store、不 fetch、不碰 DOM。
- 异步读按 request id 建钥；abort / 忽略过期；重试 = 新 request。
- 稳定回调：满依赖 `useCallback`。Effect 里只对外的 handler：有 `useEffectEvent` 就用。
- Effect 只留：订阅、网络、DOM、动画、iframe / Blob URL + cleanup。
- 极少 `oxlint-disable-next-line react/set-state-in-effect`，必须一行理由。**禁止** blanket disable `exhaustive-deps`。

## Agent oxlint 循环（抄到 todo）

1. `pnpm lint:react`
2. 按规则分组；先修 owner / 派生（`ui-state.md`）
3. `set-state-in-effect` 的 disable 只能单行且带理由
4. 再跑到干净（可跟 `pnpm lint:react:fix`，剩下的手修）
5. 有 ui-state 静态门就一起跑
6. 编码 Agent 接着走 React Doctor scan/fix/rescan（`ui-state-react-doctor.md`）；浏览器热点走 `ui-state-react-scan.md`

```md
- [ ] 已拷 `templates/oxlintrc.react.json`（或仓内等价）
- [ ] `pnpm lint:react` 按规则分组
- [ ] owner / 派生先修；无编造 ID
- [ ] 无理由 disable；无 blanket exhaustive-deps
- [ ] 静态门（若有）+ lint 全绿
```
