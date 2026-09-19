# UI Foundation

步骤卡见 `../playbooks/uidesign.md`。本卡只记社区复用清单：一套 token、一套图标、一层按钮。状态归属仍走 `ui-state.md`。

先扩展社区库，再薄封装。fork 必须写下理由。没有 token + 基础组件 gallery，不算 UI Design done。

## 三一律

- **一套 token。** color / space / radius / type / elevation / z-index / motion。CSS variables / Tailwind theme / Style Dictionary 与所选组件库对齐，不平行维护两套。命名稳定（`--oau-*` 或产品前缀）。禁止组件里散落魔法 hex/px。
- **一套图标。** Lucide / Phosphor / Heroicons / Radix Icons 四选一，全产品只用这一个。
- **一层按钮（及同类原语）。** Button / Input / Badge / Dialog / Select / Tabs / Toast 只从产品基础层引用。业务里禁止再拷第三份样式。

## 选型（按栈与许可挑，不锁死）

| 层 | 候选 | 约束 |
| --- | --- | --- |
| 组件库 | Radix + 薄皮 / shadcn/ui / Ark / Mantine / Ant Design | 跟 React 栈与许可走；产品只包一层 |
| Token | CSS variables / Tailwind theme / Style Dictionary | 与组件库同一真相，不另起一套 |
| 图标 | Lucide / Phosphor / Heroicons / Radix Icons | **只留一个** |
| 动效 / 焦点 | 所选库的 focus ring / motion | 不要自造第二套 ring |

新色 / 新圆角 / 新图标集先改 foundation PR，禁止在业务表面 PR 顺手发明。风格一句话写进 `docs/ui-style.md` 或 tokens 旁 README，禁止每个 PR 重发明。
