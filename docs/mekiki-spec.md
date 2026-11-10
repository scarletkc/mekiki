# mekiki 需求与技术方案

交给 Claude Code 实现用。仓库 `scarletkc/mekiki`，站点 `https://mekiki.fog.moe`。
建议放进仓库 `docs/SPEC.md`，实现过程中有偏离就回来改这份文档。

## 1. 这是什么

一个静态网站加一份公开 JSON API，维护 KC 个人对 AI 模型的评价。每个模型给三个评级：

- **智能**：权威榜单分数（自动拉取）和 KC 的主观分（手填）加权得出
- **成本**：根据价格自动得出
- **性价比**：由智能和成本自动得出

定位参考 models.dev，区别是 models.dev 收录事实数据（价格、上下文、能力），mekiki 只收 KC 关心的模型，并给出带个人判断的评级和评语。「mekiki」是日语「目利き」，指鉴别好坏的眼光。

不做的事：

- 不做全量模型数据库，只维护一份精选列表（预计几十个模型）
- 不做登录、评论、投票，不要后端和数据库
- 不自己跑评测
- 不做多语言（见 §2）

## 2. 默认假设

以下是写这份文档时替 KC 定的默认值，KC 开工前可以改。Claude Code 按这里写的执行，不要另行发挥。

| 项 | 默认值 |
|---|---|
| 界面语言 | 简体中文；字段名、API、代码用英文 |
| 榜单来源 | Artificial Analysis（智能指数、编程指数）+ Arena 文本榜 |
| 智能分权重 | 榜单 60%，主观 40% |
| 榜单内部权重 | AA 智能指数 0.5，AA 编程指数 0.2，Arena 文本榜 0.3 |
| 初始模型 | KC 给清单；没给的话先放 8–10 个当前主流模型当示例，主观字段全部留空 |
| 包管理器 | pnpm |
| 代码许可 | MIT |

## 3. 硬性规则

1. **不要替 KC 编主观评分和评语。** `subjective` 下的字段只能由 KC 填，示例数据里一律留空。
2. **构建不联网。** 外部数据由同步脚本写成快照文件提交进仓库，构建只读本地文件。任何数据源挂掉都不能让站点构建失败。
3. **密钥不进前端、不进仓库。** AA 的 API key 只存在于 GitHub Actions secret，只有同步脚本用。
4. **评分参数集中在一个配置文件**（权重、阈值、归一化参数），评分逻辑写成纯函数并有单元测试。
5. **写适配器前先看真实响应。** 本文档里的外部字段名来自各家文档，可能已变。先请求一次、看清结构，再写 Zod schema 和适配器。
6. **依赖用当前稳定版。** 安装和配置以官方文档为准（有 Context7 就用它查），不要照记忆里的旧写法。

## 4. 技术栈

| 层 | 选择 | 说明 |
|---|---|---|
| 框架 | Astro，静态输出 | 页面默认零 JS，只有表格是交互 island |
| UI | React + shadcn/ui + Tailwind CSS | shadcn/ui 是 React 组件，所以 island 用 React |
| 表格 | TanStack Table | 排序、筛选、搜索 |
| 内容 | Astro Content Collections + Zod | 每个模型一个 Markdown 文件 |
| 语言 | TypeScript，strict | |
| 测试 | Vitest | 至少覆盖评分函数 |
| 部署 | GitHub Actions + GitHub Pages | 自定义域名 `mekiki.fog.moe` |

不需要 Cloudflare Worker。只有在 §7 的 CORS 检查不通过时才考虑。

## 5. 数据

### 5.1 三类数据

| 类别 | 来源 | 存放位置 | 谁维护 |
|---|---|---|---|
| 主观评价 | KC 手写 | `src/content/models/**.md` | KC |
| 外部快照 | 同步脚本拉取 | `data/snapshots/*.json` | GitHub Actions 定时任务 |
| 评分参数 | 配置 | `src/lib/scoring.config.ts` | KC |

### 5.2 模型文件

