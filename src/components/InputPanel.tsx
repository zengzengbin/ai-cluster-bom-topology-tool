import type { InputState } from "../types";
import { B300_MAX, B300_MIN, normalizeB300Servers } from "../lib/inputLimits";

interface Props {
  value: InputState;
  onChange: (value: InputState) => void;
}

const fields: Array<{
  key: keyof InputState;
  label: string;
  helper: string;
  min: number;
  max: number;
  type?: "number" | "select";
}> = [
  { key: "b300Servers", label: "B300 GPU 服务器", helper: "计算网、存储网、管理网均使用。", min: 0, max: 999 },
  { key: "allFlashServers", label: "全闪存储服务器", helper: "参与存储网与管理网。", min: 0, max: 999 },
  { key: "hybridStorageServers", label: "混闪存储服务器", helper: "参与带内/带外管理网。", min: 0, max: 999 },
  { key: "managementServers", label: "管理服务器", helper: "参与带内/带外管理网。", min: 0, max: 999 },
  { key: "gpuStoragePortsPerServer", label: "GPU 存储网卡配置", helper: "当前支持 1*400G、2*400G、4*400G", min: 0, max: 4, type: "select" },
  { key: "allFlashStoragePortsPerServer", label: "全闪存储网卡配置", helper: "当前支持 1*400G、2*400G、4*400G", min: 0, max: 4, type: "select" }
];

const storageNicOptions = [1, 2, 4];

export function InputPanel({ value, onChange }: Props) {
  function update(key: keyof InputState, nextValue: number) {
    const normalizedValue = key === "b300Servers" ? normalizeB300Servers(nextValue) : Number.isFinite(nextValue) ? Math.max(0, nextValue) : 0;

    onChange({
      ...value,
      [key]: normalizedValue
    });
  }

  return (
    <aside className="input-panel">
      <div className="panel-title">
        <span>参数输入</span>
        <strong>四网 MVP</strong>
      </div>
      {fields.map((field) => (
        <label className="field" key={field.key}>
          <span>{field.label}</span>
          {field.type === "select" ? (
            <select value={value[field.key]} onChange={(event) => update(field.key, Number(event.target.value))}>
              {storageNicOptions.map((option) => (
                <option value={option} key={option}>
                  {`${option} * 400G`}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              min={field.key === "b300Servers" ? B300_MIN : field.min}
              max={field.key === "b300Servers" ? B300_MAX : field.max}
              value={value[field.key]}
              onChange={(event) => update(field.key, Number(event.target.value))}
            />
          )}
          <small>{field.helper}</small>
        </label>
      ))}
    </aside>
  );
}
