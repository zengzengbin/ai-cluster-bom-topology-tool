# 技术规范

## 基本原则

1. 优先选择简单、可运行、可验证的实现方式。
2. 未经用户批准，不引入复杂后端、数据库、账号系统或部署体系。
3. 每次开发只改动与当前需求直接相关的文件。
4. 功能实现后必须保留可复现的自测方法。
5. 不提交临时文件、调试输出、无用依赖或无关重构。

## 一阶段技术路线

- 框架：Vite + React + TypeScript。
- 运行方式：本地 Vite 网页服务。
- 包管理：pnpm。
- 入口：`index.html` -> `src/main.tsx` -> `src/App.tsx`。
- 计算逻辑：集中在 `src/lib/calculate.ts`，单元测试在 `src/lib/calculate.test.ts`。
- 拓扑：React 内 SVG 渲染，不引入外部图形库。
- 第一阶段不引入后端、数据库、登录、外部 API。

## 用户输入模型

用户只填写服务器数量和网卡配置（禁止直接填写任何推导接口数）：

- `b300`：B300 GPU 服务器数量。
- `flash`：全闪存服务器数量。
- `hybrid`：混闪存服务器数量。
- `mgmtServer`：管理服务器数量。
- `gpuStorageNic`：每台 GPU 服务器的 400G 存储网卡配置，选项为 `1*400G`、`2*400G`、`4*400G`。
- `flashStorageNic`：每台全闪服务器的 400G 存储网卡配置，选项同上。

接入口数、端口数、POD 数和设备数量均由系统内部推导，不要求用户填写。
存储网换算公式：`400G接口数 = B300 * gpuStorageNic + flash * flashStorageNic`。

## 四网计算规则

### 计算网

- 单台 B300 固定 8 张 CX8。
- B300 数量大于 224 时提示三层组网后续支持，不生成二层清单。
- B300 数量为 2 的幂次方时按虚拟双平面：
  - `Leaf = B300 / 2`
  - `Spine = Leaf / 2`
- B300 数量不是 2 的幂次方时按物理双平面：
  - `POD = ceil(B300 / 28)`
  - `Leaf = POD * 16`
  - `Spine = ceil(POD * 12.8)`

### 存储网

- `400G接入口 = B300数量 * GPU每台400G接口数 + 全闪数量 * 全闪每台400G接口数`
- `Leaf = ceil(400G接入口 / 32)` 后向上取偶数。
- `Spine = Leaf / 2` 后向上取 2 的幂。
- 当 `400G接入口 = 0` 时，Leaf 和 Spine 均为 0，不生成存储网接入设备数量。

### 带内管理网

- `服务器总数 = B300数量 + 全闪数量 + 混闪数量 + 管理服务器数量`
- `25G接口数 = 服务器总数 * 2`
- 边界交换机、防火墙、带内 border、带内管理核心交换机均固定为 2。
- `带内Leaf = ceil(25G接口数 / 44)` 后向上取偶数。

### 带外管理网

- `带外接口数 = 服务器总数 + 计算网设备数 + 存储网设备数 + 带内网络/安全设备数`
- `带外接入 = ceil(带外接口数 / 44)`
- 带外汇聚在接入交换机不大于 48 时固定为 2；超过时页面提示需要关注汇聚型号。

## 统一大拓扑

第一阶段统一大拓扑由 `src/lib/topology.ts` 的 `overviewTopology()` 独立生成，不直接嵌入四张子拓扑。

- 目标是表达服务器资源池、计算网、存储网、带内管理网、带外管理网、出口与安全之间的整体关系。
- 四张独立网络拓扑由各自计算模块生成，统一大拓扑只做总览，不追求与专业制图软件等价。
- 后续如要把四张子拓扑嵌入同一画布，需要先设计全局唯一节点 id 和 link 端点改写规则，避免 React key 冲突。

## 拓扑实现（v2 重构后）

本轮按 `docs/design-standard.md` 中"拓扑专项设计规范"重写。实现位置与职责：

