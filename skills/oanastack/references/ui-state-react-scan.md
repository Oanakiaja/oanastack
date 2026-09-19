# react-scan：运行时浏览器循环

在 **已挂载的 Web / Electron renderer** 上看谁在无谓重渲。这是人眼 + Agent 开浏览器时的循环。

编码 Agent **不要**把 react-scan 当可脚本自循环。作者现在推荐 **React Doctor** 做 scan / fix / rescan（`--json -y`），见 `ui-state-react-doctor.md`。两边连起来：Doctor 改源码 → 同一条用户流再用本卡看高亮是否安静。

只开 **dev / 被测 surface**。不要进 Main、preload、生产包。**pstack 没有** react-scan 接入。

上游：[aidenybai/react-scan](https://github.com/aidenybai/react-scan)。

## 初始化（dev only）

```bash
npx -y react-scan@latest init
```

Vite / Electron renderer：脚本必须排在应用 bundle **之前**。

```html
<script crossOrigin="anonymous" src="//unpkg.com/react-scan/dist/auto.global.js"></script>
```

或入口里（该模块不要先 import `react` / `react-dom`）：

```ts
if (import.meta.env.DEV) {
  const { scan } = await import('react-scan')
  scan({ enabled: true, log: true, showToolbar: true })
}
```

不要设 `dangerouslyForceRunInProduction`。Next 用官方 `beforeInteractive` `<Script>`。

## Agent 浏览器循环（抄到 todo）

1. 在被测 surface 打开 scan（Web 或 Electron renderer）
2. 用浏览器跑觉得卡、或 Doctor/oxlint 刚改完的那条用户流
3. 记下：谁在闪、渲染次数、props 是否引用抖动（截图 + toolbar）
4. 热点映射回 owner：整店订阅、selector 新对象、派生 Effect、inline 不稳定 props、Context 整树
5. 按 `ui-state.md` 修
6. **同一条流**再扫，直到热点安静
7. 再跑 `pnpm lint:react` + React Doctor rescan
8. 有行为风险：`ui-state-testing.md`

```md
- [ ] 只在 dev + 被测 renderer 开 react-scan
- [ ] 跑完目标流；截图 + 闪的组件 / 次数 / 动作
- [ ] 热点 → owner / selector / 派生 Effect / 不稳定 props
- [ ] 修一处，再扫同一条流
- [ ] `pnpm lint:react` + React Doctor `--json` rescan
- [ ] 行为有风险则跑 feature e2e
```

生产构建必须关 scan。
