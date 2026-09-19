# UI 状态系统：React + Electron

谁拥有事实、怎么订、何时 Effect、怎么扫多余渲染。Web 与桌面共用；桌面多一层 **main 权威**。

先分类再写 hook。不要先 `useEffect` + `useState` 再倒推 owner。

## 硬规则

1. 能在 render 里算出来的，不要放进 state / Effect。
2. `useEffect` 只做「同步到 React 外面」（播放器、DOM 测量、原生桥、analytics）。不要用它拉数据、派生状态、当 `componentDidMount`。
3. 外部权威状态用 `useSyncExternalStore` 读（Zustand 的 `useStore` 底层就是它）。

## 选型

| 事实属于谁 | 怎么接 React |
| --- | --- |
| 本页 UI（侧栏、输入草稿） | `useState` / `useReducer` |
| 应用内存真相（跨组件） | Zustand（细 selector） |
| 跨刷新持久（Web） | IndexedDB 是 owner；内存快照 + `useSyncExternalStore` |
| 服务端数据 | TanStack Query（或等价）；不要 `useEffect(() => fetch)` |
| 真正的外部系统 | `useEffect` / 专用 hook |

细则按卡片走，不要在这里加第三套规范。

## 流水线

用户点击 → store action / mutation → IndexedDB 或 API 或 main（权威）→ **成功后** 更新 snapshot/cache → 组件经 selector / `useSyncExternalStore` 重渲 → render 派生 UI → 少数 `useEffect` 同步外部。

Electron：Web 里 IndexedDB / 后端是权威；桌面端 **main 是权威**，React 仍是投影，preload 是唯一出界口。

## 怎么用这套（抄到 todo）

1. 判断数据源：`ui-state/source.md`
2. 写状态模型卡：`ui-state/model.md`（可贴进 PR / todo）
3. 按 owner 接组件：`ui-state/usage.md`
4. 判断谁会重渲：`ui-state/render.md`
5. 静态循环：`ui-state/oxlint.md`
6. 运行时循环：`ui-state/react-scan.md`

oxlint 抓「写法坏了」；react-scan 抓「订粗了 / 引用抖了」。两层都要，不要互相替代。

## 参考

- [React for Systems Engineers](https://tj-zhang.com/blog/react-for-systems-engineers/)（state ownership / derived views / sync）
