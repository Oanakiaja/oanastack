# 判断数据源

每条 UI 看得见的数据，先分类再写 hook。派生项没有 owner，禁止再存一份。

## 六类

| 来源 | 例子 | 谁写 | 刷新后还在 | 跨窗 / Tab | React 接法 |
| --- | --- | --- | --- | --- | --- |
| 短暂 UI | 侧栏开合、输入草稿 | 本组件 | 否 | 否 | `useState` / `useReducer` |
| 应用内存 | 当前选中、窗内会话 | store action | 否 | 同进程窗内 | Zustand 细 selector |
| 本地持久 | 播放列表、偏好 | IndexedDB / Electron main | 是 | 看权威在哪 | 内存快照 + `useSyncExternalStore` |
| 远端 | 列表、详情 | API（经 Query） | cache 策略 | Query cache | `useQuery` / `useMutation` |
| 外部系统 | 播放器、WS、原生桥、main | 系统自己 | 看系统 | 看系统 | `useSyncExternalStore` 或 Effect 同步出去 |
| 派生 | 过滤列表、拼好的标题 | **无人写** | 随源 | 随源 | render / `useMemo` |

「应用内存」跨刷新就丢；要落盘就升级成「本地持久」，不要在 Zustand 里假装持久。

## 判定四问

写 hook 前对每条事实问：

1. **谁能写？** 只能有一个权威。组件、Query cache、IDB、main 不能抢同一条。
2. **谁活过 reload？** 活不过 → `useState` / Zustand。要活 → IDB 或 main 或服务端。
3. **谁跨窗 / Tab 共享？** Web 多 Tab 看 IDB / 服务端；Electron 多 `webContents` 必须经 main，不能假定同一个 Zustand 单例。
4. **同步边界在哪？** 权威成功之后才换 snapshot / cache；失败保持上一份，UI 不抢跑。

## 常见错判

- 把 Query 结果再抄进 Zustand「方便用」→ 两份真相。
- 过滤、排序、拼字符串放进 state + Effect → 派生自拥有自己。
- 草稿和已提交值同一条 state → 短暂 UI 和权威绑死，失败时改不回去。
- Electron 里用 renderer Zustand 当跨窗偏好 → 权威放错进程。

分完再去 `model.md` 建卡。接法见 `usage.md`。
