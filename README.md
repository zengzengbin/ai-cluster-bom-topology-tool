# 智算清单和拓扑自动生成工具

> AI Cluster BOM & Topology Auto-Generation Tool

一个纯前端的 B300 等 AI 算力服务器清单与拓扑图自动生成工具。输入硬件配置参数，自动计算所需 GPU 服务器、交换机、Leaf/Spine、存储节点等设备的数量与型号，并绘制算力/带内/带外/存储/统一五张网络的拓扑图。

## 功能特性

- **设备清单（BOM）生成**：基于输入参数自动计算设备数量
- **多视图拓扑图**：
  - 算力网络（Spine-Leaf）
  - 带内管理网
  - 带外管理网
  - 存储网络
  - 统一大拓扑（综合视图）
- **输入参数校验**：自动检查参数合法性
- **响应式布局**：支持桌面与移动端
- **完全本地运行**：无后端依赖，所有计算在浏览器内完成

## 技术栈

- [Vite 7](https://vitejs.dev/) - 构建工具
- [React 19](https://react.dev/) - UI 框架
- [TypeScript 5](https://www.typescriptlang.org/) - 类型系统
- [Vitest](https://vitest.dev/) - 单元测试
- [pnpm](https://pnpm.io/) - 包管理

## 快速开始

### 环境要求

- Node.js 20+
- pnpm 9+

### 安装与运行

```bash
# 安装依赖
pnpm install

# 启动开发服务器（默认 http://127.0.0.1:5173）
pnpm dev

# 运行测试
pnpm test

# 构建生产版本（产物输出到 dist/）
pnpm build

# 本地预览构建产物
pnpm preview
```

## 项目结构

```
.
├── src/                    # 源代码
│   ├── components/         # React 组件
│   ├── lib/                # 核心计算逻辑 + 单元测试
│   ├── styles.css
│   ├── types.ts
│   ├── App.tsx
│   └── main.tsx
├── docs/                   # 项目规范文档
├── 需求文档/                # 原始需求文档
├── AGENTS.md               # 项目协作说明
└── vite.config.ts
```

## 文档索引

- [项目协作说明 (AGENTS.md)](AGENTS.md)
- [需求文档](docs/requirements.md)
- [技术规范](docs/technical-standard.md)
- [设计规范](docs/design-standard.md)
- [算力网络规则](docs/compute-network-rules.md)
- [执行流程](docs/execution-process.md)
- [验收标准](docs/acceptance-standard.md)

## 部署

构建产物在 `dist/` 目录，可部署到任何静态网站托管：

- GitHub Pages
- Vercel
- Netlify
- Cloudflare Pages
- 任意支持静态文件托管的 Web 服务器

也可以直接将 `dist/` 目录打包成 zip 分发给最终用户，本地双击 `index.html` 即可使用（已配置 `base: "./"`，`file://` 协议下也能正常打开）。

## 许可

本仓库目前未指定开源许可证，默认保留所有权利。
