import type * as React from "react"
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"
import { Building2, User } from "lucide-react"

import { cn } from "@/lib/utils"

// Flow Design Avatar
// shadcn/ui（Base UI 版）の Avatar と同じ構成（Avatar、AvatarImage、AvatarFallback）。
// 円形のみ。表示の優先順位は 画像 → 頭文字 → アイコン。
// 画像の読み込みに失敗した場合も、Base UI が AvatarFallback を表示する。
// 定義は docs/web/components/avatar.md を参照。

type AvatarSize = "xs" | "sm" | "default" | "lg" | "xl"

function Avatar({
  className,
  size = "default",
  label,
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: AvatarSize
  /** 単独で表示するときの名前。隣に名前を表示する場合は指定せず、読み上げの重複を避ける。 */
  label?: string
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "group/avatar relative flex shrink-0 overflow-hidden rounded-full bg-muted select-none",
        "data-[size=xs]:size-6 data-[size=sm]:size-8 data-[size=default]:size-10 data-[size=lg]:size-12 data-[size=xl]:size-16",
        className
      )}
      {...props}
    />
  )
}

function AvatarImage({ className, alt = "", ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      alt={alt}
      className={cn("size-full object-cover", className)}
      {...props}
    />
  )
}

function AvatarFallback({
  className,
  children,
  kind = "person",
  ...props
}: AvatarPrimitive.Fallback.Props & {
  /** 頭文字がないときのアイコン。 */
  kind?: "person" | "organization"
}) {
  const Icon = kind === "organization" ? Building2 : User
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "flex size-full items-center justify-center bg-muted font-medium text-muted-foreground",
        "group-data-[size=xs]/avatar:text-caption group-data-[size=sm]/avatar:text-caption",
        "group-data-[size=default]/avatar:text-ui group-data-[size=lg]/avatar:text-ui group-data-[size=xl]/avatar:text-body",
        "[&>svg]:size-5 group-data-[size=xs]/avatar:[&>svg]:size-4 group-data-[size=sm]/avatar:[&>svg]:size-4 group-data-[size=xl]/avatar:[&>svg]:size-6",
        className
      )}
      {...props}
    >
      {children || <Icon aria-hidden="true" />}
    </AvatarPrimitive.Fallback>
  )
}

const legalForms = /^(株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|\(株\)|（株）)|(株式会社|有限会社|合同会社|\(株\)|（株）)$/g

// 名前から頭文字を作る。英字の名前は姓名の頭文字 2 文字、日本語の名前は先頭の 1 文字。
// 法人格（株式会社など）は除く。
function getInitials(name: string) {
  const trimmed = name.replace(legalForms, "").trim()
  const words = trimmed.split(/[\s　]+/).filter(Boolean)
  if (!words.length) return ""
  if (/^[A-Za-z]/.test(words[0])) {
    const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2)
    return letters.toUpperCase()
  }
  return [...words[0]][0]
}

function AvatarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="avatar-group"
      className={cn("flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background", className)}
      {...props}
    />
  )
}

export { Avatar, AvatarFallback, AvatarGroup, AvatarImage, getInitials }
