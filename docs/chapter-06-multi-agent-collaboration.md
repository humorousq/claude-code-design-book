# 第6章：多 Agent 协作模式

> "If you want to go fast, go alone. If you want to go far, go together." — African Proverb

单个 Agent 的能力有限，但多个 Agent 协作可以处理远超单个 Agent 能力的复杂任务。本章将深入探讨多 Agent 协作的架构、模式与最佳实践。

## 6.1 Coordinator 模式

### Coordinator 的角色与职责

Coordinator（协调器）是管理多个 Agent 的中心节点：

```typescript
// src/coordinator/coordinatorMode.ts
export class Coordinator {
  private agents: Map<string, Agent> = new Map()
  private taskQueue: Task[] = []
  private completedTasks: Map<string, TaskResult> = new Map()

  async coordinate(mainTask: string): Promise<void> {
    // 1. 分析任务，分解为子任务
    const subtasks = await this.decomposeTask(mainTask)

    // 2. 为每个子任务分配合适的 Agent
    for (const subtask of subtasks) {
      const agentType = this.selectAgentType(subtask)
      const agent = await this.spawnAgent(agentType, subtask)
      this.agents.set(agent.id, agent)
    }

    // 3. 监控执行，收集结果
    await this.monitorAndCollect()

    // 4. 合并结果，生成最终输出
    await this.mergeResults()
  }

  private async decomposeTask(task: string): Promise<Subtask[]> {
    // 使用 Claude 分析任务，生成子任务列表
    const response = await queryClaude({
      prompt: `Decompose this task into subtasks: ${task}`,
      tools: ['TaskCreateTool']
    })

    return response.subtasks
  }
}
```

**Coordinator 的职责**：

1. **任务分解**：将复杂任务分解为可独立执行的子任务。
2. **Agent 分配**：根据子任务的性质，选择合适的 Agent 类型。
3. **依赖管理**：处理子任务之间的依赖关系。
4. **进度监控**：跟踪各个 Agent 的执行状态。
5. **结果聚合**：收集并合并各个 Agent 的输出。
6. **错误处理**：处理 Agent 失败、超时等异常情况。

### 任务分发策略

```typescript
interface Subtask {
  id: string
  description: string
  agentType: string
  dependencies: string[]  // 依赖的其他子任务 ID
  priority: number       // 优先级（数字越小越优先）
  timeout?: number       // 超时时间
}

async function distributeTasks(subtasks: Subtask[]): Promise<void> {
  // 拓扑排序，考虑依赖关系
  const sorted = topologicalSort(subtasks)

  // 按优先级分组
  const grouped = groupByPriority(sorted)

  for (const group of grouped) {
    // 同一优先级的任务并行执行
    await Promise.all(
      group.map(subtask => executeSubtask(subtask))
    )
  }
}

// 拓扑排序算法
function topologicalSort(subtasks: Subtask[]): Subtask[] {
  const sorted: Subtask[] = []
  const visited = new Set<string>()
  const visiting = new Set<string>()

  function visit(subtask: Subtask) {
    if (visited.has(subtask.id)) return
    if (visiting.has(subtask.id)) {
      throw new Error('Circular dependency detected')
    }

    visiting.add(subtask.id)

    // 先访问依赖
    for (const depId of subtask.dependencies) {
      const dep = subtasks.find(s => s.id === depId)
      if (dep) visit(dep)
    }

    visiting.delete(subtask.id)
    visited.add(subtask.id)
    sorted.push(subtask)
  }

  for (const subtask of subtasks) {
    visit(subtask)
  }

  return sorted
}
```

### 结果聚合

```typescript
async function mergeResults(
  results: Map<string, TaskResult>
): Promise<string> {
  // 1. 检查所有任务是否成功
  const failures = Array.from(results.entries())
    .filter(([_, result]) => result.status === 'error')

  if (failures.length > 0) {
    return generateFailureReport(failures)
  }

  // 2. 按依赖关系排序结果
  const sortedResults = sortByDependency(results)

  // 3. 合并结果
  const merged = await queryClaude({
    prompt: `
    Merge the following subtask results into a coherent final report:

    ${sortedResults.map(r => r.output).join('\n\n---\n\n')}
    `
  })

  return merged.output
}
```

### 错误处理

