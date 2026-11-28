import type { ComponentType } from "react"

import { AppShellPage } from "./pages/app-structure/app-shell-page"
import { StructureChecks } from "./pages/app-structure/checks-page"
import { NavigationPatternPage } from "./pages/app-structure/navigation-page"
import { PageHeaderPatternPage } from "./pages/app-structure/page-header-page"
import { PageLayoutPage } from "./pages/app-structure/page-layout-page"
import { SectionLayoutPage } from "./pages/app-structure/section-layout-page"
import { ShellExamples } from "./pages/app-structure/shell-examples"
import { StructureApp } from "./pages/app-structure/structure-app"
import { CalendarPage } from "./pages/advanced/calendar-page"
import { BrowsingApp } from "./pages/data-browsing/browsing-app"
import { BulkActionsPage } from "./pages/data-browsing/bulk-actions-page"
import { DataStatesPage } from "./pages/data-browsing/data-states-page"
import { ListDetailPage } from "./pages/data-browsing/list-detail-page"
import { SearchFilterPage } from "./pages/data-browsing/search-filter-page"
import { ViewSwitchingPage } from "./pages/data-browsing/view-switching-page"
import { FormsChecksPage } from "./pages/forms-workflows/checks-page"
import { ConfirmationPage } from "./pages/forms-workflows/confirmation-page"
import { CreateEditPage } from "./pages/forms-workflows/create-edit-page"
import { FormLayoutPage } from "./pages/forms-workflows/form-layout-page"
import { FormsApp } from "./pages/forms-workflows/forms-app"
import { ImportExportPage } from "./pages/forms-workflows/import-export-page"
import { MultiStepPage } from "./pages/forms-workflows/multi-step-page"
import { UnsavedChangesPage } from "./pages/forms-workflows/unsaved-changes-page"
import { AnalysisApp } from "./pages/data-analysis/analysis-app"
import { AnalysisFiltersPage } from "./pages/data-analysis/analysis-filters-page"
import { DashboardLayoutPage } from "./pages/data-analysis/dashboard-layout-page"
import { DrillDownPage } from "./pages/data-analysis/drill-down-page"
import { MetricOverviewPage } from "./pages/data-analysis/metric-overview-page"
import { PeriodComparisonPage } from "./pages/data-analysis/period-comparison-page"
import { AccountApp } from "./pages/system-account/account-app"
import { AuthenticationPage } from "./pages/system-account/authentication-page"
import { NotificationsPage } from "./pages/system-account/notifications-page"
import { OnboardingPage } from "./pages/system-account/onboarding-page"
import { PermissionStatesPage } from "./pages/system-account/permission-states-page"
import { SettingsPatternPage } from "./pages/system-account/settings-page"
import { SystemStatesPage } from "./pages/system-account/system-states-page"
import { PatternsIntegrationApp } from "./pages/patterns-integration/pi-app"
import { ComboboxPage } from "./pages/advanced/combobox-page"
import { CommandPage } from "./pages/advanced/command-page"
import { CsvImportPage } from "./pages/advanced/csv-import-page"
import { DatePickerPage } from "./pages/advanced/date-picker-page"
import { EmptyPage } from "./pages/advanced/empty-page"
import { FileUploadPage } from "./pages/advanced/file-upload-page"
import { MultiSelectPage } from "./pages/advanced/multi-select-page"
import { ReportFilterPage } from "./pages/advanced/report-filter-page"
import { ButtonPage } from "./pages/button-page"
import { ChartPage } from "./pages/data-display/chart-page"
import { DashboardPage } from "./pages/data-display/dashboard-page"
import { DataTablePage } from "./pages/data-display/data-table-page"
import { PaginationPage } from "./pages/data-display/pagination-page"
import { TablePage } from "./pages/data-display/table-page"
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
// category は Patterns の分類。省略したページは Components。
export type CatalogCategory = "components" | "app-structure" | "data-browsing" | "forms-workflows" | "data-analysis" | "system-account"

export const categories: { id: CatalogCategory; name: string }[] = [
  { id: "components", name: "Components" },
  { id: "app-structure", name: "Patterns：App Structure" },
  { id: "data-browsing", name: "Patterns：Data Browsing" },
  { id: "forms-workflows", name: "Patterns：Forms & Workflows" },
  { id: "data-analysis", name: "Patterns：Data Analysis" },
  { id: "system-account", name: "Patterns：System & Account" },
]

