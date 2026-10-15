<!-- oanastack:review-before-change -->

## 高影响变更：先停，等确认

涉及以下任一变更时，先停下，不要动手。先说明拟改内容、影响和 rollback，等用户明确批准后再继续。

- API / 接口：signature、request、response、protocol
- 数据库表和字段：schema、column、index、migration
- Redis key，以及 value 的内容与格式
- MQ topic 等消息配置
- 项目或模块依赖关系：新增、删除、升级 dependency，或改动 module boundary
- 动态配置中心（如 Rainbow、Polaris）
- 环境变量

<!-- /oanastack:review-before-change -->
