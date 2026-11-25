// 日本標準産業分類の大分類（一部の名前を短くしている）。選択肢が多い Select の確認用。
export const industries = [
  { value: "agriculture", label: "農業、林業" },
  { value: "fishery", label: "漁業" },
  { value: "mining", label: "鉱業、採石業、砂利採取業" },
  { value: "construction", label: "建設業" },
  { value: "manufacturing", label: "製造業" },
  { value: "utility", label: "電気・ガス・熱供給・水道業" },
  { value: "ict", label: "情報通信業" },
  { value: "transport", label: "運輸業、郵便業" },
  { value: "wholesale", label: "卸売業、小売業" },
  { value: "finance", label: "金融業、保険業" },
  { value: "realestate", label: "不動産業、物品賃貸業" },
  { value: "research", label: "学術研究、専門・技術サービス業" },
  { value: "hospitality", label: "宿泊業、飲食サービス業" },
  { value: "lifestyle", label: "生活関連サービス業、娯楽業" },
  { value: "education", label: "教育、学習支援業" },
  { value: "medical", label: "医療、福祉" },
  { value: "compound", label: "複合サービス事業" },
  { value: "service", label: "サービス業（他に分類されないもの）" },
  { value: "public", label: "公務（他に分類されるものを除く）" },
]

export const plans = [
  { value: "monthly", label: "月額プラン（毎月の請求）" },
  { value: "yearly", label: "年額プラン（年 1 回の請求、2 か月分を割引）" },
]