- 5 个变体全部集中在 `src/components/TopologyDiagram.tsx`：
  - `ComputeTopology`：Spine 区 + Leaf 区（按 POD 分组）+ 服务器 8 张 CX8 网卡条 + P1/P2 双平面。
  - `StorageTopology`：Spine 层 / Leaf 层 / 服务器接入层 3 层，400G 互联使用青色。
  - `InbandTopology`：安全出口区 + Border/Core/Leaf 层 + 服务器 25G 接入区。
  - `OobTopology`：OOB 汇聚 + OOB 接入 + 服务器 BMC 与网络/安全设备管理口。
  - `OverviewTopology`（`viewBox 1320x880`）：纵向四分区（安全出口 / 带外 / 存储+带内 / 计算 ROCE）+ 右侧颜色/速率图例 + 底部"服务器典型网卡配置"说明框。
- 所有 SVG class 与 `src/styles.css` 严格对齐（约 40+ 个 class：`.zone` / `.zone-{storage,security,inband,oob,compute}` / `.plane-p1` / `.plane-p2` / `.leaf-p1` / `.leaf-p2` / `.pod-label` / `.server-base` / `.server-label` / `.switch-icon` / `.switch-{blue,cyan,silver,green,orange}` / `.network-line` / `.legend-text` / `.topology-title-large` / `.detailed-topology` / `.zone-warning` 等）。
- 每个变体接收 `Topology` 对象的 `metrics` 字段（来自 `makeTopology()` 的第 5 个参数），从中读取 `b300` / `cx8` / `pods` / `leaf` / `spine` / `ports400` / `access` / `supported` 等派生量；`supported=false` 时显示警告区，不生成错误节点。
- 移动端：所有 SVG 包在 `.topology-scroll`（`overflow-x: auto`）里，独立拓扑最小逻辑宽度 1100px、统一大拓扑 1320px，移动端横向滚动可见。

## 端口与状态行为

- 存储网 `400G接入口 = 0`：`calculateStorage()` 返回 1 条 `BomItem`，产品名 `存储网未配置提示`，`quantity = "暂不生成"`，`sequence = "-"`；同时 `topology.metrics.supported = false`，`StorageTopology` 显示"未配置 400G 存储网卡"提示区。
- 计算网 `B300 > 224`：`calculateCompute()` 返回 1 条 `BomItem`，产品名 `二层组网超限提示`，`quantity = "暂不生成"`；`ComputeTopology` 显示"B300 数量超过 224 台"提示区，附"第一阶段不生成二层计算网拓扑，三层网后续支持"。
- 虚拟双平面 `B300=128`：计算网 `summary.POD = 4` 是为表达分组结构，**并非物理 POD 位置**；拓扑底注明确写"虚拟双平面下 POD 表示抽象分组，不代表物理 POD 位置"。
- 带外接入 `> 48`：`topology.metrics.accessOverflow=true`，`OobTopology` 在汇聚层右上角显示"需关注型号"标签。
- 计算 / 存储 / 带内 / 带外清单的 `sequence` 仍按网络独立编号（计算 1-8、存储 1-7 或 1 条 info、带内 13-24、带外 25-31），未做全局统一编号。

## 4 + 1 同页渲染

- `src/App.tsx` 不再使用 tab 切换；4 张独立拓扑 + 1 张统一大拓扑在同一页面按顺序排列：
  1. 计算网拓扑
  2. 存储网拓扑
  3. 带内管理网拓扑
  4. 带外管理网拓扑
  5. 统一大拓扑
- 每张图独立 `.topology-card` 容器；输入区参数变更通过 `useMemo` 实时刷新所有清单和拓扑。
- 顶部 hero 简化为 3 个 metric 卡片（B300 台数 / 总服务器 / 存储接口），清单区按 4 网分 4 张 `topology-card` 表格。

## Playwright 验证方法

本轮自测使用**临时 inline Playwright 脚本**（依赖 `_archive/programmer-app-2026-07-01/node_modules/playwright/` 包路径），脚本不作为项目文件保留，运行后立即删除。`screenshots/` 目录是验收证据，按经理指示保留；dev server 的 stdout/stderr 重定向到 `NUL`，避免根目录出现 `dev-*.log`。

自测要点（与 `_archive` 中的 playwright 包路径一致时可直接复用，未保留时按以下要点写新脚本）：

