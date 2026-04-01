# 第9章：系统提示词的设计

> "The limits of my language mean the limits of my world." — Ludwig Wittgenstein

系统提示词是 Claude Code 与 Claude API 沟通的桥梁，它定义了 Claude 的行为边界、知识范围和工作方式。优秀的提示词设计是 Claude Code 成功的关键。

## 9.1 提示词的结构

### System Context vs User Context

Claude Code 的提示词分为两个层次：

```typescript
// src/context.ts
export const getSystemContext = memoize(async () => {
  // 1. Git 状态（会话级别，可缓存）
  const gitStatus = await getGitStatus()

  // 2. 系统提示注入（用于调试）
  const injection = getSystemPromptInjection()

  return {
    ...(gitStatus && { gitStatus }),
    ...(injection && { cacheBreaker: injection }),
  }
})

export const getUserContext = memoize(async () => {
  // 1. 工作目录
  const cwd = getCwd()

  // 2. 项目根目录
  const projectRoot = getProjectRoot()

  // 3. Memory 提示
  const memoryPrompt = await loadMemoryPrompt()

  // 4. CLAUDE.md 内容
  const claudeMd = await loadClaudeMd()

  return {
    cwd,
    projectRoot,
    memoryPrompt,
    claudeMd,
  }
})
```

**为什么分层**：

```typescript
// System Context（系统上下文）
// - 会话级别的缓存（prompt cache）
// - 1 小时有效期
//- 不常变化的内容

// User Context（用户上下文）
// - 每轮对话都可能变化
// - 无法缓存
// - 频繁更新的内容
```

### 核心提示词分析

Claude Code 的系统提示词包含几个关键部分：

```typescript
// 1. 角色定义
const rolePrompt = `
You are Claude Code, Anthropic's official CLI for Claude.
You are an expert software engineer and AI assistant.
`

// 2. 能力边界
const capabilitiesPrompt = `
You can:
- Read and write files
- Execute shell commands
- Search codebases
- Access the web
- Spawn sub-agents
`

// 3. 工具说明
const toolsPrompt = `
You have access to the following tools:
${formatToolDescriptions(availableTools)}
`

// 4. 行为指导
const behaviorPrompt = `
- Always think before acting
- Verify your changes
- Ask for clarification when uncertain
- Explain your reasoning
`
```

### 提示词版本管理

```typescript
// 提示词版本控制
interface PromptVersion {
  version: string
  createdAt: Date
  changes: string[]
  rollback: () => void
}

class PromptManager {
  private versions: PromptVersion[] = []

  async updatePrompt(newPrompt: string, changes: string[]): Promise<void> {
    const version: PromptVersion = {
      version: this.currentVersion,
      createdAt: new Date(),
      changes,
      rollback: () => this.revertTo(this.currentVersion),
    }

    this.versions.push(version)
    this.currentPrompt = newPrompt
  }

  async rollback(version: string): Promise<void> {
    const target = this.versions.find(v => v.version === version)
    if (target) {
      await target.rollback()
    }
  }
}
```

## 9.2 Agent Tool 的提示词设计

### 提示词的组成部分

Agent Tool 拥有最复杂的提示词系统：

```typescript
// src/tools/AgentTool/prompt.ts
export async function getPrompt(
  agentDefinitions: AgentDefinition[],
  isCoordinator?: boolean,
  allowedAgentTypes?: string[],
): Promise<string> {
  // 1. 过滤 Agent 类型
  const effectiveAgents = allowedAgentTypes
    ? agentDefinitions.filter(a => allowedAgentTypes.includes(a.agentType))
    : agentDefinitions

  // 2. Fork 启用判断
  const forkEnabled = isForkSubagentEnabled()

  // 3. When to fork 章节
  const whenToForkSection = forkEnabled
    ? buildWhenToForkSection()
    : ''

  // 4. Writing the prompt 章节
  const writingThePromptSection = buildWritingPromptSection(forkEnabled)

  // 5. 示例章节
  const examplesSection = forkEnabled
    ? buildForkExamples()
    : buildCurrentExamples()

  // 6. Agent 列表章节
  const agentListSection = buildAgentListSection(effectiveAgents)

  return `
Use the Agent tool to delegate tasks to specialized agents.

${agentListSection}

${whenToForkSection}

${writingThePromptSection}

${examplesSection}
`.trim()
}
```

### When to fork 的判断标准

```typescript
const whenToForkSection = `
## When to fork

