# 组件用法

按 `source.md` 的 owner 接线。硬规则和选型表见 `../ui-state.md`。

## 本页 UI：`useState`

侧栏、草稿、一次性 dialog。不进 Zustand，不 IPC。

```ts
const [draftQuery, setDraftQuery] = useState('')
```

## 应用内存：Zustand 细 selector

```ts
export const useRoomStore = create<RoomStore>((set) => ({
  selectedId: 'dune',
  setSelectedId: (id) => set({ selectedId: id }),
}))

const selectedId = useRoomStore((s) => s.selectedId)
```

多字段要对象时用 `useShallow`，否则每次新对象：

```ts
import { useShallow } from 'zustand/react/shallow'

const { selectedId, setSelectedId } = useRoomStore(
  useShallow((s) => ({ selectedId: s.selectedId, setSelectedId: s.setSelectedId })),
)
```

action 放 store 里，引用稳定，列表行可以直接订。

## 外部权威：`useSyncExternalStore`

状态不归 React 管，但 UI 必须跟它一致读、一致更新时用：

- Zustand 底层（你走 `useStore` 即可）
- IndexedDB 前的内存快照
- `navigator.onLine` / `matchMedia`
- Electron main 推过来的 replica

它解决：订阅建立前的竞态；同一次渲染读到不同快照（tearing）。

IndexedDB 是 owner：写路径先事务成功再换不可变 snapshot；`getSnapshot` 不变时返回同一引用。

```ts
const listeners = new Set<() => void>()
let snapshot = empty

export function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

export function getSnapshot() {
  return snapshot
}

async function commit(next: Playlist) {
  await idb.put(next) // 成功后才往下
  snapshot = next
  listeners.forEach((fn) => fn())
}

const playlist = useSyncExternalStore(subscribe, getSnapshot)
```

`get()` 若是 Promise，resolve 后再换 snapshot，不要把 Promise 交给 `getSnapshot`。SSR 才需要第三个参数 `getServerSnapshot`；桌面 renderer 不用。

## 服务端：TanStack Query

```ts
const videos = useQuery({ queryKey: ['videos'], queryFn: fetchVideos })
const save = useMutation({
  mutationFn: putVideo,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['videos'] }),
})
```

不要 `useEffect(() => { fetch... setState })`。不要把 `data` 再抄进 Zustand，除非那是另一条事实（例如「用户刚选中的 id」）。

## 派生在 render

```ts
const visible = useMemo(
  () => playlist.filter((item) => item.title.includes(draftQuery)),
  [playlist, draftQuery],
)
```

便宜过滤直接写在 render。贵再 `useMemo`。禁止 Effect + `setState` 做派生。

## Effect 只同步出去

```ts
useEffect(() => {
  player.loadVideoById(selectedId)
}, [player, selectedId])
```

播放器、DOM 测量、原生桥、analytics。拉数、派生、当 `componentDidMount`：都不是它。

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

preload：白名单，renderer 只走 `window.desktop.*`。

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

renderer：模块级 cache + subscribe + `useSyncExternalStore`；写走 preload。窗内草稿继续本地 Zustand，不 IPC。

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

首值：`get()` resolve 后写入 `cached` 再 notify，或 main 启动时推一次。