- 启动 dev server：`pnpm dev --port 5181`（重定向到 NUL 即可，无需写 dev-*.log）。
- 脚本核心校验：
  - 默认用例（B300=128 / 全闪=8 / 混闪=16 / 管理=8 / GPU NIC=2 / 全闪 NIC=2）下访问 `http://127.0.0.1:5181/`。
  - 捕获 `console` 与 `pageerror`，断言无 `error` / `warning`。
  - 截 3 张：默认全页、计算网区、统一大拓扑区；写入 `screenshots/`。
  - 视口断言：1440 桌面无 `document.documentElement.scrollWidth > 1440`。
  - 移动端（视口 375）下页面无整页横向溢出，拓扑容器允许内部横向滚动。
- 关键用例视觉验收：
  - `B300=128`：计算网虚拟双平面，Leaf 64、Spine 32、每台 8×CX8、POD 4（底注写"虚拟双平面下 POD 表示抽象分组"）。
  - `B300=138`：计算网物理双平面，POD 5、Leaf 80、Spine 64。
  - `B300=225`：计算网走 `zone-warning` 状态，"二层组网超限提示"，不展示错误二层 Leaf。
  - `ports400=0`（GPU NIC 与全闪 NIC 都为 0）：存储网清单 1 条 info 行，存储网拓扑显示"未配置 400G 存储网卡"提示区。
- 根目录禁止留存 `dev-*.log` / `inspect*.mjs` / `screenshot-*.mjs` 等临时验证文件，必要时写入 `_archive`；`screenshots/` 作为验收证据保留。

## 实现汇报要求

每次汇报必须包含：

- 已实现的需求点。
- 修改或新增的文件。
- 自测方式。
- 自测结果。
- 已知问题和未覆盖风险。

## 自测命令

```powershell
# 计算自测
pnpm test
# 类型检查与生产构建
pnpm build
# 本地服务
pnpm dev
```

正式交付入口为项目根目录 Vite 应用，访问地址默认为 `http://127.0.0.1:5173/`。`app/` 目录不是交付入口，若保留仅作为历史归档。

自测必须覆盖：

- B300=128：计算网虚拟双平面，Leaf=64，Spine=32。
- B300=138：计算网物理双平面，POD=5，Leaf=80，Spine=64。
- GPU=128，全闪=8，GPU 与全闪均为每台 2*400G：存储接入口=272，Leaf=10，Spine=8。
- GPU=128，全闪=8，混闪=16，管理=8：带内 25G 接口=320，带内 Leaf=8。
- B300>224：提示三层后续支持，不生成错误二层结果。




## 拓扑实现 v3 整改（按用户 7 条浏览器批注）

v3 在 v2 基础上专门修复 7 条浏览器批注，未改清单计算规则。

### viewBox 与容器策略

- 计算网采用动态 `viewBox` 宽度：至少 1100px，`pods <= 5` 时完整展示所有 POD；POD 数更多时展示代表 POD 并允许容器内横向滚动。
- 存储网采用 `viewBox="0 0 1100 680"`，用于展示 Spine/Leaf 代表节点和两类服务器接入区。
- 带内、带外仍沿用 800px 级逻辑画布；统一大拓扑 `viewBox="0 0 1100 880"`。
- 移动端（< 900px）启用 `.topology-scroll { overflow-x: auto }`，允许容器内部横向滚动兜底。

### 5 个拓扑组件设计要点

- `ComputeTopology`：`SpinePair`（P1/P2 两台一组）置顶；`pods <= 5` 时完整展示所有 POD（B300=138 时显示 POD1~POD5），`pods > 5` 时展示代表 POD；每个 POD 内含 P1/P2 `LeafPair` + 3 个代表 `ServerNodeWithNics`。POD 按 32 台服务器容量表达，并标注每 POD 16 台 Leaf（P1/P2 各 8 台）；末组不足 32 台时直接标注“末组不足 32 台，Leaf 仍按 16 台配置”。物理双平面下增加 Spine 逃生链路视觉标注：“双平面对应 Spine 间 8×400G”。B300 > 224 时整个 `ComputeTopology` 替换为 `zone-warning`。
- `StorageTopology`：按 `Spine 层 -> Leaf 层 -> 服务器接入层` 重画为 1100×680 画布；Spine 使用 `Spine1 / Spine2 / Spine… / SpineN` 代表节点，Leaf 使用 `Leaf1 / Leaf2 / Leaf… / LeafN` 代表节点；服务器接入区拆成 `GPU 服务器接入区` 与 `全闪存储服务器接入区`，直接标注各自 400G 接入口贡献和合计 400G 接入口数量。链路使用 `NetworkPaths` 折线，表达 400G Server-Leaf 与 Spine-Leaf 关系。
- `InbandTopology`：安全出口区 + 带内核心（Border/Core） + 带内接入 Leaf + 服务器 25G 接入区。服务器接入层用 4 个 `ServerGroup` 按 `GPU / 全闪 / 混闪 / 管理` 分组，Leaf-Core 和 Leaf-Server 链路使用折线。
- `OobTopology`：OOB 汇聚 + OOB 接入 + 管理口源区。管理口源区用 4 个 `ServerGroup` 按 `GPU BMC / 全闪混闪 BMC / 管理服务器 BMC / 网络设备` 分组，服务器分组下移避免压住区域标题，接入链路使用折线。
- `OverviewTopology`：6 项 Legend + 5 个 zone，横向安全链路在 `zone-security` 内按 `边界交换机 (silver) → 防火墙 (orange) → Border (cyan) → 带内核心 (silver) → 带内接入 (green)` 串联；其他 zone 为带外管理、存储/带内管理网络、计算网络 ROCE、服务器池。

