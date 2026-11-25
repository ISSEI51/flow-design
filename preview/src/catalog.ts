import type { ComponentType } from "react"

import { ButtonPage } from "./pages/button-page"
import { CheckboxPage } from "./pages/forms/checkbox-page"
import { CustomerFormPage } from "./pages/forms/customer-form-page"
import { FieldPage } from "./pages/forms/field-page"
import { InputPage } from "./pages/forms/input-page"
import { LabelPage } from "./pages/forms/label-page"
import { RadioGroupPage } from "./pages/forms/radio-group-page"
import { SelectPage } from "./pages/forms/select-page"
import { SwitchPage } from "./pages/forms/switch-page"
import { TextareaPage } from "./pages/forms/textarea-page"

// コンポーネントを追加するときは、ページを作ってここに 1 行足す。
export const catalog: { id: string; name: string; page: ComponentType }[] = [
  { id: "button", name: "Button", page: ButtonPage },
  { id: "input", name: "Input", page: InputPage },
  { id: "textarea", name: "Textarea", page: TextareaPage },
  { id: "label", name: "Label", page: LabelPage },
  { id: "select", name: "Select", page: SelectPage },
  { id: "checkbox", name: "Checkbox", page: CheckboxPage },
  { id: "radio-group", name: "Radio Group", page: RadioGroupPage },
  { id: "switch", name: "Switch", page: SwitchPage },
  { id: "field", name: "Field", page: FieldPage },
  { id: "customer-form", name: "フォームの例", page: CustomerFormPage },
]
