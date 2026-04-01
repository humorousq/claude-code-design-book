# 第10章：上下文管理

> "Context is king, but context window is limited." — AI Engineering Wisdom

上下文管理是 Claude Code 性能和成本的关键。如何在有限的上下文窗口中装载最有价值的信息，是系统设计的核心挑战。

## 10.1 上下文源

### Git 状态

```typescript
// src/context.ts
export const getGitStatus = memoize(async (): Promise<string | null> => {
  const isGit = await getIsGit()
  if (!isGit) return null

  try {
    const [branch, mainBranch, status, log, userName] = await Promise.all([
      getBranch(),
      getDefaultBranch(),
      execFileNoThrow(gitExe(), ['--no-optional-locks', 'status', '--short']),
      execFileNoThrow(gitExe(), ['--no-optional-locks', 'log', '--oneline', '-n', '5']),
      execFileNoThrow(gitExe(), ['config', 'user.name']),
    ])

    // 截断过长的状态
    const truncatedStatus =
      status.length > MAX_STATUS_CHARS
        ? status.substring(0, MAX_STATUS_CHARS) +
          '\n... (truncated because it exceeds 2k characters. Run "git status" for full output)'
        : status

    return [
      `This is the git status at the start of the conversation.`,
      `Current branch: ${branch}`,
      `Main branch (you will usually use this for PRs): ${mainBranch}`,
      ...(userName ? [`Git user: ${userName}`] : []),
      `Status:\n${truncatedStatus || '(clean)'}`,
      `Recent commits:\n${log}`,
    ].join('\n\n')
  } catch (error) {
    return null
  }
})
```

**为什么包含 Git 状态**：

```typescript
// Git 状态提供了关键的上下文：
// 1. 当前分支：帮助 AI 理解工作上下文
// 2. 未提交的变更：避免 AI 意外覆盖
// 3. 最近的提交：了解最近的工作
// 4. 主分支：创建 PR 时需要
```

### 项目结构

```typescript
// 项目结构上下文
async function getProjectStructure(): Promise<string> {
  const cwd = getCwd()

  // 1. 读取 package.json（如果存在）
  const packageJson = await tryReadJson('package.json')

  // 2. 读取主要目录结构
  const structure = await getDirectoryTree(cwd, {
    depth: 2,
    ignore: ['node_modules', '.git', 'dist', 'build'],
  })

  // 3. 识别项目类型
  const projectType = detectProjectType(packageJson, structure)

  return `
Project: ${cwd}
Type: ${projectType}

Structure:
${formatTree(structure)}

${packageJson ? `Dependencies: ${Object.keys(packageJson.dependencies || {}).join(', ')}` : ''}
`
}
```

### CLAUDE.md 文件

```typescript
// src/utils/claudemd.ts
export async function getClaudeMds(): Promise<ClaudeMd[]> {
  const claudeMds: ClaudeMd[] = []

  // 1. 用户级别的 CLAUDE.md
  const userClaudeMd = join(getMemoryBaseDir(), 'CLAUDE.md')
  if (await exists(userClaudeMd)) {
    claudeMds.push({
      path: userClaudeMd,
      content: await fs.readFile(userClaudeMd, 'utf-8'),
      scope: 'user',
    })
  }

  // 2. 项目级别的 CLAUDE.md
  const projectClaudeMd = join(getCwd(), 'CLAUDE.md')
  if (await exists(projectClaudeMd)) {
    claudeMds.push({
      path: projectClaudeMd,
      content: await fs.readFile(projectClaudeMd, 'utf-8'),
      scope: 'project',
    })
  }

  // 3. 额外的 CLAUDE.md 目录
  const additionalDirs = getAdditionalDirectoriesForClaudeMd()
  for (const dir of additionalDirs) {
    const additionalClaudeMd = join(dir, 'CLAUDE.md')
    if (await exists(additionalClaudeMd)) {
      claudeMds.push({
        path: additionalClaudeMd,
        content: await fs.readFile(additionalClaudeMd, 'utf-8'),
        scope: 'additional',
      })
    }
  }

  return claudeMds
}
```

**CLAUDE.md 的作用**：