路径决定 ID：`src/content/models/<provider>/<model>.md` 的规范 ID 是 `<provider>/<model>`，沿用 models.dev 的命名。frontmatter 放结构化字段，正文放长评。

```markdown
---
name: Claude Opus 4.6            # 显示名
vendor: Anthropic
status: active                   # active | legacy（legacy 在首页默认折叠）
sources:                         # 这个模型在各数据源里的 ID，没有就不写
  modelsdev: anthropic/claude-opus-4-6   # 省略时默认等于规范 ID
  aa: <AA 里的 slug>
  arena_text: <Arena 文本榜里的模型名>
subjective:                      # 只能由 KC 填
  score:                         # 0–100，没用过就留空
  verdict:                       # 一句话短评，40 字以内
  pros: []
  cons: []
  best_for: []                   # 标签，如 coding、agent、写作
overrides:                       # 可选，手动覆盖自动数据
  price: { input: 5, output: 25 }
reviewed_at:                     # 最近一次评价日期
---

长评正文，Markdown，显示在详情页。
```

（上面的模型名只是格式示例，实际 ID 以 models.dev 为准。）

要点：

- **`sources` 映射必须显式填写。** 同一个模型在各榜单里的名字不一样，不要用模糊匹配自动对应。同步脚本负责报告哪些映射没对上，并列出候选名，方便 KC 补。
- AA 和 Arena 常把同一模型的不同推理档位列成多个条目，`sources` 指向 KC 实际使用的那个档位。
- 主观分 100 的含义是「KC 认为的当前最强」，和榜单归一化后的 100（当前榜首）是同一把尺。
- `reviewed_at` 超过 90 天的，在页面上标「评价较旧」。

### 5.3 外部数据源

| 源 | 取什么 | 怎么取 | 备注 |
|---|---|---|---|
| models.dev | 价格（输入、输出、缓存读）、上下文长度、发布日期、是否开源权重、模态 | `GET https://models.dev/api.json`，无需 key | 数据按 provider 分组，价格跟着 provider 走，所以 `sources.modelsdev` 带 provider 前缀 |
| Artificial Analysis | 智能指数、编程指数、跑完整套智能指数的总花费 | 免费 API，请求头 `x-api-key` | 必须署名；key 不能出现在前端 |
| Arena（原 LMArena） | 文本榜分数 | Hugging Face 数据集 `lmarena-ai/leaderboard-dataset`，子集 `text`，split `latest`，可用 HF Datasets Server 的 rows 接口取 JSON，无需 key | 按数据集页面标注的许可署名 |

实现时注意：

- AA 文档里目前能看到两套路径：`/api/v2/data/llms/models` 和较新的 `/api/v2/language/models/free`。以 `https://artificialanalysis.ai/data-api/docs` 当天的内容为准，用免费档能访问的那个。
- AA 要求所有档位都署名，页脚放一个指向 `https://artificialanalysis.ai/` 的来源链接即可。Arena 同理，按其许可写来源。
- 每个源一个适配器，接口统一：拉取 → Zod 校验 → 裁剪 → 写快照。以后加榜单只需加一个适配器和一条配置。

### 5.4 快照

每个源一个文件，如 `data/snapshots/aa.json`：

```json
{
  "source": "aa",
  "fetched_at": "2026-11-11T00:00:00Z",
  "frontier": { "aa_intelligence": 70, "aa_coding": 62 },
  "models": {
    "<该源里的模型 ID>": { "aa_intelligence": 68, "aa_coding": 60, "index_cost_usd": 123.4 }
  }
}
```

- 只保留 mekiki 跟踪的模型，加上每个指标的榜首分数 `frontier`（取自该源的全部模型，不只是跟踪的那些）。这样 diff 小，也不会把别人的整份数据搬进仓库。
- 拉取失败、校验失败、或返回的模型数量明显异常时，保留旧快照不覆盖，把原因写进 Actions 的 job summary。

## 6. 评分算法

所有数字都是 `scoring.config.ts` 里的默认值。

### 6.1 智能

对每个榜单指标 s，模型原始分 x 归一化到 0–100：

