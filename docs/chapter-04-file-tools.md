# 第4章：文件操作工具的设计考量

> "Files are the fundamental abstraction of persistent storage." — Dennis Ritchie

文件操作是开发工具最基础也是最重要的功能。Claude Code 的文件工具设计经过深思熟虑，在易用性、安全性和性能之间找到了精妙的平衡。本章将深入探讨文件操作工具的设计细节与优化策略。

## 4.1 文件读取的挑战

### 大文件的分块读取

大型文件无法一次性读取到上下文中，需要分块处理：

```typescript
// src/tools/FileReadTool/FileReadTool.ts
const DEFAULT_LIMIT = 2000  // 默认读取 2000 行

export const FileReadTool: Tool = {
  name: 'Read',
  run: async (input) => {
    const { file_path, limit = DEFAULT_LIMIT, offset = 0 } = input

    // 1. 获取文件总行数
    const totalLines = await countLines(file_path)

    // 2. 计算读取范围
    const startLine = offset
    const endLine = Math.min(offset + limit, totalLines)

    // 3. 读取指定范围
    const content = await readLines(file_path, startLine, endLine)

    // 4. 添加截断提示
    if (endLine < totalLines) {
      content += `\n\n... (${totalLines - endLine} more lines)`
    }

    return { output: content }
  }
}
```

**为什么默认限制 2000 行**：

```typescript
// 上下文窗口计算
const avgLineLength = 80  // 平均每行 80 字符
const limit = 2000
const estimatedTokens = (limit * avgLineLength) / 4  // ~40K tokens

// 2000 行约占 40K tokens
// 在 200K 的上下文窗口中，留有足够空间给其他内容
```

### 二进制文件的处理

二进制文件无法作为文本读取，需要特殊处理：

```typescript
// 支持的文件类型
enum FileType {
  Text,
  Image,
  PDF,
  Notebook,   // Jupyter Notebook
  Binary,     // 未知二进制
}

async function detectFileType(path: string): Promise<FileType> {
  const ext = extname(path).toLowerCase()

  // 图片类型
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
    return FileType.Image
  }

  // PDF
  if (ext === '.pdf') {
    return FileType.PDF
  }

  // Jupyter Notebook
  if (ext === '.ipynb') {
    return FileType.Notebook
  }

  // 检测是否为文本
  const buffer = await readFileFirstNBytes(path, 8000)
  if (isBinary(buffer)) {
    return FileType.Binary
  }

  return FileType.Text
}

// 二进制检测算法
function isBinary(buffer: Buffer): boolean {
  // 检查 null bytes（二进制文件的特征）
  for (let i = 0; i < Math.min(buffer.length, 8000); i++) {
    if (buffer[i] === 0) {
      return true
    }
  }
  return false
}
```

### 图片和 PDF 的特殊处理

**图片文件**：返回 base64 编码，Claude 可以"看到"：

```typescript
async function readImageFile(path: string): Promise<ToolResult> {
  const buffer = await fs.readFile(path)
  const base64 = buffer.toString('base64')
  const mimeType = getMimeType(path)

  // 返回 data URI
  return {
    output: `[Image: ${path}]\ndata:${mimeType};base64,${base64}`
  }
}

function getMimeType(path: string): string {
  const ext = extname(path).toLowerCase()
  const mimeTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
  }
  return mimeTypes[ext] || 'application/octet-stream'
}
```

**PDF 文件**：提取文本内容：

```typescript
async function readPdfFile(
  path: string,
  pages?: string  // "1-5" 或 "3,5,7"
): Promise<ToolResult> {
  const buffer = await fs.readFile(path)

  // 使用 pdf-parse 库
  const data = await pdf(buffer, { max: 20 })  // 最多 20 页

  let content = `PDF: ${path}\n`
  content += `Total pages: ${data.numpages}\n\n`

  // 处理页面选择
  if (pages) {
    const pageRange = parsePageRange(pages)
    // 提取指定页面的内容
    content += extractPages(data.text, pageRange)
  } else {
    content += data.text
  }

  return { output: content }
}
```

### 文件缓存策略

重复读取同一文件是常见场景，缓存可以显著提升性能：

```typescript
// src/utils/fileStateCache.ts
export class FileStateCache {
  private cache = new Map<string, {
    content: string
    mtime: number      // 修改时间
    hash: string       // 内容哈希
  }>()

  async read(path: string): Promise<string> {
    // 1. 获取文件状态
    const stat = await fs.stat(path)
    const mtime = stat.mtimeMs

    // 2. 检查缓存
    const cached = this.cache.get(path)
    if (cached && cached.mtime === mtime) {
      // 缓存命中，直接返回
      return cached.content
    }

    // 3. 缓存未命中，读取文件
    const content = await fs.readFile(path, 'utf-8')
    const hash = computeHash(content)

    // 4. 更新缓存
    this.cache.set(path, { content, mtime, hash })

    return content
  }

  // 克隆缓存（用于 Agent）
  clone(): FileStateCache {
    const newCache = new FileStateCache()
    newCache.cache = new Map(this.cache)
    return newCache
  }
}
```

