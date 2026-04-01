# 第12章：插件与扩展系统

> "Plugins are the secret sauce that turns a good application into a great platform." — John Gruber

插件系统让 Claude Code 具备了无限扩展能力。用户和第三方开发者可以为 Claude Code 添加新功能、新工具、新命令，构建丰富的生态系统。

## 12.1 插件架构

### 插件的定义

```typescript
// src/plugins/types.ts
export interface Plugin {
  // 插件元信息
  name: string
  version: string
  description: string
  author: string

  // 入口点
  main: string

  // 依赖
  dependencies?: Record<string, string>

  // 提供的能力
  provides?: {
    tools?: Tool[]
    commands?: Command[]
    agents?: AgentDefinition[]
    MCPservers?: MCPServerConfig[]
  }

  // 生命周期钩子
  hooks?: {
    onLoad?: () => Promise<void>
    onUnload?: () => Promise<void>
  }

  // 权限需求
  permissions?: PluginPermission[]
}

export interface PluginPermission {
  name: string
  reason: string
  risky: boolean  // 是否有风险
}
```

### 插件的目录结构

```typescript
// 插件的标准目录结构
const PLUGIN_STRUCTURE = {
  'my-plugin/': {
    'package.json': '插件元信息',
    'dist/': {
      'index.js': '编译后的入口文件',
    },
    'src/': {
      'index.ts': '源代码入口',
      'tools/': '自定义工具',
      'commands/': '自定义命令',
    },
    'README.md': '插件文档',
    'LICENSE': '许可证',
  }
}
```

### 插件加载机制

```typescript
// src/utils/plugins/pluginLoader.ts
export class PluginLoader {
  private loadedPlugins = new Map<string, LoadedPlugin>()
  private pluginDirs: string[]

  constructor() {
    // 插件目录优先级
    this.pluginDirs = [
      // 1. 内置插件
      join(__dirname, '..', 'plugins', 'built-in'),

      // 2. 用户级别插件
      join(getConfigHome(), 'plugins'),

      // 3. 项目级别插件
      join(getCwd(), '.claude', 'plugins'),
    ]
  }

  async discoverPlugins(): Promise<Plugin[]> {
    const plugins: Plugin[] = []

    for (const dir of this.pluginDirs) {
      if (!await exists(dir)) continue

      const entries = await fs.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const pluginPath = join(dir, entry.name)
        const plugin = await this.loadPluginManifest(pluginPath)

        if (plugin) {
          plugins.push(plugin)
        }
      }
    }

    return plugins
  }

  async loadPlugin(plugin: Plugin): Promise<void> {
    // 1. 检查依赖
    await this.checkDependencies(plugin)

    // 2. 检查权限
    const granted = await this.checkPermissions(plugin)
    if (!granted) {
      throw new Error(`Permission denied for plugin: ${plugin.name}`)
    }

    // 3. 加载插件代码
    const pluginPath = this.resolvePluginPath(plugin)
    const module = await import(pluginPath)

    // 4. 初始化插件
    const instance = await module.default(plugin)

    // 5. 注册插件提供的功能
    if (plugin.provides?.tools) {
      for (const tool of plugin.provides.tools) {
        registerTool(tool)
      }
    }

    if (plugin.provides?.commands) {
      for (const command of plugin.provides.commands) {
        registerCommand(command)
      }
    }

    // 6. 调用加载钩子
    if (plugin.hooks?.onLoad) {
      await plugin.hooks.onLoad()
    }

    this.loadedPlugins.set(plugin.name, { plugin, instance })
  }
}
```

### 插件生命周期