```
n_s = clamp( 100 × (x − floor_s) / (frontier_s − floor_s), 0, 100 )
```

- `frontier_s`：该指标当前榜首分数
- `floor_s`：指数类（AA 智能指数、编程指数）取 0；Elo 类（Arena）取 `frontier_s − 300`

榜单分是有分数的指标的加权平均，缺的指标不计入、权重重新归一：

```
benchmark = Σ(w_s × n_s) / Σ(w_s)      权重：aa_intelligence 0.5, aa_coding 0.2, arena_text 0.3
```

最终智能分：

| 情况 | intelligence | basis |
|---|---|---|
| 榜单分和主观分都有 | `0.6 × benchmark + 0.4 × subjective` | `both` |
| 只有榜单分 | `benchmark` | `benchmark_only` |
| 只有主观分 | `subjective` | `subjective_only` |
| 都没有 | 空，不参与排序 | `none` |

`basis` 要在页面和 API 里标出来，让人看得出这个分是怎么来的。

### 6.2 成本

价格取 `sources.modelsdev` 对应条目的官方价（单位：美元 / 百万 token），有 `overrides.price` 时用覆盖值。

```
blended    = (3 × input + 1 × output) / 4
cost_index = clamp( 100 × log10(blended / 0.1) / log10(30 / 0.1), 0, 100 )    // blended ≤ 0.1 时为 0
```

- 档位按 `blended` 的绝对值划分（见 §6.4），`cost_index` 只用于算性价比。
- 价格为 0：`cost_index` 为 0，页面显示「免费」。
- 查不到价格：成本和性价比都为空，页面显示「暂无价格」。
- AA 的「跑完整套智能指数的总花费」在详情页作为参考展示，本期不进公式。它比单价更接近真实开销，因为推理型模型会多烧很多 token。

### 6.3 性价比

```
value = intelligence^0.6 × max(100 − cost_index, 5)^0.4
```

几何平均的效果是两头都不能太差：聪明但很贵、便宜但很笨，都拿不到高分。

### 6.4 档位

API 里用英文 key，页面显示中文标签。

| 评级 | 档位（key / 标签 / 条件） |
|---|---|
| 智能 | `top` 最高 ≥ 90　`high` 高 ≥ 75　`mid` 中 ≥ 55　`low` 低 < 55 |
| 成本（按 blended） | `low` 低 < $1　`mid` 中 < $5　`high` 高 < $15　`very_high` 很高 ≥ $15 |
| 性价比 | `top` 最高 ≥ 70　`high` 高 ≥ 60　`mid` 中 ≥ 50　`low` 低 < 50 |

这些阈值是起点。真实数据接入后跑一次 `pnpm report`（§9），把全部模型的分数分布打成表给 KC，由 KC 定最终阈值。

### 6.5 测试用例

下表是用上面的公式实际算出来的，直接当单元测试的 fixture，容差 ±0.1。数据是虚构的，榜首设为：AA 智能指数 70、AA 编程指数 62、Arena 文本 1500。

| 用例 | AA 智能 / 编程 / Arena | 主观 | 价格 入/出 | benchmark | intelligence | blended | cost_index | value |
|---|---|---|---|---|---|---|---|---|
| A 旗舰 | 68 / 60 / 1490 | 95 | 5 / 25 | 96.9 | 96.2 最高 | 10.00 高 | 80.7 | 50.5 中 |
| B 均衡 | 60 / 52 / 1450 | 85 | 1.25 / 10 | 84.6 | 84.8 高 | 3.4375 中 | 62.0 | 61.5 高 |
| C 便宜好用 | 50 / 40 / 1400 | 70 | 0.3 / 2.5 | 68.6 | 69.2 中 | 0.85 低 | 37.5 | 66.4 高 |
| D 超便宜 | 30 / 22 / 1300 | 40 | 0.05 / 0.2 | 38.5 | 39.1 低 | 0.0875 低 | 0 | 56.9 中 |
| E 只有主观分 | 无 | 80 | 3 / 15 | 空 | 80.0 高 | 6.00 高 | 71.8 | 52.7 中 |
| F 缺编程指数、无主观分 | 56 / 无 / 1430 | 无 | 2 / 8 | 78.8 | 78.8 高 | 3.50 中 | 62.3 | 58.6 中 |

