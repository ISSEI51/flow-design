import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"

// Flow Design Button
// shadcn/ui（Base UI 版）の Button と同じ variant 名、size 名、API を使う。
// 値はすべて registry/foundation/theme.css のトークンを参照する。
// 定義と判断基準は docs/web/components/button.md を参照。

const buttonCva = cva(
  [
    "group/button relative inline-flex shrink-0 items-center justify-center",
    "border border-transparent text-center text-ui font-medium select-none [word-break:auto-phrase]",
    "transition-[color,background-color,border-color,opacity] duration-(--duration-fast) ease-standard",
    "outline-none focus-visible:focus-ring",
    "data-disabled:not-data-loading:cursor-not-allowed data-disabled:not-data-loading:opacity-50",
    "data-loading:cursor-progress",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:not-data-disabled:bg-primary/90 active:not-data-disabled:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground hover:not-data-disabled:bg-[color-mix(in_srgb,var(--secondary)_94%,var(--foreground))] active:not-data-disabled:bg-[color-mix(in_srgb,var(--secondary)_88%,var(--foreground))]",
        outline:
          "border-input bg-background text-foreground hover:not-data-disabled:bg-accent hover:not-data-disabled:text-accent-foreground active:not-data-disabled:bg-[color-mix(in_srgb,var(--accent)_94%,var(--foreground))]",
        ghost:
          "text-foreground hover:not-data-disabled:bg-accent hover:not-data-disabled:text-accent-foreground active:not-data-disabled:bg-[color-mix(in_srgb,var(--accent)_94%,var(--foreground))]",
        destructive:
          "bg-destructive text-destructive-foreground hover:not-data-disabled:bg-[color-mix(in_srgb,var(--destructive)_90%,black)] active:not-data-disabled:bg-[color-mix(in_srgb,var(--destructive)_80%,black)]",
        link:
          "text-primary underline decoration-1 underline-offset-4 hover:not-data-disabled:decoration-2",
      },
      size: {
        xs: "min-h-8 gap-2 rounded-sm px-3 py-1 [&_svg:not([class*='size-'])]:size-4",
        sm: "min-h-10 gap-2 rounded-md px-4 py-2",
        default: "min-h-control gap-2 rounded-lg px-5 py-2",
        lg: "min-h-14 gap-2 rounded-lg px-6 py-3 text-body",
        "icon-xs": "size-8 rounded-sm [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-10 rounded-md",
        icon: "size-control rounded-lg",
        "icon-lg": "size-14 rounded-lg",
      },
    },
    compoundVariants: [
      // Link は文字として見せるため、高さは保ったまま左右の余白を取らない。
      { variant: "link", size: ["xs", "sm", "default", "lg"], className: "px-0" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

// <a> などに Button と同じ見た目を付けるときに使う。cn() で重複するクラスを解消して返す。
function buttonVariants({
  className,
  ...props
}: VariantProps<typeof buttonCva> & { className?: string } = {}) {
  return cn(buttonCva(props), className)
}

type IconSize = "icon-xs" | "icon-sm" | "icon" | "icon-lg"
type TextSize = Exclude<NonNullable<VariantProps<typeof buttonCva>["size"]>, IconSize>

type ButtonBaseProps = Omit<ButtonPrimitive.Props, "className"> & {
  className?: string
  variant?: VariantProps<typeof buttonCva>["variant"]
  /** 処理中。押せない状態にし、フォーカスは保つ。幅は変えない。 */
  loading?: boolean
}

// アイコンだけのボタンは、aria-label か aria-labelledby を必須にする。
type ButtonProps = ButtonBaseProps &
  (
    | { size?: TextSize }
    | ({ size: IconSize } & ({ "aria-label": string } | { "aria-labelledby": string }))
  )

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  disabled,
  focusableWhenDisabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-loading={loading || undefined}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      focusableWhenDisabled={loading || focusableWhenDisabled}
      className={buttonVariants({ variant, size, className })}
      {...props}
    >
      <span
        data-slot="button-content"
        className={cn(
          "inline-flex min-w-0 items-center justify-center gap-[inherit]",
          loading && "opacity-0"
        )}
      >
        {children}
      </span>
      {loading && (
        <span
          data-slot="button-spinner"
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center"
        >
          <LoaderCircle className="motion-safe:animate-spin" />
        </span>
      )}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
