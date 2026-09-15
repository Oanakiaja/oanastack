# 代码风格

oanastack 自有的薄约束卡，给 Agent 过门用。不是 pstack 厂商全文。可选更深的 pstack skill（no-comments、deslop、minimize-reader-load）可以用，但**不是**跑本门的前置。

用户可事后改细则。默认：

- **跟周围文件走。** 不顺手改名、不顺手重构。
- **最小改动解决问题。** 宁可删，不要新抽象。
- **名字清楚。** 不写抬高阅读成本的 clever 一行。
- **注释只写非显然的 why。** 不叙述 what；不留注释掉的死代码。
- **类型 / 校验放在边界。** 解析过了就信任内部。
- **仓里有 format / lint / typecheck 脚本就先跑再声称做完。**
- **一个 diff 一个意图。** 无关清理拆开。

本卡由 oanastack 维护。过门对照本卡即可。