```markdown
# CLAUDE.md

本项目的技术栈和约定：
- 使用 TypeScript strict mode
- 测试框架：Jest
- 代码风格：Prettier + ESLint
- 提交规范：Conventional Commits

特殊约定：
- 所有 API 调用必须包含错误处理
- 使用 Zod 验证所有外部输入
```

### Memory 系统

```typescript
// 加载 Memory 上下文
async function loadMemoryPrompt(): Promise<string> {
  const memoryDir = getMemoryDir()

  // 1. 检查 Memory 是否启用
  if (!isMemoryEnabled()) {
    return ''
  }

  // 2. 构建 Memory 提示词
  return buildMemoryPrompt({
    displayName: 'Memory',
    memoryDir,
    extraGuidelines: [
      'Read relevant memories at the start of conversations',
      'Update memories when you learn new information',
    ],
  })
}
```

### 环境变量

```typescript
// 敏感环境变量的处理
function getEnvironmentContext(): Record<string, string> {
  const safeEnvVars: Record<string, string> = {}

  // 只包含安全的、非敏感的环境变量
  const safeKeys = [
    'NODE_ENV',
    'LANG',
    'SHELL',
    'TERM',
  ]

  for (const key of safeKeys) {
    if (process.env[key]) {
      safeEnvVars[key] = process.env[key]
    }
  }

  return safeEnvVars
}

// 敏感信息过滤
function filterSensitiveEnv(value: string): string {
  // 检测并移除敏感信息
  const sensitivePatterns = [
    /sk-[a-zA-Z0-9]{20,}/g,      // API keys
    /password/i,
    /secret/i,
    /token/i,
  ]

  let filtered = value
  for (const pattern of sensitivePatterns) {
    filtered = filtered.replace(pattern, '[REDACTED]')
  }

  return filtered
}
```

## 10.2 上下文收集

### getSystemContext 的实现

```typescript
// src/context.ts
export const getSystemContext = memoize(async () => {
  const startTime = Date.now()

  // 并行收集所有上下文
  const [gitStatus, memoryPrompt, claudeMds] = await Promise.all([
    shouldIncludeGitInstructions() ? getGitStatus() : null,
    isMemoryEnabled() ? loadMemoryPrompt() : null,
    getClaudeMds(),
  ])

  const context: Record<string, string> = {}

  // Git 状态
  if (gitStatus) {
    context.gitStatus = gitStatus
  }

  // Memory
  if (memoryPrompt) {
    context.memory = memoryPrompt
  }

  // CLAUDE.md
  if (claudeMds.length > 0) {
    context.claudeMds = claudeMds
      .map(md => `# ${md.scope} CLAUDE.md\n\n${md.content}`)
      .join('\n\n---\n\n')
  }

  // 当前日期
  context.currentDate = `Today's date is ${getLocalISODate()}.`

  return context
})
```

### getUserContext 的设计

```typescript
export const getUserContext = memoize(async () => {
  const context: Record<string, string> = {}

  // 1. 工作目录
  const cwd = getCwd()
  context.cwd = `Current working directory: ${cwd}`

  // 2. 项目根目录
  const projectRoot = findProjectRoot()
  if (projectRoot && projectRoot !== cwd) {
    context.projectRoot = `Project root: ${projectRoot}`
  }

  // 3. 最近打开的文件（可选）
  const recentFiles = getRecentFiles()
  if (recentFiles.length > 0) {
    context.recentFiles = `Recently opened files:\n${recentFiles.join('\n')}`
  }

  // 4. 当前文件（如果有）
  const currentFile = getCurrentFile()
  if (currentFile) {
    context.currentFile = `Current file: ${currentFile}`
  }

  return context
})
```

### 并行收集优化

```typescript
// 并行收集，减少延迟
async function collectContextInParallel(): Promise<FullContext> {
  const startTime = Date.now()

  // 所有的上下文收集并行执行
  const [
    gitStatus,
    memoryPrompt,
    claudeMds,
    projectStructure,
    environment,
  ] = await Promise.all([
    getGitStatus(),
    loadMemoryPrompt(),
    getClaudeMds(),
    getProjectStructure(),
    getEnvironmentContext(),
  ])

  const duration = Date.now() - startTime
  logForDebugging(`Context collection took ${duration}ms`)

  return {
    gitStatus,
    memoryPrompt,
    claudeMds,
    projectStructure,
    environment,
  }
}
```

### 缓存机制

```typescript
// 使用 Lodash 的 memoize 缓存结果
import memoize from 'lodash-es/memoize.js'

