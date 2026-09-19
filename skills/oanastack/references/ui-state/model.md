# 状态建模

编码前先建卡。一张卡对应一组相关事实，不要按组件倒推 store。

## 五步

1. **列出事实。** `selectedId`、`playlist`、`draftFilter`、`online`… 名词，不是「Sidebar 的 state」。
2. **每条事实一个权威。** 分类见 `source.md`。派生不占 owner。
3. **标出权威 vs 副本。** 副本只读、可丢、可重建。renderer 里的 Electron 选择、IDB 前的内存 snapshot，都是副本。
4. **写路径。** `command → 权威成功 → 换 snapshot / cache → notify`。组件不直接改副本。
5. **失败语义。** 写失败不得更新 UI 真相。乐观更新必须能回滚；默认先成功再投影。

## 写路径形状

```
UI 发出 command
  → 权威执行（IDB 事务 / API mutation / main ipc handle）
  → 成功：不可变 snapshot 换新引用，再 notify
  → 失败：旧 snapshot 不动；错误走独立 UI 通道（toast / mutation.error）
```

`getSnapshot` 没变时返回同一引用。Promise 不能当 snapshot。

## 模型卡（复制到 PR / todo）

```md
## 状态模型卡
- 事实：
- 权威 / 副本：
- 谁写 / 谁订：
- 写路径：command → 权威 → snapshot → notify
- 失败：权威失败则 UI 不改真相
- 跨窗 / 刷新：
- 派生（render 算，不入库）：
```

例：

```md
## 状态模型卡
- 事实：selectedId；playlist；draftQuery；online
- 权威 / 副本：selectedId+playlist → IndexedDB（桌面则 main）；draftQuery → 本页 useState；online → navigator
- 谁写 / 谁订：写走 action / desktop.selection.set；UI 细 selector / useSyncExternalStore
- 写路径：setSelected(id) → IDB/main 成功 → 换 snapshot → notify
- 失败：事务/IPC 失败不换 snapshot；错误条独立
- 跨窗 / 刷新：playlist、selectedId 活过刷新；桌面跨窗经 main
- 派生：visiblePlaylist = playlist.filter(draftQuery)（render）
```

卡写完再按 `usage.md` 接线。谁会重渲见 `render.md`。
