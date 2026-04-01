# 第13章：权限系统设计

> "Security is not a product, but a process." — Bruce Schneier

权限系统是 Claude Code 安全的基石。在赋予 AI 强大能力的同时，必须确保用户对 AI 的行为有充分的控制。本章将深入探讨权限系统的设计与实现。

## 13.1 权限模型

### Permission Mode 类型

Claude Code 定义了多种权限模式，适应不同的使用场景：

```typescript
// src/hooks/toolPermission/index.ts
export type PermissionMode =
  | 'default'     // 默认模式：危险操作需要确认
  | 'plan'        // 规划模式：只读操作
  | 'auto'        // 自动模式：减少确认
  | 'bypass'      // 绕过模式：无需确认（危险！）

// 权限模式的详细说明
const PERMISSION_MODE_DESCRIPTIONS = {
  default: `
- 大多数操作需要确认
- 写文件、执行命令等危险操作必须确认
- 读取文件等安全操作自动允许
- 适合日常开发
`,

  plan: `
- 只读模式，不允许任何修改
- 只能读取文件、搜索代码
- 适合审查代码、生成计划
- 最安全的模式
`,

  auto: `
- 减少确认次数
- 智能判断风险，低风险操作自动允许
- 高风险操作仍需确认
- 适合信任 AI 的场景
`,

  bypass: `
- 无需任何确认
- AI 可以自由执行所有操作
- 极其危险，仅限受控环境
- 慎用！
`,
}
```

### 权限决策流程

```typescript
// 权限检查流程
export async function checkToolPermission(
  tool: Tool,
  input: unknown,
  context: ToolUseContext
): Promise<PermissionDecision> {
  // 1. 检查权限模式
  const mode = context.getPermissionMode()

  // Bypass 模式：全部允许
  if (mode === 'bypass') {
    return { decision: 'allow', reason: 'Bypass mode' }
  }

  // Plan 模式：只读工具允许
  if (mode === 'plan') {
    if (tool.permissionMode === 'plan') {
      return { decision: 'allow', reason: 'Read-only tool in plan mode' }
    }
    return { decision: 'deny', reason: 'Non-read-only tool in plan mode' }
  }

  // 2. 检查工具的权限模式
  if (tool.permissionMode === 'bypass') {
    return { decision: 'allow', reason: 'Tool configured as bypass' }
  }

  if (tool.permissionMode === 'plan') {
    return { decision: 'allow', reason: 'Read-only tool' }
  }

  // 3. 检查危险操作
  if (isDangerousOperation(tool, input)) {
    return { decision: 'ask_user', reason: 'Dangerous operation detected' }
  }

  // 4. 检查用户配置的权限规则
  const userRule = matchUserPermissionRule(tool, input, context)
  if (userRule) {
    return { decision: userRule.action, reason: userRule.reason }
  }

  // 5. Auto 模式：智能判断
  if (mode === 'auto') {
    const risk = assessRisk(tool, input)
    if (risk === 'low') {
      return { decision: 'allow', reason: 'Low risk in auto mode' }
    }
  }

  // 6. 默认：询问用户
  return { decision: 'ask_user', reason: 'Default behavior' }
}
```

### 权限决策类型

```typescript
// 权限决策
interface PermissionDecision {
  decision: 'allow' | 'deny' | 'ask_user'
  reason: string
  suggestion?: string
  autoApprove?: boolean  // 是否可以自动批准
}

// 用户权限规则
interface UserPermissionRule {
  tool: string | RegExp   // 工具名称或模式
  pattern?: RegExp        // 输入模式
  action: 'allow' | 'deny'
  reason: string
  scope: 'session' | 'always'  // 作用范围
  createdAt: Date
}
```

## 13.2 权限检查流程

### Tool Permission Hook