```typescript
async function handleAgentError(
  error: AgentError,
  coordinator: Coordinator
): Promise<void> {
  // 1. 分类错误
  const errorType = classifyError(error)

  switch (errorType) {
    case 'timeout':
      // 超时：重试或使用替代方案
      await coordinator.retryTask(error.taskId, {
        timeout: error.timeout * 1.5
      })
      break

    case 'resource_exhausted':
      // 资源耗尽：等待后重试
      await sleep(60000)
      await coordinator.retryTask(error.taskId)
      break

    case 'dependency_failed':
      // 依赖失败：跳过此任务
      await coordinator.skipTask(error.taskId)
      break

    case 'irrecoverable':
      // 不可恢复：通知用户
      await coordinator.notifyUser({
        type: 'error',
        message: `Task failed: ${error.message}`,
        suggestion: error.suggestion
      })
      break
  }
}
```

## 6.2 Team Agent 架构

### TeamCreateTool 的设计

Team Agent 允许创建一组协同工作的 Agent：

```typescript
// src/tools/TeamCreateTool/TeamCreateTool.ts
export const TeamCreateTool: Tool = {
  name: 'TeamCreate',
  description: 'Create a team of agents for parallel work',

  inputSchema: z.object({
    team_name: z.string().describe('Team name'),
    agents: z.array(z.object({
      agent_type: z.string(),
      task: z.string(),
      name: z.string(),
    })),
    strategy: z.enum(['parallel', 'sequential', 'pipeline']).optional(),
  }),

  run: async (input, context) => {
    const { team_name, agents, strategy = 'parallel' } = input

    // 1. 创建 Team
    const team = new Team(team_name, strategy)

    // 2. 创建 Agent 实例
    for (const agentConfig of agents) {
      const agent = await createAgent(agentConfig)
      team.addAgent(agent)
    }

    // 3. 注册 Team（用于后续管理）
    context.registerTeam(team)

    // 4. 启动执行
    await team.start()

    return {
      output: `Team "${team_name}" created with ${agents.length} agents`,
      team_id: team.id,
    }
  }
}
```

### Team 级别的并行工作

```typescript
class Team {
  private agents: Agent[] = []
  private results: Map<string, any> = new Map()

  async start(): Promise<void> {
    switch (this.strategy) {
      case 'parallel':
        // 所有 Agent 并行执行
        await Promise.all(this.agents.map(a => a.run()))
        break

      case 'sequential':
        // Agent 依次执行
        for (const agent of this.agents) {
          await agent.run()
        }
        break

      case 'pipeline':
        // 流水线执行（第5章详细讨论）
        await this.runPipeline()
        break
    }
  }

  async runPipeline(): Promise<void> {
    // 每个 Agent 完成后，将结果传给下一个 Agent
    let output: any = null

    for (const agent of this.agents) {
      const input = output
        ? { ...agent.originalInput, previousOutput: output }
        : agent.originalInput

      output = await agent.run(input)
    }
  }
}
```

### 资源隔离

多个 Agent 可能竞争同一资源，需要隔离：

```typescript
// 文件锁
class FileLock {
  private locks = new Map<string, Promise<void>>()

  async acquire(path: string): Promise<() => void> {
    // 等待现有锁释放
    while (this.locks.has(path)) {
      await this.locks.get(path)
    }

    // 创建新锁
    let release: () => void
    const lock = new Promise<void>(resolve => {
      release = resolve
    })
    this.locks.set(path, lock)

    // 返回释放函数
    return () => {
      this.locks.delete(path)
      release()
    }
  }
}

// Agent 使用文件锁
async function agentEditFile(path: string, edits: Edit[]) {
  const release = await fileLock.acquire(path)
  try {
    for (const edit of edits) {
      await applyEdit(path, edit)
    }
  } finally {
    release()
  }
}
```

### 生命周期管理

```typescript
class TeamManager {
  private teams = new Map<string, Team>()

  async createTeam(config: TeamConfig): Promise<Team> {
    const team = new Team(config)
    this.teams.set(team.id, team)
    return team
  }

  async shutdownTeam(teamId: string): Promise<void> {
    const team = this.teams.get(teamId)
    if (!team) return

    // 1. 停止所有 Agent
    await team.stopAll()

    // 2. 收集最终结果
    const results = team.collectResults()

    // 3. 清理资源
    team.cleanup()

    // 4. 移除 Team
    this.teams.delete(teamId)

    // 5. 返回结果
    return results
  }

  async shutdownAll(): Promise<void> {
    for (const teamId of this.teams.keys()) {
      await this.shutdownTeam(teamId)
    }
  }
}
```

## 6.3 协作模式

### 主从模式 (Master-Worker)

一个主 Agent 协调多个工作 Agent：

