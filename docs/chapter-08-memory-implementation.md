# 第8章：Memory 系统的实现

> "The details are not the details. They make the design." — Charles Eames

第7章探讨了 Memory 系统的设计哲学，本章将深入技术实现细节，揭示 Memory 系统如何在 Claude Code 中高效运作。

## 8.1 文件组织结构

### MEMORY.md 入口文件

每个 Memory 目录都有一个入口文件 `MEMORY.md`：

```typescript
// src/memdir/memdir.ts
export const ENTRYPOINT_NAME = 'MEMORY.md'
export const MAX_ENTRYPOINT_LINES = 200
export const MAX_ENTRYPOINT_BYTES = 25_000

export interface EntrypointTruncation {
  content: string
  lineCount: number
  byteCount: number
  wasLineTruncated: boolean
  wasByteTruncated: boolean
}

/**
 * 截断 MEMORY.md 内容到限制内
 * 先按行截断，再按字节截断
 */
export function truncateEntrypointContent(raw: string): EntrypointTruncation {
  const trimmed = raw.trim()
  const contentLines = trimmed.split('\n')
  const lineCount = contentLines.length
  const byteCount = trimmed.length

  const wasLineTruncated = lineCount > MAX_ENTRYPOINT_LINES
  const wasByteTruncated = byteCount > MAX_ENTRYPOINT_BYTES

  if (!wasLineTruncated && !wasByteTruncated) {
    return {
      content: trimmed,
      lineCount,
      byteCount,
      wasLineTruncated,
      wasByteTruncated,
    }
  }

  // 先按行截断
  let truncated = wasLineTruncated
    ? contentLines.slice(0, MAX_ENTRYPOINT_LINES).join('\n')
    : trimmed

  // 再按字节截断（在最后一个换行符处截断）
  if (truncated.length > MAX_ENTRYPOINT_BYTES) {
    const cutAt = truncated.lastIndexOf('\n', MAX_ENTRYPOINT_BYTES)
    truncated = truncated.slice(0, cutAt > 0 ? cutAt : MAX_ENTRYPOINT_BYTES)
  }

  const reason = wasByteTruncated && !wasLineTruncated
    ? `${formatFileSize(byteCount)} (limit: ${formatFileSize(MAX_ENTRYPOINT_BYTES)}) — index entries are too long`
    : wasLineTruncated && !wasByteTruncated
      ? `${lineCount} lines (limit: ${MAX_ENTRYPOINT_LINES})`
      : `${lineCount} lines and ${formatFileSize(byteCount)}`

  return {
    content:
      truncated +
      `\n\n> WARNING: ${ENTRYPOINT_NAME} is ${reason}. Only part of it was loaded. Keep index entries to one line under ~200 chars; move detail into topic files.`,
    lineCount,
    byteCount,
    wasLineTruncated,
    wasByteTruncated,
  }
}
```

**设计考量**：

```typescript
// 为什么限制 200 行或 25KB？

// 1. Token 成本
//    200 行 × 80 字符/行 ≈ 16K 字符 ≈ 4K tokens
//    在 200K 的上下文窗口中占 2%

// 2. 可读性
//    200 行是人类一次可阅读的上限

// 3. 性能
//    25KB 的文件加载时间 < 10ms
```

### 主题文件的组织

主题文件按类型组织：

```
memory/
├── MEMORY.md              # 入口文件（索引）
│
├── user/                  # User Memory
│   ├── preferences.md    # 用户偏好
│   └── background.md     # 用户背景
│
├── feedback/              # Feedback Memory
│   ├── coding-style.md   # 编码风格反馈
│   ├── testing.md        # 测试策略反馈
│   └── communication.md   # 沟通方式反馈
│
├── project/               # Project Memory
│   ├── current-sprint.md # 当前冲刺
│   ├── decisions.md      # 架构决策
│   └── known-issues.md   # 已知问题
│
└── reference/             # Reference Memory
    ├── external-apis.md   # 外部 API
    ├── monitoring.md     # 监控系统
    └── documentation.md  # 文档链接
```

## 8.2 提示词构建

### buildMemoryPrompt 的实现

