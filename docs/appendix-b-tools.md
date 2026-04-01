# 附录B：工具参考

本附录详细列出 Claude Code 的所有工具及其使用方法。

## 文件操作工具

### Read

读取文件内容，支持文本、图片、PDF 和 Jupyter Notebook。

```typescript
Read({
  file_path: string,      // 文件路径
  limit?: number,         // 限制读取行数（默认 2000）
  offset?: number,        // 跳过前 N 行
  pages?: string          // PDF 页面范围（如 "1-5", "3,5,7"）
})
```

**示例**：
```typescript
// 读取文本文件
Read({ file_path: "src/index.ts" })

// 读取 PDF 前 5 页
Read({ file_path: "docs/manual.pdf", pages: "1-5" })

// 读取图片
Read({ file_path: "screenshot.png" })

// 分块读取大文件
Read({ file_path: "large-log.txt", limit: 100, offset: 500 })
```

### Write

创建或覆盖文件。

```typescript
Write({
  file_path: string,      // 文件路径
  content: string         // 文件内容
})
```

**安全规则**：
- 如果文件已存在，必须先 `Read` 过
- 会自动创建父目录

**示例**：
```typescript
Write({
  file_path: "src/utils/helper.ts",
  content: `
export function formatDate(date: Date): string {
  return date.toISOString()
}
`
})
```

### Edit

执行精确的字符串替换。

```typescript
Edit({
  file_path: string,      // 文件路径
  old_string: string,     // 要替换的字符串
  new_string: string,     // 新字符串
  replace_all?: boolean   // 替换所有匹配项
})
```

**示例**：
```typescript
// 单次替换
Edit({
  file_path: "src/config.ts",
  old_string: "const timeout = 5000",
  new_string: "const timeout = 10000"
})

// 替换所有匹配项
Edit({
  file_path: "src/utils.ts",
  old_string: "console.log",
  new_string: "logger.debug",
  replace_all: true
})

// 多行替换
Edit({
  file_path: "src/app.ts",
  old_string: `function oldName() {
  return 1
}`,
  new_string: `function newName() {
  return 2
}`
})
```

## 搜索工具

### Glob

使用模式匹配查找文件。

```typescript
Glob({
  pattern: string,        // Glob 模式
  path?: string           // 搜索路径（默认当前目录）
})
```

**模式示例**：
```typescript
// 查找所有 TypeScript 文件
Glob({ pattern: "**/*.ts" })

// 查找特定目录下的文件
Glob({ pattern: "src/**/*.test.ts" })

// 排除某些目录
Glob({ pattern: "**/*.js", path: "." })  // 自动排除 node_modules, .git

// 查找配置文件
Glob({ pattern: "*.config.{js,ts}" })
```

### Grep

基于 ripgrep 的内容搜索。

```typescript
Grep({
  pattern: string,              // 正则表达式模式
  path?: string,                // 搜索路径
  output_mode?: string,         // 输出模式
  type?: string,                // 文件类型
  glob?: string,                // Glob 过滤
  -i?: boolean,                 // 忽略大小写
  head_limit?: number          // 限制结果数量
})
```

**输出模式**：
- `content`: 显示匹配内容和行号（默认）
- `files_with_matches`: 只显示文件名
- `count`: 显示匹配次数

**文件类型**：
- `js`: JavaScript
- `ts`: TypeScript
- `py`: Python
- `go`: Go
- `rs`: Rust
- 更多类型见 ripgrep 文档

**示例**：
```typescript
// 搜索函数定义
Grep({ pattern: "function\\s+\\w+", type: "ts" })

// 搜索 TODO 注释
Grep({ pattern: "TODO|FIXME", output_mode: "content" })

// 查找文件名
Grep({ pattern: "className", output_mode: "files_with_matches" })

// 忽略大小写
Grep({ pattern: "error", "-i": true })

// 使用 Glob 过滤
Grep({ pattern: "export", glob: "*.test.ts" })
```

## 执行工具

### Bash

执行 Shell 命令。

```typescript
Bash({
  command: string,                    // 命令
  description?: string,               // 描述
  timeout?: number,                   // 超时时间（毫秒）
  dangerouslyDisableSandbox?: boolean,// 禁用沙箱
  run_in_background?: boolean        // 后台运行
})
```

**安全机制**：
- 自动检测危险命令
- 沙箱隔离
- 默认超时 2 分钟

**示例**：
```typescript
// 运行测试
Bash({ command: "npm test" })

// 安装依赖
Bash({ command: "npm install", timeout: 300000 })

// Git 操作
Bash({ command: "git status" })

// 后台运行
Bash({
  command: "npm run dev",
  run_in_background: true
})

// 长时间任务
Bash({
  command: "npm run build",
  timeout: 600000,  // 10 分钟
  description: "Build the project"
})
```

## Agent 工具

### Agent

生成子 Agent 执行任务。

```typescript
Agent({
  subagent_type?: string,     // Agent 类型（新 Agent）
  name?: string,               // Agent 名称（Fork）
  description?: string,        // 描述
  prompt: string              // 任务提示词
})
```

**两种模式**：
- **新 Agent**：指定 `subagent_type`，从零开始
- **Fork**：不指定 `subagent_type`，继承当前上下文

**示例**：
```typescript
// Fork 模式（快速研究）
Agent({
  name: "analyze-deps",
  prompt: "Analyze package.json dependencies and report security issues"
})

// 新 Agent（专业审查）
Agent({
  subagent_type: "code-reviewer",
  name: "security-review",
  prompt: "Review authentication code for security vulnerabilities"
})
```

### SendMessage

Agent 间发送消息。

```typescript
SendMessage({
  agent_id: string,     // 目标 Agent ID
  message: string       // 消息内容
})
```