### POD 展示规则

- `pods <= 5`：画所有 POD，默认 B300=128 / POD=4 时显示 POD1~POD4，B300=138 / POD=5 时显示 POD1~POD5。
- `pods > 5`：画 POD1、POD2、PODn（n=pods）代表框 + 省略号表达中间 POD。
- 每个 POD 按 32 台服务器容量表达；物理双平面末组不足 32 台时保留完整 Leaf 配置，并在 POD 内标注不足组信息。
- B300=128 虚拟双平面下 POD=4 属于"抽象分组"含义，底注明确写"虚拟双平面下 POD 表示抽象分组"，避免用户误读为物理分组。

### 链路颜色约定（与 Legend 一致）

- `#6ea8fe` 蓝色：计算网代表连线。
- `#00a7e1` 青色：400GE 存储 / 计算。
- `#5b8f33` 绿色：25GE 带内接入。
- `#7c2dd6` 紫色：40GE Border 互联。
- `#f0aa00` 橙色：100GE 上联 / 出口。
- `#f04d4d` 红色：GE 带外。

### 边界遵守

- 清单计算规则（`src/lib/calculate.ts` 主体函数）未动，只在 `metrics` 上增加 `b300 / allFlash / hybrid / management` 透传字段供 UI 分组。
- `types.ts` / `src/lib/topology.ts` / `math.ts` / `products.ts` / `App.tsx` / `InputPanel.tsx` / `BomTable.tsx` 全部未改。
- 未引入导出、保存、账号、数据库。
- `screenshots/` 与 `_archive/` 未动。
- 5173 旧 dev server 仍占用，本轮起 5181 为正式验收入口。

### 自测要点（v3 浏览器批注修复）

- 视口 790 / 1440 / 390 三档下 `document.documentElement.scrollWidth === window.innerWidth`（无整页横向溢出）。
- `console` 与 `pageerror` 计数 0。
- B300=128：计算网显示虚拟双平面、Leaf 64、Spine 32、4 个 POD 框（POD1~POD4 完整显示）、8×CX8 表达。
- B300=138：计算网显示物理双平面、POD 5、Leaf 80、Spine 64、POD1~POD5 完整展示，并在最后一组标注不足 32 台但 Leaf 仍按 16 台配置。
- B300=225：计算网被 `zone-warning` 替代，文案"超过 224 台，三层组网后续支持"，无错误二层 Leaf。
- 存储网在 b300=128 / 2*400G 时显示 `128 台 × 2 = 256 口`，全闪显示 `8 台 × 2 = 16 口`，合计 400G 接入口 272 个。
- 统一四网安全链路顺序按 `边界交换机 → 防火墙 → Border → 带内核心 → 带内接入` 串联，Legend 同步显示 6 项。

## 拓扑实现 v5 计算网三层带状重构（用户反馈「2 层设备不美观」）

v5 在 v3 基础上把**计算网**重新组织为 3 条独立横向带（参考 `ajchai/aidc-topology` 工程化分层拓扑与用户提供的第二张参考图）。本轮只动计算网，存储/带内/带外/统一大拓扑保持 v3 状态。

### 目标