```typescript
// src/memdir/memdir.ts
export interface MemoryPromptConfig {
  displayName: string
  memoryDir: string
  extraGuidelines?: string[]
}

export function buildMemoryPrompt(config: MemoryPromptConfig): string {
  const { displayName, memoryDir, extraGuidelines = [] } = config

  // 1. 读取 MEMORY.md 入口文件
  const entrypointPath = join(memoryDir, ENTRYPOINT_NAME)
  let entrypointContent: string

  try {
    const raw = fs.readFileSync(entrypointPath, 'utf-8')
    const truncated = truncateEntrypointContent(raw)
    entrypointContent = truncated.content
  } catch (error) {
    // 入口文件不存在，创建空的
    entrypointContent = `# Memory\n\nNo memories stored yet.`
  }

  // 2. 构建行为指导
  const guidelines = [
    ...buildMemoryLines(displayName),
    '',
    ...extraGuidelines,
    '',
    `## Memory directory`,
    '',
    `All memories are stored in: ${memoryDir}`,
    DIR_EXISTS_GUIDANCE,  // "This directory already exists..."
  ]

  // 3. 组合完整提示词
  return `
${guidelines.join('\n')}

---

${entrypointContent}
`.trim()
}
```

### 行为指导注入

```typescript
// src/memdir/memoryTypes.ts
export function buildMemoryLines(displayName: string): string[] {
  return [
    `## ${displayName}`,
    '',
    'This section defines a structured memory system for persisting information across conversations.',
    '',
    '### When to access memory',
    '',
    '- **Read**: Check for relevant memories at the start of conversations',
    '- **Write**: Save new learnings, user preferences, or feedback',
    '- **Update**: Modify existing memories when information changes',
    '- **Delete**: Remove outdated or incorrect memories',
    '',
    '### What NOT to save in memory',
    '',
    'Content that is derivable from the current project state should NOT be saved:',
    '',
    '- **Code patterns, conventions, architecture** → derivable from reading code',
    '- **Git history, recent changes** → derivable from git log/blame',
    '- **Debugging solutions** → the fix is in the code; commit message has context',
    '- **File structure** → derivable from filesystem',
    '',
    'Save only information that is NOT derivable: user preferences, project status, feedback, external references.',
  ]
}
```

### 类型系统说明

```typescript
// src/memdir/memoryTypes.ts
export const TYPES_SECTION_COMBINED: readonly string[] = [
  '## Types of memory',
  '',
  'There are several discrete types of memory that you can store in your memory system:',
  '',
  '<types>',
  '<type>',
  '    <name>user</name>',
  '    <scope>always private</scope>',
  '    <description>Contain information about the user\'s role, goals, responsibilities, and knowledge. Great user memories help you tailor your future behavior to the user\'s preferences and perspective.</description>',
  '    <when_to_save>When you learn any details about the user\'s role, preferences, responsibilities, or knowledge</when_to_save>',
  '    <how_to_use>When your work should be informed by the user\'s profile or perspective.</how_to_use>',
  '    <examples>',
  '    user: I\'m a data scientist investigating what logging we have in place',
  '    assistant: [saves private user memory: user is a data scientist, currently focused on observability/logging]',
  '    </examples>',
  '</type>',
  // ... feedback, project, reference 类型
  '</types>',
]
```

## 8.3 Agent Memory 扩展

### loadAgentMemoryPrompt 的设计

Agent 可以拥有专属的 Memory：

```typescript
// src/tools/AgentTool/agentMemory.ts
export type AgentMemoryScope = 'user' | 'project' | 'local'

/**
 * 加载 Agent 的持久化 Memory
 * @param agentType Agent 类型名称
 * @param scope Memory 作用域
 */
export function loadAgentMemoryPrompt(
  agentType: string,
  scope: AgentMemoryScope,
): string {
  // 1. 根据作用域添加特别说明
  let scopeNote: string
  switch (scope) {
    case 'user':
      scopeNote =
        '- Since this memory is user-scope, keep learnings general since they apply across all projects'
      break
    case 'project':
      scopeNote =
        '- Since this memory is project-scope and shared with your team via version control, tailor your memories to this project'
      break
    case 'local':
      scopeNote =
        '- Since this memory is local-scope (not checked into version control), tailor your memories to this project and machine'
      break
  }

  const memoryDir = getAgentMemoryDir(agentType, scope)

  // 2. 异步创建目录（不阻塞提示词构建）
  void ensureMemoryDirExists(memoryDir)

  // 3. 构建 Agent Memory 提示词
  return buildMemoryPrompt({
    displayName: 'Persistent Agent Memory',
    memoryDir,
    extraGuidelines: [
      scopeNote,
      '- Agent memory is specific to this agent type and does not affect other agents',
      '- Changes here persist across sessions for this agent type',
    ],
  })
}
```

### Agent Memory 目录路径

```typescript
// src/tools/AgentTool/agentMemory.ts
export function getAgentMemoryDir(
  agentType: string,
  scope: AgentMemoryScope,
): string {
  const dirName = sanitizeAgentTypeForPath(agentType)

  switch (scope) {
    case 'project':
      // 项目级别：.claude/agent-memory/<agentType>/
      return join(getCwd(), '.claude', 'agent-memory', dirName) + sep

    case 'local':
      // 本地级别：支持远程挂载
      if (process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR) {
        return join(
          process.env.CLAUDE_CODE_REMOTE_MEMORY_DIR,
          'projects',
          sanitizePath(getProjectRoot()),
          'agent-memory-local',
          dirName,
        ) + sep
      }
      return join(getCwd(), '.claude', 'agent-memory-local', dirName) + sep

    case 'user':
      // 用户级别：~/.claude/agent-memory/<agentType>/
      return join(getMemoryBaseDir(), 'agent-memory', dirName) + sep
  }
}

