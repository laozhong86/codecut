# PRD: Codex-Driven Codecut Editing

> Status: historical planning document. The current installed Codex-only MVP is documented in `docs/codex-driven-editing.md` and implemented with snake_case bridge tools: `get_project_info`, `list_media_assets`, `transcribe_media`, `apply_edit_plan`, `get_timeline_state`, and optional `export_project`. Do not treat the six camelCase tools in this PRD as current implemented plugin capabilities.

## 1. 背景

Codecut 当前是一个浏览器端视频编辑器，已经具备本地媒体导入、时间轴、预览、字幕、转写、AI 生成和导出等基础能力。下一阶段目标不是复制剪映，而是把 Codecut 封装成 Codex 可理解、可控制、可验证的编辑插件，让 Codex 通过结构化命令驱动 Codecut 完成所见即所得剪辑。

参考的 Jianying skill 价值不在 Python 脚本本身，而在它的执行框架：

- 把自然语言剪辑需求转成确定动作。
- 通过素材、时间轴、字幕、音频、导出等结构做验收。
- 用固定链路降低 Agent 反复探索和幻觉操作。
- 让用户拿到可打开、可预览、可继续调整的剪辑工程。

Codecut 的差异是：它不是本地剪映草稿自动化，而是浏览器内可视化编辑器。因此 Codex 不应该模拟鼠标点击，也不应该直接写 IndexedDB。最优路径是让 Codex 生成结构化剪辑计划，Codecut 在浏览器内通过现有 EditorCore、commands 和 timeline 模型执行，用户实时看到时间轴变化。

## 2. 产品目标

### 2.1 北极星目标

用户上传一个长视频后，可以用一句自然语言让 Codex 生成一个可编辑的短视频初剪版本，并在 Codecut 时间轴中实时看到结果。

示例：

> 把这个 30 分钟视频剪成一个 45 秒短视频，保留最有信息密度的片段，加一个开头标题和字幕。

### 2.2 MVP 目标

MVP 只验证一条最短商业闭环：

**长视频 → 转写分析 → 选段 → 生成短视频时间轴 → 用户预览和微调。**

MVP 成功不要求 AI 一次剪得完美，而要求它能稳定生成一个可解释、可播放、可编辑的初剪。

## 3. 用户与场景

### 3.1 目标用户

- 内容创作者：有长素材，希望快速得到短视频初剪。
- 社媒运营：需要从直播、访谈、课程、产品讲解中提取短视频片段。
- 产品/教育团队：把长演示或教学视频拆成可传播的片段。

### 3.2 核心痛点

| 痛点 | 现状成本 | MVP 价值 |
| --- | --- | --- |
| 长视频找重点慢 | 需要手动拖时间轴、反复听内容 | 先用转写和 LLM 选出候选片段 |
| AI 黑盒成片不可控 | 一键生成后难以精修 | 直接落到 Codecut 时间轴，用户可编辑 |
| 剪辑动作重复 | 切片段、排序、加字幕、标题很机械 | Codex 生成 edit plan，Codecut 执行 |
| 结果不可验证 | AI 说剪好了，但用户不知道剪了什么 | 时间轴、字幕、片段来源都可见 |

## 4. MVP 范围

### 4.1 包含

1. 选择一个已导入的长视频素材。
2. 提取音频并转写为带时间戳的 transcript。
3. Codex 根据用户目标和 transcript 生成结构化 edit plan。
4. Codecut 校验 edit plan 的时间范围、总时长、片段数量和字幕结构。
5. Codecut 将选段插入时间轴，形成短视频 draft。
6. 自动添加基础标题和字幕。
7. 用户在 Codecut 预览区看到结果，并可继续手动调整。

### 4.2 不包含

MVP 不做以下能力：

- 视觉高光识别。
- 自动 B-roll 匹配。
- 自动运镜和智能裁切。
- 高级滤镜、转场、特效库。
- 自动封面生成。
- 自动导出或发布。
- 多平台模板系统。
- 多视频混剪。

这些能力有价值，但会显著扩大不确定性。MVP 应优先证明 Codex 能稳定控制 Codecut 生成可编辑时间轴。

## 5. 用户流程

### 5.1 主流程

1. 用户打开 Codecut 编辑器。
2. 用户导入一个长视频。
3. 用户在 Codex 中提出剪辑需求。
4. Codex 读取当前项目和素材状态。
5. Codecut 对长视频提取音频并转写。
6. Codex 基于 transcript 生成 edit plan。
7. Codecut 校验 edit plan。
8. Codecut 执行 edit plan，时间轴出现短视频结构。
9. 用户播放预览。
10. 用户继续让 Codex 微调，或手动编辑。

### 5.2 典型提示词

