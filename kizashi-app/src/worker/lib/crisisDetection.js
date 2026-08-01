// 傾聴AIチャットの安全網。深刻な危機の兆候を、AIの振る舞いに依存しない
// 決定的な文字列一致で検出する（プロンプト操作やモデルの気まぐれによって
// 安全網が破られないようにするため。env.AI呼び出しより必ず先に実行する）。
//
// このリストは初期案。実際の家族の言葉づかい・婉曲表現を踏まえて
// 継続的に見直すことを前提とする。誤検知（過検知）は許容し、見逃しを避ける。
const CRISIS_KEYWORDS = [
  "死にたい",
  "消えたい",
  "自殺",
  "死のう",
  "死んだほうが",
  "生きていたくない",
  "終わりにしたい",
  "もう限界",
  "殺してほしい",
];

export function detectCrisis(text) {
  if (typeof text !== "string") return false;
  const normalized = text.normalize("NFKC");
  return CRISIS_KEYWORDS.some((keyword) => normalized.includes(keyword));
}
