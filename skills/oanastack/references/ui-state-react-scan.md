# react-scan：Agent 自循环

运行时看谁在无谓重渲。只开 **dev / 被测 surface**（Web 或 Electron renderer）。不要进 Main、preload、生产包。

上游：[aidenybai/react-scan](https://github.com/aidenybai/react-scan)。产品若已有自制高亮，Agent 循环仍统一用 react-scan，避免两套读法。

## 安装 / 初始化（dev only）

```bash
pnpm add -D react-scan
```

Vite / Electron **renderer** 入口：

```ts
if (import.meta.env.DEV) {
  const { scan } = await import('react-scan')
  scan({ enabled: true, log: true, showToolbar: true })
}
```

`import('react-scan')` 必须发生在该模块拉 `react` / `react-dom` 之前，或用官方 CDN / `npx -y react-scan@latest init`。不要设 `dangerouslyForceRunInProduction`。

快速会话也可用文档里的 CDN bookmarklet / `auto.global.js`（仍只挂 renderer / 本页）。Next 用官方 `beforeInteractive` `<Script>`。

## Agent 自循环（抄到 todo）

1. 在被测 surface 打开 scan（Web 或 Electron renderer）
2. 跑觉得卡、或刚改完状态的那条用户流
3. 记下：谁在闪、渲染次数、props 是否引用抖动（截图 + toolbar 笔记）
4. 每个热点映射回 owner 错误：整店订阅、selector 新对象、派生 Effect、inline 不稳定 props、Context 整树
5. 按 `ui-state.md` 修：收窄 selector、挪权威、杀掉派生 Effect、稳定 props / action
6. **同一条流**再扫，直到热点安静
7. 跑 oxlint + ui-state 静态门（`ui-state-oxlint.md`）
8. 有 UI 行为风险：补该 surface 的组件 / feature e2e（`ui-state-testing.md`）

## Checklist

```md
- [ ] 只在 dev + 被测 renderer 开 react-scan
- [ ] 跑完目标流；截图 + 记下闪的组件 / 次数 / 动作
- [ ] 热点 → 整店订户 / 字面量 selector / 派生 Effect / 不稳定 props / Context
- [ ] 修一处，再扫同一条流
- [ ] `pnpm lint:react` + 静态门
- [ ] 行为有风险则跑对应 feature e2e
```

生产构建必须关 scan。