```typescript
// 插件的生命周期
enum PluginState {
  DISCOVERED,    // 已发现
  LOADING,       // 加载中
  LOADED,        // 已加载
  ACTIVE,        // 激活
  INACTIVE,      // 未激活
  ERROR,         // 错误
}

class PluginLifecycle {
  private states = new Map<string, PluginState>()

  async activate(pluginName: string): Promise<void> {
    const state = this.states.get(pluginName)
    if (state !== PluginState.LOADED) {
      throw new Error(`Cannot activate plugin in state: ${state}`)
    }

    const loaded = this.loadedPlugins.get(pluginName)

    // 激活插件
    if (loaded.instance.activate) {
      await loaded.instance.activate()
    }

    this.states.set(pluginName, PluginState.ACTIVE)
  }

  async deactivate(pluginName: string): Promise<void> {
    const state = this.states.get(pluginName)
    if (state !== PluginState.ACTIVE) {
      throw new Error(`Cannot deactivate plugin in state: ${state}`)
    }

    const loaded = this.loadedPlugins.get(pluginName)

    // 停用插件
    if (loaded.instance.deactivate) {
      await loaded.instance.deactivate()
    }

    this.states.set(pluginName, PluginState.INACTIVE)
  }

  async unload(pluginName: string): Promise<void> {
    const loaded = this.loadedPlugins.get(pluginName)
    if (!loaded) return

    // 1. 停用
    const state = this.states.get(pluginName)
    if (state === PluginState.ACTIVE) {
      await this.deactivate(pluginName)
    }

    // 2. 调用卸载钩子
    if (loaded.plugin.hooks?.onUnload) {
      await loaded.plugin.hooks.onUnload()
    }

    // 3. 注销功能
    if (loaded.plugin.provides?.tools) {
      for (const tool of loaded.plugin.provides.tools) {
        unregisterTool(tool.name)
      }
    }

    // 4. 清理
    this.loadedPlugins.delete(pluginName)
    this.states.delete(pluginName)
  }
}
```

## 12.2 自定义工具开发

### Tool 接口实现

```typescript
// 示例：创建一个天气查询工具
import { Tool, z } from 'claude-code-plugin-api'

const WeatherToolInputSchema = z.object({
  city: z.string().describe('City name'),
  unit: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
})

export const WeatherTool: Tool<typeof WeatherToolInputSchema> = {
  name: 'weather',
  description: 'Get current weather for a city',

  inputSchema: WeatherToolInputSchema,

  permissionMode: 'default',

  progressMessage: 'Fetching weather data...',

  run: async (input, context) => {
    const { city, unit } = input

    try {
      // 调用天气 API
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.OPENWEATHER_API_KEY}`
      )

      if (!response.ok) {
        return { error: `Failed to fetch weather: ${response.statusText}` }
      }

      const data = await response.json()

      // 格式化输出
      const temp = unit === 'fahrenheit'
        ? (data.main.temp - 273.15) * 9/5 + 32
        : data.main.temp - 273.15

      return {
        output: `Weather in ${city}:\n` +
                `Temperature: ${temp.toFixed(1)}°${unit === 'fahrenheit' ? 'F' : 'C'}\n` +
                `Condition: ${data.weather[0].description}\n` +
                `Humidity: ${data.main.humidity}%`
      }
    } catch (error) {
      return { error: `Failed to get weather: ${error.message}` }
    }
  }
}
```

### Schema 定义

```typescript
// 使用 Zod 定义复杂的 schema
const ComplexToolInputSchema = z.object({
  // 字符串字段
  name: z.string()
    .min(1, 'Name cannot be empty')
    .max(100, 'Name too long')
    .describe('User name'),

  // 枚举字段
  role: z.enum(['admin', 'user', 'guest'])
    .describe('User role'),

  // 可选字段
  email: z.string()
    .email('Invalid email format')
    .optional()
    .describe('User email (optional)'),

  // 数组字段
  tags: z.array(z.string())
    .min(1, 'At least one tag required')
    .max(10, 'Too many tags')
    .describe('User tags'),

  // 嵌套对象
  preferences: z.object({
    theme: z.enum(['light', 'dark']).optional(),
    language: z.string().optional(),
  }).optional().describe('User preferences'),

  // 条件验证
  age: z.number()
    .int('Age must be an integer')
    .min(0, 'Age cannot be negative')
    .max(150, 'Invalid age')
    .optional(),
})
```

### 权限配置

```typescript
// 工具权限配置
const toolWithPermissions: Tool = {
  name: 'database',
  description: 'Execute database queries',

  inputSchema: z.object({
    query: z.string(),
  }),

  // 权限模式
  permissionMode: 'default',  // 需要 permission 检查

  // 自定义权限检查
  checkPermission: async (input, context) => {
    // 检查查询类型
    const query = input.query.toLowerCase()

    if (query.includes('drop') || query.includes('delete')) {
      // 危险操作，需要明确批准
      return {
        allowed: false,
        reason: 'Destructive operation detected',
        suggestion: 'This query will modify or delete data. Are you sure?',
      }
    }

    return { allowed: true }
  },

  run: async (input, context) => {
    // 执行查询
  }
}
```

### 测试与调试

```typescript
// 工具测试
import { testTool } from 'claude-code-plugin-api/testing'