```typescript
// src/hooks/toolPermission/index.ts
export function createToolPermissionHook(
  context: ToolUseContext
): ToolHook {
  return {
    name: 'tool-permission',

    beforeExecute: async (tool: Tool, input: unknown) => {
      // 检查权限
      const decision = await checkToolPermission(tool, input, context)

      switch (decision.decision) {
        case 'allow':
          return { continue: true }

        case 'deny':
          return {
            continue: false,
            error: new Error(`Permission denied: ${decision.reason}`),
          }

        case 'ask_user':
          const approved = await askUserPermission(tool, input, decision)
          if (approved) {
            return { continue: true }
          } else {
            return {
              continue: false,
              error: new Error('User denied permission'),
            }
          }
      }
    },
  }
}
```

### 用户确认机制

```typescript
// src/hooks/toolPermission/permissionPrompt.ts
interface PermissionPrompt {
  toolName: string
  input: unknown
  risk: 'low' | 'medium' | 'high'
  reason: string
  suggestion?: string
}

async function askUserPermission(
  tool: Tool,
  input: unknown,
  decision: PermissionDecision
): Promise<boolean> {
  const prompt: PermissionPrompt = {
    toolName: tool.name,
    input,
    risk: assessRisk(tool, input),
    reason: decision.reason,
    suggestion: decision.suggestion,
  }

  // 显示权限提示
  const response = await showPermissionDialog({
    title: `Permission Required: ${tool.name}`,
    message: formatPermissionMessage(prompt),
    options: [
      {
        label: 'Allow',
        value: 'allow',
        description: 'Allow this operation',
      },
      {
        label: 'Allow for session',
        value: 'allow_session',
        description: 'Allow for the rest of this session',
      },
      {
        label: 'Always allow',
        value: 'allow_always',
        description: 'Always allow this operation',
      },
      {
        label: 'Deny',
        value: 'deny',
        description: 'Deny this operation',
      },
    ],
  })

  // 处理用户选择
  switch (response) {
    case 'allow':
      return true

    case 'allow_session':
      // 保存会话规则
      saveSessionRule(tool.name, input, 'allow')
      return true

    case 'allow_always':
      // 保存永久规则
      savePermanentRule(tool.name, input, 'allow')
      return true

    case 'deny':
      return false

    default:
      return false
  }
}

function formatPermissionMessage(prompt: PermissionPrompt): string {
  const riskEmoji = {
    low: '🟢',
    medium: '🟡',
    high: '🔴',
  }

  return `
${riskEmoji[prompt.risk]} Risk: ${prompt.risk.toUpperCase()}

Tool: ${prompt.toolName}
Reason: ${prompt.reason}

Input:
${JSON.stringify(prompt.input, null, 2)}

${prompt.suggestion ? `Suggestion: ${prompt.suggestion}` : ''}
`
}
```

### 批量授权

```typescript
// 批量授权：一次性批准多个操作
interface BatchPermissionRequest {
  operations: Array<{
    tool: string
    input: unknown
    risk: 'low' | 'medium' | 'high'
  }>
}

async function askBatchPermission(
  request: BatchPermissionRequest
): Promise<Map<string, boolean>> {
  // 按风险分组
  const grouped = groupBy(request.operations, 'risk')

  // 显示批量授权界面
  const response = await showBatchPermissionDialog({
    title: 'Batch Permission Request',
    summary: `
${grouped.high?.length || 0} high-risk operations
${grouped.medium?.length || 0} medium-risk operations
${grouped.low?.length || 0} low-risk operations
    `,
    details: request.operations.map(op =>
      `- ${op.tool}: ${summarizeInput(op.input)}`
    ).join('\n'),
    options: [
      { label: 'Allow all', value: 'all' },
      { label: 'Allow low-risk only', value: 'low' },
      { label: 'Review individually', value: 'individual' },
      { label: 'Deny all', value: 'none' },
    ],
  })

  const results = new Map<string, boolean>()

  switch (response) {
    case 'all':
      request.operations.forEach(op => {
        results.set(`${op.tool}:${JSON.stringify(op.input)}`, true)
      })
      break

    case 'low':
      request.operations.forEach(op => {
        results.set(
          `${op.tool}:${JSON.stringify(op.input)}`,
          op.risk === 'low'
        )
      })
      break

    case 'individual':
      // 逐个询问
      for (const op of request.operations) {
        const approved = await askUserPermission(
          getTool(op.tool),
          op.input,
          { decision: 'ask_user', reason: 'Individual review' }
        )
        results.set(`${op.tool}:${JSON.stringify(op.input)}`, approved)
      }
      break

    case 'none':
      request.operations.forEach(op => {
        results.set(`${op.tool}:${JSON.stringify(op.input)}`, false)
      })
      break
  }

  return results
}
```

