# react-scan 自循环

运行时看「谁在无谓重渲」。只开 **dev / renderer**，不要进 main、preload、生产包。

上游：[aidenybai/react-scan](https://github.com/aidenybai/react-scan)。`npx -y react-scan@latest init` 能侦测框架并装依赖；下面是手写时的最小接法。

## 自循环（抄到 todo）

1. **Dev-only 接入** react-scan（本页目标 UI / Electron renderer）。
2. **跑目标交互**（点选、过滤、打开侧栏、跨窗同步）。
3. **读高亮 / 日志**：谁在闪、一次动作闪几次、props 是否「每次新引用」。
4. **映射回建模错误**：owner 错、selector 太粗、派生走 Effect、`{}` / `[]` / `() =>` 当 props、Context 整树抖。
5. **只修这一处**（收窄 selector、挪权威、杀掉派生 Effect、稳定 props）。见 `render.md` / `usage.md`。
6. **再扫同一条流**，直到安静。

oxlint 过了仍可能扫到热点：静态看不到「订了整店」。两层都要。

## 接入（dev）

**Vite / Electron renderer（Vite）**：脚本须排在应用入口之前。只改进 renderer 的 `index.html` 或 renderer 的 Vite config，不要碰 main。

```html
<!-- renderer index.html，放在任何 module 脚本之前 -->
<script
  crossOrigin="anonymous"
  src="//unpkg.com/react-scan/dist/auto.global.js"
></script>
```

或插件（默认 `enable: process.env.NODE_ENV === 'development'`）：

```bash
npm install -D react-scan @react-scan/vite-plugin-react-scan
```

```ts
import react from '@vitejs/plugin-react'
import reactScan from '@react-scan/vite-plugin-react-scan'

export default defineConfig({
  plugins: [react(), reactScan()],
})
```

**Next（App Router）**：官方用 `beforeInteractive` 脚本。

```tsx
import Script from 'next/script'

<Script
  src="//unpkg.com/react-scan/dist/auto.global.js"
  crossOrigin="anonymous"
  strategy="beforeInteractive"
/>
```

Pages Router 放 `pages/_document.tsx` 的 `<Head>`，同样 `beforeInteractive`。

**入口 import**（Vite/Electron renderer 也行）：必须排在 `react` / `react-dom` 之前。

```ts
import { scan } from 'react-scan'

scan({
  enabled: import.meta.env.DEV,
  log: true,
})
```

`log: true` 方便把渲染写进控制台再对照组件树。不要开 `dangerouslyForceRunInProduction`。

## 看高亮时问什么

- 这次权威改的是哪条事实？（对照模型卡）
- 闪的组件订了那条吗？还是被父级 / Context / 宽 selector 捎上？
- props 是值变了还是引用抖了？（inline 对象/函数是典型）
- 一轮点击闪两次？多半是 Effect + `setState` 派生。

## Checklist（可贴 todo）

```md
- [ ] 只在 dev + 目标 renderer 开 react-scan
- [ ] 跑完目标交互，记下闪的组件和触发动作
- [ ] 每个热点映射：owner / selector / 派生 Effect / 不稳定 props
- [ ] 修一处，再扫同一条流
- [ ] 目标流安静后再收工
```
