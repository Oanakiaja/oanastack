# UI 状态系统：React + Electron

谁拥有事实、怎么订、何时 Effect。Web 与桌面共用；桌面多一层 **Main 权威**。

先分类再写 hook。不要先 `useEffect` + `useState` 再倒推 owner。

配套循环：`ui-state-oxlint.md`（静态）→ `ui-state-react-scan.md`（运行时）→ `ui-state-testing.md`（组件 / e2e）。验证顺序见 testing 卡。

## 硬规则

1. 能在 render 里算出来的，不要放进 state / Effect。
2. `useEffect` 只做「同步到 React 外面」（订阅、网络、DOM、动画、iframe / Blob URL + cleanup）。不要用它拉数据当真相、派生状态、当 `componentDidMount`。
3. 外部权威状态用 `useSyncExternalStore` 读（Zustand 的 `useStore` 底层就是它）。

## 判断数据源

每条 UI 看得见的数据，先分类。派生项没有 owner，禁止再存一份。

| 来源 | 例子 | 谁写 | 刷新后 | 跨窗 / Tab | React 接法 |
| --- | --- | --- | --- | --- | --- |
| 短暂 UI | 侧栏、输入草稿 | 本组件 | 否 | 否 | `useState` / `useReducer` |
| 应用内存 | 当前选中、窗内会话 | 唯一 app store | 否 | 同进程窗内 | Zustand 细 selector |
| 本地持久 | 偏好、落盘会话壳 | IndexedDB / Main `userData` | 是 | 看权威 | 内存快照 + `useSyncExternalStore` |
| 远端 / 产品会话 | 会话、列表 | App-Server | cache 策略 | 服务端 | Host → use-case；Query/SWR 只做投影 |
| 外部系统 | 播放器、WS、原生桥、Main | 系统自己 | 看系统 | 看系统 | `useSyncExternalStore` 或 Effect 同步出去 |
| 派生 | 过滤列表、拼好的标题 | **无人写** | 随源 | 随源 | render / `useMemo` |

写 hook 前四问：

1. **谁能写？** 一条事实一个权威。组件、cache、IDB、Main 不能抢。
2. **谁活过 reload？** 活不过 → `useState` / store。要活 → IDB、Main `userData`、或 App-Server。
3. **谁跨窗 / Tab？** Web 看 IDB / 服务端；Electron 多 `webContents` 必须经 Main，不能假定同一个 Zustand 单例。
4. **同步边界？** 权威成功之后才换 snapshot / cache；失败保持上一份。

常见错判：把 Query/SWR 结果再抄进 store；过滤走 Effect；草稿和已提交值同一条 state；renderer store 当跨窗偏好。

## 状态建模

1. 列出事实（名词，不是「某组件的 state」）。
2. 每条一个权威；派生不占 owner。
3. 标出权威 vs 副本。renderer 里的 Main replica、IDB 前 snapshot，都是副本。
4. 写路径：`command → 权威成功 → 换 snapshot / cache → notify`。
5. 失败：权威失败不得更新 UI 真相。乐观更新必须能回滚。

```
UI 发出 command
  → Host → use-case → 权威（App-Server / IDB / Main IPC）
  → 成功：不可变 snapshot 换新引用，再 notify
  → 失败：旧 snapshot 不动；错误走独立 UI 通道
```

`getSnapshot` 没变时返回同一引用。Promise 不能当 snapshot。异步读按 **request id** 建钥；切换 / 重试 = 新 request，abort 或忽略过期。

### 模型卡（复制到 PR / todo）

```md
## 状态模型卡
- 事实：
- 权威 / 副本：
- 谁写 / 谁订：
- 写路径：command → Host → 权威 → snapshot → notify
- 失败：权威失败则 UI 不改真相
- 跨窗 / 刷新：
- 派生（render 算，不入库）：
```

## 桌面 Agent 产品形（严格 profile，可选）

共享 React shell 挂在 Web 与 Electron 上时，按这个形状收敛：

- **一个** app 级 Zustand（`createAppStore`）。叶子组件禁止 `useAppStore(s => s)`。
- Selector 不要返回新对象 / 数组字面量；要对象切片就 `useShallow`。优先 primitive + `useMemo` 派生。
- 产品会话归 **App-Server**。UI 只经 `Host` → use-case → store。请求带 id；abort / 忽略过期。
- Snapshot / SWR cache 是只读投影种子，**禁止**单靠 snapshot 发 mutation。
- 要活过 reload 的桌面偏好：Main 写 `userData` 下的文件。renderer `localStorage` 在随机端口下可能被清掉，不当权威。
- 禁止第二套 owner：第二套 Query 库、第二个桌面桥全局（只用 `window.appBridge`）、renderer 里的 `electron-store`、第二棵产品 Zustand。

## UI 影响 / 怎么判断渲染

事实变了，只应重渲 **订了这一片** 的组件。大树跟着抖，先查 selector / Context / 不稳定 props，不要先加 memo。

