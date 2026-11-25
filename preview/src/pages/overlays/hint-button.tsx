import { Info } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// Overlay の中で Tooltip を確かめるための、補足を表示するアイコンボタン（プレビュー専用の組み合わせ）。
export function HintButton({ label, hint, testId }: { label: string; hint: string; testId: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={label} data-testid={testId} />}>
        <Info />
      </TooltipTrigger>
      <TooltipContent data-testid={`${testId}-tooltip`}>{hint}</TooltipContent>
    </Tooltip>
  )
}
