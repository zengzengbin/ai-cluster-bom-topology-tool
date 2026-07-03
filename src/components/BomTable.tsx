import type { BomItem } from "../types";

interface Props {
  items: BomItem[];
  compact?: boolean;
}

export function BomTable({ items, compact = false }: Props) {
  return (
    <div className={`table-wrap${compact ? " table-wrap-compact" : ""}`}>
      <table className={compact ? "bom-table bom-table-compact" : "bom-table"}>
        <colgroup>
          <col className="col-sequence" />
          <col className="col-product" />
          <col className="col-model" />
          <col className="col-description" />
          <col className="col-quantity" />
          <col className="col-formula" />
        </colgroup>
        <thead>
          <tr>
            <th>序号</th>
            <th>产品名称</th>
            <th>产品型号</th>
            <th>产品描述</th>
            <th>数量</th>
            <th>计算依据</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={`${item.network}-${item.sequence}-${item.productName}`}>
              <td>{item.sequence}</td>
              <td className="strong-cell">{item.productName}</td>
              <td>{item.model}</td>
              <td className="description-cell">{item.description}</td>
              <td className="quantity-cell">{item.quantity}</td>
              <td className="formula-cell">{item.formula}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
