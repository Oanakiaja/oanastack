# UI 影响 / 如何判断渲染

事实变了，只应重渲 **订了这一片** 的组件。大树跟着抖，先查 selector / Context / 不稳定 props，不要先加 memo。

## 谁该重渲

| 变了什么 | 该更新谁 | 不该更新谁 |
| --- | --- | --- |
| `selectedId` | 读 `selectedId` 的行 / 播放器桥 | 只订 `playlist` 的列表壳 |
| `playlist` 引用 | 订 playlist 的列表 | 只订 `selectedId` 的详情 |
| `draftQuery` | 输入框 + 派生过滤处 | 权威 playlist 的写路径 |
| Query `data` | 该 `queryKey` 的读者 | 无关页面的 Zustand 订户 |
| main 推过来的 replica | `useSyncExternalStore` 订了这片的窗 | 其他窗（除非 main 广播了） |

流水线：用户动作 → 权威成功 → snapshot → **选择性重渲** → render 派生 → 少数 Effect 出界。

## Selector 要细

订切片，不订整店。返回 primitive / 稳定引用。对象切片用 `useShallow`（见 `usage.md`），不要每个 render `s => ({ ... })` 还不用 shallow。

`getSnapshot` 不变返回同一引用，否则 `useSyncExternalStore` 当每次都变。

## 怎么判断多余渲染

1. 父渲了、子 props 引用变了（inline `{}` / `[]` / `() =>`）。
2. Context 值是新对象，整棵消费者重跑。
3. selector 返回新对象 / 订了用不到的字段。
4. 派生走 Effect + `setState`，一次交互两轮渲。

看的时候对一下：这次权威到底改了哪条事实。改了 A、B 却渲了，就是订错了。

运行时用 `react-scan.md` 高亮；静态用 `oxlint.md` 抓不稳定 JSX props、Effect 里 setState。

## memo / useMemo / useCallback

| 情况 | 做 | 别做 |
| --- | --- | --- |
| 列表行重、props 已稳定 | 行 `memo` | 给叶子 span 包一层 |
| 派生很贵且输入稳定 | `useMemo` | 每个布尔、每段字符串都 memo |
| 把函数传给已 memo 的子 | 稳定 action（store 里的）或必要时 `useCallback` | 到处 `useCallback` 当风格 |
| Context 经常变 | 拆 Context，或改 Zustand | 再包一层 `memo` 假装没变 |
| 大树低优更新 | `startTransition` / `useDeferredValue` | 用它掩盖订得太粗 |

先修 owner 和 selector。memo 是边界，不是默认。
