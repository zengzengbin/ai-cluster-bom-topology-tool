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
├── development-logs/       # 按天维护的开发日志
├── scripts/                # 本地辅助脚本
├── AGENTS.md               # 项目协作说明
└── vite.config.ts
```

## 文档索引

- [项目协作说明 (AGENTS.md)](AGENTS.md)
- [开发需求](docs/requirements.md)
- [技术规范](docs/technical-standard.md)
- [设计规范](docs/design-standard.md)
- [算力网络规则](docs/compute-network-rules.md)
- [执行流程](docs/execution-process.md)
- [验收标准](docs/acceptance-standard.md)
- [开发日志目录](development-logs/)

## 开发日志规则

开发日志统一放在仓库根目录 `development-logs/` 下，与 `docs/` 同级。日志按天命名，例如 `2026-07-05.md`；同一天继续开发时刷新当天文件，不重复新建同日多份日志。

## 部署与分享

构建产物在 `dist/` 目录，可部署到任何静态网站托管：

- GitHub Pages
- Vercel
- Netlify
- Cloudflare Pages
- 任意支持静态文件托管的 Web 服务器

### 在线分享

优先推荐直接分享 GitHub Pages 在线地址，使用者无需安装任何环境。

### 离线分享

不建议让使用者直接双击 `dist/index.html`。部分浏览器会限制 `file://` 下的 JavaScript 模块加载，导致页面空白。

离线分发建议：

1. 在项目根目录执行 `pnpm build`，生成 `dist/`。
2. 将 `scripts/start-local.bat` 复制到 `dist/` 目录内。
3. 将整个 `dist/` 目录压缩成 zip 发给使用者。
4. 使用者解压后进入 `dist/`，双击 `start-local.bat`。
5. 脚本默认使用 `http://127.0.0.1:8765/` 打开工具。

如 8765 端口被占用，可在命令行中进入 `dist/` 后执行：

```bat
start-local.bat 8766
```

离线脚本依赖使用者电脑已安装 Python 3；如没有 Python，建议改用在线地址访问。

## 许可

本仓库目前未指定开源许可证，默认保留所有权利。