| 变了什么 | 该更新谁 | 不该更新谁 |
| --- | --- | --- |
| `selectedId` | 订了它的行 / 外部桥 | 只订列表壳的节点 |
| store 里另一条切片 | 该切片订户 | 无关叶子 |
| 草稿 | 输入 + 派生过滤 | 权威写路径 |
| SWR / Query `data` | 该 key 的读者 | 无关 store 订户 |
| Main replica | 本窗 `useSyncExternalStore` | 未广播到的窗 |

流水线：用户动作 → 权威成功 → snapshot → **选择性重渲** → render 派生 → 少数 Effect 出界。

多余渲染信号：inline `{}` / `[]` / `() =>`；Context 每渲新对象；selector 返回新字面量；Effect + `setState` 派生（一轮点击两轮渲）。

memo / `useMemo` / `useCallback`：列表行重且 props 已稳定才 `memo`；贵计算才 `useMemo`；传给已 memo 子的回调用 store action 或满依赖 `useCallback`。先修 owner。

## 组件怎么接

本页 UI：

```ts
const [draftQuery, setDraftQuery] = useState('')
```

应用内存（一个 `createAppStore`，细 selector）：

```ts
export const useAppStore = createAppStore<AppState>((set) => ({
  selectedId: 'demo',
  setSelectedId: (id) => set({ selectedId: id }),
}))

const selectedId = useAppStore((s) => s.selectedId)
```

多字段要对象时：

```ts
import { useShallow } from 'zustand/react/shallow'

const { selectedId, setSelectedId } = useAppStore(
  useShallow((s) => ({ selectedId: s.selectedId, setSelectedId: s.setSelectedId })),
)
```

外部权威 / IDB 快照 / Main replica：`useSyncExternalStore`。写路径先权威成功再换 snapshot。

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
  await persist.put(next)
  snapshot = next
  listeners.forEach((fn) => fn())
}
```

远端列表用 Query / SWR 当投影，不要 `useEffect(() => fetch)`。不要把 `data` 再抄进 store，除非那是另一条事实。

派生在 render：

```ts
const visible = useMemo(
  () => items.filter((item) => item.title.includes(draftQuery)),
  [items, draftQuery],
)
```

Effect 只同步出去（播放器、测量、`window.appBridge` 订阅、Blob URL + revoke）。

身份变化要重置的本地草稿：render 期条件更新可以，必须收敛、不写 store、不 fetch、不碰 DOM。用户动作放事件处理。Effect 里的外部 handler 优先 `useEffectEvent`（有就用）。

## Electron

| 事实 | 放哪 |
| --- | --- |
| 窗口、托盘、文件、密钥、原生模块 | Main（权威） |
| 本窗 UI | renderer `useState` / 窗内 store 切片 |
| 跨窗 / 要落盘的应用状态 | Main store / `userData`；renderer 订副本 |
| 要系统代理 / 证书的远端 | Main 代打；renderer 经 `window.appBridge` |
| 多 webContents 共享 | 必须经 Main 转发 |

```
Main:     权威 + IPC handlers + userData
preload:  contextBridge 只暴露 window.appBridge.*
renderer: React 投影（useSyncExternalStore 订 Main）
```

```ts
ipcMain.handle('selection:get', () => store.get())
ipcMain.handle('selection:set', (_e, id: string) => {
  store.set(id)
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('selection:changed', id)
  }
})
```

```ts
contextBridge.exposeInMainWorld('appBridge', {
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

```ts
let cached = initial
const subscribe = (onStoreChange: () => void) =>
  window.appBridge.selection.onChange((next) => {
    if (Object.is(cached, next)) return
    cached = next
    onStoreChange()
  })
const selectedId = useSyncExternalStore(subscribe, () => cached)
const select = (id: string) => window.appBridge.selection.set(id)
```

`get()` 是 Promise 时先 resolve 再换 snapshot。窗内草稿继续本地 state，不 IPC。

## 静态门（可抄到产品仓）

oxlint 管 hooks / 派生。下面这类 **订整店 / 字面量 selector / 禁 import** 要另做 AST 或 ripgrep 门（失败即红）：

- 整店身份订户：`useAppStore(s => s)` / `useAppStore()`
- selector 返回 `{` / `[` 字面量且同表达式没有 `useShallow`
- 可配置禁 import：第二套 Query、第二个桥全局、`electron-store`（renderer）

```bash
# 思路，路径和函数名按产品仓改
rg -n "useAppStore\\(\\s*\\)|useAppStore\\(\\s*s\\s*=>\\s*s\\s*\\)" packages apps
rg -n "useAppStore\\(\\s*s\\s*=>\\s*(\\(|\\{)" packages apps
rg -n "from ['\"]electron-store['\"]|window\\.[A-Za-z]+Bridge" packages apps
```

更稳的是小脚本走 TS AST：命中 `useAppStore` 的 CallExpr，selector 是 Identity / ObjectLiteral / ArrayLiteral 且父节点不是 `useShallow` 则 fail。禁 import 列表做成配置，不要写死产品名。和 `oxlint` 一起跑，见 `ui-state-oxlint.md`。

## 参考

- [React for Systems Engineers](https://tj-zhang.com/blog/react-for-systems-engineers/)
- oxlint：`ui-state-oxlint.md`
- react-scan：`ui-state-react-scan.md`
- 验证分层：`ui-state-testing.md`