### 拒绝处理

```typescript
// 权限被拒绝后的处理
async function handlePermissionDenial(
  tool: Tool,
  input: unknown,
  reason: string
): Promise<void> {
  // 1. 记录日志
  logPermissionDenial({
    tool: tool.name,
    input,
    reason,
    timestamp: new Date(),
  })

  // 2. 提供替代方案
  const alternatives = suggestAlternatives(tool, input, reason)

  if (alternatives.length > 0) {
    console.log('Permission denied. Alternatives:')
    alternatives.forEach((alt, i) => {
      console.log(`${i + 1}. ${alt.description}`)
    })

    // 用户可以选择替代方案
    const choice = await promptChoice('Choose an alternative:', alternatives)
    if (choice) {
      await executeAlternative(choice)
    }
  } else {
    console.log('Permission denied. No alternatives available.')
  }
}

// 建议替代方案
function suggestAlternatives(
  tool: Tool,
  input: unknown,
  reason: string
): Alternative[] {
  const alternatives: Alternative[] = []

  // 例如：Bash 命令被拒绝，建议使用更安全的命令
  if (tool.name === 'Bash') {
    const command = (input as any).command

    if (command.includes('rm ')) {
      alternatives.push({
        description: 'Move to trash instead of deleting',
        action: () => executeBash(command.replace('rm ', 'mv ')),
      })
    }

    if (command.includes('npm install')) {
      alternatives.push({
        description: 'Install with --dry-run first',
        action: () => executeBash(command + ' --dry-run'),
      })
    }
  }

  // 更多替代方案...
  return alternatives
}
```

## 13.3 敏感操作保护

### 危险命令检测

```typescript
// src/hooks/toolPermission/dangerDetection.ts
interface DangerousPattern {
  pattern: RegExp
  severity: 'low' | 'medium' | 'high'
  description: string
  alternative?: string
}

const DANGEROUS_BASH_PATTERNS: DangerousPattern[] = [
  {
    pattern: /\brm\s+-rf\s+\//,
    severity: 'high',
    description: 'Recursively delete from root directory',
    alternative: 'Specify the exact directory to delete',
  },
  {
    pattern: />\s*\/dev\/sda/,
    severity: 'high',
    description: 'Write directly to disk device',
  },
  {
    pattern: /:(){ :|:& };:/,
    severity: 'high',
    description: 'Fork bomb',
  },
  {
    pattern: /curl.*\|\s*(ba)?sh/,
    severity: 'medium',
    description: 'Execute script from network',
    alternative: 'Download and review the script first',
  },
  {
    pattern: /chmod\s+777/,
    severity: 'medium',
    description: 'Set overly permissive permissions',
    alternative: 'Use minimal necessary permissions',
  },
  {
    pattern: /\bsudo\b/,
    severity: 'medium',
    description: 'Execute with superuser privileges',
  },
]

export function detectDangerousBashCommand(
  command: string
): DangerousOperation[] {
  const detected: DangerousOperation[] = []

  for (const { pattern, severity, description, alternative } of DANGEROUS_BASH_PATTERNS) {
    if (pattern.test(command)) {
      detected.push({
        severity,
        description,
        command,
        alternative,
      })
    }
  }

  return detected
}
```

### 沙箱机制

