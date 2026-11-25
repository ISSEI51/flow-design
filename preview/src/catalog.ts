import type { ComponentType } from "react"

import { CalendarPage } from "./pages/advanced/calendar-page"
import { ComboboxPage } from "./pages/advanced/combobox-page"
import { CommandPage } from "./pages/advanced/command-page"
import { CsvImportPage } from "./pages/advanced/csv-import-page"
import { DatePickerPage } from "./pages/advanced/date-picker-page"
import { EmptyPage } from "./pages/advanced/empty-page"
import { FileUploadPage } from "./pages/advanced/file-upload-page"
import { MultiSelectPage } from "./pages/advanced/multi-select-page"
import { ReportFilterPage } from "./pages/advanced/report-filter-page"
import { ButtonPage } from "./pages/button-page"
import { AlertPage } from "./pages/feedback/alert-page"
import { AvatarPage } from "./pages/feedback/avatar-page"
import { BadgePage } from "./pages/feedback/badge-page"
import { BillingPage } from "./pages/feedback/billing-page"
import { ProgressPage } from "./pages/feedback/progress-page"
import { SkeletonPage } from "./pages/feedback/skeleton-page"
import { ToastPage } from "./pages/feedback/toast-page"
import { TooltipPage } from "./pages/feedback/tooltip-page"
import { AccordionPage } from "./pages/navigation/accordion-page"
import { AppPage } from "./pages/navigation/app-page"
import { BreadcrumbPageDemo } from "./pages/navigation/breadcrumb-page"
import { CardPage } from "./pages/navigation/card-page"
import { SeparatorPage } from "./pages/navigation/separator-page"
import { SidebarPage } from "./pages/navigation/sidebar-page"
import { TabsPage } from "./pages/navigation/tabs-page"
import { CheckboxPage } from "./pages/forms/checkbox-page"
import { CustomerFormPage } from "./pages/forms/customer-form-page"
import { FieldPage } from "./pages/forms/field-page"
import { InputPage } from "./pages/forms/input-page"
import { LabelPage } from "./pages/forms/label-page"
import { RadioGroupPage } from "./pages/forms/radio-group-page"
import { SelectPage } from "./pages/forms/select-page"
import { SwitchPage } from "./pages/forms/switch-page"
import { TextareaPage } from "./pages/forms/textarea-page"
import { AlertDialogPage } from "./pages/overlays/alert-dialog-page"
import { DialogPage } from "./pages/overlays/dialog-page"
import { DrawerPage } from "./pages/overlays/drawer-page"
import { DropdownMenuPage } from "./pages/overlays/dropdown-menu-page"
import { PopoverPage } from "./pages/overlays/popover-page"
import { SheetPage } from "./pages/overlays/sheet-page"

// コンポーネントを追加するときは、ページを作ってここに 1 行足す。
// fullscreen のページは、プレビューの見出しを付けずに画面全体で表示する。
export const catalog: { id: string; name: string; page: ComponentType; fullscreen?: boolean }[] = [
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
  { id: "badge", name: "Badge", page: BadgePage },
  { id: "avatar", name: "Avatar", page: AvatarPage },
  { id: "tooltip", name: "Tooltip", page: TooltipPage },
  { id: "alert", name: "Alert", page: AlertPage },
  { id: "toast", name: "Toast", page: ToastPage },
  { id: "skeleton", name: "Skeleton", page: SkeletonPage },
  { id: "progress", name: "Progress", page: ProgressPage },
  { id: "billing", name: "請求書の例", page: BillingPage },
  { id: "dialog", name: "Dialog", page: DialogPage },
  { id: "alert-dialog", name: "Alert Dialog", page: AlertDialogPage },
  { id: "popover", name: "Popover", page: PopoverPage },
  { id: "dropdown-menu", name: "Dropdown Menu", page: DropdownMenuPage },
  { id: "sheet", name: "Sheet", page: SheetPage },
  { id: "drawer", name: "Drawer", page: DrawerPage },
  { id: "sidebar", name: "Sidebar", page: SidebarPage },
  { id: "tabs", name: "Tabs", page: TabsPage },
  { id: "breadcrumb", name: "Breadcrumb", page: BreadcrumbPageDemo },
  { id: "card", name: "Card", page: CardPage },
  { id: "accordion", name: "Accordion", page: AccordionPage },
  { id: "separator", name: "Separator", page: SeparatorPage },
  { id: "app", name: "業務アプリの例", page: AppPage, fullscreen: true },
  { id: "combobox", name: "Combobox", page: ComboboxPage },
  { id: "multi-select", name: "Multi Select", page: MultiSelectPage },
  { id: "command", name: "Command", page: CommandPage },
  { id: "calendar", name: "Calendar", page: CalendarPage },
  { id: "date-picker", name: "Date Picker", page: DatePickerPage },
  { id: "file-upload", name: "File Upload", page: FileUploadPage },
  { id: "empty", name: "Empty", page: EmptyPage },
  { id: "report-filter", name: "集計条件の例", page: ReportFilterPage },
  { id: "csv-import", name: "CSV 取り込みの例", page: CsvImportPage },
]