// hidden のページ（検品用の画面）は、プレビューの上部の一覧に表示しない。
export const catalog: { id: string; name: string; page: ComponentType; fullscreen?: boolean; category?: CatalogCategory; hidden?: boolean }[] = [
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
  { id: "table", name: "Table", page: TablePage },
  { id: "data-table", name: "Data Table", page: DataTablePage },
  { id: "pagination", name: "Pagination", page: PaginationPage },
  { id: "chart", name: "Chart", page: ChartPage },
  { id: "dashboard", name: "ダッシュボードの例", page: DashboardPage },
  { id: "app-shell", name: "App Shell", page: AppShellPage, category: "app-structure" },
  { id: "navigation", name: "Navigation", page: NavigationPatternPage, category: "app-structure" },
  { id: "page-header", name: "Page Header", page: PageHeaderPatternPage, category: "app-structure" },
  { id: "page-layout", name: "Page Layout", page: PageLayoutPage, category: "app-structure" },
  { id: "section-layout", name: "Section Layout", page: SectionLayoutPage, category: "app-structure" },
  { id: "structure-app", name: "営業管理の検証画面", page: StructureApp, fullscreen: true, category: "app-structure" },
  { id: "shell-examples", name: "Shell の例", page: ShellExamples, fullscreen: true, category: "app-structure" },
  { id: "structure-checks", name: "App Structure の検品", page: StructureChecks, fullscreen: true, category: "app-structure", hidden: true },
  { id: "search-filter", name: "Search & Filter", page: SearchFilterPage, category: "data-browsing" },
  { id: "list-detail", name: "List & Detail", page: ListDetailPage, category: "data-browsing" },
  { id: "bulk-actions", name: "Bulk Actions", page: BulkActionsPage, category: "data-browsing" },
  { id: "view-switching", name: "View Switching", page: ViewSwitchingPage, category: "data-browsing" },
  { id: "data-states", name: "Data States", page: DataStatesPage, category: "data-browsing" },
  { id: "browsing-app", name: "営業管理の検証画面（Data Browsing）", page: BrowsingApp, fullscreen: true, category: "data-browsing" },
  { id: "form-layout", name: "Form Layout", page: FormLayoutPage, category: "forms-workflows" },
  { id: "create-edit", name: "Create & Edit", page: CreateEditPage, category: "forms-workflows" },
  { id: "unsaved-changes", name: "Unsaved Changes", page: UnsavedChangesPage, category: "forms-workflows" },
  { id: "confirmation", name: "Confirmation", page: ConfirmationPage, category: "forms-workflows" },
  { id: "multi-step", name: "Multi-step Workflow", page: MultiStepPage, category: "forms-workflows" },
  { id: "import-export", name: "Import & Export", page: ImportExportPage, category: "forms-workflows" },
  { id: "forms-app", name: "営業管理の検証画面（Forms & Workflows）", page: FormsApp, fullscreen: true, category: "forms-workflows" },
  { id: "forms-checks", name: "Forms & Workflows の検品", page: FormsChecksPage, fullscreen: true, category: "forms-workflows", hidden: true },
  { id: "metric-overview", name: "Metric Overview", page: MetricOverviewPage, category: "data-analysis" },
  { id: "dashboard-layout", name: "Dashboard Layout", page: DashboardLayoutPage, category: "data-analysis" },
  { id: "analysis-filters", name: "Analysis Filters", page: AnalysisFiltersPage, category: "data-analysis" },
  { id: "period-comparison", name: "Period Comparison", page: PeriodComparisonPage, category: "data-analysis" },
  { id: "drill-down", name: "Drill-down", page: DrillDownPage, category: "data-analysis" },
  { id: "analysis-app", name: "営業管理の検証画面（Data Analysis）", page: AnalysisApp, fullscreen: true, category: "data-analysis" },
  { id: "authentication", name: "Authentication", page: AuthenticationPage, category: "system-account" },
  { id: "settings", name: "Settings", page: SettingsPatternPage, category: "system-account" },
  { id: "onboarding", name: "Onboarding", page: OnboardingPage, category: "system-account" },
  { id: "permission-states", name: "Permission States", page: PermissionStatesPage, category: "system-account" },
  { id: "system-states", name: "System States", page: SystemStatesPage, category: "system-account" },
  { id: "notifications", name: "Notifications", page: NotificationsPage, category: "system-account" },
  { id: "account-app", name: "営業管理の検証画面（System & Account）", page: AccountApp, fullscreen: true, category: "system-account" },
  { id: "patterns-integration", name: "Patterns の横断の検証画面", page: PatternsIntegrationApp, fullscreen: true, category: "system-account", hidden: true },
]