```typescript
// 沙箱执行环境
interface SandboxConfig {
  allowedCommands?: string[]    // 允许的命令白名单
  deniedCommands?: string[]     // 禁止的命令黑名单
  allowedPaths?: string[]       // 允许访问的路径
  deniedPaths?: string[]        // 禁止访问的路径
  maxExecutionTime?: number     // 最大执行时间（毫秒）
  maxMemory?: number            // 最大内存使用（字节）
  networkAccess?: boolean       // 是否允许网络访问
}

const DEFAULT_SANDBOX: SandboxConfig = {
  allowedPaths: [
    process.cwd(),
    getTmpDir(),
  ],
  deniedPaths: [
    '/etc',
    '~/.ssh',
    '~/.gnupg',
  ],
  maxExecutionTime: 300000,  // 5 分钟
  networkAccess: true,
}

async function executeInSandbox(
  command: string,
  config: SandboxConfig = DEFAULT_SANDBOX
): Promise<ExecutionResult> {
  // 1. 验证命令
  const validation = validateCommand(command, config)
  if (!validation.valid) {
    throw new Error(`Command not allowed: ${validation.reason}`)
  }

  // 2. 创建沙箱环境
  const sandbox = await createSandboxEnvironment(config)

  // 3. 执行命令
  const result = await sandbox.execute(command)

  // 4. 清理沙箱
  await sandbox.cleanup()

  return result
}
```

### 审计日志

```typescript
// 所有工具调用都被记录
interface ToolCallAuditLog {
  id: string
  timestamp: Date
  tool: string
  input: unknown
  output: unknown
  permission: {
    decision: 'allow' | 'deny'
    mode: PermissionMode
    userConfirmed?: boolean
  }
  duration: number
  error?: string
}

class AuditLogger {
  private logs: ToolCallAuditLog[] = []
  private maxLogs = 10000

  log(entry: Omit<ToolCallAuditLog, 'id' | 'timestamp'>): void {
    const log: ToolCallAuditLog = {
      id: generateId(),
      timestamp: new Date(),
      ...entry,
    }

    this.logs.push(log)

    // 保持日志数量限制
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // 写入文件
    this.writeToFile(log)
  }

  query(filter: AuditLogFilter): ToolCallAuditLog[] {
    return this.logs.filter(log => {
      if (filter.tool && log.tool !== filter.tool) return false
      if (filter.startTime && log.timestamp < filter.startTime) return false
      if (filter.endTime && log.timestamp > filter.endTime) return false
      if (filter.permission && log.permission.decision !== filter.permission) return false
      return true
    })
  }

  private async writeToFile(log: ToolCallAuditLog): Promise<void> {
    const logPath = join(getConfigHome(), 'audit.log')
    await fs.appendFile(logPath, JSON.stringify(log) + '\n')
  }
}
```

## 13.4 细粒度控制

### 文件路径权限

```typescript
// 文件路径权限规则
interface FilePathPermission {
  pattern: string | RegExp   // 路径模式
  permission: 'read' | 'write' | 'deny'
  reason?: string
}

// 默认规则
const DEFAULT_FILE_PERMISSIONS: FilePathPermission[] = [
  // 禁止访问系统文件
  { pattern: '/etc/*', permission: 'deny', reason: 'System files' },
  { pattern: '~/.ssh/*', permission: 'deny', reason: 'SSH keys' },
  { pattern: '~/.gnupg/*', permission: 'deny', reason: 'GPG keys' },

  // 项目目录：读写
  { pattern: process.cwd(), permission: 'write' },

  // 临时目录：读写
  { pattern: getTmpDir(), permission: 'write' },
]

function checkFilePermission(
  path: string,
  operation: 'read' | 'write'
): PermissionCheck {
  const normalized = normalize(path)

  for (const rule of DEFAULT_FILE_PERMISSIONS) {
    if (matchesPattern(normalized, rule.pattern)) {
      if (rule.permission === 'deny') {
        return {
          allowed: false,
          reason: rule.reason || 'Path not allowed',
        }
      }

      if (operation === 'read' && rule.permission === 'read') {
        return { allowed: true }
      }

      if (operation === 'write' && rule.permission === 'write') {
        return { allowed: true }
      }
    }
  }

  // 默认：拒绝
  return {
    allowed: false,
    reason: 'Path not in allowed list',
  }
}
```

### 命令白名单

