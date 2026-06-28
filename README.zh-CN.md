# CodeCut

[English](README.md)

<p>
  Codex + CapCut：Agent 驱动的可视化视频生产系统。<br />
  Codex 负责生产工作，CodeCut 让过程可见、可改、可导出。
</p>

[![GPLv3 License](https://img.shields.io/badge/license-GPLv3-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](.github/CONTRIBUTING.md)

---

## 一句话定位

CodeCut = Codex + CapCut。CodeCut 是 Agent 驱动的可视化视频生产系统：Codex 负责视频生产工作，CodeCut 通过本地可视化编辑器展示进度、素材、时间线、预览、人工调整和导出。

## 为什么需要 CodeCut

自媒体创作者已经在用 AI 写选题、脚本、标题、封面和配图，但最后的视频制作链路仍然断裂：

- 纯 Agent 会写脚本、会生成图片、会做内容判断，但没有视频时间线、没有预览界面，也不能可靠导出视频。
- 纯剪辑工具有时间线，但不理解创作者的内容意图，也没有面向 Agent 的明确剪辑合同。
- CapCut / 剪映足够好用，但高频创作者会遇到 Pro AI 功能、模板、素材、云存储或协作能力的付费墙。
- 第三方 AI 视频 API 会增加新的订阅、API key、额度管理和成本压力，让简单创作变成工程项目。

CodeCut 要连接的是这两个缺口：**Agent 生产智能 + 本地可视化编辑器**。

产品假设很简单：创作者应该能复用自己已经购买或正在使用的 Codex / Claude /
ChatGPT 能力来完成内容理解、素材生成和剪辑规划，再用 CodeCut 检查、调整并导出真实可编辑时间线。

## 目标人群

CodeCut 首先服务 AI 原生自媒体工作者：

- 知识博主、AI 工具博主、独立开发者、创业者 IP、课程作者、咨询型创作者。
- 已经在用 Codex、Claude 或 ChatGPT，希望现有 Agent 订阅能承担更多视频工作的人。
- 每周持续生产短视频，重视发布速度、成本控制、稳定风格和人工复审的人。
- 不想把素材和创作过程全部交给黑盒云端工具，希望在本地看得见、改得动、导得出的人。

CodeCut 暂时不是为这些人优先设计：

- 只想套模板、发生活片段的轻量用户。
- 专业影视后期团队。
- 主要需要多人审批、品牌素材库和云协作的大团队或代理商。

## 你可以用它做什么

- 导入本地视频、图片和音频素材。
- 让 Codex 了解素材内容、画面信息、字幕文本和项目状态。
- 让 Agent 把口播、课程、访谈、产品演示剪成短视频草稿。
- 看到清楚的剪辑方案，包括选了哪些片段、怎么加字幕、标题和比例。
- 让方案落到可编辑时间线，而不是只拿到一个看不到过程的成片文件。
- 在本地预览、手动调整并导出。

首个主打场景：

> 给 CodeCut 一段本地口播视频，让 Codex 剪成 30-90 秒竖屏短视频：清理废话、生成字幕、加 hook 标题，并按需要生成或插入视觉素材。

## 产品原则

- **复用已有 Agent 订阅。** CodeCut 应该让 Codex / Claude 在视频工作流里更有用，而不是逼创作者再接一堆 AI API。图片生成能力和额度取决于用户自己的 Agent 账号和套餐。
- **本地优先。** 素材、转写、时间线修改、预览和导出尽量留在本机。
- **可视化时间线优先于黑盒结果。** Agent 可以起草，但创作者必须能看见、理解和修改结果。
- **单一路径执行。** Agent 的判断必须变成明确剪辑方案，CodeCut 只执行确认过的计划，不做静默兜底、魔法默认值或隐藏修复。
- **替代 CapCut Pro AI 工作流，不复制完整 CapCut。** 第一阶段不拼模板数量，而是拼 Agent 原生控制、重复 AI 工具成本更低、剪辑过程可解释。

## 技术栈

- `apps/web` 中的 `Next.js` 应用。
- `Bun` 管理依赖和脚本。
- `PostgreSQL + Redis`，前端开发时可按需启用。
- 全项目使用 `TypeScript`。

## 安装

### 让 Codex 自动安装

把下面这段发给 Codex：

```text
Please install the CodeCut Codex plugin from https://github.com/laozhong86/codecut.git.
Clone the repository into ~/plugins/codecut, verify that .codex-plugin/plugin.json exists, run bun install, create apps/web/.env.local from apps/web/.env.example if it is missing, add the plugin to the personal marketplace, run codex plugin marketplace add ~, then run codex plugin add codecut@personal. After installing, validate the plugin and tell me whether I should start a fresh Codex conversation to load the new skills and MCP tools.
```

### 手动安装 / Manual Install

推荐把插件 clone 到 Codex personal marketplace 默认会引用的位置：

```bash
mkdir -p ~/plugins
git clone https://github.com/laozhong86/codecut.git ~/plugins/codecut
cd ~/plugins/codecut
bun install
test -f apps/web/.env.local || cp apps/web/.env.example apps/web/.env.local
bun run build:web
```

确保 `~/.agents/plugins/marketplace.json` 中有 CodeCut 条目：

```json
{
  "name": "personal",
  "interface": {
    "displayName": "Personal"
  },
  "plugins": [
    {
      "name": "codecut",
      "source": {
        "source": "local",
        "path": "./plugins/codecut"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Developer Tools"
    }
  ]
}
```

然后先注册 personal marketplace，再安装插件：

```bash
codex plugin marketplace add ~
codex plugin add codecut@personal
```

安装后建议开启一个 fresh Codex 对话，让新的 skill 和 MCP 工具完整加载。

## 使用

### 打开 CodeCut

在 Codex 中说：

```text
Open CodeCut and set up an Agent-driven visual video production workspace.
```

CodeCut 会启动本地网页编辑器，默认地址是：

```text
http://127.0.0.1:4100/en/projects
```

剪辑记录会保存在当前 CodeCut 项目文件夹中，而不是保存到插件仓库里：

```text
.codecut-workspace/projects/<project-id>/
```

### 导入本地素材

在 Codex 中说：

```text
Import my local video into CodeCut and prepare a visible short-form timeline.
```

Codex 会通过 CodeCut 插件检查文件、收集必要剪辑设置，并准备一个可视化本地时间线，
而不是只返回一个看不到过程的成片文件。

### 生成竖屏短视频

在 Codex 中说：

```text
Turn this source clip into a 30-90 second vertical short with captions and preview.
```

Codex 负责编写剪辑方案。CodeCut 把方案应用到本地网页时间线，打开编辑器链接，
让创作者继续预览、修改和导出。

## 发布本地更新与验证

CodeCut 可以作为普通本地应用启动，但 Codex 插件发布要分四层验证：marketplace
发现、插件启用、installed cache、当前 Codex 会话。源码测试通过，不等于一个
fresh Codex 会话已经看到了最新插件。

修改 `.codex-plugin/plugin.json`、`skills/`、`.mcp.json`、MCP resource、widget、
bridge 代码或插件展示资源后，发布本地更新：

```bash
node scripts/sync-codex-local-plugin.mjs --marketplace <marketplace-name>
bun run plugin:freshness
```

`node scripts/sync-codex-local-plugin.mjs` 会把 source checkout 同步到 Codex
installed cache，并校验关键 source/cache checksum。`bun run plugin:freshness`
是只读检查，只报告 source、marketplace、enabled config、installed cache 和
session freshness，不会自动修复状态。

报告插件发布就绪前，把 `docs/codecut-version-release-matrix.md` 里的自检表补齐：

- Manifest：`.codex-plugin/plugin.json` 的 name 和 version。
- Marketplace/config：启用的 `codecut@<marketplace-name>` 指向当前 source checkout。
- Installed cache：更新后 source-to-cache sync 干净。
- fresh Codex 会话：安装或 cache sync 后开启新的 Codex 对话。
- Tool surface：用 `tool_search` 搜索 `open_codecut_workspace CodeCut MCP
  workspace setup widget`，确认 `open_codecut_workspace` 可调用。
- Fresh-thread widget proof：涉及 widget 或 MCP 路由变化时，按
  `docs/codecut-widget-intake-fresh-thread.md` 验证后再报告可见。

CodeCut 的 workspace 数据、导入素材、生成的计划文件、时间线状态和导出文件属于用户项目或
executor workspace。它们不是插件源码，也不能作为插件 bundle 已发布的证明。

## 快速启动

```bash
git clone <your-fork-url>
cd codecut/apps/web
cp .env.example .env.local
bun install
bun dev
```

打开 `http://localhost:4100`。

## 完整本地环境

只启动本地开发需要的后端服务：

```bash
docker compose up redis serverless-redis-http -d
```

然后进入 `apps/web`：

```bash
cp .env.example .env.local
```

必填环境变量：

```bash
UPSTASH_REDIS_REST_URL="http://localhost:8079"
UPSTASH_REDIS_REST_TOKEN="codecut_redis_token"
NODE_ENV="development"
```

如果要启用登录认证，再启动 PostgreSQL 并补充这些环境变量：

```bash
docker compose up redis serverless-redis-http postgres -d
```

```bash
DATABASE_URL="postgresql://codecut:codecut@localhost:5432/codecut"
BETTER_AUTH_SECRET="your-generated-secret-here"
```

生成 `BETTER_AUTH_SECRET`：

```bash
openssl rand -base64 32
```

运行：

```bash
bun run db:migrate
bun run dev
```

## 参与贡献

欢迎贡献。提交 PR 前请先查看 `.github/CONTRIBUTING.md`。

当前高价值方向：

- 时间线交互质量。
- 项目管理与可靠性。
- 性能优化和缺陷修复。
- 预览核心之外的 UI 改进。

正在重构中的区域：

- 预览面板内部实现，包括字体、贴纸和效果。
- 导出链路内部实现。

## Docker 部署

运行完整应用：

```bash
docker compose up --build
```

打开 `http://localhost:4100`。

该命令会启动 Redis 和 Web 应用。如果要启用认证，请在 `docker-compose.yaml` 中打开
PostgreSQL 服务和对应环境变量。

## 部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fmsgbyte%2Fcodecut&project-name=codecut&repository-name=codecut)

## 许可证

基于 [GNU General Public License v3.0](LICENSE) 发布。

<p align="right">
  <sub><sup>NOTE: fork from opencut (#fca99d6126c31fbb18ed9f1034cee6f940b040e8)</sup></sub>
</p>
