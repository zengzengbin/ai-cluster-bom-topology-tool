# 技术规范

## 基本原则

1. 优先选择简单、可运行、可验证的实现方式。
2. 未经用户批准，不引入复杂后端、数据库、账号系统或部署体系。
3. 每次开发只改动与当前需求直接相关的文件。
4. 功能实现后必须保留可复现的自测方法。
5. 不提交临时文件、调试输出、无用依赖或无关重构。

## 一阶段技术路线

- 框架：Vite + React + TypeScript。
- 运行方式：本地 Vite 网页服务，也可通过 GitHub Pages 发布构建产物。
- 包管理：pnpm。
- 入口：`index.html` -> `src/main.tsx` -> `src/App.tsx`。
- 计算逻辑：集中在 `src/lib/calculate.ts`，单元测试在 `src/lib/calculate.test.ts`。
- 计算网拓扑：集中在 `src/components/ComputeTopologyView.tsx`，通过 `topology.metrics` 读取 `b300`、`cx8`、`pods`、`leaf`、`spine`、`supported`、`virtualDualPlane`、`directSpine`。
- 第一阶段不引入后端、数据库、登录、外部 API。

## 用户输入模型

用户只填写服务器数量和网卡配置，禁止直接填写任何推导接口数：

- `b300`：B300 GPU 服务器数量。
- `flash`：全闪存服务器数量。
- `hybrid`：混闪存服务器数量。
- `mgmtServer`：管理服务器数量。
- `gpuStorageNic`：每台 GPU 服务器的 400G 存储网卡配置，选项为 `1*400G`、`2*400G`、`4*400G`。
- `flashStorageNic`：每台全闪服务器的 400G 存储网卡配置，选项同上。

接入口数、端口数、POD 数和设备数量均由系统内部推导。

## 四网计算规则

### 计算网

- 单台 B300 固定 8 张 CX8。
- B300 数量大于 224 时提示三层组网后续支持，不生成二层清单。
- B300=1-4：双 Spine 直连，不设置 Leaf，Spine 固定 2 台；Spine 横联备注按 `B300 数量 * 8 * 400G` 显示。
- B300=5-128：虚拟双平面。
  - `POD = ceil(B300 / 32)`。
  - Leaf 按 POD 分段汇总。
  - 满编 POD 固定 16 台 Leaf，即 P1/P2 各 8 台。
  - 唯一 POD 或最后一个不足 32 台的 POD：`Leaf = ceil_even(本 POD B300 数量 * 8 * 2 / 32)` 后再向上取 2 的幂。
  - 单 POD Leaf 必须 `<=16`，单平面 Leaf 必须 `<=8`。
  - `Spine = roundUpPowerOfTwo(Leaf / 2)`。
- B300=129-224：物理双平面。
  - `POD = ceil(B300 / 32)`。
  - `Leaf = POD * 16`。
  - `Spine = roundUpPowerOfTwo(Leaf / 2)`。

### 存储网

- `400G接入口 = B300数量 * GPU每台400G接口数 + 全闪数量 * 全闪每台400G接口数`。
- `Leaf = ceil(400G接入口 / 32)` 后向上取偶数。
- `Spine = Leaf / 2` 后向上取 2 的幂。
- 当 `400G接入口 = 0` 时，Leaf 和 Spine 均为 0，不生成存储网接入设备数量。

### 带内管理网

- `服务器总数 = B300数量 + 全闪数量 + 混闪数量 + 管理服务器数量`。
- `25G接口数 = 服务器总数 * 2`。
- 边界交换机、防火墙、带内 border、带内管理核心交换机均固定为 2。
- `带内Leaf = ceil(25G接口数 / 44)` 后向上取偶数。

### 带外管理网

- `带外接口数 = 服务器总数 + 计算网设备数 + 存储网设备数 + 带内网络/安全设备数`。
- `带外接入 = ceil(带外接口数 / 44)`。
- 带外汇聚在接入交换机不大于 48 时固定为 2；超过时页面提示需要关注汇聚型号。

## 计算网清单与拓扑同源要求

1. `calculateCompute()` 是计算网清单和拓扑数量的唯一来源。
2. 清单中的 Leaf 总数、Spine 总数、POD 数必须通过 `topology.metrics` 传递给拓扑组件。
3. 拓扑组件允许按 POD 重新拆分展示，但拆分规则必须与 `calculateCompute()` 一致。
4. B300=5-128 时，拓扑每个 POD 的 Leaf 数不得超过 16；不能把全局补齐的 Leaf 追加到已满 16 台的 POD。
5. B300=129-224 时，拓扑每个 POD 固定 16 台 Leaf，P1/P2 各 8 台。
6. 清单计算依据文案必须直接说明 Leaf 口径，推荐文案：`Leaf 按 POD 分段汇总：满编 POD=16 台 Leaf；唯一/最后 POD 按剩余 B300 的 CX8*2/32 计算后向上取 2 的幂；单 POD≤16，单平面≤8。`

## 统一大拓扑

统一大拓扑由 `src/lib/topology.ts` 的 `overviewTopology()` 和相关 view model 生成，只表达整体关系，不改变四张独立网络的设备数量公式。

- 计算网：仅 B300 计算网卡参与。
- 存储网：B300 与全闪服务器的 400G 存储网卡参与。
- 带内管理网：B300、全闪、混闪、管理服务器的带内管理口参与。
- 带外管理网：四类服务器 BMC 以及网络/安全设备管理口参与。

## 自测命令

```powershell
# 计算自测
pnpm test
# 类型检查与生产构建
pnpm build
# 本地服务
pnpm dev
```

正式交付入口为项目根目录 Vite 应用，访问地址默认为 `http://127.0.0.1:5173/`。

## 计算网重点自测用例

- B300=1：双 Spine 直连，Leaf=0，Spine=2，Spine 横联显示 `8*400G`。
- B300=4：双 Spine 直连，Leaf=0，Spine=2，Spine 横联显示 `32*400G`。
- B300=5：虚拟双平面，POD=1，Leaf=4，Spine=2。
- B300=28：虚拟双平面，POD=1，Leaf=16，Spine=8。
- B300=33：虚拟双平面，POD=2，Leaf=18，Spine=16。
- B300=51：虚拟双平面，POD=2，Leaf=32，Spine=16；拓扑中任一 POD Leaf 不得超过 16。
- B300=65：虚拟双平面，POD=3，Leaf=34，Spine=32。
- B300=81：虚拟双平面，POD=3，Leaf=48，Spine=32。
- B300=97：虚拟双平面，POD=4，Leaf=50，Spine=32。
- B300=128：虚拟双平面，POD=4，Leaf=64，Spine=32。
- B300=129：物理双平面，POD=5，Leaf=80，Spine=64。
- B300=138：物理双平面，POD=5，Leaf=80，Spine=64。
- B300=225：提示三层后续支持，不生成错误二层结果。

## 实现汇报要求

每次汇报必须包含：

- 已实现的需求点。
- 修改或新增的文件。
- 自测方式。
- 自测结果。
- 已知问题和未覆盖风险。