```typescript
// Bash 命令白名单
const ALLOWED_COMMANDS = [
  // Git 命令
  'git status',
  'git diff',
  'git log',
  'git branch',

  // 包管理器
  'npm install',
  'npm test',
  'npm run build',

  // 代码质量
  'eslint',
  'prettier',
  'tsc',

  // 搜索和查找
  'grep',
  'find',
  'ls',
  'cat',
]

function isCommandAllowed(command: string): boolean {
  const baseCommand = command.split(' ')[0]

  // 检查白名单
  return ALLOWED_COMMANDS.some(allowed =>
    baseCommand === allowed.split(' ')[0]
  )
}

// 如果不在白名单，需要用户确认
if (!isCommandAllowed(command)) {
  const approved = await askUserPermission(...)
  // ...
}
```

### 环境变量控制

```typescript
// 通过环境变量控制权限
const PERMISSION_ENV_VARS = {
  // 完全禁用网络访问
  CLAUDE_CODE_DISABLE_NETWORK: 'true',

  // 只读模式
  CLAUDE_CODE_READ_ONLY: 'true',

  // 禁用 Bash 工具
  CLAUDE_CODE_DISABLE_BASH: 'true',

  // 自动批准所有操作（危险！）
  CLAUDE_CODE_AUTO_APPROVE: 'true',

  // 最大命令执行时间（秒）
  CLAUDE_CODE_MAX_EXEC_TIME: '60',
}

function getPermissionFromEnv(): Partial<PermissionConfig> {
  const config: Partial<PermissionConfig> = {}

  if (process.env.CLAUDE_CODE_DISABLE_NETWORK === 'true') {
    config.networkAccess = false
  }

  if (process.env.CLAUDE_CODE_READ_ONLY === 'true') {
    config.mode = 'plan'
  }

  if (process.env.CLAUDE_CODE_DISABLE_BASH === 'true') {
    config.disabledTools = [...(config.disabledTools || []), 'Bash']
  }

  if (process.env.CLAUDE_CODE_AUTO_APPROVE === 'true') {
    config.mode = 'bypass'
    console.warn('⚠️  WARNING: Auto-approve mode is enabled. This is dangerous!')
  }

  return config
}
```

### 组织策略

```typescript
// 企业级策略管理
interface OrganizationPolicy {
  // 工具权限
  allowedTools?: string[]
  deniedTools?: string[]

  // 文件访问权限
  allowedPaths?: string[]
  deniedPaths?: string[]

  // 网络权限
  allowedDomains?: string[]
  deniedDomains?: string[]

  // 执行限制
  maxExecutionTime?: number
  maxFileSize?: number

  // 审计要求
  requireAudit?: boolean
  auditRetention?: number  // 天数
}

async function loadOrganizationPolicy(): Promise<OrganizationPolicy> {
  // 从远程服务器加载策略
  const response = await fetch('https://policy.company.com/claude-code')
  return response.json()
}

// 应用组织策略
function applyOrganizationPolicy(
  policy: OrganizationPolicy
): void {
  // 设置工具权限
  if (policy.deniedTools) {
    for (const tool of policy.deniedTools) {
      disableTool(tool)
    }
  }

  // 设置文件访问权限
  if (policy.deniedPaths) {
    addDeniedPaths(policy.deniedPaths)
  }

  // 设置审计
  if (policy.requireAudit) {
    enableAuditLogging()
  }
}
```

## 总结

权限系统是 Claude Code 安全的保障：

1. **多级权限模式**：default、plan、auto、bypass 适应不同场景。
2. **智能风险判断**：自动评估操作风险，减少不必要的打扰。
3. **用户友好确认**：清晰的提示、批量授权、替代方案。
4. **敏感操作保护**：危险检测、沙箱机制、审计日志。
5. **细粒度控制**：文件路径、命令白名单、环境变量、组织策略。

通过精心设计的权限系统，Claude Code 在赋予 AI 强大能力的同时，确保用户始终保持控制权。

---

<div style="text-align: center; margin-top: 2rem;">
  <a href="/chapter-12-plugin-system" style="margin-right: 1rem;">← 第12章</a>
  <a href="/chapter-14-performance-optimization">第14章：性能优化策略 →</a>
</div>
