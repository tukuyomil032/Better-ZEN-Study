import { describe, expect, test } from "bun:test";
import { subjectIconKey } from "../src/lib/subject-icon";

// Subject names as the site returns them (see dev/fixtures): the basic service and the advanced service.
describe("subjectIconKey", () => {
  test.each([
    ["政治・経済", "economics"],
    ["国語表現", "japanese"],
    ["地理探究", "geography"],
    ["地学基礎", "earth-science"],
    ["体育Ⅲ（大修館書店）", "pe"],
    ["論理・表現Ⅰ", "english"],
    ["情報Ⅱ", "information"],
    ["特別活動Ⅲ", "activities"],
    ["総合的な探究の時間Ⅲ", "inquiry"],
    ["世界史探究", "history"],
    ["古典探究", "japanese"],
  ])("basic subject %s", (name, key) => {
    expect(subjectIconKey(name)).toBe(key);
  });

  test.each([
    ["バーチャルキャンパス N高/S高", "monitor"],
    ["英語", "english"],
    ["英文法", "english"],
    ["まずはここから英数国", "default"],
    ["スマートフォンアプリ開発", "smartphone"],
    ["中学復習講座 英語", "english"],
    ["中学復習講座 数学", "math"],
    ["英検対策", "english"],
    ["プログラミング入門", "information"],
    ["N高グループ", "activities"],
    ["英文読解", "english"],
    ["数学Ⅰ", "math"],
    ["動画クリエイター", "video"],
    ["DTM・ボーカロイド", "music"],
    ["Unity ゲーム開発", "game"],
  ])("advanced course %s", (name, key) => {
    expect(subjectIconKey(name)).toBe(key);
  });

  test("保健体育 is health, not pe", () => {
    expect(subjectIconKey("保健体育")).toBe("health");
  });

  test("the full-width letters and symbols are normalised first", () => {
    // Half-width katakana middle dot and roman numerals must still match the plain patterns.
    expect(subjectIconKey("政治･経済")).toBe("economics");
    expect(subjectIconKey("論理･表現Ⅰ")).toBe("english");
  });

  test("an empty or unknown name falls back to the default icon", () => {
    expect(subjectIconKey("")).toBe("default");
    expect(subjectIconKey("ＸＹＺ")).toBe("default");
  });
});
