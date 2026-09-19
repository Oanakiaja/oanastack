# UI oxlint：配置与修复循环

静态抓 hooks / 派生 state / render 期 setState。跑在 react-scan 之前。规则 ID 以 [Oxlint rules](https://oxc.rs/docs/guide/usage/linter/rules.html) 和本机 `oxlint --help` 为准，**不要编名字**（虚构 ID 可能被静默忽略）。

下面 JSON 与五条规则已在 **oxlint 1.83.0** 上对过：都能报真实文件。`react/rules-of-hooks`、`react/exhaustive-deps` 输出前缀是 `react-hooks(...)`，配置仍写 `react/...`。

## 推荐 `.oxlintrc.json`

这是 **React 专项** 配置：`plugins` 只开 `react`，`correctness` 先关上，再点名五条。给 `lint:react` 用；全仓通用 lint 若还要 eslint / unicorn / oxc，另写一份或 `overrides`，不要默默覆盖默认插件集。

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

```json
{
  "scripts": {
    "lint:react": "oxlint packages/*/src apps/*/src"
  }
}
```

CLI 等价探测：

```bash
oxlint --react-plugin \
  --deny react/rules-of-hooks \
  --deny react/exhaustive-deps \
  --deny react/set-state-in-effect \
  --deny react/no-deriving-state-in-effects \
  --deny react/set-state-in-render \
  packages apps
```

可选下一步：仓准备好再加 `--react-perf-plugin`（`jsx-no-new-*-as-prop` 等）。加之前用 `oxlint --help` 和规则页核对 ID，不要凭记忆发明。

## 修复原则

- 派生在 render；用户动作在事件处理。
- 身份变化要重置的本地草稿：render 期条件更新可以，必须收敛；这条路径不写 store、不 fetch、不碰 DOM。
- 异步读按 request id 建钥；abort / 忽略过期；重试 = 新 request。
- 稳定回调：满依赖 `useCallback`。Effect 里只对外的 handler：有 `useEffectEvent` 就用。
- Effect 只留：订阅、网络、DOM、动画、iframe / Blob URL + cleanup。
- 极少 `oxlint-disable-next-line react/set-state-in-effect`，必须一行理由（测量 / 滚动高亮、Blob URL 生命周期、iframe keepalive、采纳外部路由）。**禁止**blanket disable `exhaustive-deps`。新例外要证明 render / 事件表达不了。

## Agent 循环（抄到 todo）

1. `pnpm lint:react`（或仓库等价 make / 脚本）
2. 按规则分组，不要一条条跳着改
3. 先修 owner / 派生（见 `ui-state.md`）；disable 是最后手段，且带理由
4. 再跑到干净
5. 若仓里有 ui-state 静态门（整店订户 / 字面量 selector / 禁 import），一并跑
6. 目标交互再走 `ui-state-react-scan.md`；有行为风险走 `ui-state-testing.md`

```md
- [ ] `pnpm lint:react` 红的按规则分组
- [ ] owner / 派生修完，不编规则 ID
- [ ] 无理由 disable；无 blanket exhaustive-deps
- [ ] 静态门（若有）+ lint 全绿
```
