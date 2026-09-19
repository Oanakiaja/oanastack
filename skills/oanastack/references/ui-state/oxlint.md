# oxlint：启用与修复

静态抓「写法会逼出多余渲染 / 派生 state」。跑在 react-scan 之前更便宜；扫到的运行时问题再回来对规则。

ID 以当前 [Oxlint rules](https://oxc.rs/docs/guide/usage/linter/rules.html) 和本机 `oxlint --help` 为准。**不要编规则名。** 没在文档里的 ID 就当它不存在。虚构 ID（如 `react/no-derived-state`）可能被静默忽略，看起来像「全绿」。

下面命令按 **oxlint 1.83.0** CLI 核对过：`--react-plugin`、`--react-perf-plugin`、`--fix`、`--init`。插件表见 [Built-in plugins](https://oxc.rs/docs/guide/usage/linter/plugins.html)。

## 项目里启用（优先）

真实 app 用配置，不要每次手搓 flag。`oxlint --init` 生成 `.oxlintrc.json`。

**`plugins` 会覆盖默认集**，要自己写回默认的 `eslint` / `typescript` / `unicorn` / `oxc`，再加上 `react`、`react-perf`。

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["eslint", "typescript", "unicorn", "oxc", "react", "react-perf"],
  "categories": {
    "correctness": "error",
    "perf": "warn"
  },
  "rules": {
    "react/set-state-in-effect": "error",
    "react/no-deriving-state-in-effects": "error",
    "react/jsx-no-constructed-context-values": "warn",
    "react-perf/jsx-no-new-object-as-prop": "error",
    "react-perf/jsx-no-new-array-as-prop": "error",
    "react-perf/jsx-no-new-function-as-prop": "error",
    "react-perf/jsx-no-jsx-as-prop": "warn"
  }
}
```

React Compiler 相关规则默认仍偏实验、要显式打开插件和类别 / 规则（见 [React Compiler support](https://oxc.rs/blog/2026-08-18-react-compiler-support)）。`react/set-state-in-effect` 在 correctness；`react/no-deriving-state-in-effects` 在 perf，只开插件不够，规则或 `perf` 类别要点名。

脚本例：`"lint": "oxlint ."`。CI 走同一份 config。

## 一次性探测（没 config 时）

```bash
oxlint --react-plugin --react-perf-plugin -D correctness -W perf .
```

点名一条（官方文档里的 CLI 形状）：

```bash
oxlint --react-plugin --deny react/set-state-in-effect
oxlint --react-plugin --deny react/no-deriving-state-in-effects
oxlint --react-perf-plugin --deny react-perf/jsx-no-new-object-as-prop
```

## 本系统用到的规则（已核对）

| ID | 插件 | 类别 | 修法 |
| --- | --- | --- | --- |
| `react/set-state-in-effect` | react | correctness | Effect 里同步 `setState` → 改 render 派生，或确认是出界同步 |
| `react/no-deriving-state-in-effects` | react | perf | 删掉「源变 → Effect → 另一份 state」 |
| `react/jsx-no-constructed-context-values` | react | perf | Context `value` 提到稳定引用或拆店 |
| `react-perf/jsx-no-new-object-as-prop` | react-perf | perf | 不要 `<C style={{}} />` / 当 render 造新对象当 prop |
| `react-perf/jsx-no-new-array-as-prop` | react-perf | perf | 不要 `<C list={[]} />` |
| `react-perf/jsx-no-new-function-as-prop` | react-perf | perf | 函数放到 store action / 模块级；必要时再 `useCallback` |
| `react-perf/jsx-no-jsx-as-prop` | react-perf | perf | 不要 render 里现造 `<Child />` 当 prop |

相关但别误当成「有这条就够」：`react/set-state-in-render`（correctness）、`react/exhaustive-deps`（correctness）。需要时查规则页再开，不要靠记忆发明别名（例如不存在的 `no-derived-state`、`unstable-props`）。

## 修复自循环（抄到 todo）

1. 项目已有上面这份 config（或 CLI 等价）。
2. `oxlint --fix .` — 只收安全自动修；剩下的会继续报。
3. 仍红：打开规则页，**按规则修**，不要 `--fix-dangerously` 碰 UI 语义。
4. 典型手修：
   - `jsx-no-new-*-as-prop` → 稳定引用；真要新对象就让子组件别靠引用相等，或把数据放进 store 再订切片。
   - `set-state-in-effect` / `no-deriving-state-in-effects` → 派生回 render；外部系统才留 Effect。
   - Context 警告 → 拆 Context 或改 Zustand（见 `render.md`）。
5. 再跑 `oxlint .` 直到本目录干净。
6. 目标交互再走 `react-scan.md`。

`--fix-suggestions` 可能改行为，UI 路径默认不用。`--fix` 修不了的 react-perf 规则是正常的，手改引用即可。

## Checklist（可贴 todo）

```md
- [ ] `.oxlintrc.json` 含 react + react-perf，且保留默认 plugins
- [ ] `oxlint --fix .` 后再 `oxlint .`
- [ ] 剩余告警按文档里的规则 ID 修（不编 ID）
- [ ] 同一条 UI 流再跑 react-scan
```

静态管源码形状，扫描管实际订阅。一边绿、另一边红，先信还红的那边。
