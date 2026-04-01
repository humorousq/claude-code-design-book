# 附录D：故障排查

本附录提供 Claude Code 常见问题的诊断和解决方案。

## 安装问题

### 问题：Node.js 版本不兼容

**症状**：
```
Error: Node.js version 18.x is not supported
Please upgrade to Node.js 22.x or higher
```

**解决方案**：
```bash
# 检查当前版本
node --version

# 使用 nvm 升级
nvm install 22
nvm use 22

# 或使用 n
n 22

# 验证
node --version  # 应该显示 v22.x.x
```

### 问题：npm 安装失败

**症状**：
```
npm ERR! EACCES: permission denied
```

**解决方案**：
```bash
# 方案 1：修复 npm 权限
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# 方案 2：使用 npx
npx claude-code

# 方案 3：使用 sudo（不推荐）
sudo npm install -g claude-code
```

### 问题：Git 未安装

**症状**：
```
Error: Git is not installed
```

**解决方案**：
```bash
# macOS
brew install git

# Ubuntu/Debian
sudo apt-get install git

# Windows
# 下载并安装：https://git-scm.com/download/win

# 验证
git --version
```

## 认证问题

### 问题：登录失败

**症状**：
```
Authentication failed
```

**诊断步骤**：
```bash
# 1. 检查网络连接
curl -I https://api.anthropic.com

# 2. 检查认证状态
/doctor

# 3. 查看详细日志
DEBUG=* claude-code
```

**解决方案**：
```bash
# 方案 1：重新登录
/logout
/login

# 方案 2：清除缓存认证
rm -rf ~/.claude/auth.json
/login

# 方案 3：使用环境变量
export ANTHROPIC_API_KEY=your-key-here
```

### 问题：Token 过期

**症状**：
```
Error: Token expired
```

**解决方案**：
```bash
# 刷新 token
/logout
/login

# 或使用 API key
export ANTHROPIC_API_KEY=your-key-here
```

## 工具执行问题

### 问题：Bash 命令超时

**症状**：
```
Error: Command timed out after 120000ms
```

**解决方案**：
```typescript
// 增加超时时间
Bash({
  command: "npm run build",
  timeout: 300000  // 5 分钟
})

// 或后台运行
Bash({
  command: "npm run dev",
  run_in_background: true
})
```

### 问题：文件权限错误

**症状**：
```
Error: EACCES: permission denied, open '/path/to/file'
```

**解决方案**：
```bash
# 检查文件权限
ls -la /path/to/file

# 修改权限
chmod 644 /path/to/file

# 或修改所有者
chown $USER:$USER /path/to/file
```

### 问题：命令被拒绝

**症状**：
```
Error: Dangerous command detected: rm -rf /
```

**解决方案**：
```typescript
// 1. 使用更安全的命令
Bash({ command: "rm -rf ./dist" })  // 明确指定目录

// 2. 如果确实需要（危险！）
Bash({
  command: "dangerous-command",
  dangerouslyDisableSandbox: true
})
```

## Memory 问题

### 问题：Memory 未加载

**症状**：
- AI 不记得之前的偏好
- 每次对话都需要重新说明背景

**诊断步骤**：
```bash
# 1. 检查 Memory 目录
ls -la ~/.claude/memory/

# 2. 检查配置
/config get memoryEnabled

# 3. 查看 Memory 内容
/memory view
```

**解决方案**：
```bash
# 方案 1：启用 Memory
/config set memoryEnabled true

# 方案 2：重新创建 Memory 目录
mkdir -p ~/.claude/memory/projects/$(pwd | sed 's/\//-/g')
/memory init

# 方案 3：检查文件权限
chmod -R 755 ~/.claude/memory/
```

### 问题：Memory 文件过大

**症状**：
```
Warning: MEMORY.md exceeds 25KB limit
```

**解决方案**：
```bash
# 1. 检查文件大小
wc -l ~/.claude/memory/projects/*/MEMORY.md

# 2. 分拆内容
/memory edit MEMORY.md
# 将详细内容移到子文件

# 3. 压缩历史
/memory compact --aggressive
```

### 问题：Memory 冲突

**症状**：
- Team Memory 和 Private Memory 矛盾
- AI 使用了错误的偏好

**解决方案**：
```bash
# 1. 查看所有 Memory
/memory list --all

# 2. 明确优先级
# Private > Team > User

# 3. 更新冲突的 Memory
/memory edit team/feedback.md
# 注明这是团队规范，个人项目可以使用不同偏好
```

## MCP 问题

### 问题：MCP Server 连接失败

**症状**：
```
Error: Failed to connect to MCP server "filesystem"
```

**诊断步骤**：
```bash
# 1. 检查 MCP Server 状态
/mcp list

# 2. 查看日志
/mcp logs filesystem

# 3. 手动测试
npx @anthropic-ai/mcp-server-filesystem --help
```

**解决方案**：
```bash
# 方案 1：重启 MCP Server
/mcp restart filesystem

# 方案 2：检查配置
cat ~/.claude/mcp_servers.json

# 方案 3：重新安装
npm install -g @anthropic-ai/mcp-server-filesystem
/mcp add filesystem npx @anthropic-ai/mcp-server-filesystem
```

