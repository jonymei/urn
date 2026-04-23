# ingest / sync 策略

`urn` 现在区分两类同步方式：

- `ingest`：手动或按天归档，适合补数和离线回放
- `sync`：面向频繁执行的近实时同步，适合每隔 1 小时运行

## source 优先级

建议按下面的顺序投入优化和理解：

1. `agent_session`
2. `browser_history`
3. `shell_history`

原因：

- `agent_session` 直接携带任务语义、上下文和交互内容，价值最高
- `browser_history` 能补研究路径，但容易受浏览器同步和延迟落盘影响
- `shell_history` 只有命令文本，缺少结果和可靠上下文，适合作为弱信号

## 每天归档

每天跑一次时，推荐：

```bash
urn ingest --profile daily
```

默认行为：

- `agent_session`：采集当天全量
- `browser_history`：回放最近 3 天窗口
- `shell_history`：默认不采集

如果需要 shell 弱信号：

```bash
urn ingest --profile daily --include-shell
```

## 每小时同步

如果目标是让索引尽量实时更新，同时控制重复成本，推荐：

```bash
urn sync
```

默认行为：

- `agent_session`：使用增量 cursor，同步时回放最近 15 分钟重叠窗口
- `browser_history`：不走 cursor，固定回放最近 1 天窗口
- `shell_history`：默认关闭

如果确实需要 shell：

```bash
urn sync --include-shell
```

可调参数：

- `--agent-overlap-hours`
- `--browser-days`
- `--shell-hours`

## 为什么这样设计

### agent_session

Agent 会话是主信号，已经接入 cursor：

- 每个 source 单独维护同步 cursor
- 频繁执行时只扫描 cursor 之后的数据
- 保留一小段 overlap，降低边界漏数风险

这意味着每小时运行时，agent 部分会越来越接近真正增量。

### browser_history

浏览器历史不适合严格 cursor：

- 浏览器同步可能导致旧记录晚到
- 本地历史库可能被整理、修复或延迟落盘
- 游标很容易被“同步重放”的语义污染

所以这里保留滑动窗口重放，再依赖数据库幂等去重。

### shell_history

Shell 历史暂时维持低优先级：

- 命令本身信息有限
- 当前 `cwd` 能力弱
- 历史文件受 shell 写盘策略影响较大

因此默认不参与频繁同步。

## 幂等与低消耗

同步过程现在有两层保障：

1. source 层减少扫描范围
2. DB 层幂等去重

其中 DB 层已经做到：

- `raw_records.id` 稳定生成
- `events.id` 稳定生成
- `INSERT OR IGNORE` 避免重复写入
- 只对本次新插入的 `raw_records` 继续做 `normalize -> events`

因此重复执行时，主要成本来自必要的重扫窗口，而不会重复生成整批 events。

## 适用建议

- 每天归档：`ingest --profile daily`
- 每小时同步：`sync`
- 补历史：继续使用 `ingest --day` 或 `ingest --start/--end`
- 排查单个 source：继续使用 `ingest --source ...`
- 看累计分布：`stats`
- 看时间段摘要：`summary`
