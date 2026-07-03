import { useMemo, useState } from "react";
import { BomTable } from "./components/BomTable";
import { InputPanel } from "./components/InputPanel";
import { TopologyDiagram } from "./components/TopologyDiagram";
import { calculateAll } from "./lib/calculate";
import { B300_MAX, B300_MIN, normalizeB300Servers } from "./lib/inputLimits";
import type { InputState } from "./types";
import "./toolIntro.css";

const defaultInputs: InputState = {
  b300Servers: 128,
  allFlashServers: 8,
  hybridStorageServers: 16,
  managementServers: 8,
  gpuStoragePortsPerServer: 2,
  allFlashStoragePortsPerServer: 2
};

const toolFeatures = [
  {
    icon: "清",
    tone: "blue",
    title: "自动生成 BOM 清单",
    description: "根据服务器规模自动计算交换机、网卡、线缆与接口需求。"
  },
  {
    icon: "拓",
    tone: "green",
    title: "一键输出拓扑",
    description: "自动生成计算网、存储网、带内管理网与带外管理网拓扑。"
  },
  {
    icon: "验",
    tone: "purple",
    title: "参数联动校验",
    description: "输入参数后自动联动更新关键规模数据，减少人工计算错误。"
  },
  {
    icon: "售",
    tone: "orange",
    title: "适配方案沟通",
    description: "便于售前、方案设计与客户沟通展示，提升方案输出效率。"
  }
];

export function App() {
  const [inputs, setInputs] = useState(defaultInputs);
  const [activeView, setActiveView] = useState("summary");
  const result = useMemo(() => calculateAll(inputs), [inputs]);
  const allItems = result.networks.flatMap((network) => network.items);
  const activeNetwork = result.networks.find((network) => network.key === activeView);
  const showInputPanel = activeView === "summary";
  const compactBom = activeNetwork?.key === "compute" && inputs.b300Servers >= 97;
  const totalServers = inputs.b300Servers + inputs.allFlashServers + inputs.hybridStorageServers + inputs.managementServers;
  const navItems = [
    { key: "summary", label: "总览" },
    ...result.networks.map((network) => ({ key: network.key, label: network.title })),
    { key: "overview", label: "统一拓扑" }
  ];

  return (
    <main>
      <header className="app-header">
        <nav>
          <div className="brand-mark">智算工具</div>
          <div className="nav-links">
            {navItems.map((item) => (
              <button
                key={item.key}
                className={activeView === item.key ? "active" : ""}
                type="button"
                onClick={() => setActiveView(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>
        <section className="hero">
          <div>
            <h1>智算清单和拓扑生成工具</h1>
            <p>输入服务器规模后，自动生成计算网、存储网、带内管理网和带外管理网的一阶段清单与网页拓扑。</p>
          </div>
          <div className="hero-metrics" aria-label="当前输入摘要">
            <EditableMetric
              label="B300"
              value={inputs.b300Servers}
              min={B300_MIN}
              max={B300_MAX}
              unit="台"
              onChange={(b300Servers) => setInputs({ ...inputs, b300Servers: normalizeB300Servers(b300Servers) })}
            />
            <Metric label="总服务器" value={`${totalServers} 台`} />
            <Metric
              label="存储接口"
              value={`${inputs.b300Servers * inputs.gpuStoragePortsPerServer + inputs.allFlashServers * inputs.allFlashStoragePortsPerServer} 个`}
            />
          </div>
        </section>
      </header>

      <div className={showInputPanel ? "workspace" : "workspace workspace-wide"}>
        {showInputPanel && <InputPanel value={inputs} onChange={setInputs} />}
        <section className="content">
          {result.warnings.length > 0 && (
            <div className="warning-stack" role="status">
              {result.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          {activeView === "summary" && (
            <section id="summary" className="result-section">
              <div className="section-heading">
                <div>
                  <h2>总览</h2>
                  <p>当前输入下四张网络的关键规模摘要。进入单张网络页面可查看对应清单和拓扑。</p>
                </div>
                <span>{allItems.length} 项清单</span>
              </div>
              <div className="summary-grid">
                {result.networks.map((network) => (
                  <article className="summary-card" key={network.key}>
                    <span>{network.title}</span>
                    <strong>{Object.entries(network.summary)[0]?.[1]}</strong>
                    <p>{network.notes[0]}</p>
                  </article>
                ))}
              </div>
              <ToolIntro />
            </section>
          )}

          {activeNetwork && (
            <section id={activeNetwork.key} className="result-section">
              <div className="section-heading">
                <div>
                  <h2>{activeNetwork.title}</h2>
                  <p>{activeNetwork.notes[0]}。本页只展示当前网络的清单和拓扑。</p>
                </div>
                <span>{activeNetwork.items.length} 项</span>
              </div>
              <div className="topology-stack">
                <div className="topology-card">
                  <div className="section-heading">
                    <div>
                      <h3>{activeNetwork.title} 清单</h3>
                      <p className="topology-sub">{activeNetwork.notes[0]}</p>
                    </div>
                  </div>
                  <BomTable items={activeNetwork.items} compact={compactBom} />
                </div>
                <TopologyDiagram topology={activeNetwork.topology} />
              </div>
            </section>
          )}

          {activeView === "overview" && (
            <section id="overview" className="result-section">
              <div className="section-heading">
                <div>
                  <h2>统一大拓扑</h2>
                  <p>单独展示四张网络与服务器、安全出口、管理对象之间的整体关系。</p>
                </div>
              </div>
              <TopologyDiagram topology={result.overviewTopology} />
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

function ToolIntro() {
  return (
    <section className="tool-intro" aria-labelledby="tool-intro-title">
      <div className="tool-intro-header">
        <h3 id="tool-intro-title">工具介绍</h3>
        <p>帮助您快速完成智算网络清单与拓扑规划。</p>
      </div>
      <div className="tool-feature-grid">
        {toolFeatures.map((feature) => (
          <article className="tool-feature-card" key={feature.title}>
            <span className={`tool-feature-icon ${feature.tone}`} aria-hidden="true">
              {feature.icon}
            </span>
            <div>
              <h4>{feature.title}</h4>
              <p>{feature.description}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="tool-intro-note">
        <span aria-hidden="true">i</span>
        <p>
          <strong>适用场景：</strong>B300 等智算服务器集群的初步规划、清单测算与拓扑展示。
        </p>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EditableMetric({
  label,
  value,
  min,
  max,
  unit,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="metric-input-label">
        <span>{label}</span>
        <span className="metric-input-row">
          <input
            aria-label={`${label}数量`}
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <strong>{unit}</strong>
        </span>
      </label>
    </div>
  );
}
