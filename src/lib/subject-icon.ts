// Picks the icon for a subject from its name. Pure function, no DOM, so the rules can be tested.
// The name is normalised first (full-width letters and symbols become their plain forms), then the
// rules are tried in order: the first rule whose pattern appears in the name wins. Order matters:
// "保健体育" must be tried before "体育", and "探究の時間" before the subject words it contains.

export type SubjectIconKey =
  | "inquiry"
  | "activities"
  | "monitor"
  | "smartphone"
  | "game"
  | "video"
  | "music"
  | "english"
  | "health"
  | "pe"
  | "home"
  | "art"
  | "geography"
  | "history"
  | "economics"
  | "civics"
  | "physics"
  | "chemistry"
  | "biology"
  | "earth-science"
  | "information"
  | "math"
  | "japanese"
  | "science"
  | "default";

const RULES: readonly { key: Exclude<SubjectIconKey, "default">; pattern: RegExp }[] = [
  { key: "inquiry", pattern: /総合的な探究の時間|総合的な学習の時間|課題研究/u },
  { key: "activities", pattern: /特別活動|ホームルーム|生徒会活動|学校行事|N高グループ/u },
  { key: "monitor", pattern: /バーチャルキャンパス/u },
  { key: "smartphone", pattern: /スマートフォン|アプリ開発/u },
  { key: "game", pattern: /Unity|ゲーム開発/u },
  { key: "video", pattern: /動画|映像|クリエイター/u },
  { key: "music", pattern: /DTM|ボーカロイド|音楽/u },
  { key: "english", pattern: /論理[・･]?表現|英語|英文|英検/u },
  { key: "health", pattern: /保健体育|保健/u },
  { key: "pe", pattern: /体育|スポーツ/u },
  { key: "home", pattern: /家庭|家政/u },
  { key: "art", pattern: /美術|芸術|工芸|書道/u },
  { key: "geography", pattern: /地理|地誌/u },
  { key: "history", pattern: /世界史|日本史|歴史/u },
  { key: "economics", pattern: /政治[・･]?経済|経済/u },
  { key: "civics", pattern: /政治|公民|公共|倫理|現代社会|社会/u },
  { key: "physics", pattern: /物理/u },
  { key: "chemistry", pattern: /化学/u },
  { key: "biology", pattern: /生物/u },
  { key: "earth-science", pattern: /地学/u },
  { key: "information", pattern: /情報|プログラミング|コンピュータ/u },
  { key: "math", pattern: /数学|算数/u },
  { key: "japanese", pattern: /国語|古典|現代文|古文|漢文|文学/u },
  { key: "science", pattern: /理科|科学/u },
];

export function subjectIconKey(name: string): SubjectIconKey {
  const normalized = name.normalize("NFKC");
  for (const rule of RULES) {
    if (rule.pattern.test(normalized)) return rule.key;
  }
  return "default";
}
