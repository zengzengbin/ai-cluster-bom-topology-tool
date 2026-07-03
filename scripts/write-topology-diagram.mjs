import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(__dirname, "..", "src", "components", "TopologyDiagram.tsx");
const content = `// 完整内容：使用模板字符串写入，避免 PowerShell 解析问题`;

writeFileSync(target, content, "utf8");
console.log("Wrote", target, content.length, "bytes");