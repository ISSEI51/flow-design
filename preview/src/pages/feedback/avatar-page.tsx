import { useState } from "react"

import { Avatar, AvatarFallback, AvatarGroup, AvatarImage, getInitials } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

const sizes = [
  ["xs", "24px"],
  ["sm", "32px"],
  ["default", "40px"],
  ["lg", "48px"],
  ["xl", "64px"],
] as const

export function AvatarPage() {
  const [src, setSrc] = useState("/avatars/landscape.png")
  return (
    <article>
      <PageHeader name="Avatar" lead="人物や組織を識別する。円形だけを使う。画像、頭文字、アイコンの順に表示する。" />

      <Section title="大きさ" lead="標準は 40px。">
        {sizes.map(([size, px]) => (
          <Row key={size} label={px} note={`size="${size}"`}>
            <Avatar data-testid={`avatar-${size}`} size={size}>
              <AvatarImage src="/avatars/landscape.png" />
              <AvatarFallback>山</AvatarFallback>
            </Avatar>
            <Avatar data-testid={`avatar-initial-${size}`} size={size}>
              <AvatarFallback>{getInitials("山田 花子")}</AvatarFallback>
            </Avatar>
            <Avatar size={size}>
              <AvatarFallback />
            </Avatar>
          </Row>
        ))}
      </Section>

      <Section title="表示の順番" lead="画像がない場合と、画像の取得に失敗した場合は、頭文字かアイコンを表示する。">
        <Row label="画像" note="縦横比が違っても円に切り抜く">
          <Avatar data-testid="avatar-landscape">
            <AvatarImage src="/avatars/landscape.png" />
            <AvatarFallback>横</AvatarFallback>
          </Avatar>
          <Avatar data-testid="avatar-portrait">
            <AvatarImage src="/avatars/portrait.png" />
            <AvatarFallback>縦</AvatarFallback>
          </Avatar>
        </Row>
        <Row label="取得の失敗" note="押すと存在しない画像に切り替わる">
          <Avatar data-testid="avatar-switch">
            <AvatarImage src={src} />
            <AvatarFallback>{getInitials("Hanako Yamada")}</AvatarFallback>
          </Avatar>
          <Button
            data-testid="avatar-break"
            variant="secondary"
            size="sm"
            onClick={() => setSrc(src.includes("missing") ? "/avatars/landscape.png" : "/avatars/missing.png")}
          >
            {src.includes("missing") ? "画像を戻す" : "画像の取得を失敗させる"}
          </Button>
        </Row>
        <Row label="頭文字" note="日本語は先頭の 1 文字、英語は姓名の頭文字。法人格は除く">
          {["山田 花子", "Hanako Yamada", "株式会社北斗システム", "Taro"].map((n) => (
            <span key={n} className="flex items-center gap-2 text-ui">
              <Avatar data-testid={`avatar-name-${n}`}>
                <AvatarFallback>{getInitials(n)}</AvatarFallback>
              </Avatar>
              {n}
            </span>
          ))}
        </Row>
        <Row label="アイコン" note="名前もない場合。人物と組織">
          <Avatar>
            <AvatarFallback />
          </Avatar>
          <Avatar>
            <AvatarFallback kind="organization" />
          </Avatar>
        </Row>
      </Section>

      <Section title="読み上げ" lead="名前を隣に表示する場合、Avatar は読み上げない。単独の場合は label で名前を付ける。">
        <Row label="名前と並べる">
          <span className="flex items-center gap-3 text-ui" data-testid="avatar-with-name">
            <Avatar>
              <AvatarImage src="/avatars/portrait.png" />
              <AvatarFallback>佐</AvatarFallback>
            </Avatar>
            佐藤 健
          </span>
        </Row>
        <Row label="単独" note='label="佐藤 健"'>
          <Avatar data-testid="avatar-labelled" label="佐藤 健">
            <AvatarImage src="/avatars/portrait.png" />
            <AvatarFallback>佐</AvatarFallback>
          </Avatar>
        </Row>
        <Row label="グループ">
          <AvatarGroup role="img" aria-label="担当者 3 名：山田 花子、佐藤 健、Hanako Yamada">
            <Avatar size="sm">
              <AvatarFallback>{getInitials("山田 花子")}</AvatarFallback>
            </Avatar>
            <Avatar size="sm">
              <AvatarImage src="/avatars/portrait.png" />
              <AvatarFallback>佐</AvatarFallback>
            </Avatar>
            <Avatar size="sm">
              <AvatarFallback>{getInitials("Hanako Yamada")}</AvatarFallback>
            </Avatar>
          </AvatarGroup>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <>
              {["bg-[#fde68a]", "bg-[#bfdbfe]", "bg-[#fecaca]"].map((c, i) => (
                <Avatar key={c}>
                  <AvatarFallback className={c}>{["山", "佐", "HY"][i]}</AvatarFallback>
                </Avatar>
              ))}
            </>
          }
          badNote="人ごとにランダムな背景色を付けている。色に意味がなく、画面が騒がしくなる。"
          good={
            <>
              {["山", "佐", "HY"].map((t) => (
                <Avatar key={t}>
                  <AvatarFallback>{t}</AvatarFallback>
                </Avatar>
              ))}
            </>
          }
          goodNote="背景は muted にそろえ、人の区別は名前で行う。"
        />
      </Section>
    </article>
  )
}
