// Advanced Components のプレビュー用のデータ。製品のデータではない。

export type Option = { value: string; label: string; keywords?: string[]; disabled?: boolean }

// 都道府県。keywords に読み（ひらがな）とローマ字を入れ、別名でも探せることを確かめる。
const pref: [string, string, string, string][] = [
  ["hokkaido", "北海道", "ほっかいどう", "hokkaido"],
  ["aomori", "青森県", "あおもり", "aomori"],
  ["iwate", "岩手県", "いわて", "iwate"],
  ["miyagi", "宮城県", "みやぎ", "miyagi"],
  ["akita", "秋田県", "あきた", "akita"],
  ["yamagata", "山形県", "やまがた", "yamagata"],
  ["fukushima", "福島県", "ふくしま", "fukushima"],
  ["ibaraki", "茨城県", "いばらき", "ibaraki"],
  ["tochigi", "栃木県", "とちぎ", "tochigi"],
  ["gunma", "群馬県", "ぐんま", "gunma"],
  ["saitama", "埼玉県", "さいたま", "saitama"],
  ["chiba", "千葉県", "ちば", "chiba"],
  ["tokyo", "東京都", "とうきょう", "tokyo"],
  ["kanagawa", "神奈川県", "かながわ", "kanagawa"],
  ["niigata", "新潟県", "にいがた", "niigata"],
  ["toyama", "富山県", "とやま", "toyama"],
  ["ishikawa", "石川県", "いしかわ", "ishikawa"],
  ["fukui", "福井県", "ふくい", "fukui"],
  ["yamanashi", "山梨県", "やまなし", "yamanashi"],
  ["nagano", "長野県", "ながの", "nagano"],
  ["gifu", "岐阜県", "ぎふ", "gifu"],
  ["shizuoka", "静岡県", "しずおか", "shizuoka"],
  ["aichi", "愛知県", "あいち", "aichi"],
  ["mie", "三重県", "みえ", "mie"],
  ["shiga", "滋賀県", "しが", "shiga"],
  ["kyoto", "京都府", "きょうと", "kyoto"],
  ["osaka", "大阪府", "おおさか", "osaka"],
  ["hyogo", "兵庫県", "ひょうご", "hyogo"],
  ["nara", "奈良県", "なら", "nara"],
  ["wakayama", "和歌山県", "わかやま", "wakayama"],
  ["tottori", "鳥取県", "とっとり", "tottori"],
  ["shimane", "島根県", "しまね", "shimane"],
  ["okayama", "岡山県", "おかやま", "okayama"],
  ["hiroshima", "広島県", "ひろしま", "hiroshima"],
  ["yamaguchi", "山口県", "やまぐち", "yamaguchi"],
  ["tokushima", "徳島県", "とくしま", "tokushima"],
  ["kagawa", "香川県", "かがわ", "kagawa"],
  ["ehime", "愛媛県", "えひめ", "ehime"],
  ["kochi", "高知県", "こうち", "kochi"],
  ["fukuoka", "福岡県", "ふくおか", "fukuoka"],
  ["saga", "佐賀県", "さが", "saga"],
  ["nagasaki", "長崎県", "ながさき", "nagasaki"],
  ["kumamoto", "熊本県", "くまもと", "kumamoto"],
  ["oita", "大分県", "おおいた", "oita"],
  ["miyazaki", "宮崎県", "みやざき", "miyazaki"],
  ["kagoshima", "鹿児島県", "かごしま", "kagoshima"],
  ["okinawa", "沖縄県", "おきなわ", "okinawa"],
]
export const prefectures: Option[] = pref.map(([value, label, kana, roman]) => ({ value, label, keywords: [kana, roman] }))

// 取引先。長い名前と、英語の名前を含める。
export const accounts: Option[] = [
  { value: "a-001", label: "株式会社青葉システム", keywords: ["あおば", "aoba"] },
  { value: "a-002", label: "北星物流株式会社", keywords: ["ほくせい", "hokusei"] },
  { value: "a-003", label: "Northwind Traders Japan G.K.", keywords: ["ノースウィンド"] },
  { value: "a-004", label: "さくら医療機器販売株式会社 東日本統括支社 首都圏営業部", keywords: ["さくら", "sakura"] },
  { value: "a-005", label: "株式会社みなと製作所", keywords: ["みなと", "minato"] },
  { value: "a-006", label: "Contoso Pharmaceuticals International Holdings Limited", keywords: ["コントソ"] },
  { value: "a-007", label: "有限会社つばめ商店", keywords: ["つばめ", "tsubame"] },
  { value: "a-008", label: "株式会社東邦エンジニアリング", keywords: ["とうほう", "toho"] },
  { value: "a-009", label: "Fabrikam Inc.", keywords: ["ファブリカム"] },
  { value: "a-010", label: "株式会社山田建設", keywords: ["やまだ", "yamada"] },
  { value: "a-011", label: "合同会社こだま企画", keywords: ["こだま", "kodama"] },
  { value: "a-012", label: "株式会社ひかり食品", keywords: ["ひかり", "hikari"] },
]

// 担当者。サーバー側の検索の模擬に使う。
export type Person = { value: string; label: string; email: string; team: string }
const familyNames = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤", "吉田", "山田"]
const givenNames = ["健太", "美咲", "大輔", "陽子", "翔", "愛", "直樹", "さくら"]
const teams = ["営業部", "経理部", "開発部", "カスタマーサクセス部"]
export const people: Person[] = familyNames.flatMap((f, i) =>
  givenNames.map((g, j) => ({
    value: `u-${i * givenNames.length + j + 1}`,
    label: `${f} ${g}`,
    email: `user${i * givenNames.length + j + 1}@example.com`,
    team: teams[(i + j) % teams.length],
  }))
)

/**
 * サーバー側の検索の模擬。外部への通信はしない。
 * 1 文字の検索は 1200ms、2 文字以上は 400ms かかる。古い検索が後から返る状況を再現する。
 * 「エラー」を含む検索は失敗する。
 * 中断できない API を想定し、signal を受け取っても処理を止めない。古い結果を捨てるのは useComboboxSearch の役割。
 */
export function searchPeople(query: string, _signal?: AbortSignal): Promise<Person[]> {
  const delay = [...query].length === 1 ? 1200 : 400
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (query.includes("エラー")) reject(new Error("search failed"))
      else {
        const q = query.normalize("NFKC").toLowerCase()
        resolve(people.filter((p) => p.label.replace(" ", "").includes(q.replace(/\s/g, "")) || p.email.includes(q)).slice(0, 20))
      }
    }, delay)
  })
}