- 把这个长视频剪成 45 秒短视频，适合 TikTok。
- 保留最有观点冲突的片段，做成 30 秒开头强的视频。
- 从这个课程里剪一个 60 秒知识点摘要，加字幕。
- 帮我找出最适合做开头 hook 的 3 个片段。

## 6. 核心能力设计

### 6.1 Codex 控制方式

Codex 不直接操作 DOM，也不直接写数据库。Codex 输出结构化命令，由 Codecut 浏览器端执行。

推荐控制链路：

```text
User intent
  -> Codex understands goal
  -> Codecut provides project/media/transcript context
  -> Codex returns EditPlan JSON
  -> Codecut validates EditPlan
  -> Codecut previews the planned timeline change
  -> Codecut applies plan through EditorCore commands
  -> Codecut verifies timeline and preview state
```

这一条链路借鉴 OpusClip skill 的 round-trip 思路，但不接入 OpusClip 云端能力。Codecut 的差异是本地可视化编辑器，所以必须把“预览”和“可撤销时间轴变更”作为产品合同的一部分。

### 6.2 EditPlan 概念

EditPlan 是 Codex 和 Codecut 之间的核心产品合同。它不应该是自由文本，而应该是可验证的结构。

概念字段：

| 字段 | 含义 |
| --- | --- |
| sourceMediaId | 被剪辑的原始长视频素材 |
| targetDuration | 目标短视频时长 |
| aspectRatio | 输出比例，例如 9:16 或 16:9 |
| clips | 选中的源片段列表 |
| captions | 字幕列表 |
| title | 开头标题 |
| rationale | 为什么这样剪 |

每个 clip 至少需要：

| 字段 | 含义 |
| --- | --- |
| sourceStart | 原视频起点 |
| sourceEnd | 原视频终点 |
| timelineStart | 短视频时间轴位置 |
| reason | 入选原因 |

### 6.3 验收规则

Codecut 执行前必须校验：

- `sourceStart >= 0`
- `sourceEnd > sourceStart`
- `sourceEnd <= 原视频时长`
- 所有 clip 总时长接近目标时长
- 字幕时间落在目标 timeline 内
- 至少存在一个视频片段
- 不允许静默跳过非法片段

校验失败时直接报错，让 Codex 修正 plan，而不是自动降级。

### 6.4 Round-trip 编辑模型

MVP 不应让 Codex 直接改时间轴。推荐固定模型：

```text
getProjectState
  -> buildVideoContext
  -> generate EditPlan
  -> validateEditPlan
  -> previewEditPlan
  -> applyEditPlan
  -> verifyEditorState
```

每一层的产品职责：

| 步骤 | 产品职责 |
| --- | --- |
| getProjectState | 读取当前项目、媒体、时间轴和目标画布 |
| buildVideoContext | 建立长视频的转写、时长、候选上下文 |
| generate EditPlan | Codex 决定剪哪些片段、为什么剪 |
| validateEditPlan | Codecut 拦截非法时间点、缺失素材、错误比例 |
| previewEditPlan | 给用户看将要发生什么，不改时间轴 |
| applyEditPlan | 通过 EditorCore/TimelineManager 落到时间轴 |
| verifyEditorState | 验证轨道、元素、字幕、预览是否符合计划 |

这个模型的业务价值是降低用户不信任：用户不是拿到一个黑盒成片，而是先看到“会剪哪几段、为什么选、总时长多少”，确认后再落到可编辑时间轴。

### 6.5 最小工具合同

历史规划曾建议以下 6 个未来概念工具；当前已安装 MVP 不按这一节执行，当前工具面以 `docs/codex-driven-editing.md` 为准：

| 工具 | 是否改时间轴 | MVP 作用 |
| --- | --- | --- |
| getProjectState | 否 | 让 Codex 理解当前项目和素材 |
| buildVideoContext | 否 | 生成或读取转写和视频上下文 |
| validateEditPlan | 否 | 在执行前发现错误 |
| previewEditPlan | 否 | 让用户看到计划差异和风险 |
| applyEditPlan | 是 | 把计划应用到 Codecut 时间轴 |
| verifyEditorState | 否 | 验证结果可见、可播放、可编辑 |

MVP 暂不暴露自动发布、批量变体、任意低层 timeline mutation、直接 IndexedDB 写入、自动导出。

## 7. MVP 交互策略

### 7.1 用户看到什么

用户不需要看到复杂 JSON。用户应该看到：

- Codex 的剪辑意图摘要。
- 选了哪些片段。
- 每个片段为什么被选。
- 计划预览：总时长、片段来源、风险提示、是否需要确认。
- 确认后时间轴已经更新。
- 可以播放预览。

### 7.2 Codex 应该怎么说

Codex 输出应偏产品化：