- 把"POD 框内同时装 Leaf 和 Server"的两层堆叠改成 3 条独立横向带：**Spine 带 / Leaf 带 / POD 带**。
- POD 带只装服务器，Leaf 带与 POD 带解耦。
- 每 POD 16 台 Leaf 严格按 L1 平面 8 台 + L2 平面 8 台表达，编号 `L1-1..L1-8` / `L2-1..L2-8`，4 个 POD 各自独立编号。
- 服务器代表节点选择 `[首, 二, 末]`（与参考图 2 范本 `1 / 2 / 32` 一致），替代 v3 的 `[首, 中, 末]`。

### viewBox 布局

```
y = 30 .. 230    Spine 带（整行虚线框）
y = 280 .. 500   Leaf 带（整行虚线框）
y = 540 .. 920   POD 带（每 POD 独立虚线框）
y = 920 .. 970   底部图例（蓝实线 / 紫虚线 / B300 摘要）
canvasW = max(1900, 1200)   // 3 POD 场景 1920×970
```

`canvasH = 970` 固定。

### Leaf 带压缩显示策略

- 每个 POD 可见 3 对叶块：`[L1-1, L2-1, L1-2, L2-2, ..., L1-8, L2-8]`，分别位于 POD 宽度的 0.2 / 0.5 / 0.8 处。
- 4 个 POD 各自独立编号（不跨 POD 累加）。
- POD 数量 > 2 时只画 `[POD1, POD2, ..., PODn]` 三个代表 POD，中间用 `gap` 单元 + `省略 X 个 POD` 标识压缩。

### Spine → Leaf → Server 链路

- Spine → Leaf：**全网状**贝塞尔曲线（每条 visible Spine ↔ 每个 visible Leaf 一条）。
- Leaf → Server：每个 Leaf 在其 POD 内扇出到 3 个 server 节点。
- VRF 逃生弧：仅 `virtualDualPlane=true` 时从首 Spine 划到末 Spine 的紫色虚线弧 + 标签。
- 贝塞尔控制点 `offset = |y2-y1| * 0.5`，连线 `opacity 0.45` / `strokeWidth 1`。

### POD 框

- 每 POD 用 `rect.pod-frame` 独立虚线框，**只装服务器**：3 个 `ServerNodeWithNics`（8×CX8 彩色 NIC 条）+ 头部 POD 标签 + 右上小计 `X 台 / 8xCX8` + 底部说明（起始服务器号 + 满组/末组标识）。
- 不再在 POD 框内堆 Leaf。

### 服务器代表节点选择：首 / 二 / 末

- 第 1 节点 = `start`
- 第 2 节点 = `actualServers > 1 ? min(end, start + 1) : start`
- 第 3 节点 = `end`

B300=128 默认 POD1 显示 1 / 2 / 32；B300=138 POD5 末组显示 129 / 130 / 138。同步清理 `PodLayout.mid` 字段，全部替换为 `second`。

### SVG class 复用

- `SpinePair({x, y, label})`：P1 灰 + P2 橙 + `plane-dashed` 外框 + P1/P2 文字 + 副标签。
- `LeafBlock({x, y, plane, label})`：单块，plane 1 红 / plane 2 黄，标签 `L1-1` / `L2-8` 等。
- `ServerNodeWithNics({x, y, label})`：8 色 NIC 条 + 灰底 + 服务器编号。
- 复用 v3 的 `.plane-p1` / `.plane-p2` / `.plane-dashed` / `.plane-text` / `.leaf-p1` / `.leaf-p2` / `.leaf-text` / `.pod-label` / `.server-base` / `.server-label` / `.nic-text` 样式，未新增 class。

### 边界遵守

- `src/lib/calculate.ts` / `src/lib/topology.ts` / `src/types.ts` / `App.tsx` / `InputPanel.tsx` / `BomTable.tsx` / `styles.css` / `_archive/` / `screenshots/` 全部未动。
- 存储/带内/带外/统一大拓扑未动。
- 未引入导出、保存、账号、数据库。

### 自测要点

