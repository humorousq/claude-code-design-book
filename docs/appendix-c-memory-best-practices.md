# 附录C：Memory 最佳实践

本附录提供 Memory 系统的最佳实践和实用技巧。

## Memory 类型选择

### User Memory - 用户偏好

**适用场景**：
- 用户的技术背景和经验水平
- 沟通风格偏好
- 常用工具和编辑器
- 学习节奏和深度偏好

**示例**：
```markdown
---
name: user-preferences
type: user
---

## 技术背景
- 角色：高级全栈工程师（10年经验）
- 强项：React、Node.js、PostgreSQL
- 弱项：移动端开发、Kubernetes

## 沟通偏好
- 喜欢简洁的技术解释，不需要基础概念科普
- 代码示例优于长篇描述
- 提前告知潜在风险和边界情况

## 工作习惯
- 习惯先写测试再实现（TDD）
- 使用 Git 分支策略：feature/*, hotfix/*
- PR 审查时关注性能和安全性
```

### Feedback Memory - 反馈指导

**适用场景**：
- 用户纠正 AI 行为的反馈
- 成功方法的确认
- 项目特定的规范

**示例**：
```markdown
---
name: coding-style-feedback
type: feedback
---

## 代码风格
- 使用函数式编程风格，避免 class
- **Why:** 团队更习惯函数式范式
- **How to apply:** 所有新代码使用纯函数和组合

## 测试策略
- 集成测试必须使用真实数据库，不使用 mock
- **Why:** 曾发生 mock 测试通过但生产失败的事故
- **How to apply:** 所有数据库相关测试使用 test database

## 错误处理
- 所有 API 调用必须有完善的错误处理
- **Why:** 生产环境出现未捕获异常导致崩溃
- **How to apply:** 使用 try-catch 并返回 Result 类型
```

### Project Memory - 项目状态

**适用场景**：
- 当前冲刺的目标和任务
- 架构决策及其原因
- 已知问题和待办事项
- 截止日期和里程碑

**示例**：
```markdown
---
name: current-sprint
type: project
---

## Sprint 目标（2026-04-01 ~ 2026-04-15）
- 完成用户认证模块重构
- 集成 OAuth 2.0 登录
- 修复性能瓶颈（响应时间 > 500ms）

## 架构决策
- 使用 JWT 而非 session（原因：微服务架构，无状态更好）
- 认证服务独立部署（原因：单点登录需求）

## 已知问题
- 登录 API 在高并发下有性能问题
- Token 刷新逻辑存在 race condition

## 注意事项
- 2026-04-03 代码冻结，准备发布
- 性能优化优先级高于新功能
```

### Reference Memory - 外部引用

**适用场景**：
- Bug 追踪系统链接
- 监控仪表板地址
- API 文档链接
- 团队知识库

**示例**：
```markdown
---
name: external-resources
type: reference
---

## Bug 追踪
- Linear 项目：INGEST（所有 pipeline 相关 bug）
  https://linear.app/company/project/INGEST

## 监控系统
- Grafana 仪表板：https://grafana.internal/d/api-latency
  这是 on-call 团队监控的仪表板
  如果修改请求处理逻辑，检查这个仪表板

## 文档资源
- API 文档：https://docs.internal.company.com/api
- 架构决策记录：https://confluence.company.com/display/ARCH

## CI/CD
- GitHub Actions：.github/workflows/
- 部署流程：https://wiki.company.com/deployment
```

## 写作技巧

### 清晰的结构

```markdown
# ✅ 好的结构

## 标题
简洁的主题描述

### 详情
- 关键信息点 1
- 关键信息点 2

### 原因（Why）
为什么这个信息重要

### 应用场景（How to apply）
在什么情况下使用这个信息
```

### 具体而非抽象

```markdown
# ❌ 太抽象
用户喜欢高质量的代码

# ✅ 具体
用户偏好：
- 函数式编程风格
- 单一职责原则
- 充分的类型注释
```

### 包含上下文

```markdown
# ❌ 缺少上下文
不要使用 class

# ✅ 包含上下文
避免使用 class，因为：
- 团队习惯函数式编程
- 项目已全面采用函数式范式
- 前任架构师留下的代码库以函数为主
```

## 避免常见错误

### 错误 1：保存可推导的内容

```markdown
# ❌ 不要保存
- 文件结构：src/utils/format.ts
- Git 历史：最近提交是 "fix: auth bug"
- 代码模式：使用 async/await

# ✅ 这些可以从代码/Git 中获得，不需要记忆
```

### 错误 2：过度细化

```markdown
# ❌ 过度细化
2026-04-01 09:05:23 用户说想用蓝色主题
2026-04-01 09:07:45 用户改了主意说要用绿色
...

# ✅ 适度概括
用户偏好暖色调（蓝、绿）
```

### 错误 3：缺少原因

```markdown
# ❌ 只有规则
集成测试必须用真实数据库

# ✅ 包含原因
集成测试必须用真实数据库
- **Why:** 2025-12-15 发生事故，mock 测试通过但生产失败
- **How to apply:** 所有测试使用 TEST_DATABASE_URL 环境变量
```

### 错误 4：过于宽泛

```markdown
# ❌ 宽泛的规则
写好代码

# ✅ 具体的规则
- 函数不超过 20 行
- 嵌套不超过 3 层
- 参数不超过 4 个
```