```typescript
// Master Agent
async function masterWorker(task: string) {
  // 1. Master 分析任务
  const subtasks = await analyzeTask(task)

  // 2. 创建 Workers
  const workers = await Promise.all(
    subtasks.map(subtask =>
      Agent({
        name: `worker-${subtask.id}`,
        prompt: subtask.description,
      })
    )
  )

  // 3. Master 等待所有 Workers 完成
  // 不主动轮询，等待通知
}

// Worker Agent
async function workerTask(description: string) {
  // 执行具体的子任务
  const result = await executeTask(description)
  return result
}
```

**适用场景**：

- 任务可以自然分解为独立的子任务
- 子任务之间没有复杂的依赖关系
- 需要并行处理以提高效率

**示例**：代码审查

```
Master: 审查这个 PR
  ├── Worker 1: 检查代码风格
  ├── Worker 2: 检查安全问题
  ├── Worker 3: 检查性能问题
  └── Worker 4: 检查测试覆盖率

Master: 合并审查结果，生成报告
```

### 流水线模式 (Pipeline)

多个 Agent 形成处理流水线，每个 Agent 处理一步：

```typescript
async function pipeline(task: string) {
  // Stage 1: 需求分析
  const requirements = await Agent({
    name: 'requirements-analyzer',
    prompt: `Analyze requirements: ${task}`,
  })

  // Stage 2: 设计
  const design = await Agent({
    name: 'designer',
    prompt: `Design based on requirements: ${requirements}`,
  })

  // Stage 3: 实现
  const implementation = await Agent({
    name: 'implementer',
    prompt: `Implement based on design: ${design}`,
  })

  // Stage 4: 测试
  const tests = await Agent({
    name: 'tester',
    prompt: `Write tests for implementation: ${implementation}`,
  })

  return { implementation, tests }
}
```

**适用场景**：

- 任务有明确的阶段划分
- 每个阶段的输出是下一个阶段的输入
- 需要逐步处理和转换

**示例**：功能开发

```
需求分析 → 设计 → 实现 → 测试 → 部署
```

### 混合模式 (Hybrid)

结合主从模式和流水线模式：

```typescript
async function hybrid(task: string) {
  // Stage 1: 分析（Master-Worker）
  const subtasks = await Agent({
    name: 'analyzer',
    prompt: `Analyze and decompose: ${task}`,
  })

  // Stage 2: 并行执行（Master-Worker）
  const results = await Promise.all(
    subtasks.map(subtask =>
      Agent({
        name: `executor-${subtask.id}`,
        prompt: `Execute: ${subtask}`,
      })
    )
  )

  // Stage 3: 聚合（Pipeline）
  const aggregated = await Agent({
    name: 'aggregator',
    prompt: `Aggregate results: ${results}`,
  })

  // Stage 4: 验证（Pipeline）
  const validated = await Agent({
    name: 'validator',
    prompt: `Validate aggregated result: ${aggregated}`,
  })

  return validated
}
```

**适用场景**：

- 复杂的任务既有并行部分，又有串行部分
- 需要灵活组合不同的协作模式

### 适用场景分析

| 协作模式 | 适用场景 | 优势 | 劣势 |
|---------|---------|------|------|
| Master-Worker | 独立子任务、并行处理 | 高效、可扩展 | 需要明确的任务分解 |
| Pipeline | 阶段性处理、数据转换 | 清晰的流程、易于调试 | 阶段间可能成为瓶颈 |
| Hybrid | 复杂任务、混合需求 | 灵活、强大 | 设计复杂、成本高 |

## 6.4 性能优化

### 并行执行的调度

```typescript
class ParallelScheduler {
  private maxConcurrency: number
  private running = 0
  private queue: Task[] = []

  constructor(maxConcurrency = 5) {
    this.maxConcurrency = maxConcurrency
  }

  async schedule(task: Task): Promise<void> {
    // 如果达到并发限制，等待
    while (this.running >= this.maxConcurrency) {
      await sleep(100)
    }

    this.running++

    try {
      await task.run()
    } finally {
      this.running--
      // 检查队列，启动下一个任务
      this.processQueue()
    }
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.running < this.maxConcurrency) {
      const next = this.queue.shift()
      this.schedule(next)
    }
  }
}
```

### 资源竞争的处理

```typescript
// 资源池
class ResourcePool<T> {
  private available: T[]
  private inUse = new Set<T>()
  private waitQueue: ((resource: T) => void)[] = []

  constructor(resources: T[]) {
    this.available = resources
  }

  async acquire(): Promise<T> {
    if (this.available.length > 0) {
      const resource = this.available.pop()!
      this.inUse.add(resource)
      return resource
    }

    // 没有可用资源，等待
    return new Promise(resolve => {
      this.waitQueue.push(resolve)
    })
  }

  release(resource: T): void {
    this.inUse.delete(resource)

    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!
      this.inUse.add(resource)
      next(resource)
    } else {
      this.available.push(resource)
    }
  }
}

// 使用示例：限制同时写入的文件数
const fileWritePool = new ResourcePool(
  Array(3).fill(null).map((_, i) => `file-writer-${i}`)
)

async function writeWithPool(path: string, content: string) {
  const writer = await fileWritePool.acquire()
  try {
    await fs.writeFile(path, content)
  } finally {
    fileWritePool.release(writer)
  }
}
```