- `pnpm test`：8/8 PASS。
- `pnpm build`：成功。
- Playwright 视口 1280 三档截图（`scripts/verify-v5.mjs` 或 `_archive/programmer-app-2026-07-01/verify-v5.mjs`）：
  - B300=128 虚拟双平面：viewBox 1920×970，3 个 POD 框，9 个 leaf-p1 + 9 个 leaf-p2 + 9 个服务器节点，叶块含 `L1-1 / L2-1 / L1-2 / L2-2 / L1-8 / L2-8` 标签，POD 框内只装服务器，含 VRF 逃生弧。
  - B300=138 物理双平面：POD 编号到 POD5，末组 10 台，服务器节点 129/130/138，无 VRF 弧。
  - B300=225：渲染为 warning 区 `"B300 数量超过 224 台 / 第一阶段不生成二层计算网拓扑，三层组网后续支持"`，无二层拓扑。
- 桌面 1280 / 1440 视口下 `documentElement.scrollWidth === window.innerWidth`（无整页横向溢出）；移动 390 至少无整页溢出，拓扑容器允许内部横向滚动。
- `console` / `pageerror` 计数 0。

## 存储网拓扑当前画法补充（2026-07-02）

- 存储网拓扑继续表达 `Spine -> Leaf -> GPU/全闪服务器接入` 三层关系，但交换机节点风格应与计算网工业设备块保持一致：矩形设备、顶部面板、底部端口点、居中设备名。
- 存储网服务器代表节点不再复用计算网 `8xCX8` 网卡条；应按实际每台存储网卡配置绘制 `1/2/4` 条 400G 端口。
- 默认 `GPU=128 / 全闪=8 / 两类均 2*400G` 时，代表服务器显示 `GPU1/GPU2/GPU128` 和 `Flash1/Flash2/Flash8`，每台只显示 `1/2` 两个 400G 存储端口。
- 当存储网卡配置为 `1*400G` 时，每台代表服务器只显示 `1` 个 400G 端口。
- 存储网链路采用代表性规整连线，不要求画满全部物理链路；图中保留 Spine-Leaf 与 Leaf-Server 两类颜色区分。
- 存储网视觉风格应避免大面积深色横条；分区使用轻量虚线框、细竖向强调线和普通标题文字，整体参考计算网拓扑的克制设备块风格。
- 存储网代表连线规则：每台代表服务器按 `portsPerServer` 条上联线分散连接不同 Leaf；不同代表服务器继续错开 Leaf 目标；每个代表 Leaf 再用 2 条代表线上联到不同 Spine，表达“Leaf 32 条上联平均分布到各 Spine”的逻辑。

## 统一大拓扑数据来源与显示规则（2026-07-03）

### 数据来源

1. 统一大拓扑不再使用无输入静态 SVG；统一改为 `calculateAll()` 汇总 overview 专用 metrics，再由 `overviewTopology(metrics)` 和 `buildOverviewTopologyViewModel(metrics)` 渲染。
2. overview metrics 只保留统一图所需的最小字段，不复用四张子拓扑的布局结果：
   - 服务器分组数量：`b300`、`allFlash`、`hybrid`、`management`
   - 状态字段：`computeSupported`、`storageEnabled`
   - 存储参与条件：`gpuStoragePortsPerServer`、`allFlashStoragePortsPerServer`
   - 设备数量：`computeLeaf`、`computeSpine`、`storageLeaf`、`storageSpine`、`inbandLeaf`、`inbandCore`、`inbandBorder`、`exitSwitches`、`firewalls`、`oobAccess`、`oobAggregation`、`oobManagedDeviceCount`
   - 来源布尔：`computeFromB300`、`storageFromB300`、`storageFromAllFlash`、`inbandFrom*`、`oobFrom*`
3. overview metrics 由四张独立网络的已有计算结果派生，只做统一图表达汇总，不改变四张独立网络的设备数量公式。

### 服务器为源的统一逻辑

1. 统一大拓扑按“服务器源区 -> 四网分流 -> 安全出口区”的逻辑组织。
2. 服务器源区固定表达四类服务器分组：
   - `B300 GPU 服务器`
   - `全闪服务器`
   - `混闪服务器`
   - `管理服务器`
3. 四张网络的来源关系固定如下：
   - 计算网：仅 `B300` 服务器计算网卡参与
   - 存储网：仅 `B300 + 全闪` 服务器的 400G 存储网卡参与
   - 带内管理网：`B300 + 全闪 + 混闪 + 管理` 服务器的带内管理口参与
   - 带外管理网：上述四类服务器的 `BMC` 参与，同时额外纳入 `网络/安全设备管理口`
