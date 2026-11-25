import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"

// Flow Design Alert
// shadcn/ui の Alert と同じ構成（Alert、AlertTitle、AlertDescription、AlertAction）。
// 背景と文字は無彩色。状態の意味は、色の付いたアイコンと文章で表す。
// shadcn/ui と異なり、role="alert" を既定にしない。動的に表示する重要な通知だけ、製品が role を付ける。
// 定義は docs/web/components/alert.md を参照。

const alertVariants = cva(
  [
    "group/alert relative grid w-full gap-x-3 gap-y-1 rounded-md border border-border bg-background p-4 text-left text-ui text-foreground data-[icon=true]:grid-cols-[auto_1fr] has-[>svg]:grid-cols-[auto_1fr]",
    "*:data-[slot=alert-icon]:row-span-3 *:data-[slot=alert-icon]:mt-px *:data-[slot=alert-icon]:size-5",
    // shadcn/ui のように子要素として渡したアイコン（直下の svg）も同じ位置と大きさにし、
    // そのときは種類から自動で表示するアイコンを隠して重複させない。
    "*:[svg]:row-span-3 *:[svg]:mt-px *:[svg]:size-5 *:[svg]:shrink-0",
    "has-[>svg:not([data-slot=alert-icon])]:*:data-[slot=alert-icon]:hidden",
  ],
  {
    variants: {
      variant: {
        neutral: "*:data-[slot=alert-icon]:text-muted-foreground *:[svg]:text-muted-foreground",
        success: "*:data-[slot=alert-icon]:text-success *:[svg]:text-success",
        warning: "*:data-[slot=alert-icon]:text-warning *:[svg]:text-warning",
        destructive: "*:data-[slot=alert-icon]:text-destructive *:[svg]:text-destructive",
        info: "*:data-[slot=alert-icon]:text-info *:[svg]:text-info",
        // shadcn/ui との互換のための名前。neutral と同じ見た目になる。
        default: "*:data-[slot=alert-icon]:text-muted-foreground *:[svg]:text-muted-foreground",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
)

const icons = {
  neutral: Info,
  default: Info,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  destructive: CircleAlert,
} as const

function Alert({
  className,
  variant = "neutral",
  icon,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & {
    /** 既定は種類に対応する Lucide のアイコン。false で表示しない。 */
    icon?: React.ReactNode | false
  }) {
  const Icon = icons[variant ?? "neutral"]
  return (
    <div
      data-slot="alert"
      data-variant={variant}
      data-icon={icon !== false}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {icon === false ? null : icon ? (
        <span data-slot="alert-icon" aria-hidden="true" className="flex [&>svg]:size-5">
          {icon}
        </span>
      ) : (
        <Icon data-slot="alert-icon" aria-hidden="true" />
      )}
      {children}
    </div>
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("font-medium group-data-[icon=true]/alert:col-start-2 group-has-[>svg]/alert:col-start-2", className)} {...props} />
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "text-muted-foreground group-data-[icon=true]/alert:col-start-2 group-has-[>svg]/alert:col-start-2 [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_p:not(:last-child)]:mb-2",
        className
      )}
      {...props}
    />
  )
}

// 次に行う操作。説明の下に置く。
function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-action" className={cn("mt-2 flex flex-wrap gap-2 group-data-[icon=true]/alert:col-start-2 group-has-[>svg]/alert:col-start-2", className)} {...props} />
}

export { Alert, AlertAction, AlertDescription, AlertTitle }