describe('WeatherTool', () => {
  it('should return weather for valid city', async () => {
    const result = await testTool(WeatherTool, {
      city: 'San Francisco',
      unit: 'celsius',
    })

    expect(result.output).toContain('Weather in San Francisco')
    expect(result.output).toContain('°C')
    expect(result.error).toBeUndefined()
  })

  it('should handle invalid city', async () => {
    const result = await testTool(WeatherTool, {
      city: 'NonExistentCity12345',
    })

    expect(result.error).toBeDefined()
    expect(result.output).toBeUndefined()
  })
})
```

## 12.3 自定义命令开发

### Command 接口

```typescript
// src/commands/types.ts
export interface Command {
  // 命令名称（不带 / 前缀）
  name: string

  // 简短描述
  description: string

  // 使用说明
  usage?: string

  // 参数 schema
  inputSchema?: z.ZodType<any>

  // 别名
  aliases?: string[]

  // 是否需要权限
  requiresPermission?: boolean

  // 执行函数
  run: (args: string[], context: CommandContext) => Promise<void>
}
```

### 命令实现示例

```typescript
// 示例：创建一个 /translate 命令
import { Command, z } from 'claude-code-plugin-api'

export const TranslateCommand: Command = {
  name: 'translate',
  description: 'Translate text to another language',
  usage: '/translate <from> <to> <text>',
  aliases: ['tr'],

  inputSchema: z.object({
    from: z.string().describe('Source language code (e.g., en, zh, es)'),
    to: z.string().describe('Target language code'),
    text: z.string().describe('Text to translate'),
  }),

  run: async (args, context) => {
    // 解析参数
    if (args.length < 3) {
      console.log('Usage: /translate <from> <to> <text>')
      return
    }

    const [from, to, ...textParts] = args
    const text = textParts.join(' ')

    // 调用翻译 API
    const translated = await translateText(text, from, to)

    // 显示结果
    console.log(`Translation (${from} -> ${to}):`)
    console.log(translated)
  }
}

async function translateText(
  text: string,
  from: string,
  to: string
): Promise<string> {
  // 实现翻译逻辑
  // 可以调用 Google Translate API、DeepL API 等
  // ...
}
```

### 交互式命令

```typescript
// 交互式命令示例
export const InteractiveCommand: Command = {
  name: 'ask',
  description: 'Ask a question interactively',

  run: async (args, context) => {
    // 1. 显示提示
    const question = args.join(' ') || 'What would you like to know?'

    console.log(`Question: ${question}`)

    // 2. 等待用户输入
    const answer = await context.prompt('Your answer:')

    // 3. 处理回答
    console.log(`You answered: ${answer}`)

    // 4. 可选：继续对话
    const more = await context.confirm('Want to continue?', false)

    if (more) {
      await this.run([], context)
    }
  }
}
```

### 命令注册

```typescript
// 注册命令到 Claude Code
export function registerCommand(command: Command): void {
  // 1. 验证命令名称
  if (!/^[a-z-]+$/.test(command.name)) {
    throw new Error(`Invalid command name: ${command.name}`)
  }

  // 2. 检查重复
  if (commandRegistry.has(command.name)) {
    throw new Error(`Command already registered: ${command.name}`)
  }

  // 3. 注册
  commandRegistry.set(command.name, command)

  // 4. 注册别名
  if (command.aliases) {
    for (const alias of command.aliases) {
      commandRegistry.set(alias, command)
    }
  }
}
```

## 12.4 最佳实践

### 命名约定

```typescript
// ✅ 好的命名
- toolName: 'weather'           // 小写，单一词汇
- toolName: 'github-issue'      // 连字符分隔
- toolName: 'slack-message'     // 清晰表达功能

// ❌ 不好的命名
- toolName: 'WeatherTool'       // 驼峰式
- toolName: 'weather_tool'      // 下划线
- toolName: 'getWeather'        // 动词前缀
- toolName: 'wthr'              // 缩写

// 命名空间
- toolName: 'github:issue'     // 使用命名空间避免冲突
- toolName: 'slack:message'
```

### 文档编写

```typescript
// 插件文档模板
export const MyPlugin: Plugin = {
  name: 'my-awesome-plugin',
  version: '1.0.0',
  description: 'An awesome plugin that does amazing things',

  // README.md 应该包含：
  // 1. 简介：插件做什么
  // 2. 安装：如何安装
  // 3. 使用：如何使用每个功能
  // 4. 配置：配置选项
  // 5. 示例：具体的使用案例
  // 6. 故障排查：常见问题
  // 7. 贡献：如何贡献代码
  // 8. 许可证：许可证信息
}
```

### 版本兼容

```typescript
// 版本兼容性声明
export const MyPlugin: Plugin = {
  name: 'my-plugin',
  version: '1.2.0',

  // Claude Code 版本要求
  engines: {
    'claude-code': '>=1.0.0 <2.0.0',
  },

  // 依赖
  dependencies: {
    'some-library': '^2.0.0',
  },

  // 向后兼容
  compatibility: {
    'claude-code': {
      '1.0.0': 'Uses legacy API',
      '1.5.0': 'Uses new API',
    },
  },
}

