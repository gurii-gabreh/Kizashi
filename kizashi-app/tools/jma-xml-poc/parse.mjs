// 気象庁防災情報XML（JMAXML Ver.1.3）から、東京都の市区町村単位の
// 警報・注意報発表状況を抽出するパーサーのプロトタイプ。
//
// docs/reference/jmaxml_format_v1_3.pdf セクション1.3.11「部品（警報事項の
// 共通部品）」に示された構造（Information > Item > Kind / Areas > Area）に
// 基づく。Cloudflare Workersでの本実装を想定し、Workers上でも動く
// fast-xml-parser（純JS実装）を使用している。
//
// このセッションはxml.kishou.go.jpへのネットワークアクセスがブロックされて
// おり、実際に配信されているXMLを取得してテストすることができなかったため、
// 同ディレクトリの sample_warning.xml（仕様書の記述例をもとに作成した検証用
// サンプル）でパース処理のみを検証している。実データでの動作確認は別途必要。

import { readFileSync } from "node:fs";
import { XMLParser } from "fast-xml-parser";

const TOKYO_PREFECTURE_CODE_PREFIX = "13"; // JIS X0402 都道府県コード（東京都）

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// fast-xml-parserは既定で名前空間プレフィックスを要素名の一部として残す
// （例: "jmx_ib:Title"）。プレフィックスの有無に関わらず探索できるよう、
// ローカル名（コロン以降）だけで比較するヘルパーを用意する。
function findByLocalName(obj, localName) {
  const results = [];
  function walk(node) {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      const bare = key.includes(":") ? key.split(":").pop() : key;
      if (bare === localName) results.push(value);
      walk(value);
    }
  }
  walk(obj);
  return results;
}

export function parseWarnings(xmlText) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc = parser.parse(xmlText);

  const informationNodes = findByLocalName(doc, "Information");
  const warnings = [];

  for (const info of informationNodes) {
    const infoType = info["@_type"] ?? "";
    if (!infoType.includes("警報") && !infoType.includes("注意報")) continue;

    for (const item of toArray(info.Item)) {
      const kind = item.Kind;
      if (!kind) continue;
      const kindName = kind.Name;
      const condition = kind.Condition ?? null; // 例: "土砂災害"

      const areasNode = item.Areas;
      if (!areasNode) continue;
      for (const area of toArray(areasNode.Area)) {
        const code = String(area.Code ?? "");
        if (!code.startsWith(TOKYO_PREFECTURE_CODE_PREFIX)) continue; // 東京都以外は除外
        warnings.push({
          municipality: area.Name,
          municipalityCode: code,
          warningName: kindName,
          condition, // 土砂災害警戒に関係するかの判定に使う
        });
      }
    }
  }

  return warnings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const xmlPath = process.argv[2] ?? new URL("./sample_warning.xml", import.meta.url).pathname;
  const xmlText = readFileSync(xmlPath, "utf-8");
  const warnings = parseWarnings(xmlText);

  console.log(`東京都内の警報・注意報: ${warnings.length}件`);
  for (const w of warnings) {
    const sabo = w.condition === "土砂災害" ? "【土砂災害関連】" : "";
    console.log(`  ${w.municipality}(${w.municipalityCode}): ${w.warningName} ${sabo}`);
  }

  const saboRelated = warnings.filter((w) => w.condition === "土砂災害");
  console.log(`\nうち土砂災害に関係するもの: ${saboRelated.length}件`);
}