## Memory 更新策略

### 何时更新

```typescript
// 1. 用户明确反馈时
用户："不要再总结每一轮对话了，我能看懂代码"
→ 保存 feedback memory: 用户偏好简洁回复，无需总结

// 2. 发现新模式时
观察：用户在多个项目中都偏好 TypeScript
→ 保存 user memory: 用户首选 TypeScript

// 3. 项目状态变化时
事件：冲刺目标从"完成认证"变为"修复性能问题"
→ 更新 project memory: 当前冲刺目标

// 4. 收到纠正时
用户："这个不对，应该是..."
→ 保存 feedback memory: 正确的做法和原因
```

### 如何更新

```typescript
// 1. 新增而非覆盖
// ❌ 不要删除旧记忆
// ✅ 添加新条目或更新现有条目

// 2. 注明时间
"2026-04-01: 用户偏好改为..."

// 3. 解释变更
"之前偏好 X，现在偏好 Y，原因是..."

// 4. 定期清理
// 每月检查一次，删除过时的记忆
```

## Memory 组织技巧

### 目录结构

```
memory/
├── MEMORY.md              # 入口文件（索引）
│
├── user/
│   ├── background.md      # 技术背景
│   ├── preferences.md     # 工作偏好
│   └── communication.md    # 沟通风格
│
├── feedback/
│   ├── coding-style.md    # 代码风格
│   ├── testing.md         # 测试策略
│   └── workflow.md         # 工作流程
│
├── project/
│   ├── current-sprint.md  # 当前冲刺
│   ├── decisions.md       # 架构决策
│   └── known-issues.md    # 已知问题
│
└── reference/
    ├── tracking.md        # Bug 追踪
    ├── monitoring.md      # 监控系统
    └── documentation.md   # 文档链接
```

### 索引文件

```markdown
# MEMORY.md

## User Memory
- [技术背景](user/background.md) - 经验和技能矩阵
- [工作偏好](user/preferences.md) - 开发习惯和工具

## Feedback Memory
- [代码风格](feedback/coding-style.md) - 团队编码规范
- [测试策略](feedback/testing.md) - 测试相关反馈

## Project Memory
- [当前冲刺](project/current-sprint.md) - 本周目标和任务
- [架构决策](project/decisions.md) - 重要的技术决策

## Reference Memory
- [Bug 追踪](reference/tracking.md) - Linear/JIRA 链接
- [监控系统](reference/monitoring.md) - Grafana 仪表板
```

## 团队协作

### Team vs Private

```markdown
# Team Memory（提交到 Git）
- 编码规范
- 测试策略
- 架构决策
- 项目约定

# Private Memory（本地）
- 个人偏好
- 具体反馈
- 工作习惯
```

### 冲突解决

```markdown
# Team Memory
- 使用 2 空格缩进

# Private Memory（覆盖）
- 个人项目偏好 4 空格缩进
- **注意:** 这仅适用于我的个人项目
```

## 性能优化

### 控制大小

```markdown
# ❌ 过大的文件
文件大小：500 行
Token 消耗：~100K

# ✅ 适度大小
文件大小：< 200 行
Token 消耗：< 40K
```

### 分离关注点

```markdown
# ❌ 一个文件包含所有
memory/everything.md - 所有信息

# ✅ 按主题分离
memory/user/background.md
memory/project/current-sprint.md
memory/feedback/coding-style.md
```

### 定期清理

```bash
# 每月执行一次
/memory clear --older-than 30days
/memory compact --aggressive
/memory export --backup
```

## 安全考虑

### 敏感信息过滤

```markdown
# ❌ 包含敏感信息
API Key: sk-abc123...

# ✅ 使用占位符
API Key: [REDACTED]
```

### 权限控制

```typescript
// 不同作用域的访问控制
const permissions = {
  user: 'only-self',      // 只有自己
  project: 'team-members', // 团队成员
  local: 'local-machine'  // 本机用户
}
```

## 实战案例

### 案例 1：新项目设置

```bash
# 1. 创建 Memory 目录
mkdir -p memory/{user,feedback,project,reference}

# 2. 创建索引文件
cat > memory/MEMORY.md << 'EOF'
# Project Memory

## 快速链接
- [用户偏好](user/preferences.md)
- [当前冲刺](project/current-sprint.md)
EOF

# 3. 添加初始 Memory
/memory add user "资深工程师，偏好函数式编程"
/memory add feedback "所有测试必须使用真实数据库"
```

### 案例 2：项目交接

```bash
# 1. 导出当前 Memory
/memory export --team --output team-memories.json

# 2. 新成员导入
/memory import team-memories.json

# 3. 查看项目背景
/memory view project/background.md
```

### 案例 3：定期维护

```bash
# 1. 查看所有 Memory
/memory list

# 2. 清理过时内容
/memory edit project/old-sprint.md --archive

# 3. 压缩历史
/memory compact --keep-recent 10

# 4. 备份
/memory export --backup --compress
```

---

更多信息请参考：
- [第7章：Memory 系统的哲学](/chapter-07-memory-philosophy)
- [第8章：Memory 系统的实现](/chapter-08-memory-implementation)
- [附录D：故障排查](/appendix-d-troubleshooting)