// 根据版本选择 API
function getAPI() {
  const version = getClaudeCodeVersion()

  if (semver.gte(version, '1.5.0')) {
    return new NewAPI()
  } else {
    return new LegacyAPI()
  }
}
```

### 错误处理

```typescript
// 健壮的错误处理
export const MyTool: Tool = {
  name: 'my-tool',

  run: async (input, context) => {
    try {
      // 验证输入
      validateInput(input)

      // 执行操作
      const result = await performOperation(input)

      return { output: result }
    } catch (error) {
      // 分类错误
      if (error instanceof ValidationError) {
        return { error: `Invalid input: ${error.message}` }
      }

      if (error instanceof NetworkError) {
        return { error: `Network error: ${error.message}. Please try again.` }
      }

      if (error instanceof PermissionError) {
        return { error: `Permission denied: ${error.message}` }
      }

      // 未知错误
      console.error('Unexpected error:', error)
      return { error: 'An unexpected error occurred. Please check the logs.' }
    }
  }
}
```

### 发布流程

```bash
# 1. 准备发布
npm version patch  # 或 minor, major

# 2. 运行测试
npm test

# 3. 构建文档
npm run docs:build

# 4. 发布到 npm
npm publish

# 5. 创建 Git tag
git tag -a v1.0.0 -m "Release version 1.0.0"
git push --tags

# 6. 创建 GitHub Release
gh release create v1.0.0 --generate-notes

# 7. 更新插件市场
# （如果有的话）
```

## 12.5 插件市场

### 插件发现

```typescript
// 搜索和发现插件
class PluginMarket {
  async search(query: string): Promise<PluginListing[]> {
    // 从插件市场搜索
    const response = await fetch(
      `https://marketplace.claude.ai/plugins?q=${encodeURIComponent(query)}`
    )

    return response.json()
  }

  async install(pluginName: string): Promise<void> {
    // 1. 下载插件
    const plugin = await this.download(pluginName)

    // 2. 安装到用户目录
    const pluginDir = join(getConfigHome(), 'plugins', pluginName)
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.writeFile(join(pluginDir, 'package.json'), JSON.stringify(plugin))

    // 3. 安装依赖
    await exec('npm install', { cwd: pluginDir })

    // 4. 加载插件
    await pluginLoader.loadPlugin(plugin)
  }

  async update(pluginName: string): Promise<void> {
    // 更新插件到最新版本
    const latest = await this.getLatestVersion(pluginName)
    const installed = await this.getInstalledVersion(pluginName)

    if (semver.gt(latest, installed)) {
      console.log(`Updating ${pluginName} from ${installed} to ${latest}`)
      await this.install(pluginName)
    } else {
      console.log(`${pluginName} is already up to date`)
    }
  }
}
```

### 插件评分

```typescript
// 插件评分系统
interface PluginRating {
  average: number     // 平均分（0-5）
  count: number       // 评分人数
  distribution: {     // 分数分布
    5: number
    4: number
    3: number
    2: number
    1: number
  }
}

async function ratePlugin(
  pluginName: string,
  rating: number,
  review?: string
): Promise<void> {
  await fetch(`https://marketplace.claude.ai/plugins/${pluginName}/rate`, {
    method: 'POST',
    body: JSON.stringify({ rating, review }),
  })
}
```

## 总结

插件系统让 Claude Code 成为真正的开放平台：

1. **标准化架构**：清晰的插件定义和生命周期。
2. **丰富的能力**：工具、命令、Agent、MCP Server 全面支持。
3. **开发友好**：完善的 API、测试工具、文档模板。
4. **安全可靠**：权限检查、依赖管理、版本兼容。
5. **生态繁荣**：插件市场、评分系统、社区驱动。

通过插件系统，Claude Code 的能力不再局限于核心团队的开发，而是可以向整个社区开放，让每个人都能贡献和分享。

---

<div style="text-align: center; margin-top: 2rem;">
  <a href="/chapter-11-mcp-integration" style="margin-right: 1rem;">← 第11章</a>
  <a href="/chapter-13-permission-system">第13章：权限系统设计 →</a>
</div>
