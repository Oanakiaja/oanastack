# UI Design

**先定风格、token、基础组件，再画表面。** 社区库优先，不自研设计体系。没有 token + 基础组件 gallery，不算 done。实现交给 `feat.md`；证据走 `test.md`；状态走 `../references/ui-state.md`；选型清单见 `../references/ui-foundation.md`。

匹配：定产品风格 / 落 token / 铺基础组件；新/改 Settings·卡片·列表·对话框；「看起来不对 / 不知道放哪」；换主题或暗色；交互要截图确认。

## 步骤（原样抄到 todo）

### A. Foundation（必做 / 最重要）

1. **定产品风格一句话。** 密度、圆角、主色、语气（例：dense tool UI / soft consumer）。写进 repo（`docs/ui-style.md` 或 tokens 旁 README），禁止每个 PR 重发明。
2. **选社区底座，不自研设计体系。** 按 React 栈与许可挑，不要锁死一家。细则 `../references/ui-foundation.md`。

   | 层 | 候选（不锁死） |
   | --- | --- |
   | 组件库 | Radix + 薄皮 / shadcn/ui / Ark / Mantine / Ant Design |
   | Token | CSS variables / Tailwind theme / Style Dictionary — 与库对齐，不平行两套 |
   | 图标 | Lucide / Phosphor / Heroicons / Radix Icons — **只留一个** |
   | 动效 / 焦点 | 跟组件库的 focus ring / motion |
3. **落下 design tokens（唯一真相）。** color / space / radius / type / elevation / z-index / motion。命名稳定（`--oau-*` 或产品前缀）。禁止组件里散落魔法 hex/px。
4. **落下基础组件（薄封装社区原语）。** Button / Input / Badge / Dialog / Select / Tabs / Toast… 产品只通过这一层引用，禁止业务里再拷一份按钮样式。优先扩展社区库；fork 必须写下理由。
5. **Foundation 验收。** Story/fixture 或最小 gallery：每个基础组件 + token 对照表截图；换主题/暗色若需要也在这一层证明。缺 gallery 不得进 Phase B。已落地则 `skip: foundation 已在 <path>`，并核对照片仍有效。

### B. Surface（只在 foundation 之上）

6. **写一句话任务，选已有表面。** 用户要完成什么、成功长什么样。能否挂进现有页/卡片/行？禁止无故新开导航（一页一事）。
7. **列状态机。** 空 / loading / ready / error / disabled / 无权限。每个状态的文案与主按钮。状态 owner 对照 `../references/ui-state.md`（不要用 Effect 派生 UI 文案）。
8. **定主操作。** 唯一 primary CTA；次要动作用 outline/text。中文文案短、动词优先，对齐产品现有用词。
9. **只组合 foundation。** 只用已落地的基础组件 + token；不新开视觉语言。新色 / 新圆角 / 新图标集先改 foundation PR，禁止在业务 PR 顺手发明。
10. **出证据再交 `feat.md`。** 至少桌面一帧 + 窄屏一帧（或 `skip: <原因>`）。交互变更未经截图确认不得当 done。实现走 `feat.md`（worktree + 验收）。复杂度高时 `reflect.md`。

## 工具边界

- 没有 token + 基础组件 gallery，不算 UI Design done。
- 新色 / 新圆角 / 新图标集 = 先改 foundation PR，禁止业务 PR 顺手发明。
- 优先扩展社区库；fork 必须写下理由。
- 不做：无验收的「美化」、为 MCP/能力发明第二套配置向导（除非产品明确要求）、在错误表面堆配置（例：机器页塞插件安装）。
- 验证：`test.md` + 真实 Web/Desktop 截图；「编译过」不算。不在本卡 merge / land / ship。
- 状态：`../references/ui-state.md`；lint/scan 见 `../references/ui-state-oxlint.md` / `../references/ui-state-react-doctor.md` / `../references/ui-state-react-scan.md`。

**回复：** 风格一句话、社区选型（组件库 / token / 图标）、token 路径、基础组件清单、gallery 截图、（若做表面）所选表面 / 状态表 / 主 CTA / 交给 feat 的验收标准。