## 7. JSON API

全部是构建时生成的静态文件（Astro 的静态 endpoint）。

| 路径 | 内容 |
|---|---|
| `/api.json` | 全量：元信息 + 所有模型的完整评级 |
| `/api/models.json` | 模型名列表：`id`、`name`、`vendor`、`status` |
| `/api/models/<provider>/<model>.json` | 单个模型 |

`/api.json` 的结构：

```json
{
  "version": 1,
  "generated_at": "2026-11-11T00:00:00Z",
  "sources": {
    "aa": { "name": "Artificial Analysis", "url": "https://artificialanalysis.ai/", "fetched_at": "..." }
  },
  "models": [
    {
      "id": "<provider>/<model>",
      "name": "...",
      "vendor": "...",
      "status": "active",
      "intelligence": {
        "score": 96.2, "tier": "top", "label": "最高", "basis": "both",
        "benchmark": 96.9, "subjective": 95,
        "breakdown": { "aa_intelligence": { "raw": 68, "normalized": 97.1 } }
      },
      "cost": {
        "tier": "high", "label": "高", "index": 80.7,
        "blended": 10, "input": 5, "output": 25, "cache_read": 0.5
      },
      "value": { "score": 50.5, "tier": "mid", "label": "中" },
      "verdict": "...",
      "best_for": [],
      "reviewed_at": "2026-11-11",
      "url": "https://mekiki.fog.moe/m/<provider>/<model>"
    }
  ]
}
```

- 分数保留一位小数，缺失值用 `null`，不要省略字段。
- 字段只加不改。有破坏性变更时 `version` 加一。
- 上线后用 `curl -I https://mekiki.fog.moe/api.json` 确认响应带 `Access-Control-Allow-Origin: *`。没有的话，在域名侧加响应头规则，或把 API 单独挪到 Worker。

## 8. 页面

| 路由 | 内容 |
|---|---|
| `/` | 模型总表 |
| `/m/<provider>/<model>` | 模型详情 |
| `/method` | 评分方法、数据来源与署名、各源最近更新时间 |
| `/api` | API 说明和示例 |

**首页表格**：列为模型、厂商、智能、成本、性价比、输入/输出价、短评、评价日期。三个评级列显示档位徽章加分数。支持按任意列排序（默认智能降序）、按厂商/档位/是否开源筛选、按名称搜索。排序和筛选状态写进 URL 查询参数，方便分享某个视图。`legacy` 模型默认折叠。

**详情页**：三个评级；智能分的构成（每个榜单的原始分、归一化分、权重，以及主观分和 `basis`）；价格、上下文长度、发布日期；优点、缺点、适用场景；长评正文；各榜单原始页面的链接。

**通用要求**：

- 视觉以数据表为主体，信息密度参考 models.dev。不要做成营销落地页，不要 hero 区和大渐变标题。
- 深色、浅色都支持，默认跟随系统，可手动切换。
- 380px 宽的手机上可用：表格固定首列横向滚动，或改成卡片列表，二选一。
- 没有数据的地方明确显示「未评」「暂无数据」，不要留空白或显示 0。
- 页脚：数据来源署名（AA、Arena、models.dev）、最近同步时间、GitHub 仓库链接。

## 9. 同步与部署

### 脚本

| 命令 | 作用 |
|---|---|
| `pnpm sync` | 跑所有适配器，更新 `data/snapshots/`；打印每个源里没对上映射的模型和候选名 |
| `pnpm report` | 打印所有模型的各项分数和档位分布，用于校准阈值 |
| `pnpm test` | 单元测试 |
| `pnpm build` | 构建，不联网 |

### 工作流

只用一个 `.github/workflows/deploy.yml`，触发条件：推送到 `main`、每天一次定时、手动触发。