// 会话级别的缓存
export const getSystemContext = memoize(async () => {
  // ... 收集上下文
})

// 手动清除缓存
export function clearContextCache(): void {
  getSystemContext.cache.clear?.()
  getUserContext.cache.clear?.()
}

// 当环境变化时清除缓存
function onEnvironmentChange(): void {
  // 例如：切换目录、Git 状态变化等
  clearContextCache()
}
```

## 10.3 上下文压缩

### Compact 算法

```typescript
// src/services/compact/index.ts
export async function compactConversation(
  messages: Message[]
): Promise<Message[]> {
  // 1. 识别可以压缩的消息
  const compressible = identifyCompressibleMessages(messages)

  // 2. 使用 Claude 生成摘要
  const summary = await generateSummary(compressible)

  // 3. 替换原始消息
  const compacted = messages.map(msg =>
    compressible.includes(msg) ? summary : msg
  )

  return compacted
}

function identifyCompressibleMessages(messages: Message[]): Message[] {
  // 压缩标准：
  // 1. 旧的对话（距离当前超过 10 轮）
  // 2. 工具调用结果（特别是长输出）
  // 3. 重复的信息

  const recentMessages = messages.slice(-10)
  const oldMessages = messages.slice(0, -10)

  return oldMessages.filter(msg =>
    msg.role === 'tool' ||  // 工具输出
    msg.content.length > 1000  // 长消息
  )
}

async function generateSummary(messages: Message[]): Promise<Message> {
  const prompt = `
Summarize the following conversation segment into a concise summary.
Focus on:
- Key decisions made
- Important findings
- Actions taken

Messages:
${messages.map(m => m.content).join('\n\n')}
`

  const summary = await queryClaude({ prompt, maxTokens: 500 })

  return {
    role: 'assistant',
    content: `Summary of earlier conversation:\n${summary.output}`,
  }
}
```

### 信息重要性排序

```typescript
// 按重要性排序上下文
function prioritizeContext(
  context: Record<string, string>,
  maxTokens: number
): Record<string, string> {
  const prioritized: Record<string, string> = {}
  let usedTokens = 0

  // 优先级顺序
  const priority = [
    'currentFile',      // 当前文件最重要
    'gitStatus',        // Git 状态次之
    'memory',           // Memory
    'claudeMds',        // CLAUDE.md
    'cwd',              // 工作目录
    'projectStructure', // 项目结构
    'environment',      // 环境变量
  ]

  for (const key of priority) {
    if (!context[key]) continue

    const tokens = estimateTokens(context[key])

    if (usedTokens + tokens <= maxTokens) {
      prioritized[key] = context[key]
      usedTokens += tokens
    } else {
      // 空间不足，截断或跳过
      const remaining = maxTokens - usedTokens
      if (remaining > 100) {
        prioritized[key] = truncateToTokens(context[key], remaining)
      }
      break
    }
  }

  return prioritized
}

function estimateTokens(text: string): number {
  // 简单估算：1 token ≈ 4 字符
  return Math.ceil(text.length / 4)
}
```

### 保留关键决策

```typescript
// 在压缩时保留关键决策
function extractKeyDecisions(messages: Message[]): string[] {
  const decisions: string[] = []

  for (const msg of messages) {
    // 查找决策关键词
    const decisionPatterns = [
      /decided to/i,
      /will use/i,
      /chose/i,
      /selected/i,
      /agreed on/i,
    ]

    for (const pattern of decisionPatterns) {
      if (pattern.test(msg.content)) {
        decisions.push(extractDecision(msg.content))
      }
    }
  }

  return decisions
}

// 在压缩后的上下文中包含关键决策
function buildCompactedContext(
  summary: string,
  decisions: string[]
): string {
  return `
${summary}

## Key Decisions Made:
${decisions.map(d => `- ${d}`).join('\n')}
`
}
```

### 用户自定义压缩

```typescript
// 允许用户自定义压缩策略
interface CompactStrategy {
  preserveTools: string[]    // 保留的工具调用
  preservePatterns: RegExp[] // 保留的内容模式
  maxAge: number             // 最大保留轮数
}