### TeamCreate / TeamDelete

管理 Agent 团队。

```typescript
TeamCreate({
  team_name: string,
  agents: Array<{
    agent_type: string,
    task: string,
    name: string
  }>,
  strategy?: 'parallel' | 'sequential' | 'pipeline'
})

TeamDelete({
  team_id: string
})
```

## 任务管理工具

### TaskCreate

创建任务。

```typescript
TaskCreate({
  subject: string,       // 任务标题
  description: string,   // 详细描述
  activeForm?: string    // 进度提示
})
```

### TaskUpdate

更新任务状态。

```typescript
TaskUpdate({
  taskId: string,
  status?: 'pending' | 'in_progress' | 'completed',
  subject?: string,
  description?: string,
  addBlockedBy?: string[],
  addBlocks?: string[]
})
```

### TaskGet / TaskList

查询任务。

```typescript
// 获取单个任务
TaskGet({ taskId: string })

// 列出所有任务
TaskList()
```

### TaskStop

停止任务。

```typescript
TaskStop({
  taskId: string
})
```

## MCP 工具

### MCP

调用 MCP Server 的工具。

```typescript
MCP({
  server_name: string,      // MCP Server 名称
  tool_name: string,        // 工具名称
  arguments: object         // 工具参数
})
```

**示例**：
```typescript
// 调用文件系统 MCP
MCP({
  server_name: "filesystem",
  tool_name: "read_file",
  arguments: { path: "/data/config.json" }
})

// 调用数据库 MCP
MCP({
  server_name: "postgres",
  tool_name: "query",
  arguments: { sql: "SELECT * FROM users LIMIT 10" }
})
```

### ReadMcpResource

读取 MCP Server 的资源。

```typescript
ReadMcpResource({
  server_name: string,
  uri: string
})
```

## LSP 工具

### LSP

与 Language Server 交互。

```typescript
LSP({
  operation: string,      // 操作类型
  file_path: string,     // 文件路径
  line: number,          // 行号（1-based）
  character: number      // 字符位置（1-based）
})
```

**操作类型**：
- `goToDefinition`: 跳转到定义
- `findReferences`: 查找引用
- `hover`: 获取悬停信息
- `goToImplementation`: 跳转到实现
- `documentSymbol`: 文档符号

**示例**：
```typescript
// 跳转到定义
LSP({
  operation: "goToDefinition",
  file_path: "src/app.ts",
  line: 10,
  character: 15
})

// 查找引用
LSP({
  operation: "findReferences",
  file_path: "src/utils.ts",
  line: 5,
  character: 10
})
```

## Notebook 工具

### NotebookEdit

编辑 Jupyter Notebook。

```typescript
NotebookEdit({
  notebook_path: string,    // Notebook 路径
  cell_id: string,         // Cell ID
  new_source: string,      // 新内容
  cell_type?: 'code' | 'markdown'
})
```

## 其他工具

### AskUserQuestion

向用户提问。

```typescript
AskUserQuestion({
  questions: [{
    question: string,
    header: string,
    multiSelect: boolean,
    options: [{
      label: string,
      description: string,
      preview?: string
    }]
  }]
})
```

### WebFetch

获取网页内容。

```typescript
WebFetch({
  url: string,           // URL
  prompt: string        // 提取指令
})
```

### WebSearch

搜索网络。

```typescript
WebSearch({
  query: string         // 搜索查询
})
```

### Sleep

等待指定时间（主动模式）。

```typescript
Sleep({
  duration: number      // 等待时间（毫秒）
})
```

### CronCreate

创建定时任务。

```typescript
CronCreate({
  cron: string,         // Cron 表达式
  prompt: string        // 定时执行的提示词
})
```

## 工具权限

### 权限模式

| 工具 | Default | Plan | Auto | Bypass |
|------|---------|------|------|--------|
| Read | ✓ | ✓ | ✓ | ✓ |
| Write | 需确认 | ✗ | ✓ | ✓ |
| Edit | 需确认 | ✗ | ✓ | ✓ |
| Bash | 需确认 | ✗ | 需确认 | ✓ |
| Agent | ✓ | ✗ | ✓ | ✓ |
| MCP | 需确认 | ✗ | 需确认 | ✓ |

### 禁用工具

通过配置禁用特定工具：

```json
{
  "disabledTools": ["Bash", "MCP"]
}
```

## 最佳实践

### 文件操作

```typescript
// ✅ 正确：先读后写
Read({ file_path: "config.json" })
Write({ file_path: "config.json", content: "..." })

// ✅ 正确：精确的字符串替换
Edit({
  file_path: "src/app.ts",
  old_string: `function oldName() {
  return 1
}`,
  new_string: `function newName() {
  return 2
}`
})

// ❌ 错误：过于宽泛的替换
Edit({
  file_path: "src/app.ts",
  old_string: "return 1",  // 可能匹配多处
  new_string: "return 2"
})
```

### 搜索

```typescript
// ✅ 正确：具体的目标
Grep({ pattern: "function\\s+fetchUser", type: "ts" })

// ❌ 错误：过于宽泛
Grep({ pattern: "function" })  // 匹配太多

// ✅ 正确：组合过滤
Glob({ pattern: "**/*.test.ts" })
Grep({ pattern: "describe", glob: "*.test.ts" })
```

### 执行

```typescript
// ✅ 正确：明确的描述
Bash({
  command: "npm run build",
  description: "Build the production bundle",
  timeout: 300000
})

// ❌ 错误：危险命令无保护
Bash({ command: "rm -rf /" })  // 会被拦截
```

---

更多信息请参考：
- [附录A：命令参考](/appendix-a-commands)
- [附录C：Memory 最佳实践](/appendix-c-memory-best-practices)