/**
 * 清理 Agent 类型名称，用于目录命名
 * 将冒号（Windows 无效，用于插件命名空间）替换为破折号
 */
function sanitizeAgentTypeForPath(agentType: string): string {
  return agentType.replace(/:/g, '-')
}
```

### Agent Memory 与主 Memory 的协调

```typescript
// Agent 启动时的 Memory 加载
async function initializeAgent(agentDef: AgentDefinition, context: Context) {
  const systemPrompt = agentDef.systemPrompt

  // 1. 加载主 Memory（如果有）
  if (agentDef.includeMainMemory) {
    const mainMemory = await loadMemoryPrompt()
    systemPrompt += '\n\n' + mainMemory
  }

  // 2. 加载 Agent 专属 Memory
  if (agentDef.memory) {
    const agentMemory = loadAgentMemoryPrompt(
      agentDef.agentType,
      agentDef.memory.scope
    )
    systemPrompt += '\n\n' + agentMemory
  }

  return systemPrompt
}
```

## 8.4 自动 Memory 提取

### extractMemories 服务

```typescript
// src/services/extractMemories/index.ts
export interface MemoryCandidate {
  type: MemoryType
  content: string
  confidence: number  // 0-1，AI 确信度
  reason: string      // 为什么值得保存
}

export async function extractMemories(
  conversation: Message[]
): Promise<MemoryCandidate[]> {
  // 1. 分析对话，识别潜在的记忆
  const candidates = await analyzeConversation(conversation)

  // 2. 过滤可推导的内容
  const nonDerivable = candidates.filter(c =>
    !isDerivableFromCode(c) &&
    !isDerivableFromGitHistory(c) &&
    !isDocumentedInClaudeMd(c)
  )

  // 3. 去重
  const unique = deduplicateMemories(nonDerivable)

  // 4. 排序（按置信度）
  unique.sort((a, b) => b.confidence - a.confidence)

  return unique
}

async function analyzeConversation(
  messages: Message[]
): Promise<MemoryCandidate[]> {
  const prompt = `
Analyze the following conversation and identify information worth remembering.

Conversation:
${formatConversation(messages)}

Look for:
1. User preferences about coding style, communication, or workflow
2. Project-specific context, decisions, or constraints
3. Feedback about how you should behave or respond
4. References to external resources, tools, or systems

For each candidate, provide:
- Type: user, feedback, project, or reference
- Content: the actual information to remember
- Confidence: 0-1, how certain you are this should be saved
- Reason: why this information is worth remembering

Output as JSON array.
`

  const response = await queryClaude({ prompt })
  return JSON.parse(response.output)
}
```

### 提取时机与策略

```typescript
// 什么时候触发 Memory 提取？

// 1. 会话结束时
export async function onSessionEnd(conversation: Message[]) {
  if (!isAutoMemoryEnabled()) return

  const candidates = await extractMemories(conversation)

  // 如果有高置信度的候选，询问用户
  const highConfidence = candidates.filter(c => c.confidence > 0.8)

  if (highConfidence.length > 0) {
    await promptUserToSave(highConfidence)
  }
}

// 2. 用户明确反馈时
export async function onUserFeedback(feedback: string) {
  // 用户给出明确的反馈，直接保存
  const memory: MemoryCandidate = {
    type: 'feedback',
    content: feedback,
    confidence: 1.0,
    reason: 'User explicitly provided feedback',
  }

  await saveMemory(memory)
}

