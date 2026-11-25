import {
  mergeConfigs,
  type Config,
  type ConfigExtension,
  type DefaultClassGroupIds,
  type DefaultThemeGroupIds,
} from "tailwind-merge"

// Flow Design のテーマ（registry/foundation/theme.css の @theme inline）が追加した
// クラス名。tailwind-merge に登録しないと、たとえば "text-ui text-primary-foreground"
// の text-ui が文字色のクラスとみなされて削除される。
export const flowDesignMergeExtension: ConfigExtension<DefaultClassGroupIds, DefaultThemeGroupIds> = {
  extend: {
    theme: {
      text: ["display", "metric", "page-title", "section", "heading", "body", "ui", "caption"],
      shadow: ["menu", "popover", "dialog"],
      spacing: ["control", "table-row"],
      ease: ["standard", "enter", "exit"],
    },
  },
}

// 既存の tailwind-merge の設定に、Flow Design の設定を追加する。
//   extendTailwindMerge({ ...製品の設定 }, withFlowDesign)
// 型は extendTailwindMerge の追加の設定関数（(config) => config）に合わせている。
export function withFlowDesign(config: Config<string, string>): Config<string, string> {
  return mergeConfigs(config, flowDesignMergeExtension as ConfigExtension<string, string>)
}
