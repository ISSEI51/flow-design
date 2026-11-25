import { useState } from "react"
import { addDays } from "date-fns"

import { Calendar } from "@/components/ui/calendar"
import { formatDate, todayIn, type DateRange } from "@/lib/date"

import { Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

function Result({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p data-testid={id} className="w-full text-ui text-muted-foreground tabular-nums">
      {children}
    </p>
  )
}

export function CalendarPage() {
  const today = todayIn()
  const [single, setSingle] = useState<Date | undefined>(today)
  const [multiple, setMultiple] = useState<Date[] | undefined>([addDays(today, 2), addDays(today, 5)])
  const [range, setRange] = useState<DateRange | undefined>({ from: addDays(today, -3), to: addDays(today, 3) })
  const [future, setFuture] = useState<Date | undefined>()
  const [birth, setBirth] = useState<Date | undefined>()

  return (
    <article>
      <PageHeader
        name="Calendar"
        lead="日付を見て選ぶ。単一の日付、複数の日付、期間を選べる。日付を入力する欄には Date Picker を使う。"
      />

      <Section
        title="開始曜日"
        lead="月曜始まりを標準にする。製品のロケールや用途に合わせて変えられる。矢印キーで日付を、PageUp・PageDown で月を移動する。"
      >
        <Row label="月曜始まり" note="標準">
          <div data-testid="calendar-monday">
            <Calendar mode="single" selected={single} onSelect={setSingle} />
          </div>
        </Row>
        <Row label="日曜始まり" note="weekStartsOn={0}">
          <div data-testid="calendar-sunday">
            <Calendar mode="single" weekStartsOn={0} selected={single} onSelect={setSingle} />
          </div>
        </Row>
      </Section>

      <Section title="選択モード" lead="必要なモードを製品が選ぶ。">
        <Row label="単一日付">
          <div data-testid="calendar-single" className="flex flex-col gap-4">
            <Calendar mode="single" selected={single} onSelect={setSingle} />
            <Result id="calendar-single-value">選択中：{formatDate(single) || "なし"}</Result>
          </div>
        </Row>
        <Row label="複数日付" note="もう一度押すと解除する">
          <div data-testid="calendar-multiple" className="flex flex-col gap-4">
            <Calendar mode="multiple" selected={multiple} onSelect={setMultiple} />
            <Result id="calendar-multiple-value">
              {multiple?.length ?? 0} 日：{multiple?.map((d) => formatDate(d)).join("、") || "なし"}
            </Result>
          </div>
        </Row>
        <Row label="期間" note="開始日と終了日を塗り、間を帯で示す">
          <div data-testid="calendar-range" className="flex flex-col gap-4">
            <Calendar mode="range" selected={range} onSelect={setRange} numberOfMonths={2} />
            <Result id="calendar-range-value">
              開始日：{formatDate(range?.from) || "未選択"} ／ 終了日：{formatDate(range?.to) || "未選択"}
            </Result>
          </div>
        </Row>
      </Section>

      <Section title="日付の状態" lead="今日は境界線、選択中は塗りで示し、混同しない。今日を選んだときは、塗りの内側に線を引く。">
        <Row label="今日・選択中・選択不可" note="今日より前と、毎月 15 日は選べない">
          <div data-testid="calendar-states" className="flex flex-col gap-4">
            <Calendar
              mode="single"
              selected={future}
              onSelect={setFuture}
              disabled={[{ before: today }, (d) => d.getDate() === 15]}
            />
            <Result id="calendar-states-value">選択中：{formatDate(future) || "なし"}</Result>
          </div>
        </Row>
      </Section>

      <Section
        title="年月の直接移動"
        lead="年と月はドロップダウンで直接選ぶ。数年前の日付を選ぶために、前月のボタンを何度も押さなくてよい。"
      >
        <Row label="生年月日" note="1926 年〜今年。未来の日は選べない">
          <div data-testid="calendar-birth" className="flex flex-col gap-4">
            <Calendar
              mode="single"
              selected={birth}
              onSelect={setBirth}
              defaultMonth={new Date(1990, 0)}
              startMonth={new Date(1926, 0)}
              endMonth={today}
              disabled={{ after: today }}
            />
            <Result id="calendar-birth-value">選択中：{formatDate(birth) || "なし"}</Result>
          </div>
        </Row>
        <Row label="年月の文字のみ" note="captionLayout=&quot;label&quot;。移動はボタンだけ">
          <Calendar mode="single" captionLayout="label" />
        </Row>
      </Section>

      <Section
        title="今日のタイムゾーン"
        lead="「今日」は、指定したタイムゾーンの年月日で決める。省略するとブラウザのタイムゾーンになる。選んだ日付は年月日だけを持ち、タイムゾーンでずれない。"
      >
        <Row label="東京の今日" note='timeZone="Asia/Tokyo"'>
          <div data-testid="calendar-tokyo" className="flex flex-col gap-4">
            <Calendar mode="single" timeZone="Asia/Tokyo" />
            <Result id="calendar-tokyo-value">
              東京の今日：{formatDate(todayIn("Asia/Tokyo"))} ／ ブラウザの今日：{formatDate(today)}
            </Result>
          </div>
        </Row>
      </Section>
    </article>
  )
}