### 上下文压缩

多个 Agent 的结果可能占用大量上下文，需要压缩：

```typescript
async function compressContext(
  results: TaskResult[]
): Promise<string> {
  // 1. 选择最重要的信息
  const important = results
    .filter(r => r.importance > 0.5)
    .map(r => r.summary)

  // 2. 使用 Claude 压缩
  const compressed = await queryClaude({
    prompt: `
    Compress the following results into a concise summary.
    Keep the key findings and conclusions.

    Results:
    ${important.join('\n\n')}
    `,
    maxTokens: 1000,
  })

  return compressed.output
}
```

### 成本控制

多个 Agent 会增加 API 成本，需要控制：

```typescript
class CostController {
  private budget: number
  private spent = 0

  constructor(budget: number) {
    this.budget = budget
  }

  async executeWithBudget(
    task: () => Promise<any>
  ): Promise<any> {
    // 检查预算
    if (this.spent >= this.budget) {
      throw new Error('Budget exhausted')
    }

    // 执行前估算成本
    const estimatedCost = estimateCost(task)

    if (this.spent + estimatedCost > this.budget) {
      throw new Error('Insufficient budget for this task')
    }

    // 执行任务
    const result = await task()

    // 记录实际成本
    this.spent += result.actualCost

    return result
  }
}
```

## 6.5 实战案例

### 案例 1：大规模代码审查

```typescript
async function largeScaleCodeReview(repoPath: string) {
  // 1. 收集所有需要审查的文件
  const files = await glob('**/*.{ts,tsx,js,jsx}', { cwd: repoPath })

  // 2. 分组，每组 10 个文件
  const groups = chunk(files, 10)

  // 3. 为每组创建审查 Agent
  const reviewAgents = groups.map((group, i) =>
    Agent({
      name: `reviewer-group-${i}`,
      prompt: `
      Review the following files for:
      - Security vulnerabilities
      - Performance issues
      - Code style problems
      - Best practice violations

      Files: ${group.join(', ')}

      Provide a concise report with severity levels.
      `,
    })
  )

  // 4. 并行执行所有审查
  // （等待通知）

  // 5. 合并审查结果
  const finalReport = await Agent({
    name: 'report-aggregator',
    prompt: `
    Merge all review reports into a comprehensive code review report.
    Prioritize by severity: Critical > Major > Minor.
    `,
  })

  return finalReport
}
```

### 案例 2：自动化测试生成

```typescript
async function generateTests(sourcePath: string) {
  // Pipeline 模式

  // Stage 1: 分析代码结构
  const structure = await Agent({
    name: 'structure-analyzer',
    prompt: `Analyze the code structure: ${sourcePath}`,
  })

  // Stage 2: 识别需要测试的函数
  const functions = await Agent({
    name: 'function-identifier',
    prompt: `Identify functions that need tests: ${structure}`,
  })

  // Stage 3: 为每个函数生成测试（Master-Worker）
  const tests = await Promise.all(
    functions.map(func =>
      Agent({
        name: `test-generator-${func.name}`,
        prompt: `Generate tests for: ${func}`,
      })
    )
  )

  // Stage 4: 整合测试文件
  const testFile = await Agent({
    name: 'test-assembler',
    prompt: `Assemble all tests into a single test file: ${tests}`,
  })

  return testFile
}
```

## 总结

多 Agent 协作是 Claude Code 处理复杂任务的利器：

1. **Coordinator 模式**：中心化的任务分解与协调。
2. **Team Agent**：团队级别的并行工作。
3. **协作模式**：Master-Worker、Pipeline、Hybrid 各有适用场景。
4. **性能优化**：并行调度、资源池、上下文压缩、成本控制。
5. **实战应用**：代码审查、测试生成等场景的最佳实践。

通过多 Agent 协作，Claude Code 能够处理超越单个 Agent 能力的复杂任务，实现真正的智能工作流。

---

<div style="text-align: center; margin-top: 2rem;">
  <a href="/chapter-05-agent-system" style="margin-right: 1rem;">← 第5章</a>
  <a href="/chapter-07-memory-philosophy">第7章：Memory 系统的哲学 →</a>
</div>