4. 安全出口区只表达带内主链路的出口关系，不作为四张网络共同源头；带外管理口不再画成通往 ISP 的业务主路径。
5. 统一图链路继续使用代表性表达，不展开完整全互联。

### disabled 与 warning 显示规则

1. `storageEnabled=false` 时：
   - 统一图存储网区域显示 `未配置 400G 存储网卡`
   - 不绘制存储网 Spine / Leaf
   - `storageSources` 为空
2. `computeSupported=false` 时：
   - 统一图计算网区域显示 `二层计算网本阶段不生成`
   - 不绘制计算网 Spine / Leaf
   - `computeSources` 为空
3. 服务器分组数量为 `0` 时，该分组在服务器源区隐藏，且不参与 overview source links。
4. 带外管理对象固定包含：
   - `服务器 BMC`
   - `网络/安全设备管理口`

### 参考图直排细化（2026-07-03）

1. 统一大拓扑在保持 overview metrics 驱动的前提下，版式直接参考用户提供的大拓扑图：左上图例、上中偏左安全出口区、中右带内管理网、中上服务器源区、下方计算网/存储网/带外管理网；安全出口区框外不再渲染顶部蓝线和 ISP 云。
2. 服务器源区不再只画“服务器盒子”，而是必须显式绘制网卡分组；其中计算网卡、存储网卡放在服务器卡片下侧，链路从下侧 NIC 锚点向下连接对应网络的 Leaf：
   - `B300 GPU 服务器`：`8` 个计算网卡、`2` 个存储网卡、`2` 个带内网卡、`1` 个带外网卡
   - `全闪服务器`：`2` 个存储网卡、`2` 个带内网卡、`1` 个带外网卡
   - `混闪服务器`：`2` 个带内网卡、`1` 个带外网卡
   - `管理服务器`：`2` 个带内网卡、`1` 个带外网卡
3. 带外网卡与计算/存储网卡一起放在服务器卡片下侧，链路从服务器下侧接入右下方 OOB 接入层；带内网卡可继续放在服务器卡片上侧，用于表达向右接入带内管理网络。
4. overview source links 的数据职责仍只负责“谁连到哪张网”，但渲染层必须保证线从对应 NIC 锚点出发，而不是从服务器卡片中心或安全出口区起线。
5. 为避免文字压线，统一图优先靠形状和布局传达逻辑；解释性辅助文案只在不干扰主图识读时保留。
6. 安全出口区只包含 `边界交换机 -> 防火墙 -> BORDER` 三层，整体向左布置；`Core1/Core2` 归入带内管理网区域，`Core -> Border` 链路按实际布局从带内区回连到 BORDER。
7. 带外管理网布置在服务器源区下方右侧；OOB 接入层位于上方并标注 `OOB接入`，OOB 汇聚层位于下方并可保留横联，OOB 接入交换机之间不画横联线。
8. 安全出口区与带内管理网整体上移到服务器源区上方，避免压住服务器源区和下方计算/存储/OOB 链路。
9. 当全闪服务器和混闪服务器均为 0 时，统一图不渲染服务器源区左侧的“参数导入、参数存储”辅助弧线和文字。
10. 当 `computeLeaf=0` 且 `computeSpine>0` 时，统一图计算网区域不画 Leaf，Spine 上移到原 Leaf 视觉高度，`B300-compute` 来源线直接连到代表 Spine。
11. 安全出口区标题由渲染层在区域顶部横排输出，禁止继续使用右侧旋转标题。
12. `Border -> Core` 使用双归代表链路：`BRD1/BRD2` 分别连接 `Core1/Core2`，模型层生成 4 条 `border-core-*` internal links；路径起点使用 Border 下联端口分布点，终点使用 Core 上联端口分布点。
13. 带内管理网副标题由渲染层放到区域右上角，避免与 Core 设备、Core 外框和橙色 Border-Core 链路重叠。
14. 带内来源线使用服务器上侧带内网卡锚点，并将折线路由到服务器源区上方后再接入带内 Leaf，避免穿过服务器卡片。
15. 服务器源区辅助弧线 `showServerSourceCallout` 只在全闪服务器实际存在时显示；`allFlash=0` 时必须隐藏“参数导入、参数存储”文字和 `.overview-callout-curve`。
