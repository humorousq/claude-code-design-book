# 附录E：术语表

本附录定义 Claude Code 文档中使用的关键术语。

## A

### Agent
智能代理，能够自主执行任务的 AI 实体。在 Claude Code 中，Agent 可以理解用户意图、规划步骤、调用工具并完成复杂任务。

### API Key
应用程序接口密钥，用于认证和授权 API 调用。Claude Code 使用 Anthropic API Key 或 OAuth 进行认证。

### Auto Mode
自动模式，一种权限模式，允许 AI 自动执行低风险操作，减少用户确认次数。

## B

### Bypass Mode
绕过模式，一种权限模式，跳过所有权限检查。极度危险，仅适用于受控环境。

## C

### CLI (Command Line Interface)
命令行界面，用户通过文本命令与程序交互的界面。Claude Code 主要以 CLI 形式运行。

### Context
上下文，AI 在当前对话中可用的信息集合，包括对话历史、文件内容、系统提示等。

### Context Window
上下文窗口，AI 模型一次可以处理的最大 token 数量。Claude 的上下文窗口为 200K tokens。

### Compact
压缩，将对话历史浓缩为更简洁的摘要，以减少 token 使用。

## D

### Dependency Injection
依赖注入，一种软件设计模式，将依赖项从外部传入，而不是在内部创建。Claude Code 使用依赖注入来管理工具和服务的实例。

## E

### Entrypoint
入口点，程序开始执行的位置。在 Claude Code 中，`main.tsx` 是主入口点。

## F

### Feature Flag
特性标志，用于控制功能开关的机制。Bun 的 `bun:bundle` 支持编译时特性标志，实现死代码消除。

### Feedback Memory
反馈记忆，存储用户关于 AI 行为的指导和建议的 Memory 类型。

### Fork
分支，在 Agent 上下文中，指从父 Agent 创建一个继承上下文的子 Agent。

## G

### Git Worktree
Git 工作树，允许多个工作目录共享同一个 Git 仓库，用于隔离不同分支的开发工作。

### Glob
全局模式，一种文件路径匹配模式，使用通配符（如 `*` 和 `**`）匹配多个文件。

## H

### Hook
钩子，在特定事件发生时执行的代码。Claude Code 使用 hooks 来处理权限检查、工具调用等。

## I

### In-memory Error
内存错误，程序运行时发生的内存相关问题。

### Input Schema
输入模式，定义工具或命令接受的参数结构，通常使用 Zod 库定义。

## L

### LSP (Language Server Protocol)
语言服务器协议，一种用于编辑器和语言服务器之间通信的标准协议。Claude Code 通过 LSP 获取代码智能功能。

## M

### MCP (Model Context Protocol)
模型上下文协议，Anthropic 推出的开放标准，用于连接 AI 应用与外部工具和数据源。

### Memory
记忆系统，Claude Code 的持久化知识存储系统，允许 AI 跨会话保留信息。

### Memory Scope
记忆作用域，定义 Memory 的可见范围，包括 User、Project、Local 三种级别。

### Memoize
记忆化，一种缓存技术，存储函数计算结果，避免重复计算。

## N

### Node.js
基于 Chrome V8 引擎的 JavaScript 运行时。Claude Code 可以运行在 Node.js 上，但推荐使用 Bun。

## P

### Permission Mode
权限模式，定义 AI 可自主执行的操作范围。包括 default、plan、auto、bypass 四种模式。

### Plugin
插件，扩展 Claude Code 功能的第三方代码包。

### Project Memory
项目记忆，存储项目特定信息的 Memory 类型，包括当前状态、决策、已知问题等。

### Prompt
提示词，用户或系统提供给 AI 的指令或问题。

### Prompt Cache
提示词缓存，Claude API 的特性，可以缓存部分提示词，减少重复计算，降低延迟和成本。

## R

### Reference Memory
引用记忆，存储外部资源链接的 Memory 类型，如文档 URL、监控仪表板等。

### Ripgrep (rg)
一种极速的文本搜索工具，Grep 工具基于 ripgrep 实现。

## S

### Schema
模式，定义数据结构的规范。在 Claude Code 中，使用 Zod 库定义工具的输入参数模式。

### Scope
作用域，定义变量的可见范围。在 Memory 系统中，Scope 决定 Memory 的共享级别。

### Subagent
子 Agent，由主 Agent 创建的辅助 Agent，用于处理特定的子任务。

### System Context
系统上下文，会话级别的上下文信息，包括 Git 状态、项目信息等，可以被 Prompt Cache 缓存。

### System Prompt
系统提示词，定义 AI 的角色、能力和行为规范的提示词。

## T

### Token
标记，AI 模型处理文本的基本单位。一个 token 约等于 4 个英文字符或 0.75 个单词。

### Tool
工具，AI 可以调用的函数，用于执行特定操作如读写文件、运行命令等。

### TypeScript
JavaScript 的超集，添加了静态类型支持。Claude Code 使用 TypeScript strict mode 编写。

## U

### User Context
用户上下文，每轮对话可变的上下文信息，如当前工作目录、最近打开的文件等。

### User Memory
用户记忆，存储用户个人偏好的 Memory 类型，包括角色背景、沟通风格等。

## V

### VitePress
基于 Vue.js 的静态站点生成器，Claude Code 的文档网站使用 VitePress 构建。

## W

### Workflow Engine
工作流引擎，管理多步骤任务的执行流程。Book Crafter 使用工作流引擎管理书籍创建流程。

### Worktree
工作树，参见 Git Worktree。

## Z

### Zod
TypeScript 优先的模式验证库，Claude Code 使用 Zod v4 定义工具的输入参数。

## 其他

### AI First
以 AI 为核心的设计理念，强调从 AI 的能力和限制出发设计系统。

### Dead Code Elimination
死代码消除，编译时移除不会执行的代码，减小打包体积。

### Lazy Loading
懒加载，延迟加载非必需的资源，提升启动性能。

### Parallel Prefetch
并行预取，同时发起多个数据读取请求，减少总等待时间。

### React + Ink
使用 React 和 Ink 库构建终端用户界面的技术栈。

### Streaming Response
流式响应，API 返回数据的方式，数据逐步到达而非一次性返回全部。

---

## 参考链接

- [Anthropic API 文档](https://docs.anthropic.com)
- [Claude Code 官方网站](https://claude.ai/code)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [VitePress 文档](https://vitepress.dev)
- [Zod 文档](https://zod.dev)
- [Bun 文档](https://bun.sh)