Fork yourself (omit \`subagent_type\`) when the intermediate tool output isn't worth keeping in your context.
The criterion is qualitative — "will I need this output again" — not task size.

- **Research**: fork open-ended questions. If research can be broken into independent questions, launch parallel forks in one message. A fork beats a fresh subagent for this — it inherits context and shares your cache.
- **Implementation**: prefer to fork implementation work that requires more than a couple of edits. Do research before jumping to implementation.

Forks are cheap because they share your prompt cache. Don't set \`model\` on a fork — a different model can't reuse the parent's cache. Pass a short \`name\` (one or two words, lowercase) so the user can see the fork in the teams panel and steer it mid-run.

**Don't peek.** The tool result includes an \`output_file\` path — do not Read or tail it unless the user explicitly asks for a progress check. You get a completion notification; trust it. Reading the transcript mid-flight pulls the fork's tool noise into your context, which defeats the point of forking.

**Don't race.** After launching, you know nothing about what the fork found. Never fabricate or predict fork results in any format — not as prose, summary, or structured output. The notification arrives as a user-role message in a later turn; it is never something you write yourself. If the user asks a follow-up before the notification lands, tell them the fork is still running — give status, not a guess.
`
```

### 编写 Agent 提示词的原则

```typescript
const writingThePromptSection = `
## Writing the prompt

${forkEnabled ? 'When spawning a fresh agent (with a `subagent_type`), it starts with zero context. ' : ''}Brief the agent like a smart colleague who just walked into the room — it hasn't seen this conversation, doesn't know what you've tried, doesn't understand why this task matters.

- Explain what you're trying to accomplish and why.
- Describe what you've already learned or ruled out.
- Give enough context about the surrounding problem that the agent can make judgment calls rather than just following a narrow instruction.
- If you need a short response, say so ("report in under 200 words").
- Lookups: hand over the exact command. Investigations: hand over the question — prescribed steps become dead weight when the premise is wrong.

${forkEnabled ? 'For fresh agents, terse' : 'Terse'} command-style prompts produce shallow, generic work.

**Never delegate understanding.** Don't write "based on your findings, fix the bug" or "based on the research, implement it." Those phrases push synthesis onto the agent instead of doing it yourself. Write prompts that prove you understood: include file paths, line numbers, what specifically to change.
`
```

### Agent 提示词的反模式

```typescript
// ❌ 错误示例：过于简短
const badPrompt = 'Fix the bug'

// ❌ 错误示例：过度委托理解
const badPrompt = 'Research the issue and fix it'

// ❌ 错误示例：指定具体步骤
const badPrompt = `
1. Read file A
2. Search for pattern B
3. Modify C
`
// 问题：如果前提错误，这些步骤会成为负担

// ✅ 正确示例：清晰的意图和上下文
const goodPrompt = `
Fix the authentication bug in src/auth/login.ts:

Problem: Users are logged out after 5 minutes
Expected: Session should last 24 hours

What I've tried:
- Increased SESSION_TIMEOUT to 86400
- But users still get logged out after 5 minutes

Please find the root cause and fix it.
Constraint: Do NOT modify the cookie logic.
`
```

## 9.3 Memory 的行为指导

### Memory 提示词的构建

```typescript
// src/memdir/memoryTypes.ts
export const TYPES_SECTION_INDIVIDUAL: readonly string[] = [
  '## Types of memory',
  '',
  'There are several discrete types of memory that you can store in your memory system:',
  '',
  '<types>',
  '<type>',
  '    <name>user</name>',
  '    <description>Contain information about the user\'s role, goals, responsibilities, and knowledge.</description>',
  '    <when_to_save>When you learn any details about the user\'s role, preferences, responsibilities, or knowledge</when_to_save>',
  '    <how_to_use>When your work should be informed by the user\'s profile or perspective.</how_to_use>',
  '    <examples>',
  '    user: I\'m a data scientist investigating what logging we have in place',
  '    assistant: [saves user memory: user is a data scientist, currently focused on observability/logging]',
  '    </examples>',
  '</type>',
  // ... 其他类型
  '</types>',
]
```

### Memory 使用指导

```typescript
const memoryUsageGuidelines = `
### When to access memory

- **Start of conversation**: Check for relevant memories before responding
- **Before complex tasks**: Review project memories for context
- **After user feedback**: Save feedback to memory
- **When uncertain**: Check if similar situations occurred before

### What NOT to save

Content derivable from the current project state should NOT be saved:

- Code patterns, conventions, architecture → derivable from reading code
- Git history, recent changes → derivable from git log/blame
- Debugging solutions → the fix is in the code
- Anything in CLAUDE.md → already documented

Save only information NOT derivable: user preferences, project status, feedback, external references.
`
```

## 9.4 提示词优化技巧

### 清晰的指令

```typescript
// ❌ 模糊的指令
const vagueInstruction = 'Be helpful'

// ✅ 清晰的指令
const clearInstruction = `
When the user asks for code:
1. Read the relevant files first
2. Understand the context
3. Write the code
4. Test if possible
5. Explain your changes
`
```

### 结构化输出

```typescript
// ❌ 无结构的输出要求
const unstructuredOutput = 'Generate a report'

// ✅ 结构化的输出要求
const structuredOutput = `
Generate a report with the following structure:

# Report Title

## Summary
- Bullet points

## Details
- Section for each major finding

## Recommendations
1. Numbered list
2. In priority order

## Appendix
- Supporting data
`
```

### 避免歧义

```typescript
// ❌ 有歧义的提示
const ambiguousPrompt = 'Fix the file'

// ✅ 无歧义的提示
const unambiguousPrompt = `
Fix src/auth/login.ts by:
- Changing line 45 from `timeout: 300` to `timeout: 86400`
- This increases session duration from 5 minutes to 24 hours
`
```

### 使用示例

```typescript
// 示例比描述更有力
const promptWithExamples = `
Write a commit message following this format:

<type>(<scope>): <subject>

<body>

<footer>

Examples:
- feat(auth): add OAuth 2.0 login support
- fix(api): resolve timeout issue in request handler
- docs(readme): update installation instructions
`
```

## 9.5 提示词的迭代改进

### A/B 测试

```typescript
class PromptABTest {
  private variants = new Map<string, PromptVariant>()

  async runTest(
    promptA: string,
    promptB: string,
    task: string
  ): Promise<TestResult> {
    const [resultA, resultB] = await Promise.all([
      this.executeWithPrompt(promptA, task),
      this.executeWithPrompt(promptB, task),
    ])

    return {
      variantA: resultA,
      variantB: resultB,
      winner: this.compareResults(resultA, resultB),
    }
  }

  compareResults(a: ExecutionResult, b: ExecutionResult): string {
    // 比较准确率、速度、成本等指标
    const scoreA = this.computeScore(a)
    const scoreB = this.computeScore(b)
    return scoreA > scoreB ? 'A' : 'B'
  }
}
```

### 回归测试

```typescript
// 确保提示词变更不会破坏现有功能
class PromptRegressionTest {
  private testCases: TestCase[] = []

  async runTests(newPrompt: string): Promise<TestReport> {
    const results: TestResult[] = []

    for (const testCase of this.testCases) {
      const result = await this.runTest(testCase, newPrompt)
      results.push(result)
    }

    return {
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      details: results,
    }
  }
}
```

### 文档化

```typescript
// 每个提示词变更都应该有文档
interface PromptChange {
  timestamp: Date
  author: string
  prompt: string
  reason: string
  metrics: {
    accuracy?: number
    latency?: number
    cost?: number
  }
}

// 示例
const promptChange: PromptChange = {
  timestamp: new Date('2026-04-01'),
  author: 'team@anthropic.com',
  prompt: 'new_agent_prompt_v2',
  reason: 'Improved success rate for code review tasks',
  metrics: {
    accuracy: 0.92,  // +5% from previous
    latency: 2.3,    // -0.5s from previous
    cost: 0.012,     // -$0.003 from previous
  },
}
```

## 9.6 提示词的安全性

### 输入验证

```typescript
// 防止提示词注入
function sanitizeUserInput(input: string): string {
  // 1. 移除潜在的注入标记
  let sanitized = input.replace(/<\|.*?\|>/g, '')

  // 2. 转义特殊字符
  sanitized = sanitized.replace(/</g, '&lt;')
  sanitized = sanitized.replace(/>/g, '&gt;')

  // 3. 限制长度
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000) + '... [truncated]'
  }

  return sanitized
}
```

### 输出过滤

```typescript
// 过滤敏感输出
function filterSensitiveOutput(output: string): string {
  const patterns = [
    { pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: '[API_KEY]' },
    { pattern: /password:\s*\S+/gi, replacement: 'password: [REDACTED]' },
    { pattern: /token:\s*\S+/gi, replacement: 'token: [REDACTED]' },
  ]

  let filtered = output
  for (const { pattern, replacement } of patterns) {
    filtered = filtered.replace(pattern, replacement)
  }

  return filtered
}
```

## 9.7 提示词最佳实践

### 保持简洁

```typescript
// ❌ 过于冗长
const verbosePrompt = `
In order to successfully complete the task at hand, it is important
that you first understand the requirements thoroughly. Please take
your time to analyze the problem and then proceed to implement the
solution step by step, making sure to test your changes as you go.
`