const defaultStrategy: CompactStrategy = {
  preserveTools: ['Bash', 'Write'],  // 保留 Bash 和 Write 调用
  preservePatterns: [
    /TODO/i,
    /FIXME/i,
    /IMPORTANT/i,
  ],
  maxAge: 10,
}

function compactWithStrategy(
  messages: Message[],
  strategy: CompactStrategy
): Message[] {
  // 根据用户策略压缩
  // ...
}
```

## 10.4 上下文边界

### 何时需要刷新上下文

```typescript
// 触发上下文刷新的条件
function shouldRefreshContext(): boolean {
  // 1. 切换目录
  if (cwdChanged) return true

  // 2. Git 状态显著变化
  if (gitStatusChangedSignificantly()) return true

  // 3. Memory 更新
  if (memoryUpdated) return true

  // 4. CLAUDE.md 修改
  if (claudeMdModified) return true

  // 5. 达到 token 限制
  if (tokenCount > MAX_TOKENS * 0.9) return true

  return false
}

function gitStatusChangedSignificantly(): boolean {
  // 检查是否有重要的 Git 变化
  // - 新的提交
  // - 分支切换
  // - 大量文件变更
  // ...
}
```

### 上下文隔离

```typescript
// 不同 Agent 之间的上下文隔离
class ContextIsolation {
  private contexts = new Map<string, Context>()

  // 每个 Agent 有自己的上下文
  getAgentContext(agentId: string): Context {
    if (!this.contexts.has(agentId)) {
      // 创建隔离的上下文
      this.contexts.set(agentId, this.createIsolatedContext())
    }
    return this.contexts.get(agentId)!
  }

  private createIsolatedContext(): Context {
    // 继承全局上下文
    const global = getGlobalContext()

    // 创建隔离副本
    return {
      ...global,
      messages: [],  // 独立的消息历史
      toolResults: new Map(),  // 独立的工具结果
    }
  }
}
```

### 多轮对话的上下文管理

```typescript
// 管理多轮对话的上下文
class ConversationContextManager {
  private messageHistory: Message[] = []
  private maxMessages = 50

  addMessage(message: Message): void {
    this.messageHistory.push(message)

    // 检查是否需要压缩
    if (this.messageHistory.length > this.maxMessages) {
      this.compact()
    }
  }

  private async compact(): Promise<void> {
    // 保留最近的消息
    const recent = this.messageHistory.slice(-20)

    // 压缩旧的消息
    const old = this.messageHistory.slice(0, -20)
    const summary = await generateSummary(old)

    // 替换
    this.messageHistory = [summary, ...recent]
  }

  getFullContext(): Message[] {
    return [
      { role: 'system', content: getSystemPrompt() },
      ...this.messageHistory,
    ]
  }
}
```

### 大型项目的策略

```typescript
// 针对大型项目的特殊策略
class LargeProjectContextStrategy {
  private fileIndex: FileIndex
  private symbolIndex: SymbolIndex

  async getContextForQuery(query: string): Promise<string> {
    // 1. 分析查询，提取关键词
    const keywords = extractKeywords(query)

    // 2. 使用索引找到相关文件
    const relevantFiles = await this.findRelevantFiles(keywords)

    // 3. 只加载相关的上下文
    const context = await this.loadRelevantContext(relevantFiles)

    return context
  }

  private async findRelevantFiles(keywords: string[]): Promise<string[]> {
    // 使用文件索引和符号索引
    const byFileName = await this.fileIndex.search(keywords)
    const bySymbol = await this.symbolIndex.search(keywords)

    // 合并去重
    const unique = new Set([...byFileName, ...bySymbol])
    return Array.from(unique)
  }
}
```

## 10.5 Token 计数与优化

### Token 计数

```typescript
// src/services/tokenEstimation.ts
export function estimateTokenCount(text: string): number {
  // 方法 1：简单估算（快速）
  const simple = Math.ceil(text.length / 4)

  // 方法 2：使用 tokenizer（准确）
  const accurate = countWithTokenizer(text)

  // 根据需求选择
  return process.env.ACCURATE_TOKEN_COUNT ? accurate : simple
}

