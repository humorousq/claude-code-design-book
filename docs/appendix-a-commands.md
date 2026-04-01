# 附录A：命令参考

本附录列出 Claude Code 的所有斜杠命令及其用法。

## 基础命令

### `/help`

显示帮助信息。

```bash
/help
```

### `/version`

显示 Claude Code 版本信息。

```bash
/version
```

### `/login` / `/logout`

管理用户认证。

```bash
/login      # 登录到 Claude
/logout     # 登出当前账户
```

## 文件操作

### `/read`

读取文件内容。

```bash
/read <file-path>
/read <file-path> --limit 100
/read <file-path> --offset 50
```

**参数**：
- `--limit <n>`: 限制读取行数（默认 2000）
- `--offset <n>`: 跳过前 N 行

### `/write`

创建或覆盖文件。

```bash
/write <file-path>
```

**注意**：如果文件已存在，必须先读取过才能写入。

### `/edit`

编辑文件（字符串替换）。

```bash
/edit <file-path> <old-string> <new-string>
/edit <file-path> <old-string> <new-string> --replace-all
```

**参数**：
- `--replace-all`: 替换所有匹配项

## Git 相关

### `/commit`

创建 Git 提交。

```bash
/commit
/commit "commit message"
/commit --no-verify
```

**参数**：
- `--no-verify`: 跳过 pre-commit 钩子

### `/review`

执行代码审查。

```bash
/review
/review --scope <files>
/review --type security
```

**参数**：
- `--scope <files>`: 指定审查范围
- `--type <type>`: 审查类型（security, performance, style）

### `/pr`

创建或管理 Pull Request。

```bash
/pr create
/pr view <number>
/pr list
```

### `/diff`

查看代码变更。

```bash
/diff
/diff --staged
/diff HEAD~1
```

## 开发工具

### `/test`

运行测试。

```bash
/test
/test --watch
/test --coverage
/test <test-file>
```

**参数**：
- `--watch`: 监听模式
- `--coverage`: 生成覆盖率报告

### `/lint`

运行代码检查。

```bash
/lint
/lint --fix
/lint <files>
```

### `/format`

格式化代码。

```bash
/format
/format <files>
/format --check
```

### `/build`

构建项目。

```bash
/build
/build --watch
/build --production
```

## Agent 和协作

### `/plan`

进入规划模式。

```bash
/plan
/plan <description>
/plan --exit
```

**规划模式特点**：
- 只读操作，不修改文件
- 生成详细的实施计划
- 退出时需要确认

### `/agent`

管理自定义 Agent。

```bash
/agent list
/agent create <type>
/agent run <type>
/agent delete <type>
```

### `/team`

管理多 Agent 团队。

```bash
/team create <name>
/team add-agent <team-id> <agent-type>
/team start <team-id>
/team stop <team-id>
```

## Memory 管理

### `/memory`

管理 Memory 系统。

```bash
/memory list
/memory add <type> <content>
/memory edit <file-path>
/memory view
/memory clear
/memory export
/memory import <file>
```

**子命令**：
- `list`: 列出所有 Memory 条目
- `add`: 添加新的 Memory
- `edit`: 编辑 Memory 文件
- `view`: 查看当前 Memory 内容
- `clear`: 清空所有 Memory
- `export`: 导出 Memory 到文件
- `import`: 从文件导入 Memory

## MCP 和插件

### `/mcp`

管理 MCP Server。

```bash
/mcp list
/mcp add <server-name> <command>
/mcp remove <server-name>
/mcp restart <server-name>
/mcp logs <server-name>
```

### `/plugin`

管理插件。

```bash
/plugin list
/plugin install <name>
/plugin uninstall <name>
/plugin update <name>
/plugin enable <name>
/plugin disable <name>
```

## 配置和设置

### `/config`

管理配置设置。

```bash
/config list
/config get <key>
/config set <key> <value>
/config reset <key>
/config edit
```

**常用配置**：
- `theme`: 主题设置（light/dark）
- `permissionMode`: 权限模式
- `maxTokens`: 最大 token 数
- `model`: AI 模型选择

### `/doctor`

运行环境诊断。