**缓存失效**：

```typescript
// 文件修改后，主动失效缓存
export const FileWriteTool: Tool = {
  name: 'Write',
  run: async (input, context) => {
    await fs.writeFile(input.file_path, input.content)

    // 失效缓存
    context.fileCache.invalidate(input.file_path)

    return { output: `File written: ${input.file_path}` }
  }
}
```

## 4.2 文件编辑的艺术

### 为什么选择字符串替换而非行号

Claude Code 使用字符串替换（Edit tool）而非行号编辑，这个设计决策基于深刻的考量：

**行号编辑的问题**：

```typescript
// ❌ 行号编辑的问题
// 原始文件：
// 1: function foo() {
// 2:   return 1
// 3: }

// 用户请求：在第 2 行后添加日志
// AI 执行：在第 3 行插入 console.log

// 但如果文件在读取后被修改：
// 1: function foo() {
// 2:   console.log('new line')  // 新增的行！
// 3:   return 1
// 4: }

// AI 的编辑会错位！
```

**字符串替换的优势**：

```typescript
// ✅ 字符串替换的优势
// 原始文件：
function foo() {
  return 1
}

// 用户请求：修改返回值
// AI 执行：替换 "return 1" 为 "return 2"

// 即使文件被修改：
function foo() {
  console.log('new line')  // 新增的行
  return 1                 // 仍然能正确找到并替换
}
```

### 编辑冲突的处理

当 `old_string` 不唯一时，需要处理冲突：

```typescript
export const FileEditTool: Tool = {
  name: 'Edit',
  run: async (input) => {
    const { file_path, old_string, new_string, replace_all } = input

    const content = await fs.readFile(file_path, 'utf-8')

    // 统计匹配次数
    const matches = content.split(old_string)
    const matchCount = matches.length - 1

    if (matchCount === 0) {
      return { error: `String not found: "${old_string}"` }
    }

    if (matchCount > 1 && !replace_all) {
      // 多次匹配但未指定 replace_all
      return {
        error: `Found ${matchCount} matches. ` +
               `Provide a more specific string or set replace_all: true.`
      }
    }

    // 执行替换
    const newContent = replace_all
      ? content.split(old_string).join(new_string)
      : content.replace(old_string, new_string)

    await fs.writeFile(file_path, newContent)

    return {
      output: `Edited ${file_path} (${matchCount} replacement${matchCount > 1 ? 's' : ''})`
    }
  }
}
```

**提供更多上下文**：

```typescript
// ❌ 不够具体：多处匹配
old_string: "return 1"

// ✅ 更具体：唯一匹配
old_string: `function foo() {
  return 1
}`
```

### 原子性写入

文件写入必须是原子性的，避免写入过程中断导致文件损坏：

```typescript
async function atomicWrite(path: string, content: string): Promise<void> {
  // 1. 写入临时文件
  const tempPath = `${path}.tmp.${Date.now()}`
  await fs.writeFile(tempPath, content)

  // 2. 原子性重命名
  await fs.rename(tempPath, path)
}
```

**为什么原子性重要**：

```typescript
// ❌ 非原子性写入的风险
async function unsafeWrite(path: string, content: string) {
  await fs.writeFile(path, content)
  // 如果在写入过程中崩溃，文件会损坏
}

// ✅ 原子性写入
async function safeWrite(path: string, content: string) {
  const tempPath = `${path}.tmp`
  await fs.writeFile(tempPath, content)
  await fs.rename(tempPath, path)
  // rename 是原子操作，要么成功要么失败，不会损坏原文件
}
```

### 文件历史记录

为了防止误操作，Claude Code 保留了文件修改历史：

```typescript
// src/utils/fileHistory.ts
export class FileHistory {
  private history = new Map<string, FileSnapshot[]>()

  async saveSnapshot(path: string): Promise<void> {
    const content = await fs.readFile(path, 'utf-8')
    const stat = await fs.stat(path)

    const snapshot: FileSnapshot = {
      content,
      mtime: stat.mtimeMs,
      timestamp: Date.now(),
    }

    if (!this.history.has(path)) {
      this.history.set(path, [])
    }

    this.history.get(path)!.push(snapshot)

    // 限制历史记录数量
    if (this.history.get(path)!.length > 10) {
      this.history.get(path)!.shift()
    }
  }

  async restore(path: string, index: number): Promise<void> {
    const snapshots = this.history.get(path)
    if (!snapshots || !snapshots[index]) {
      throw new Error('Snapshot not found')
    }

    await fs.writeFile(path, snapshots[index].content)
  }
}
```

