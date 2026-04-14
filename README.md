<p align="center">
  <img src="./docs/assets/urn-icon.png" alt="urn icon" width="128" height="128">
</p>

<h1 align="center">urn</h1>

<p align="center">
  把散落在本机各处的工作痕迹收回来，炼成一份能查、能汇总、能喂给 Agent 的本地索引。
</p>

<p align="center">
  <img alt="Agent Sources" src="https://img.shields.io/badge/Agent-Claude%20%7C%20Codex%20%7C%20OpenCode%20%7C%20Alma-4F46E5">
  <img alt="Browser Sources" src="https://img.shields.io/badge/Browser-Safari%20%7C%20Chrome%20%7C%20Edge-0F766E">
  <img alt="Shell Sources" src="https://img.shields.io/badge/Shell-Bash%20%7C%20Zsh%20%7C%20Fish-7C3AED">
</p>

<p align="center"><em>人生苦短，每一个人都是演员。</em></p>

`urn` 不是那种想把一切都解释清楚的“大平台”。`urn` 就是 Dota 里的 **Urn of Shadows**，收集英雄散掉的灵魂；而我们的灵魂，散在 Codex 的对话里，散在 Claude 的上下文里，散在浏览器一闪而过的标签页里，散在终端敲下又忘掉的命令里。一天过去，真正留下来的东西往往不是完整的叙事，只是一些碎片、一些残影、一些还带着温度的痕迹。`urn` 做的事，就是把这些东西收回来，洗一遍，炼一遍，存进本地。等你回头看，等 Agent 来问，等你想知道自己到底做过什么、查过什么、想过什么，它们还在，还能被重新唤醒，还能重新开口。

## 它具体做什么

当前 `urn` 主要提供四类能力：

- 采集本地工作活动，覆盖 AI Agent 会话、浏览器历史、Shell 历史
- 对原始记录做脱敏、规范化和去重，统一落到 SQLite
- 按天、时间段或最近窗口查询事件，并导出为人类或机器友好的格式
- 为上层 Agent 提供稳定的数据入口，用于回顾、统计、摘要和分析

核心特性：

- 本地优先，统一入库到 SQLite
- 原始记录与规范化事件两层模型
- 支持按天、任意时间段、最近 N 小时 / N 天查询
- 默认输出适合人类阅读，也支持 `json`、`jsonl`、`csv`、`tsv`
- 内置规则型敏感信息脱敏
- 为未来多节点聚合预留 `nodeId`

## 安装

```bash
cd /path/to/urn
pnpm install
pnpm build
```

如果只是本地调试 CLI：

```bash
pnpm cli -- --help
```

## 用法

最常见的几个入口：

- `ingest`：手动补数、按天归档
- `sync`：高频近实时同步
- `query`：查明细
- `stats`：看聚合分布
- `summary`：看一段时间的摘要

示例：

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
urn sync --format json
urn stats --recent 30d --format json
urn summary --day 2026-04-14 --format json
urn query --start 2026-04-14T00:00:00 --end 2026-04-14T23:59:59 --format json
urn query --day 2026-04-14 --format jsonl
urn query --day 2026-04-14 --format csv
urn sources list
urn nodes list
```

推荐的每日同步策略见 [docs/ingest-strategy.md](./docs/ingest-strategy.md)。
CLI 输出与格式约定见 [docs/cli-design.md](./docs/cli-design.md)。
如果需要每隔 1 小时近实时同步，优先使用 `sync`。

默认输出面向人类阅读。
如果需要给脚本、Agent 或管道消费，请显式加 `--format json`、`--format jsonl`、`--format csv` 或 `--format tsv`。

默认数据库位置：

```text
~/.urn/urn.db
```

## Skills

仓库内提供了一个面向 Agent 的 skill：

- `skills/urn-cli`

它的用途是约束 Agent 在分析本地工作行为时优先调用已安装的 `urn` CLI，而不是直接运行仓库里的开发入口。

适用场景：

- 查询某一天或某个时间段的活动记录
- 汇总 `query` / `stats` / `summary` 的结果
- 选择合适的 `--format`
- 说明 `ingest` / `sync` / `sources list` / `nodes list` 的使用方式

如果你的 Agent 支持从仓库加载 skill，可以直接引用 `skills/urn-cli/SKILL.md`。

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

## 开发

```bash
pnpm install
pnpm build
pnpm test
```

常用命令：

- `pnpm build`：编译 TypeScript
- `pnpm cli -- --help`：用仓库源码直接调试 CLI
- `pnpm test:unit`：运行单元测试
- `pnpm test:e2e`：运行 e2e 测试