1. checkout，装依赖
2. 仅定时和手动触发时：跑 `pnpm sync`（注入 `AA_API_KEY`），快照有变化就提交并推送
3. `pnpm test`
4. `pnpm build`，上传产物，部署到 GitHub Pages

同步和部署必须在同一次运行里。原因：用默认 `GITHUB_TOKEN` 推送的提交不会触发其他工作流，如果拆成两个工作流，同步后的数据不会自动上线。工作流权限需要 `contents: write`、`pages: write`、`id-token: write`。

Astro 构建和部署步骤的具体写法（官方 action 的版本号等）照 Astro 官方的 GitHub Pages 部署指南。

### 自定义域名

- `public/CNAME` 内容为 `mekiki.fog.moe`
- `astro.config` 里 `site: 'https://mekiki.fog.moe'`，不要设 `base`

## 10. 目录结构

```
mekiki/
├─ src/
│  ├─ content/models/<provider>/<model>.md
│  ├─ lib/
│  │  ├─ scoring.ts            # 纯函数
│  │  ├─ scoring.config.ts     # 全部权重和阈值
│  │  └─ dataset.ts            # 合并内容 + 快照，产出页面和 API 共用的数据
│  ├─ components/              # shadcn 组件、表格 island
│  └─ pages/
│     ├─ index.astro
│     ├─ m/[...id].astro
│     ├─ method.astro
│     ├─ api.astro
│     ├─ api.json.ts
│     └─ api/…                 # models.json 和单模型 JSON
├─ data/snapshots/             # modelsdev.json, aa.json, arena.json
├─ scripts/
│  ├─ sync.ts
│  ├─ report.ts
│  └─ sources/                 # 每个数据源一个适配器
├─ tests/scoring.test.ts
├─ public/CNAME
├─ docs/SPEC.md                # 本文档
└─ .github/workflows/deploy.yml
```

页面和 API 都从 `dataset.ts` 取数，保证两边数字一致。Content Collections 配置文件的位置按当前 Astro 版本的约定。

## 11. 需要 KC 手动做的事

1. 创建公开仓库 `scarletkc/mekiki`
2. 注册 Artificial Analysis 账号，生成 API key，加到仓库 secret `AA_API_KEY`
3. DNS：给 `mekiki.fog.moe` 加 CNAME 记录指向 `scarletkc.github.io`（如果走 Cloudflare，先用仅 DNS 模式，等 GitHub 签好证书）
4. 仓库 Settings → Pages：来源选 GitHub Actions，填自定义域名，开启强制 HTTPS
5. 给出模型清单，填每个模型的 `sources` 映射和主观评价

Claude Code 做完自己的部分后，把这几项列成清单提醒 KC，不要尝试代做。

## 12. 实现顺序和验收

顺序：

1. 项目骨架、内容 schema、评分函数和测试
2. 三个适配器和 `pnpm sync`、`pnpm report`
3. 页面和 JSON API
4. 工作流和部署

验收标准：

- [ ] `pnpm test` 通过，§6.5 的六个用例全部在容差内
- [ ] 断网状态下 `pnpm build` 成功
- [ ] 删掉任意一个快照文件，站点仍能构建，对应数据显示「暂无数据」
- [ ] 新增一个模型只需要新增一个 Markdown 文件
- [ ] `/api.json`、`/api/models.json`、单模型 JSON 都能访问，结构符合 §7
- [ ] 页面和 API 里同一个模型的分数一致
- [ ] 首页表格的排序、筛选、搜索可用，状态能通过 URL 还原
- [ ] 深色和浅色模式正常，380px 宽度下可用
- [ ] 页脚有 AA、Arena、models.dev 的来源署名
- [ ] 仓库里搜不到任何 API key
- [ ] 示例数据的主观字段全部为空
- [ ] README 写清楚：怎么加模型、怎么改权重和阈值、怎么本地跑

## 13. 本期不做

- 给每个模型生成分享用的 OG 图片（发 X 时有用，优先级最高的后续项）
- 分数历史趋势
- RSS 或更新日志
- 多语言
- 更多榜单（如 Arena 的 webdev 榜）
- 用 AA 的总花费数据改进成本算法
