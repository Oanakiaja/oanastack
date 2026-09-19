# UI 验证：组件 harness + 产品 e2e

「编译过 / lint 绿」不是验收。GUI 改动要在 **Web 与 Electron** 都看到同一套共享 shell。CLI 钩子走静态 lint；浏览器用例 **不能**代替真实 IPC / 协议测试。

## 分层

| 层 | 证明什么 | 形状 |
| --- | --- | --- |
| 静态 | hooks / deps / ownership | oxlint + ui-state 静态门 |
| 组件 / feature harness | 共享 UI 在浏览器 StrictMode 下的行为 | fixture HTML + **真组件** + mock service port + 脚本化浏览器 |
| 产品 e2e（本地可复现） | 契约 + 共享 shell 能在 Web / Desktop 挂上 | make / pnpm target，不连活后端 |
| 活 e2e | 真服务器会留下资源 | **显式批准**目标、脱敏账本、用完清理 |

默认 Agent 顺序：

1. oxlint React 规则（`ui-state-oxlint.md`，模板在 `templates/`）
2. ui-state 静态门（整店订户 / 字面量 selector / 禁 import）
3. React Doctor `--json` scan/fix/rescan（`ui-state-react-doctor.md`）
4. 碰到的 unit / contract
5. 受影响 UI 的 feature / 组件 e2e；浏览器热点再走 `ui-state-react-scan.md`
6. 动到 shell / 契约再跑产品本地 e2e
7. 活 e2e **只在用户批准目标之后**

## 组件 / feature harness

- 挂 **真实共享组件**，不要把整棵产品树 shallow mock 掉。小 HTML fixture 即可。
- 服务端口用确定性 mock；不碰真麦 / 真摄像头；原生事件用模拟。
- 至少覆盖：草稿随身份重置、请求切换 / 重试竞态、异步 diff 竞态、订阅 cleanup、默认工作台能挂上。
- 浏览器驱动：`agent-browser` 或 Playwright；会话要有名字。证据 = snapshot + screenshot，不是模型自己的叙述。
- **等可点目标稳定**（布局停了）再 click，不要点在 reflow 半中。
- 用环境变量白名单挑用例，例如 `FEATURE_E2E_CASES=react-effects,draft-reset`。
- 给人看的交互 debug server 和 CI 无头脚本分开。
- 改了共享 GUI：Web 与 Electron 各跑一遍同一组用例。

```ts
// fixture 思路：真组件 + mock Host / App-Server port
const host = createMockHost({
  session: { id: 's1', items: [] },
})
mount(<SharedWorkbench host={host} />, { strictMode: true })
```

## 产品 e2e

- 先过本地确定性门：契约、生命周期 fixture、共享 app 入口能挂。
- Web 验收：打开本地 UI URL → snapshot → 交互 → 再 snapshot + screenshot。
- Electron 验收：只连 **loopback CDP** → 同一套共享 app 交互；完了停进程、拆 fixture。
- 活门：用户必须批准目标 URL / 环境；健康检查 ≠ 产品证明。
- 证据是观察到的交互结果。凭证只走环境变量或 `chmod 600` 的本地文件名；不提交 token；不把 secret 打进 shell trace。

不要写死内网环境名、公司域名、登录品牌。文档和脚本用 `Host`、`App-Server`、`WEB_UI_URL`、`E2E_CDP_URL` 这类占位。

## Agent 验证顺序（抄到 todo）

```md
- [ ] `pnpm lint:react`
- [ ] ui-state 静态门（若有）
- [ ] React Doctor `--json` 初扫 / 修复 / rescan（schemaVersion 3）
- [ ] 碰到的 unit / contract
- [ ] 受影响 case：`FEATURE_E2E_CASES=...` 组件 / feature harness
- [ ] 运行时仍卡：react-scan 浏览器环
- [ ] 动到共享 shell / 契约：本地产品 e2e（Web + Electron）
- [ ] 活 e2e：已获批准的目标；账本脱敏；用完清理
```

活门没批准就停，不要自行对线上环境开打。
