// Flow Design の検索の共通処理。Combobox、Multi Select、Command が使う。
// 検索アルゴリズムを製品に固定しないため、ここでは部分一致の判定だけを持つ。
// 製品は filter を差し替えるか、filter={null} にしてサーバー側で検索する。

/** 検索の対象として扱う項目。label のほかに、別名や関連キーワードを keywords に持てる。 */
export type SearchableItem = {
  label: string
  keywords?: readonly string[]
}

const KATAKANA = /[ァ-ヶ]/g

/**
 * 比べる前に文字列をそろえる。
 * - NFKC：全角の英数字と半角のカタカナを、半角の英数字と全角のカタカナにそろえる
 * - 大文字と小文字を区別しない
 * - カタカナをひらがなにそろえる（「トウキョウ」と「とうきょう」を同じとみなす）
 * - 空白を 1 つにまとめる
 */
export function normalizeSearchText(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(KATAKANA, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * 部分一致。検索文字列を空白で区切った語が、すべて texts のどれかに含まれるときに一致とする。
 * 空の検索文字列は、すべてに一致する。
 */
export function matchesSearch(texts: readonly string[], query: string) {
  const q = normalizeSearchText(query)
  if (q === "") return true
  const haystack = texts.map(normalizeSearchText)
  return q.split(" ").every((term) => haystack.some((t) => t.includes(term)))
}

/** 項目の label と keywords を検索の対象にする filter。Base UI の Combobox と Autocomplete の filter に渡せる。 */
export function searchItemFilter<T>(item: T, query: string, itemToString?: (item: T) => string) {
  if (item && typeof item === "object" && "label" in item) {
    const { label, keywords = [] } = item as SearchableItem
    return matchesSearch([String(label), ...keywords], query)
  }
  return matchesSearch([itemToString ? itemToString(item) : String(item)], query)
}