## 4.3 搜索工具的优化

### Glob 模式匹配的实现

GlobTool 使用 fast-glob 库实现高效的模式匹配：

```typescript
import glob from 'fast-glob'

export const GlobTool: Tool = {
  name: 'Glob',
  run: async (input) => {
    const { pattern, path } = input

    const files = await glob(pattern, {
      cwd: path || process.cwd(),
      absolute: true,
      onlyFiles: true,
      ignore: [
        '**/node_modules/**',
        '**/.git/**',
        '**/dist/**',
        '**/build/**',
      ],
      suppressErrors: true,
    })

    // 按修改时间排序（最近修改的在前）
    const sorted = await sortByModTime(files)

    // 限制结果数量
    const limited = sorted.slice(0, 250)

    return {
      output: limited.join('\n'),
      ...(sorted.length > 250 && {
        error: `Found ${sorted.length} files, showing first 250`
      })
    }
  }
}

async function sortByModTime(files: string[]): Promise<string[]> {
  const filesWithTime = await Promise.all(
    files.map(async (file) => {
      const stat = await fs.stat(file)
      return { file, mtime: stat.mtimeMs }
    })
  )

  filesWithTime.sort((a, b) => b.mtime - a.mtime)

  return filesWithTime.map(f => f.file)
}
```

### ripgrep 的集成与优化

GrepTool 使用 ripgrep（rg）实现高速内容搜索：

```typescript
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export const GrepTool: Tool = {
  name: 'Grep',
  run: async (input) => {
    const { pattern, path, output_mode, type, glob } = input

    // 构建 ripgrep 命令
    const args = [
      'rg',
      '--line-number',
      '--color=never',
      '--with-filename',

      // 输出模式
      output_mode === 'files_with_matches'
        ? '--files-with-matches'
        : output_mode === 'count'
        ? '--count'
        : '',

      // 文件类型
      type ? `--type=${type}` : '',

      // Glob 过滤
      glob ? `--glob=${glob}` : '',

      // 搜索模式
      pattern,

      // 搜索路径
      path || '.',
    ].filter(Boolean)

    try {
      const { stdout, stderr } = await execAsync(args.join(' '), {
        maxBuffer: 10 * 1024 * 1024,  // 10MB buffer
      })

      // 限制输出行数
      const lines = stdout.split('\n')
      if (lines.length > 250) {
        return {
          output: lines.slice(0, 250).join('\n'),
          error: `Found ${lines.length} matches, showing first 250`
        }
      }

      return { output: stdout }
    } catch (error) {
      if (error.code === 1) {
        // ripgrep exit code 1 = no matches
        return { output: 'No matches found' }
      }
      throw error
    }
  }
}
```

**ripgrep 的优势**：

1. **速度快**：Rust 实现，比传统 grep 快 10-100 倍。
2. **智能过滤**：自动忽略 .git、node_modules 等。
3. **Unicode 支持**：正确处理 UTF-8 文件。
4. **多行匹配**：支持跨行搜索。

### 搜索结果的排序与过滤

```typescript
// 相关性排序
function rankSearchResults(
  results: SearchResult[],
  query: string
): SearchResult[] {
  return results
    .map(result => ({
      ...result,
      score: computeRelevanceScore(result, query)
    }))
    .sort((a, b) => b.score - a.score)
}

function computeRelevanceScore(
  result: SearchResult,
  query: string
): number {
  let score = 0

  // 1. 文件名匹配
  if (result.filename.includes(query)) {
    score += 10
  }

  // 2. 最近修改
  const daysSinceMod = (Date.now() - result.mtime) / (1000 * 60 * 60 * 24)
  score += Math.max(0, 10 - daysSinceMod)

  // 3. 匹配数量
  score += Math.min(result.matchCount, 5)

  return score
}
```

### 大型代码库的性能优化

对于超大型代码库（数万文件），需要特殊优化：

```typescript
// 1. 使用文件索引
class FileIndex {
  private index = new Map<string, FileMetadata>()

  async buildIndex(rootPath: string): Promise<void> {
    const files = await glob('**/*', { cwd: rootPath })

    for (const file of files) {
      const stat = await fs.stat(file)
      this.index.set(file, {
        mtime: stat.mtimeMs,
        size: stat.size,
      })
    }
  }

  query(filter: FileFilter): string[] {
    return Array.from(this.index.entries())
      .filter(([_, meta]) => filter(meta))
      .map(([path, _]) => path)
  }
}

// 2. 并行搜索
async function parallelSearch(
  pattern: string,
  paths: string[]
): Promise<SearchResult[]> {
  const BATCH_SIZE = 10
  const results: SearchResult[] = []

  for (let i = 0; i < paths.length; i += BATCH_SIZE) {
    const batch = paths.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(path => searchInPath(pattern, path))
    )
    results.push(...batchResults.flat())
  }

  return results
}
```