```bash
/doctor
/doctor --verbose
```

**检查项目**：
- Node.js 版本
- Git 安装
- Claude API 连接
- 配置文件有效性
- 权限设置

### `/theme`

更改主题。

```bash
/theme
/theme light
/theme dark
```

## 会话管理

### `/save`

保存当前会话。

```bash
/save
/save <name>
```

### `/load`

加载保存的会话。

```bash
/load
/load <name>
```

### `/resume`

恢复上一个会话。

```bash
/resume
/resume <session-id>
```

### `/clear`

清空当前会话。

```bash
/clear
/clear --keep-memory
```

### `/history`

查看命令历史。

```bash
/history
/history --limit 20
/history --search <pattern>
```

## 调试和日志

### `/debug`

调试模式。

```bash
/debug on
/debug off
/debug logs
```

### `/cost`

查看使用成本。

```bash
/cost
/cost --today
/cost --month
/cost --detailed
```

### `/compact`

压缩对话历史。

```bash
/compact
/compact --aggressive
/compact --keep-recent 10
```

## 高级命令

### `/vim`

Vim 模式切换。

```bash
/vim on
/vim off
/vim status
```

### `/voice`

语音输入（如果可用）。

```bash
/voice start
/voice stop
```

### `/macro`

宏录制和回放。

```bash
/macro record <name>
/macro stop
/macro play <name>
/macro list
/macro delete <name>
```

### `/shell`

执行 Shell 命令。

```bash
/shell <command>
/shell <command> --background
/shell <command> --timeout 60000
```

## 快捷键

### 全局快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+C` | 取消当前操作 |
| `Ctrl+D` | 退出 Claude Code |
| `Ctrl+L` | 清屏 |
| `Ctrl+R` | 搜索历史 |
| `Tab` | 自动补全 |
| `↑/↓` | 浏览历史命令 |

### Vim 模式快捷键

| 快捷键 | 功能 |
|--------|------|
| `Esc` | 进入普通模式 |
| `i` | 插入模式 |
| `v` | 可视模式 |
| `:` | 命令模式 |
| `/` | 搜索 |
| `yy` | 复制行 |
| `dd` | 删除行 |
| `p` | 粘贴 |

### 编辑快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+A` | 行首 |
| `Ctrl+E` | 行尾 |
| `Ctrl+W` | 删除前一个词 |
| `Ctrl+U` | 删除到行首 |
| `Ctrl+K` | 删除到行尾 |
| `Ctrl+Y` | 粘贴 |

## 环境变量

### 常用环境变量

```bash
# 禁用网络访问
export CLAUDE_CODE_DISABLE_NETWORK=true

# 只读模式
export CLAUDE_CODE_READ_ONLY=true

# 禁用 Bash 工具
export CLAUDE_CODE_DISABLE_BASH=true

# 自动批准（危险！）
export CLAUDE_CODE_AUTO_APPROVE=true

# 最大执行时间（秒）
export CLAUDE_CODE_MAX_EXEC_TIME=60

# 自定义配置目录
export CLAUDE_CODE_CONFIG_DIR=~/.claude-custom
```

## 命令组合示例

### 完整工作流

```bash
# 1. 规划
/plan "Add user authentication feature"

# 2. 实现
/write src/auth/login.ts
/write src/auth/middleware.ts

# 3. 测试
/test auth.test.ts

# 4. 审查
/review --scope src/auth/

# 5. 提交
/commit
```

### 调试流程

```bash
# 1. 运行诊断
/doctor --verbose

# 2. 查看日志
/debug logs

# 3. 检查成本
/cost --detailed

# 4. 清理历史
/compact
```

## 注意事项

### 权限相关

- 危险操作需要用户确认
- 使用 `--yes` 标志跳过确认（谨慎使用）
- 规划模式只允许读操作

### 性能相关

- 大文件操作会自动截断
- 长命令历史会影响启动速度
- 定期使用 `/compact` 清理历史

---

更多信息请参考：
- [附录B：工具参考](/appendix-b-tools)
- [附录C：Memory 最佳实践](/appendix-c-memory-best-practices)
- [附录D：故障排查](/appendix-d-troubleshooting)