### 问题：MCP 工具调用失败

**症状**：
```
Error: MCP tool call failed
```

**解决方案**：
```typescript
// 1. 验证参数
MCP({
  server_name: "filesystem",
  tool_name: "read_file",
  arguments: { path: "/absolute/path/to/file" }
})

// 2. 检查权限
/doctor --mcp

// 3. 查看 MCP 日志
/mcp logs filesystem --tail 100
```

## 性能问题

### 问题：启动缓慢

**症状**：
- 启动时间超过 1 秒
- 加载时卡顿

**诊断步骤**：
```bash
# 1. 测量启动时间
time claude-code --version

# 2. 检查插件
/plugin list

# 3. 检查历史
wc -l ~/.claude/history
```

**解决方案**：
```bash
# 方案 1：清理历史
/clear --keep-memory
/history clear --older-than 30d

# 方案 2：禁用不必要的插件
/plugin disable unused-plugin

# 方案 3：清理缓存
rm -rf ~/.claude/cache/*
```

### 问题：响应缓慢

**症状**：
- AI 响应延迟超过 5 秒
- Token 生成速度慢

**解决方案**：
```bash
# 1. 检查网络
ping api.anthropic.com

# 2. 检查 API 状态
curl https://status.anthropic.com/api/v1/status

# 3. 压缩对话历史
/compact --aggressive

# 4. 减少上下文大小
/config set maxHistory 50
```

### 问题：内存占用高

**症状**：
```
Warning: Memory usage exceeds 500MB
```

**解决方案**：
```bash
# 1. 检查内存使用
ps aux | grep claude-code

# 2. 清理缓存
rm -rf ~/.claude/cache/*

# 3. 重启 Claude Code
/logout
/login
```

## Git 问题

### 问题：Git 操作失败

**症状**：
```
Error: Not a git repository
```

**解决方案**：
```bash
# 1. 初始化 Git 仓库
git init

# 2. 检查 Git 状态
git status

# 3. 配置用户信息
git config user.name "Your Name"
git config user.email "your@email.com"
```

### 问题：Commit 失败

**症状**：
```
Error: Nothing to commit
```

**解决方案**：
```bash
# 1. 检查是否有变更
git status

# 2. 添加文件
git add .

# 3. 再次尝试
/commit
```

## 权限问题

### 问题：权限被拒绝

**症状**：
```
Error: Permission denied
```

**解决方案**：
```bash
# 1. 检查权限模式
/config get permissionMode

# 2. 切换权限模式
/config set permissionMode auto  # 减少确认

# 或
/config set permissionMode bypass  # 完全跳过（危险！）
```

### 问题：误操作恢复

**症状**：
- 不小心执行了危险操作
- 文件被错误修改

**解决方案**：
```bash
# 1. 查看操作历史
/history

# 2. 恢复文件
git checkout HEAD -- path/to/file

# 3. 或使用文件历史
/read path/to/file --history
```

## 网络问题

### 问题：API 连接失败

**症状**：
```
Error: Network request failed
```

**诊断步骤**：
```bash
# 1. 测试网络连接
curl -I https://api.anthropic.com

# 2. 检查代理设置
env | grep -i proxy

# 3. 检查防火墙
```

**解决方案**：
```bash
# 方案 1：设置代理
export HTTP_PROXY=http://proxy:8080
export HTTPS_PROXY=http://proxy:8080

# 方案 2：禁用代理
unset HTTP_PROXY HTTPS_PROXY

# 方案 3：使用 API key（绕过 OAuth）
export ANTHROPIC_API_KEY=your-key
```

## 调试技巧

### 启用详细日志

```bash
# 启用所有调试信息
DEBUG=* claude-code

# 只看特定模块
DEBUG=claude-code:* claude-code

# 保存日志到文件
DEBUG=* claude-code 2>&1 | tee claude-code.log
```

### 运行诊断

```bash
# 完整诊断
/doctor --verbose

# 特定检查
/doctor --check git
/doctor --check auth
/doctor --check mcp
```

### 检查配置

```bash
# 查看所有配置
/config list

# 导出配置
/config export > config-backup.json

# 重置配置
/config reset
```

## 获取帮助

### 日志文件位置

```bash
# macOS/Linux
~/.claude/logs/

# Windows
%USERPROFILE%\.claude\logs\
```

### 常用命令

```bash
# 查看版本
/version

# 查看帮助
/help

# 查看状态
/status

# 生成错误报告
/doctor --report > error-report.txt
```

### 联系支持

如果以上方法都无法解决问题：

1. **收集信息**：
   ```bash
   /doctor --verbose > diagnostic.txt
   cat ~/.claude/logs/latest.log > logs.txt
   ```

2. **提交问题**：
   - GitHub Issues: https://github.com/anthropics/claude-code/issues
   - 附上 `diagnostic.txt` 和 `logs.txt`

3. **社区支持**：
   - Discord: https://discord.gg/anthropic
   - 文档: https://docs.anthropic.com/claude-code

---

更多信息请参考：
- [附录A：命令参考](/appendix-a-commands)
- [附录B：工具参考](/appendix-b-tools)
- [附录C：Memory 最佳实践](/appendix-c-memory-best-practices)
