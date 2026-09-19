# UI 状态：React + Electron

谁拥有事实、怎么订、何时 Effect。Web 与桌面共用；桌面多一层 **main 权威**。

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

## 何时 `useSyncExternalStore`

状态不归 React 管，但 UI 必须跟它一致读、一致更新时：

- Zustand / 外部 store
- IndexedDB 前的内存快照
- `navigator.onLine` / `matchMedia` 等浏览器 API
- Electron main 推过来的 replica

它解决：订阅建立前的竞态；同一次渲染读到不同快照（tearing）。

## Web 骨架

Zustand 细 selector：

```ts
export const useRoomStore = create<RoomStore>((set) => ({
  selectedId: 'dune',
  setSelectedId: (id) => set({ selectedId: id }),
}))

const selectedId = useRoomStore((s) => s.selectedId)
```

IndexedDB 是 owner：写路径先事务成功再换不可变 snapshot；`getSnapshot` 不变时返回同一引用。

Query 拉服务端，不要 Effect + fetch：

```ts
useQuery({ queryKey: ['videos'], queryFn: fetchVideos })
```

派生在 render / `useMemo`。播放器等外部系统用 Effect：

```ts
useEffect(() => {
  player.loadVideoById(selectedId)
}, [player, selectedId])
```

## Electron

| 事实 | 放哪 |
| --- | --- |
| 窗口、托盘、文件、密钥、原生模块 | main（权威） |
| 本窗 UI | renderer `useState` / 窗内 Zustand |
| 跨窗 / 要落盘的应用状态 | main store；renderer 订阅副本 |
| 远端 API（要系统代理/证书） | main 代打，Query 的 `queryFn` 调 preload |
| IAB / 多 webContents 共享状态 | 必须经 main 转发，不能假定同一 Zustand 单例 |

形状：

```
main:     权威 + IPC handlers + 持久化
preload:  contextBridge 暴露 window.desktop.*
renderer: React 投影（useSyncExternalStore 订 main）
```

main：`ipcMain.handle` 做 get/set，变更后广播。

```ts
ipcMain.handle('selection:get', () => store.get())
ipcMain.handle('selection:set', (_e, id: string) => {
  store.set(id)
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('selection:changed', id)
  }
})
```

preload：`contextBridge` 白名单，renderer 只走 `window.desktop.*`。

```ts
contextBridge.exposeInMainWorld('desktop', {
  selection: {
    get: () => ipcRenderer.invoke('selection:get'),
    set: (id: string) => ipcRenderer.invoke('selection:set', id),
    onChange: (cb: (id: string) => void) => {
      const fn = (_e: unknown, id: string) => cb(id)
      ipcRenderer.on('selection:changed', fn)
      return () => ipcRenderer.removeListener('selection:changed', fn)
    },
  },
})
```

renderer：模块级 cache + subscribe + `useSyncExternalStore`；写走 preload。窗内草稿继续本地 Zustand，不 IPC。`get()` 是 Promise 时先 resolve 再换 snapshot，不要把 Promise 当 `getSnapshot`。

```ts
let cached = initial
const subscribe = (onStoreChange: () => void) =>
  window.desktop.selection.onChange((next) => {
    if (Object.is(cached, next)) return
    cached = next
    onStoreChange()
  })
const selectedId = useSyncExternalStore(subscribe, () => cached)
const select = (id: string) => window.desktop.selection.set(id)
```

## 渲染性能

1. Selector 要细
2. 列表行 memo + 稳定 action 引用
3. 贵计算才 `useMemo`
4. 禁止派生用 Effect + `setState`
5. Context 拆开或改 Zustand
6. 大树 `startTransition` / `useDeferredValue`
7. `getSnapshot` 稳定引用

## 流水线

用户点击 → store action / mutation → IndexedDB 或 API 或 main（权威）→ 成功后更新 snapshot/cache → 组件经 selector / `useSyncExternalStore` 重渲 → render 派生 UI → 少数 `useEffect` 同步外部。

Electron：Web 里 IndexedDB / 后端是权威；桌面端 **main 是权威**，React 仍是投影，preload 是唯一出界口。

## 参考

- [React for Systems Engineers](https://tj-zhang.com/blog/react-for-systems-engineers/)（state ownership / derived views / sync）