// 3. 关键事件发生时
export async function onKeyEvent(event: KeyEvent) {
  // 例如：用户纠正 Claude 的行为
  if (event.type === 'correction') {
    const memory = await convertCorrectionToMemory(event)
    await saveMemory(memory)
  }
}
```

### 质量控制

```typescript
// Memory 质量检查
function validateMemory(candidate: MemoryCandidate): boolean {
  // 1. 内容不能为空
  if (!candidate.content || candidate.content.trim().length === 0) {
    return false
  }

  // 2. 内容不能太短（至少 10 字符）
  if (candidate.content.trim().length < 10) {
    return false
  }

  // 3. 内容不能太长（建议不超过 500 字符）
  if (candidate.content.length > 500) {
    console.warn('Memory content too long, consider splitting')
    // 不拒绝，但警告
  }

  // 4. 不能包含敏感信息
  if (containsSensitiveInfo(candidate.content)) {
    return false
  }

  // 5. 置信度必须合理
  if (candidate.confidence < 0 || candidate.confidence > 1) {
    return false
  }

  return true
}

function containsSensitiveInfo(content: string): boolean {
  const sensitivePatterns = [
    /sk-[a-zA-Z0-9]{20,}/,      // API keys
    /password[:=]\s*\S+/i,       // Passwords
    /secret[:=]\s*\S+/i,         // Secrets
    /\b\d{16}\b/,                // Credit card numbers
    /\b\d{3}-\d{2}-\d{4}\b/,     // SSN
  ]

  return sensitivePatterns.some(p => p.test(content))
}
```

## 8.5 Memory 搜索与检索

### findRelevantMemories 实现

```typescript
// src/memdir/findRelevantMemories.ts
export async function findRelevantMemories(
  query: string,
  context: SearchContext
): Promise<MemoryMatch[]> {
  // 1. 向量化查询
  const queryEmbedding = await embed(query)

  // 2. 搜索所有 Memory 文件
  const memoryFiles = await glob('**/*.md', { cwd: getMemoryDir() })

  const matches: MemoryMatch[] = []

  for (const file of memoryFiles) {
    const content = await fs.readFile(file, 'utf-8')

    // 3. 向量化 Memory 内容
    const memoryEmbedding = await embed(content)

    // 4. 计算相似度
    const similarity = cosineSimilarity(queryEmbedding, memoryEmbedding)

    if (similarity > SIMILARITY_THRESHOLD) {
      matches.push({
        file,
        content,
        similarity,
        snippet: extractRelevantSnippet(content, query),
      })
    }
  }

  // 5. 按相似度排序
  matches.sort((a, b) => b.similarity - a.similarity)

  // 6. 返回 Top-N
  return matches.slice(0, 10)
}

function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((sum, ai, i) => sum + ai * b[i], 0)
  const normA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0))
  const normB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0))
  return dot / (normA * normB)
}
```

### 向量化与索引

```typescript
// Memory 索引系统
class MemoryIndex {
  private embeddings = new Map<string, number[]>()
  private index: VectorIndex

  async buildIndex(): Promise<void> {
    const files = await this.getAllMemoryFiles()

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8')
      const embedding = await embed(content)
      this.embeddings.set(file, embedding)
    }

    // 构建向量索引（使用 HNSW 或类似算法）
    this.index = new HNSWIndex(Array.from(this.embeddings.values()))
  }

  async search(query: string, k: number = 10): Promise<string[]> {
    const queryEmbedding = await embed(query)

    // 向量搜索
    const indices = this.index.search(queryEmbedding, k)

    // 返回文件路径
    return indices.map(i => Array.from(this.embeddings.keys())[i])
  }
}
```

### 上下文感知检索

```typescript
// 根据当前上下文检索相关 Memory
async function getContextualMemories(
  currentFile: string,
  recentChanges: string[],
  userQuery: string
): Promise<string[]> {
  // 1. 提取关键词
  const keywords = extractKeywords(currentFile, recentChanges, userQuery)

  // 2. 组合查询
  const query = `${keywords.join(' ')} ${userQuery}`

  // 3. 向量搜索
  const matches = await findRelevantMemories(query)

  // 4. 过滤不相关的
  const relevant = matches.filter(m =>
    isRelevantToContext(m, { currentFile, recentChanges })
  )

  return relevant.map(m => m.content)
}
```

## 8.6 Memory 的性能优化

### 懒加载策略

```typescript
// 只在需要时才加载 Memory
export async function loadMemoryPrompt(): Promise<string> {
  // 检查是否已加载
  if (memoryCache.has('loaded')) {
    return memoryCache.get('loaded')
  }

  // 懒加载
  const prompt = await buildMemoryPrompt({
    displayName: 'Memory',
    memoryDir: getMemoryDir(),
  })

  memoryCache.set('loaded', prompt)
  return prompt
}
```

### 增量更新

```typescript
// 只更新变化的部分
class IncrementalMemoryUpdater {
  private lastModified = new Map<string, number>()