// ✅ 简洁明了
const concisePrompt = `
Analyze the requirements, implement the solution, and test it.
`
```

### 使用主动语态

```typescript
// ❌ 被动语态
const passivePrompt = 'Files should be read before editing'

// ✅ 主动语态
const activePrompt = 'Read files before editing'
```

### 提供上下文

```typescript
// ❌ 缺少上下文
const noContextPrompt = 'Fix the bug'

// ✅ 提供上下文
const contextualPrompt = `
Fix the race condition in src/queue/processor.ts.

Context: Multiple workers are processing jobs concurrently.
Sometimes two workers process the same job.

Hint: Check the job locking mechanism around line 45.
`
```

## 总结

系统提示词的设计是一门艺术：

1. **结构清晰**：分层组织，System Context + User Context。
2. **指令明确**：告诉 AI 做什么，而不是不做什么。
3. **示例丰富**：好的示例胜过千言万语。
4. **持续优化**：A/B 测试、回归测试、文档化。
5. **安全第一**：输入验证、输出过滤。
6. **简洁有力**：删除每一个不必要的词。

优秀的提示词设计让 Claude Code 成为开发者得力的 AI 伙伴。

---

<div style="text-align: center; margin-top: 2rem;">
  <a href="/chapter-08-memory-implementation" style="margin-right: 1rem;">← 第8章</a>
  <a href="/chapter-10-context-management">第10章：上下文管理 →</a>
</div>
