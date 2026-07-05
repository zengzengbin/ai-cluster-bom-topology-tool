# 项目协作说明

本项目采用“小步推进、先规划后执行、实现后自测、负责人自验、用户最终确认”的工作方式。

## 标准文件路径

- 开发需求：`docs/requirements.md`
- 技术规范：`docs/technical-standard.md`
- 设计规范：`docs/design-standard.md`
- 算力网络规则：`docs/compute-network-rules.md`
- 执行步骤：`docs/execution-process.md`
- 验收标准：`docs/acceptance-standard.md`
- 每日开发日志：`development-logs/YYYY-MM-DD.md`

## 工作规则

1. 不一次性推进过多内容，每次只处理一个可验证的小阶段。
2. 收到多条批注或多项修改要求时，必须分步骤处理；先明确本轮只处理哪一小组问题，完成实现、自测和汇报后，再进入下一组。
3. 先形成方案并向用户汇报；需求明确且风险可控时，可以直接实现。
4. 每次实现或设计调整完成后，必须自测，并汇报实现内容、涉及文件、自测方式、自测结果和遗留风险。
5. 只有用户批准验收通过，当前阶段才算暂时结束。
6. 所有开发事项和待办事项记录到当天开发日志。
7. 修改技术路线、设计规范、执行流程或验收标准时，先更新 `docs` 下对应标准文件，再执行具体工作。
8. 直接修改实现文件后，必须说明修改范围、自测方式、自测结果和遗留风险。
9. 验收不通过时，必须明确整改项、影响范围、验证方式，并继续推进到可验证结果。

## 计算网规则协作要求

1. 涉及 B300/POD/Leaf/Spine 规则时，先确认适用范围，例如 1-4、5-128、129-224 或超出 224，不得把某一段规则误扩展到其他范围。
2. `src/lib/calculate.ts` 是计算网清单数量的源头；拓扑必须与清单同源，不允许独立产生矛盾数量。
3. B300=5-128 时，Leaf 按 POD 分段汇总；满编 POD=16 台 Leaf；唯一/最后 POD 按剩余 B300 的 `CX8*2/32` 计算后向上取 2 的幂；单 POD≤16，单平面≤8。
4. B300=129-224 时，Leaf 仍按 `POD 数 * 16`，不要套用 5-128 的最后 POD 取幂规则。
5. 修改计算网规则必须同步检查 `docs/compute-network-rules.md`、`docs/technical-standard.md`、`docs/design-standard.md`、`docs/requirements.md`、`docs/acceptance-standard.md`。
6. 用户点名的反例必须加入测试或验收用例；例如 B300=51 时，拓扑不得出现单 POD 20 台 Leaf。

## 文件维护责任

- 协作与流程文件：`AGENTS.md`、`docs/execution-process.md`、`docs/acceptance-standard.md`、`development-logs/`。
- 技术实现文件：`docs/technical-standard.md`、`docs/compute-network-rules.md` 及开发日志中的自测记录。
- 需求与设计文件：`docs/requirements.md`、`docs/design-standard.md` 及开发日志中的设计记录。

## 项目协作边界

- 默认职责是理解用户需求、拆分阶段、制定计划、必要时实现、验证结果并向用户汇总。
- 每次改动应保持范围必要、可验证、可回退，不顺手扩大到无关文件。
- 涉及删除数据、覆盖重要文件、批量操作、权限或部署配置变化时，必须先说明风险并等待用户确认。
- 如果直接修改带来风险，应在汇报中说明风险、验证方式和未覆盖范围。
