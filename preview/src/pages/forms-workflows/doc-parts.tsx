import { useEffect, useState } from "react"

import { formsServer, type ActionMode, type CheckMode, type ImportMode, type SaveMode } from "../../data/forms-workflows/server"
import { DemoControls, Radio } from "../data-browsing/doc-parts"

// Forms & Workflows の資料のページで使う、プレビュー専用の部品。Registry には含めない。
// Mock、AppLink、DemoFrame、Rules は Data Browsing の資料のページと共通（../data-browsing/doc-parts）。

type ModeKey = "saveMode" | "actionMode" | "undoMode" | "importMode" | "checkMode"
const modeOptions: Record<ModeKey, { legend: string; options: [string, string][] }> = {
  saveMode: {
    legend: "保存の結果（模擬のサーバー）",
    options: [
      ["success", "成功"],
      ["fail", "失敗"],
      ["invalid", "サーバー側の検証のエラー"],
      ["unknown", "結果が不明"],
      ["throw", "予期しない例外"],
    ] satisfies [SaveMode, string][],
  },
  actionMode: {
    legend: "実行の結果（模擬のサーバー）",
    options: [
      ["success", "成功"],
      ["fail", "失敗"],
      ["unknown", "結果が不明"],
    ] satisfies [ActionMode, string][],
  },
  undoMode: {
    legend: "元に戻すの結果",
    options: [
      ["success", "成功"],
      ["fail", "失敗"],
      ["unknown", "結果が不明"],
    ] satisfies [ActionMode, string][],
  },
  checkMode: {
    legend: "入力中の確認（模擬のサーバー）",
    options: [
      ["success", "成功"],
      ["fail", "通信の失敗"],
      ["timeout", "応答しない"],
    ] satisfies [CheckMode, string][],
  },
  importMode: {
    legend: "取り込みの結果（模擬のサーバー）",
    options: [
      ["success", "すべて成功"],
      ["partial", "一部失敗"],
      ["fail", "すべて失敗"],
      ["unknown", "途中で通信が切れる"],
      ["throw", "途中で通信の例外になる（応答がない）"],
      ["inconsistent", "結果に矛盾がある"],
    ] satisfies [ImportMode, string][],
  },
}

const defaults: Record<ModeKey, string> = { saveMode: "success", actionMode: "success", undoMode: "success", importMode: "partial", checkMode: "success" }

/** 模擬のサーバーの結果を切り替える。ページを離れたら既定に戻す */
export function ServerModes({ keys, name }: { keys: ModeKey[]; name: string }) {
  const [values, setValues] = useState(() => Object.fromEntries(keys.map((k) => [k, formsServer[k]])) as Record<ModeKey, string>)
  useEffect(() => {
    for (const k of keys) (formsServer as Record<string, unknown>)[k] = values[k]
  }, [keys, values])
  useEffect(
    () => () => {
      for (const k of keys) (formsServer as Record<string, unknown>)[k] = defaults[k]
    },
    // ページを離れるときだけ
    []
  )
  return (
    <div className="flex flex-col gap-2">
      {keys.map((k) => (
        <DemoControls key={k} legend={modeOptions[k].legend}>
          {modeOptions[k].options.map(([v, l]) => (
            <Radio key={v} name={`${name}-${k}`} checked={values[k] === v} onChange={() => setValues((s) => ({ ...s, [k]: v }))}>
              {l}
            </Radio>
          ))}
        </DemoControls>
      ))}
    </div>
  )
}