- “我会先基于转写找高信息密度片段。”
- “这版初剪选了 4 段，总长 43 秒。”
- “第 2 段保留是因为它给出了具体结论。”
- “你可以让我继续压缩到 30 秒，或加强开头 hook。”

避免：

- 只说“已完成”但没有片段说明。
- 给用户展示大量内部工具日志。
- 对无法验证的结果做确定承诺。

## 8. 成功指标

### 8.1 MVP 可用性指标

| 指标 | 目标 |
| --- | --- |
| 长视频生成短视频初剪成功率 | >= 80% |
| 生成结果可播放率 | >= 95% |
| EditPlan 校验失败可修正率 | >= 90% |
| 用户从上传到看到初剪 | 目标 3 分钟内，长视频可先接受更久 |
| 用户需要手动重剪比例 | 下降到可接受范围，MVP 先定性观察 |

### 8.2 产品价值指标

| 指标 | 意义 |
| --- | --- |
| 用户是否接受 AI 初剪作为起点 | 验证不是玩具功能 |
| 用户二次指令次数 | 观察 Codex 是否适合做剪辑协作 |
| 平均节省时间 | 对比手动找片段和初剪时间 |
| 初剪后导出率 | 验证真实产出价值 |

## 9. 技术边界

### 9.1 应复用的 Codecut 能力

- `EditorCore`
- `TimelineManager`
- timeline commands
- media processing
- audio extraction
- transcription service
- caption chunk builder
- export pipeline
- existing agent tools where适用

### 9.2 应避免的方式

- 不模拟鼠标拖拽。
- 不直接写 IndexedDB。
- 不把 Jianying Python runtime 接进 Codecut。
- 不让 LLM 自由拼工具调用完成复杂剪辑。
- 不在没有校验的情况下把 plan 写入时间轴。

## 10. 风险与约束

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 长视频转写慢 | 用户等待时间长 | MVP 接受长任务状态；后续做分段和缓存 |
| LLM 选段质量不稳定 | 初剪不好用 | 输出 rationale，允许用户二次指令微调 |
| EditPlan 幻觉时间点 | 时间轴执行失败 | 强校验，失败直接回给 Codex 修 plan |
| 只有文本理解，缺少视觉判断 | 适合口播，不适合纯画面视频 | MVP 明确聚焦口播/访谈/教程 |
| 自动剪辑过度黑盒 | 用户不信任 | 展示片段来源和选择理由 |

## 11. 分阶段路线

### Phase 1: Skill 与产品合同

目标：定义 Codex 如何理解 Codecut 剪辑任务。

产出：

- Codex skill 主框架。
- EditPlan 产品合同。
- 长视频转短视频 MVP PRD。
- 验收标准。

### Phase 2: 本地桥接与命令执行

目标：Codex 能把结构化命令传给打开的 Codecut 编辑器。

产出：

- round-trip 命令 envelope。
- `getProjectState` / `buildVideoContext`。
- `validateEditPlan` / `previewEditPlan`。
- `applyEditPlan` / `verifyEditorState`。
- 浏览器端执行器和结果回传。

### Phase 3: 长视频初剪

目标：完成第一个真实业务闭环。

产出：

- 选择长视频。
- 转写。
- 生成 EditPlan。
- 预览 EditPlan。
- 应用到时间轴。
- 用户预览。

### Phase 4: 质量增强

目标：让初剪结果更像可发布短视频。

候选能力：

- hook 评分。
- 字幕样式。
- 自动节奏压缩。
- 竖屏裁切建议。
- BGM 推荐。
- 片段候选对比。

## 12. MVP 判断

MVP 的关键问题不是“能不能自动剪出爆款”，而是：

1. Codex 是否能稳定理解 Codecut 当前项目状态。
2. Codex 是否能生成可执行的剪辑计划。
3. Codecut 是否能把计划可靠地应用到时间轴。
4. 用户是否愿意基于这个初剪继续微调。

只要这四点成立，后续视觉分析、特效、模板和自动发布才值得继续投入。

## 13. 下一步计划

### P0: 实现 `previewEditPlan` / `applyEditPlan` 工具合同

风险：没有预览和应用分层，Codex 容易直接改时间轴，用户不可控，也难以定位失败。

### P1: 把 `EditPlan` schema 转成 runtime validator

风险：只有文档 schema 不能阻止错误时间点、错误轨道和字幕漂移。

### P2: 用固定长视频样例跑完整验收

风险：没有可重复样例，无法判断 MVP 是否真的比手动剪辑节省时间。

验收路径：导入一个 10-60 分钟口播/教程视频，生成 30-60 秒竖屏短视频，要求 `previewEditPlan` 能解释片段选择，`applyEditPlan` 能生成可播放、可继续编辑的 Codecut 时间轴。
