# urn

`urn` 用来采集用户的日常工作行为，做统一脱敏、规范化、索引和查询，供上层 AI Agent 分析与汇总。

当前首批数据源：

- AI Agent 会话
- 浏览器历史
- Shell 历史

当前特性：

- 本地优先，统一入库到 SQLite
- 原始记录与规范化事件两层模型
- 按天、任意时间段、最近 N 小时 / N 天查询
- 规则型敏感信息脱敏
- 为未来多节点聚合预留 `nodeId`

## 安装

```bash
cd /path/to/urn
pnpm install
pnpm build
```

## 用法

```bash
urn ingest --source all --day 2026-04-14
urn ingest --source zsh --recent 7d
urn ingest --profile daily
urn ingest --profile daily --include-shell
urn sync
urn sync --include-shell
urn query --source all --day 2026-04-14
urn stats --recent 30d
urn summary --start 2026-04-11T00:00:00 --end 2026-04-12T23:59:59
urn query --start 2026-04-14T00:00:00 --end 2026-04-14T23:59:59 --format json
urn query --day 2026-04-14 --format jsonl
urn query --day 2026-04-14 --format csv
urn sources list
urn nodes list
```

推荐的每日同步策略见 [docs/ingest-strategy.md](./docs/ingest-strategy.md)。
如果需要每隔 1 小时近实时同步，优先使用 `sync`。

默认数据库位置：

```text
~/.urn/urn.db
```

## 配置

当前 `urn` 采用两种方式定位本地数据：

- 显式配置：通过环境变量覆盖
- 自动发现：按当前用户主目录下的标准路径查找

### 核心配置

```bash
export URN_DB_PATH=/path/to/urn.db
export URN_NODE_ID=local:my-node
```

- `URN_DB_PATH`
  覆盖默认 SQLite 数据库路径
- `URN_NODE_ID`
  覆盖默认节点 ID

### AI Agent 会话数据源

```bash
export AI_SESSION_VIEWER_HOME=/path/to/home
export AI_SESSION_VIEWER_CLAUDE_DIR=/path/to/claude/projects
export AI_SESSION_VIEWER_CODEX_DB=/path/to/.codex/state_5.sqlite
export AI_SESSION_VIEWER_OPENCODE_DB=/path/to/opencode.db
export AI_SESSION_VIEWER_ALMA_DB=/path/to/chat_threads.db
```

默认情况下会自动发现：

- Claude: `~/.claude/projects`
- Codex: `~/.codex/state_5.sqlite`
- OpenCode: 若干常见本地数据库位置
- Alma: `~/Library/Application Support/alma/chat_threads.db`

### 浏览器历史数据源

当前只支持自动发现，按标准路径读取：

- Safari: `~/Library/Safari/History.db`
- Chrome: `~/Library/Application Support/Google/Chrome/Default/History`
- Edge: `~/Library/Application Support/Microsoft Edge/Default/History`

### Shell 历史数据源

当前只支持自动发现，按标准路径读取：

- Bash: `~/.bash_history`
- Zsh: `~/.zsh_history`
- Fish: `~/.local/share/fish/fish_history`

说明：

- `bash`、`zsh` 没有时间戳的记录会被直接丢弃
- `fish` 依赖历史文件中的 `when:` 时间戳
- `cwd` 目前不会从历史文件中恢复；后续需要通过 shell hook 补齐