  async updateIfNeeded(file: string): Promise<boolean> {
    const stat = await fs.stat(file)
    const mtime = stat.mtimeMs

    if (this.lastModified.get(file) === mtime) {
      return false  // 无变化
    }

    this.lastModified.set(file, mtime)
    await this.updateMemory(file)
    return true
  }

  private async updateMemory(file: string): Promise<void> {
    // 重新向量化
    const content = await fs.readFile(file, 'utf-8')
    const embedding = await embed(content)

    // 更新索引
    memoryIndex.update(file, embedding)
  }
}
```

### 缓存策略

```typescript
// 多级缓存
class MemoryCache {
  // L1: 内存缓存（最近使用的）
  private lru = new LRUCache<string, string>({ max: 100 })

  // L2: 文件系统缓存
  private async getFromFile(file: string): Promise<string | null> {
    const cacheFile = this.getCachePath(file)
    try {
      return await fs.readFile(cacheFile, 'utf-8')
    } catch {
      return null
    }
  }

  async get(file: string): Promise<string> {
    // L1 缓存
    if (this.lru.has(file)) {
      return this.lru.get(file)!
    }

    // L2 缓存
    const cached = await this.getFromFile(file)
    if (cached) {
      this.lru.set(file, cached)
      return cached
    }

    // 缓存未命中，读取文件
    const content = await fs.readFile(file, 'utf-8')
    this.lru.set(file, content)
    await this.saveToFile(file, content)
    return content
  }
}
```

## 8.7 Memory 的安全性

### 访问控制

```typescript
// Memory 访问权限检查
function canAccessMemory(
  scope: MemoryScope,
  operation: 'read' | 'write',
  user: User
): boolean {
  switch (scope) {
    case 'user':
      // User Memory: 只有用户自己可以访问
      return true  // 已验证的用户

    case 'project':
      // Project Memory: 团队成员可以读写
      return user.isTeamMember()

    case 'local':
      // Local Memory: 只有本机用户
      return user.isLocal()
  }
}
```

### 数据隔离

```typescript
// Memory 路径验证
function validateMemoryPath(
  path: string,
  scope: MemoryScope
): boolean {
  const allowedRoot = getMemoryDir(scope)
  const normalized = normalize(path)

  // 防止路径遍历
  if (!normalized.startsWith(allowedRoot)) {
    throw new Error('Invalid memory path')
  }

  // 防止访问其他用户的 Memory
  const userRoot = getUserMemoryRoot()
  if (normalized.startsWith(userRoot) && !isCurrentUser(normalized)) {
    throw new Error('Cannot access other user\'s memory')
  }

  return true
}
```

### 数据加密

```typescript
// 敏感 Memory 加密存储
async function encryptAndSave(
  content: string,
  file: string
): Promise<void> {
  // 1. 生成密钥
  const key = await deriveKey(process.env.MEMORY_SECRET)

  // 2. 加密内容
  const encrypted = await encrypt(content, key)

  // 3. 保存加密文件
  await fs.writeFile(file + '.enc', encrypted)

  // 4. 删除明文文件
  await fs.unlink(file)
}
```

## 总结

Memory 系统的实现体现了以下原则：

1. **分层组织**：入口文件 + 主题文件，清晰的结构。
2. **智能提示**：构建富含指导意义的提示词。
3. **自动提取**：AI 辅助识别值得保存的信息。
4. **高效检索**：向量搜索 + 上下文感知。
5. **性能优化**：懒加载、增量更新、多级缓存。
6. **安全可靠**：访问控制、数据隔离、加密存储。

通过精心的实现，Memory 系统成为 Claude Code 真正的长期记忆，使其能够持续学习和改进。

---

<div style="text-align: center; margin-top: 2rem;">
  <a href="/chapter-07-memory-philosophy" style="margin-right: 1rem;">← 第7章</a>
  <a href="/chapter-09-system-prompts">第9章：系统提示词的设计 →</a>
</div>
