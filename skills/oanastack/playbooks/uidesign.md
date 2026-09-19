# UI Design

**先定任务与表面，再动控件。** 不换皮；复用现有 chrome。实现阶段交给 `feat.md`；验证截图走 `test.md`；状态归属走 `../references/ui-state.md`。

匹配：新/改 Settings·卡片·列表·对话框·Composer 能力行；「看起来不对 / 不知道放哪」；交互变更需要截图确认。

## 步骤（原样抄到 todo）

1. **写一句话任务。** 用户在这个表面要完成什么？成功长什么样？
2. **选已有表面，禁止无故新开导航。** 问：能否挂进现有页/卡片/行？表面职责是否冲突（一页一事）？
3. **列状态机。** 空 / loading / ready / error / disabled / 无权限。每个状态的文案与主按钮。状态 owner 对照 `../references/ui-state.md`（不要用 Effect 派生 UI 文案）。
4. **定主操作。** 唯一 primary CTA；次要动作用 outline/text。中文文案短、动词优先，对齐产品现有用词。
5. **复用构建块。** Button / Badge / 既有卡片与 token；不引入第二套品牌色/圆角/字体。产品专属细则若存在（如 settings/capability UI skill）先读再画。
6. **布局自检。** 操作列有明确 track；CTA `nowrap`；`border-box` + `min-width:0`；窄屏 (~390) 右缘留白；可选 trailing 用 flex 勿用会孤儿换行的固定 N 列 grid。
7. **出证据再编码。** 至少：桌面一帧 + 窄屏一帧（或说明为何不适用）。交互变更未经截图确认不得当 done。
8. **交接实现。** 任务清晰后走 `feat.md`（worktree + 验收）。纯视觉 polish 仍要有前后截图。复杂度高时 `reflect.md`。

## 工具边界

- 不做：无验收的「美化」、为 MCP/能力发明第二套配置向导（除非产品明确要求）。
- 不做：在错误表面堆配置（例：机器页塞插件安装）。
- 验证：`test.md` + 真实 Web/Desktop 截图；「编译过」不算。
- 状态：`../references/ui-state.md`；lint/scan 见 `../references/ui-state-oxlint.md` / `../references/ui-state-react-doctor.md` / `../references/ui-state-react-scan.md`。

**回复：** 一句话任务、所选表面、状态表、主 CTA、截图路径、交给 feat 的验收标准。