## 4.4 安全性考量

### 路径遍历攻击防护

用户可能尝试使用 `../` 访问不允许的目录：

```typescript
function isPathAllowed(
  path: string,
  allowedRoots: string[]
): boolean {
  // 1. 规范化路径（解析 .. 和符号链接）
  const normalized = realpathSync(path)

  // 2. 检查是否在允许的根目录下
  return allowedRoots.some(root => {
    const normalizedRoot = realpathSync(root)
    return normalized.startsWith(normalizedRoot)
  })
}

// 使用示例
const allowedRoots = [
  process.cwd(),           // 当前工作目录
  getMemoryDir(),          // Memory 目录
  getScratchpadDir(),      // 临时目录
]

if (!isPathAllowed(path, allowedRoots)) {
  return { error: 'Path not allowed' }
}
```

### 符号链接处理

符号链接可能导致意外访问：

```typescript
async function resolveSymlink(path: string): Promise<string> {
  let current = path
  const visited = new Set<string>()

  while (true) {
    // 检测循环链接
    if (visited.has(current)) {
      throw new Error('Circular symlink detected')
    }
    visited.add(current)

    // 检查是否是符号链接
    const stat = await fs.lstat(current)
    if (!stat.isSymbolicLink()) {
      return current
    }

    // 解析链接
    const target = await fs.readlink(current)
    current = resolve(dirname(current), target)
  }
}
```

### 文件权限检查

```typescript
async function checkFilePermission(
  path: string,
  operation: 'read' | 'write'
): Promise<boolean> {
  try {
    await fs.access(path, operation === 'read' ? fs.constants.R_OK : fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}
```

### 敏感文件过滤

```typescript
const SENSITIVE_FILES = [
  '.env',
  '.env.local',
  '.env.production',
  'credentials.json',
  'secrets.yaml',
  'id_rsa',
  'id_ed25519',
]

function isSensitiveFile(path: string): boolean {
  const basename = path.split('/').pop()
  return SENSITIVE_FILES.includes(basename)
}

// 读取敏感文件时警告
if (isSensitiveFile(path)) {
  return {
    output: content,
    error: 'Warning: This file may contain sensitive information'
  }
}
```

## 4.5 最佳实践总结

### 文件读取

```typescript
// ✅ 最佳实践
async function readFileBestPractices(path: string) {
  // 1. 检查文件存在
  if (!await exists(path)) {
    throw new Error('File not found')
  }

  // 2. 使用缓存
  const content = await cache.read(path)

  // 3. 限制大小
  if (content.length > MAX_SIZE) {
    return content.substring(0, MAX_SIZE) + '\n... (truncated)'
  }

  return content
}
```

### 文件写入

```typescript
// ✅ 最佳实践
async function writeFileBestPractices(
  path: string,
  content: string
) {
  // 1. 检查路径权限
  if (!isPathAllowed(path)) {
    throw new Error('Path not allowed')
  }

  // 2. 如果文件存在，必须先读取
  if (await exists(path)) {
    await readFileBestPractices(path)
  }

  // 3. 创建备份
  await createBackup(path)

  // 4. 原子性写入
  await atomicWrite(path, content)

  // 5. 失效缓存
  cache.invalidate(path)
}
```

### 文件搜索

```typescript
// ✅ 最佳实践
async function searchBestPractices(pattern: string) {
  // 1. 使用高效的工具（ripgrep, fast-glob）
  // 2. 限制结果数量
  // 3. 按相关性排序
  // 4. 提供清晰的输出
}
```

## 总结

文件操作工具的设计体现了以下原则：

1. **安全性优先**：路径验证、权限检查、敏感文件保护。
2. **用户友好**：清晰的错误消息、智能的默认值。
3. **性能优化**：缓存、并行处理、高效算法。
4. **原子性**：避免中间状态，保证数据完整性。
5. **可恢复**：历史记录、备份机制。

文件操作看似简单，实则充满细节。Claude Code 通过精心的设计，在易用性与安全性之间找到了最佳平衡点。

---

<div style="text-align: center; margin-top: 2rem;">
  <a href="/chapter-03-tool-system" style="margin-right: 1rem;">← 第3章</a>
  <a href="/chapter-05-agent-system">第5章：Agent 系统的设计 →</a>
</div>
