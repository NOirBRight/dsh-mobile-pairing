# 插件维护边界

完整的 production / lab 约定见 Workstation 根目录的 `AGENTS.md`。

## Core 边界

本项目只维护插件：官方 [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) 及其本地 checkout 是只读依赖。实现、兼容 Adapter、测试和构建配置留在本项目；禁止修改、携带或要求 DSH core patch。缺少公开 Interface、slot 或 RPC 时，记录缺失 seam 与上游提案，并让插件在干净的官方 tag 上降级或关闭该能力。

## Pairing 来源与 UI 限制

- `@dsh-mobile/pairing` 的唯一来源是本仓库；下游通过发布的 tag/tarball 消费，不维护第二份源码镜像。
- 设置导航的远程图标通过临时 DOM patch 替换官方齿轮（官方 `settings.section` 暂无 icon 字段）。属于已接受的临时兼容性限制，变更时静默回落，不影响配对与会话。

## DSH 版本兼容

- 官方 DSH Host 包（`@deepseek-ai/dsh` 及其工作区 `@deepseek-ai/dsh-*` 包）在 `package.json` 的 `dependencies`、`optionalDependencies`、`devDependencies`、`peerDependencies` 中使用无上界的下限范围 `>=<最早已验证兼容版本>`；锁文件可固定实际验证的版本。独立发布的插件依赖按其发布渠道声明。
- 声明兼容新 DSH release 前，审查其公开 API 变化与插件实际调用，运行相关测试和 `pnpm run build`，并在 3082（`DSH_HOME=~/.dsh-lab`）验证；全部通过后再宣称兼容。