function countWithTokenizer(text: string): number {
  // 使用实际的 tokenizer
  // 例如：@anthropic-ai/tokenizer
  const tokenizer = new Tokenizer()
  return tokenizer.encode(text).length
}
```

### Token 预算分配

```typescript
// 分配 token 预算
interface TokenBudget {
  systemPrompt: number     // 系统提示词
  context: number          // 上下文
  history: number          // 对话历史
  response: number         // AI 响应
  buffer: number           // 缓冲区
}

const DEFAULT_BUDGET: TokenBudget = {
  systemPrompt: 2000,      // 2K tokens
  context: 20000,          // 20K tokens
  history: 50000,          // 50K tokens
  response: 4000,          // 4K tokens
  buffer: 24000,           // 24K tokens
}

function allocateBudget(totalBudget: number): TokenBudget {
  // 根据总预算动态分配
  return {
    systemPrompt: Math.floor(totalBudget * 0.02),
    context: Math.floor(totalBudget * 0.15),
    history: Math.floor(totalBudget * 0.50),
    response: Math.floor(totalBudget * 0.05),
    buffer: Math.floor(totalBudget * 0.28),
  }
}
```

### 成本监控

```typescript
// src/cost-tracker.ts
export class CostTracker {
  private totalCost = 0
  private totalTokens = 0

  trackUsage(usage: Usage): void {
    const cost = calculateCost(usage)
    this.totalCost += cost
    this.totalTokens += usage.input_tokens + usage.output_tokens

    // 记录日志
    logUsage({
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cost,
      totalCost: this.totalCost,
    })
  }

  getSummary(): CostSummary {
    return {
      totalCost: this.totalCost,
      totalTokens: this.totalTokens,
      averageCostPerRequest: this.totalCost / requestCount,
    }
  }
}

function calculateCost(usage: Usage): number {
  // Claude 的定价（示例）
  const INPUT_COST_PER_1K = 0.003   // $0.003 per 1K input tokens
  const OUTPUT_COST_PER_1K = 0.015  // $0.015 per 1K output tokens

  const inputCost = (usage.input_tokens / 1000) * INPUT_COST_PER_1K
  const outputCost = (usage.output_tokens / 1000) * OUTPUT_COST_PER_1K

  return inputCost + outputCost
}
```

## 10.6 上下文可视化

### 显示上下文使用情况

```typescript
// 向用户展示上下文使用情况
function formatContextUsage(usage: ContextUsage): string {
  const bar = createProgressBar(usage.used, usage.total, 40)

  return `
Context Usage: ${usage.used}/${usage.total} tokens (${usage.percentage}%)
${bar}

Breakdown:
- System Prompt: ${usage.systemPrompt} tokens
- Context: ${usage.context} tokens
- History: ${usage.history} tokens
- Buffer: ${usage.buffer} tokens
`
}

function createProgressBar(used: number, total: number, width: number): string {
  const percentage = used / total
  const filled = Math.round(width * percentage)
  const empty = width - filled

  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`
}
```

### 上下文调试

```typescript
// 调试模式下的上下文详情
function debugContext(context: Record<string, string>): void {
  if (!process.env.DEBUG_CONTEXT) return

  console.log('=== Context Debug ===')

  for (const [key, value] of Object.entries(context)) {
    const tokens = estimateTokenCount(value)
    console.log(`${key}: ${tokens} tokens, ${value.length} chars`)

    if (process.env.DEBUG_CONTEXT === 'verbose') {
      console.log('Content:', value.substring(0, 200))
    }
  }

  const totalTokens = Object.values(context)
    .reduce((sum, v) => sum + estimateTokenCount(v), 0)

  console.log(`Total: ${totalTokens} tokens`)
}
```

## 总结

上下文管理是 Claude Code 的生命线：

1. **多元数据源**：Git、项目、Memory、CLAUDE.md、环境变量。
2. **并行收集**：高效地收集所有上下文。
3. **智能压缩**：保留关键信息，丢弃冗余。
4. **优先级排序**：最重要的信息优先保留。
5. **Token 预算**：合理分配 token，控制成本。
6. **可视化**：让用户了解上下文使用情况。

通过精细的上下文管理，Claude Code 在有限的 token 预算内实现了最大的智能。

---

<div style="text-align: center; margin-top: 2rem;">
  <a href="/chapter-09-system-prompts" style="margin-right: 1rem;">← 第9章</a>
  <a href="/chapter-11-mcp-integration">第11章：MCP 协议集成 →</a>
</div>
