"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLanguage } from "@/app/_components/language-provider";
import { displayChineseText, displayVisaType } from "@/app/_lib/chinese-display";
import {
  displayVisaTemplateItemInstruction,
  displayVisaTemplateItemTitle,
  displayVisaTemplateTitle,
} from "@/app/_lib/visa-template-translations";
import {
  apiGet,
  apiPost,
  createCaseFromTemplateSelection,
  formatDateTime,
  toAdminErrorMessage,
  type AdminCustomerList,
  type AdminCustomerListItem,
  type AdminTemplateDetail,
  type AdminTemplateList,
  type AdminTemplateListItem,
  type CreatedCaseFromTemplateSelection,
  type CreatedToken,
  type TemplateSelectionCustomItemInput,
} from "../_lib/admin-api";
import {
  DashboardCard,
  DateTextInput,
  EmptyState,
  ErrorBanner,
  ProgressStepper,
  SectionHeader,
  StatusBadge,
  cx,
} from "./ui";

type CustomerMode = "create" | "reuse";
type ResponsibleParty = "customer" | "office";
type VisaBusinessType = "certification" | "renewal" | "change";

type NewCustomerForm = {
  name: string;
  email: string;
  phone: string;
  address: string;
  nationality: string;
  birthday: string;
};

type CustomItemForm = {
  id: string;
  title: string;
  responsibleParty: ResponsibleParty;
  customerInstruction: string;
  internalNote: string;
  dueDate: string;
  portalVisible: boolean;
  portalDownloadable: boolean;
  isCollapsed: boolean;
};

const currentVisaTypes = [
  "无",
  "高度専門職 学术研究",
  "高度専門職 专业・技术",
  "高度専門職 经营・管理",
  "経営・管理",
  "技術・人文知識・国際業務",
  "企業内転勤",
  "技能",
  "特定技能",
  "留学",
  "家族滞在",
  "日本人の配偶者等",
  "永住者",
  "永住者の配偶者等",
  "定住者",
];

const targetVisaTypes = currentVisaTypes.filter((visaType) => visaType !== "无");
const changeCurrentVisaTypes = targetVisaTypes;
const todayDateValue = new Date().toISOString().slice(0, 10);
const creationSteps = ["选择客户", "选择签证", "选择材料模板", "确认材料清单", "创建案件", "生成客户链接"];

const newCaseText = {
  zh: {
    title: "新建案件",
    progress: "建案进度",
    createCustomer: "新建客户",
    reuseCustomer: "复用客户",
    stepLabels: {
      选择客户: "选择客户",
      选择签证: "选择签证",
      选择材料模板: "选择材料模板",
      确认材料清单: "确认材料清单",
      创建案件: "创建案件",
      生成客户链接: "生成客户链接",
    },
    stepTitles: {
      customer: "Step 1：选择客户",
      visa: "Step 2：选择签证",
      template: "Step 3：选择材料模板",
      checklist: "Step 4：确认材料清单",
      create: "Step 5：创建案件",
      token: "Step 6：生成客户链接",
    },
    placeholders: {
      customerName: "客户姓名",
      email: "邮箱",
      phone: "电话",
      nationality: "国籍",
      birthday: "出生日期 YYYY-MM-DD",
      address: "地址（可选，不会在搜索结果中显示）",
      customerSearch: "按姓名、邮箱、电话搜索",
      caseTitle: "案件标题（可选）",
      internalNote: "内部备注（仅后台可见，可选）",
      customTitle: "例如：补充说明书",
      customerInstruction: "客户提交材料时会显示给客户，可选",
      internalOnly: "仅后台可见，可选",
      dueDate: "截止日期 YYYY-MM-DD",
    },
    labels: {
      visaBusinessType: "签证业务类型",
      currentVisaType: "现有签证类型",
      targetVisaType: "申请签证类型",
      selected: "已选择",
      excluded: "已排除",
      customAdded: "自定义追加",
      customerItems: "客户提交材料",
      officeItems: "事务所做成材料",
      customItems: "自定义追加材料",
      itemCount: "{count} 项",
      customer: "客户",
      templateAndItems: "模板与材料",
      customerMode: "客户模式",
      template: "模板",
      items: "材料",
      case: "案件",
      token: "客户访问链接",
      itemName: "材料名称（必填）",
      responsibleParty: "负责方",
      customerInstruction: "客户说明",
      internalNote: "内部备注",
      dueDate: "截止日期",
      expiresAt: "有效期：",
    },
    actions: {
      search: "搜索",
      searching: "搜索中...",
      generate: "生成材料一览",
      generating: "生成材料一览中...",
      addItem: "追加材料",
      edit: "点击修改",
      confirm: "确定",
      delete: "删除",
      createCase: "确认创建案件",
      creating: "创建中...",
      created: "案件已创建",
      createToken: "创建客户访问链接",
      tokenCreated: "客户访问链接已创建",
      copyToken: "复制访问令牌",
      openCase: "打开案件详情",
    },
    messages: {
      customerSearchEmpty: "没有找到匹配客户",
      customerSearchEmptyDescription: "可以换关键词继续搜索，或切换到“新建客户”录入新客户。",
      templateIntro: "请选择签证业务类型和申请签证类型后生成材料一览。",
      noTemplate: "没有匹配模板",
      noTemplateDescription: "请检查模板状态、签证业务类型和申请签证类型。当前模板只匹配 active 状态。",
      chooseTemplate: "请先选择模板。",
      noItems: "没有材料",
      noItemsDescription: "当前模板在这个分组下没有材料。",
      noCustomItems: "还没有追加材料",
      noCustomItemsDescription: "可追加客户提交材料或事务所做成材料。",
      noExistingCustomer: "尚未选择已有客户",
      noCustomerName: "尚未填写客户姓名",
      noSelectedTemplate: "尚未选择模板",
      createTokenAfterCase: "案件创建后可以选择创建客户访问链接。",
      tokenOnceTitle: "明文访问令牌只显示一次。",
      tokenOnceDescription: "离开或刷新页面后无法再次查看明文访问令牌。请立即复制，并通过安全渠道发送给客户。",
      noFixedExpiry: "无固定过期时间",
      notSelected: "未选择",
      notCreated: "未创建",
    },
    errors: {
      changeSameVisa: "变更业务中，现有签证类型和申请签证类型不能相同；如果相同请选择“更新”。",
      customerSearch: "客户搜索失败，请稍后重试。",
      templateList: "模板列表加载失败，请稍后重试。",
      templateMissing: "模板不存在或已不可用，请重新选择。",
      templateDetail: "模板详情加载失败，请稍后重试。",
      customItemTitle: "请先填写必填项目：材料名称。",
      selectCustomer: "请先选择一个已有客户。",
      customerName: "请填写客户姓名。",
      selectTemplate: "请先选择模板并加载材料预览。",
      keepOneItem: "请至少保留一个模板材料，或追加一个自定义材料。",
      createCase: "案件创建失败，请检查材料选择后重试。",
      createTokenFirstCase: "请先创建案件，再创建客户访问链接。",
      createToken: "客户访问链接创建失败。案件已创建，可以稍后在详情页重试。",
      copyFailed: "复制失败，请手动复制访问令牌文本。",
    },
    success: {
      caseCreated: "案件 {caseNumber} 已创建，已生成 {count} 个材料项。",
      tokenCreated: "客户访问链接已创建。明文访问令牌只在当前界面显示一次。",
      copied: "已复制。请只通过安全渠道发送给客户。",
      createdSummary: "已创建：{caseNumber}，材料项 {count} 个。",
      selectedSummary: "已选择 {selected} 项，排除 {excluded} 项，自定义 {custom} 项",
    },
    businessTypes: {
      certification: {
        label: "认定",
        description: "没有现有签证，从在留资格认定证明书开始申请。",
      },
      renewal: {
        label: "更新",
        description: "现有签证和申请签证相同，只选择申请签证类型。",
      },
      change: {
        label: "变更",
        description: "现有签证和申请签证不同，需要同时选择两种签证类型。",
      },
    },
  },
  ja: {
    title: "新規案件",
    progress: "作成進捗",
    createCustomer: "新規顧客",
    reuseCustomer: "既存顧客を使用",
    stepLabels: {
      选择客户: "お客様選択",
      选择签证: "ビザ選択",
      选择材料模板: "資料テンプレート選択",
      确认材料清单: "資料リスト確認",
      创建案件: "案件作成",
      生成客户链接: "お客様リンク発行",
    },
    stepTitles: {
      customer: "Step 1：お客様選択",
      visa: "Step 2：ビザ選択",
      template: "Step 3：資料テンプレート選択",
      checklist: "Step 4：資料リスト確認",
      create: "Step 5：案件作成",
      token: "Step 6：お客様リンク発行",
    },
    placeholders: {
      customerName: "お客様名",
      email: "メール",
      phone: "電話番号",
      nationality: "国籍",
      birthday: "生年月日 YYYY-MM-DD",
      address: "住所（任意、検索結果には表示されません）",
      customerSearch: "氏名、メール、電話番号で検索",
      caseTitle: "案件タイトル（任意）",
      internalNote: "内部メモ（管理画面のみ、任意）",
      customTitle: "例：補足説明書",
      customerInstruction: "お客様の提出画面に表示されます（任意）",
      internalOnly: "管理画面のみ（任意）",
      dueDate: "提出期限 YYYY-MM-DD",
    },
    labels: {
      visaBusinessType: "ビザ業務種別",
      currentVisaType: "現在のビザ種別",
      targetVisaType: "申請ビザ種別",
      selected: "選択済み",
      excluded: "除外",
      customAdded: "追加作成",
      customerItems: "お客様提出資料",
      officeItems: "事務所作成資料",
      customItems: "追加資料",
      itemCount: "{count} 件",
      customer: "お客様",
      templateAndItems: "テンプレートと資料",
      customerMode: "顧客モード",
      template: "テンプレート",
      items: "資料",
      case: "案件",
      token: "お客様リンク",
      itemName: "資料名（必須）",
      responsibleParty: "担当",
      customerInstruction: "お客様向け説明",
      internalNote: "内部メモ",
      dueDate: "提出期限",
      expiresAt: "有効期限：",
    },
    actions: {
      search: "検索",
      searching: "検索中...",
      generate: "資料リストを生成",
      generating: "生成中...",
      addItem: "資料を追加",
      edit: "クリックして編集",
      confirm: "確定",
      delete: "削除",
      createCase: "案件を作成",
      creating: "作成中...",
      created: "案件作成済み",
      createToken: "お客様リンクを作成",
      tokenCreated: "お客様リンク作成済み",
      copyToken: "アクセストークンをコピー",
      openCase: "案件詳細を開く",
    },
    messages: {
      customerSearchEmpty: "一致する顧客がありません",
      customerSearchEmptyDescription: "別のキーワードで検索するか、「新規顧客」に切り替えて入力してください。",
      templateIntro: "ビザ業務種別と申請ビザ種別を選択してから資料リストを生成してください。",
      noTemplate: "一致するテンプレートがありません",
      noTemplateDescription: "テンプレート状態、ビザ業務種別、申請ビザ種別を確認してください。現在は active 状態のみ対象です。",
      chooseTemplate: "先にテンプレートを選択してください。",
      noItems: "資料がありません",
      noItemsDescription: "このテンプレートの該当グループには資料がありません。",
      noCustomItems: "追加資料はまだありません",
      noCustomItemsDescription: "お客様提出資料または事務所作成資料を追加できます。",
      noExistingCustomer: "既存顧客が未選択です",
      noCustomerName: "お客様名が未入力です",
      noSelectedTemplate: "テンプレートが未選択です",
      createTokenAfterCase: "案件作成後にお客様リンクを作成できます。",
      tokenOnceTitle: "平文アクセストークンは一度だけ表示されます。",
      tokenOnceDescription: "画面を離れる、または更新すると再表示できません。今すぐコピーし、安全な方法でお客様へ送付してください。",
      noFixedExpiry: "固定の有効期限なし",
      notSelected: "未選択",
      notCreated: "未作成",
    },
    errors: {
      changeSameVisa: "変更業務では、現在のビザ種別と申請ビザ種別を同じにできません。同じ場合は「更新」を選択してください。",
      customerSearch: "顧客検索に失敗しました。しばらくしてから再度お試しください。",
      templateList: "テンプレート一覧の読み込みに失敗しました。しばらくしてから再度お試しください。",
      templateMissing: "テンプレートが存在しない、または利用できません。再度選択してください。",
      templateDetail: "テンプレート詳細の読み込みに失敗しました。しばらくしてから再度お試しください。",
      customItemTitle: "必須項目の資料名を入力してください。",
      selectCustomer: "既存顧客を選択してください。",
      customerName: "お客様名を入力してください。",
      selectTemplate: "テンプレートを選択し、資料プレビューを読み込んでください。",
      keepOneItem: "テンプレート資料を1件以上残すか、追加資料を1件作成してください。",
      createCase: "案件作成に失敗しました。資料選択を確認してから再度お試しください。",
      createTokenFirstCase: "先に案件を作成してからお客様リンクを作成してください。",
      createToken: "お客様リンクの作成に失敗しました。案件は作成済みのため、後で詳細画面から再試行できます。",
      copyFailed: "コピーに失敗しました。アクセストークンを手動で選択してください。",
    },
    success: {
      caseCreated: "案件 {caseNumber} を作成し、資料項目 {count} 件を生成しました。",
      tokenCreated: "お客様リンクを作成しました。平文アクセストークンはこの画面で一度だけ表示されます。",
      copied: "コピーしました。安全な方法でのみお客様へ送付してください。",
      createdSummary: "作成済み：{caseNumber}、資料項目 {count} 件。",
      selectedSummary: "選択済み {selected} 件、除外 {excluded} 件、追加 {custom} 件",
    },
    businessTypes: {
      certification: {
        label: "認定",
        description: "現在のビザがない場合。在留資格認定証明書交付申請から開始します。",
      },
      renewal: {
        label: "更新",
        description: "現在のビザと申請ビザが同じ場合。申請ビザ種別のみ選択します。",
      },
      change: {
        label: "変更",
        description: "現在のビザと申請ビザが異なる場合。両方のビザ種別を選択します。",
      },
    },
  },
} as const;

function interpolate(template: string, params: Record<string, string | number>) {
  return Object.entries(params).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function createEmptyCustomer(): NewCustomerForm {
  return {
    name: "",
    email: "",
    phone: "",
    address: "",
    nationality: "",
    birthday: "",
  };
}

function createEmptyCustomItem(): CustomItemForm {
  return {
    id: crypto.randomUUID(),
    title: "",
    responsibleParty: "customer",
    customerInstruction: "",
    internalNote: "",
    dueDate: "",
    portalVisible: true,
    portalDownloadable: false,
    isCollapsed: false,
  };
}

function toOptionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toCustomItemInput(item: CustomItemForm): TemplateSelectionCustomItemInput {
  return {
    title: item.title.trim(),
    responsibleParty: item.responsibleParty,
    customerInstruction: toOptionalText(item.customerInstruction),
    internalNote: toOptionalText(item.internalNote),
    dueDate: toOptionalText(item.dueDate),
    portalVisible: item.portalDownloadable ? true : item.portalVisible,
    portalDownloadable: item.portalDownloadable,
  };
}

function groupTemplateItems(templateDetail: AdminTemplateDetail | null) {
  const items = templateDetail?.items ?? [];
  return {
    customer: items.filter((item) => item.responsibleParty === "customer"),
    office: items.filter((item) => item.responsibleParty === "office"),
  };
}

function formatTemplateDisplayName(template: {
  templateKey: string;
  version: number;
  currentVisaType: string | null;
  targetVisaType: string | null;
  title?: string;
}, locale: "zh" | "ja") {
  if (locale === "ja") {
    return displayVisaTemplateTitle(template, locale);
  }

  if (!template.currentVisaType || !template.targetVisaType) {
    return displayChineseText(template.title ?? "材料一览模板");
  }

  const currentVisaType = displayVisaType(template.currentVisaType, locale);
  const targetVisaType = displayVisaType(template.targetVisaType, locale);

  if (template.currentVisaType === "无") {
    return `${targetVisaType}认定`;
  }

  if (template.currentVisaType === template.targetVisaType) {
    return `${targetVisaType}更新`;
  }

  return `${currentVisaType}→${targetVisaType}变更`;
}

export function AdminNewCasePage() {
  const { locale } = useLanguage();
  const text = newCaseText[locale];
  const visaBusinessTypeOptions = [
    { value: "certification", ...text.businessTypes.certification },
    { value: "renewal", ...text.businessTypes.renewal },
    { value: "change", ...text.businessTypes.change },
  ] satisfies Array<{ value: VisaBusinessType; label: string; description: string }>;
  const [customerMode, setCustomerMode] = useState<CustomerMode>("create");
  const [newCustomer, setNewCustomer] = useState<NewCustomerForm>(createEmptyCustomer);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<AdminCustomerListItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<AdminCustomerListItem | null>(null);
  const [isSearchingCustomers, setIsSearchingCustomers] = useState(false);
  const [hasSearchedCustomers, setHasSearchedCustomers] = useState(false);

  const [visaBusinessType, setVisaBusinessType] = useState<VisaBusinessType>("certification");
  const [existingVisaType, setExistingVisaType] = useState("无");
  const [applyingVisaType, setApplyingVisaType] = useState(targetVisaTypes[0]);
  const [caseTitle, setCaseTitle] = useState("");
  const [caseInternalNote, setCaseInternalNote] = useState("");

  const [templates, setTemplates] = useState<AdminTemplateListItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<AdminTemplateListItem | null>(null);
  const [templateDetail, setTemplateDetail] = useState<AdminTemplateDetail | null>(null);
  const [selectedTemplateItemIds, setSelectedTemplateItemIds] = useState<Set<string>>(new Set());
  const [hasLoadedTemplates, setHasLoadedTemplates] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  const [customItems, setCustomItems] = useState<CustomItemForm[]>([]);
  const [createdCase, setCreatedCase] = useState<CreatedCaseFromTemplateSelection | null>(null);
  const [createdToken, setCreatedToken] = useState<CreatedToken | null>(null);
  const [tokenCopyMessage, setTokenCopyMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groupedItems = useMemo(() => groupTemplateItems(templateDetail), [templateDetail]);
  const selectedCount = selectedTemplateItemIds.size;
  const totalTemplateItems = templateDetail?.items.length ?? 0;
  const excludedCount = Math.max(0, totalTemplateItems - selectedCount);
  const validCustomItems = customItems.filter((item) => item.title.trim());
  const templateCurrentVisaType =
    visaBusinessType === "certification"
      ? "无"
      : visaBusinessType === "renewal"
        ? applyingVisaType
        : existingVisaType;
  const businessTypeDescription =
    visaBusinessTypeOptions.find((option) => option.value === visaBusinessType)?.description ?? "";
  const currentStep =
    createdToken
      ? "生成客户链接"
      : createdCase
        ? "生成客户链接"
        : templateDetail
          ? "确认材料清单"
          : templates.length
            ? "选择材料模板"
            : "选择客户";

  async function searchCustomers() {
    if (!customerSearch.trim()) {
      setCustomerResults([]);
      setHasSearchedCustomers(false);
      return;
    }

    try {
      setIsSearchingCustomers(true);
      setError(null);
      const result = await apiGet<AdminCustomerList>(
        `/api/admin/customers?q=${encodeURIComponent(customerSearch.trim())}`,
      );
      setCustomerResults(result.items);
      setHasSearchedCustomers(true);
    } catch (searchError) {
      setError(toAdminErrorMessage(searchError, text.errors.customerSearch));
    } finally {
      setIsSearchingCustomers(false);
    }
  }

  function clearTemplateSelection() {
    setTemplates([]);
    setSelectedTemplate(null);
    setTemplateDetail(null);
    setSelectedTemplateItemIds(new Set());
    setHasLoadedTemplates(false);
  }

  function handleVisaBusinessTypeChange(nextType: VisaBusinessType) {
    setVisaBusinessType(nextType);
    clearTemplateSelection();

    if (nextType === "certification") {
      setExistingVisaType("无");
      return;
    }

    if (nextType === "renewal") {
      setExistingVisaType(applyingVisaType);
      return;
    }

    if (existingVisaType === "无" || existingVisaType === applyingVisaType) {
      setExistingVisaType(
        changeCurrentVisaTypes.find((visaType) => visaType !== applyingVisaType) ??
          changeCurrentVisaTypes[0],
      );
    }
  }

  function handleApplyingVisaTypeChange(nextVisaType: string) {
    setApplyingVisaType(nextVisaType);
    clearTemplateSelection();

    if (visaBusinessType === "renewal") {
      setExistingVisaType(nextVisaType);
    }

    if (visaBusinessType === "change" && existingVisaType === nextVisaType) {
      setExistingVisaType(
        changeCurrentVisaTypes.find((visaType) => visaType !== nextVisaType) ??
          changeCurrentVisaTypes[0],
      );
    }
  }

  function handleExistingVisaTypeChange(nextVisaType: string) {
    setExistingVisaType(nextVisaType);
    clearTemplateSelection();
  }

  async function loadTemplates() {
    if (visaBusinessType === "change" && templateCurrentVisaType === applyingVisaType) {
      setError(text.errors.changeSameVisa);
      return;
    }

    try {
      setIsLoadingTemplates(true);
      setError(null);
      setMessage(null);
      setTemplates([]);
      setSelectedTemplate(null);
      setTemplateDetail(null);
      setSelectedTemplateItemIds(new Set());
      const query = new URLSearchParams({
        status: "active",
        currentVisaType: templateCurrentVisaType,
        targetVisaType: applyingVisaType,
      });
      const result = await apiGet<AdminTemplateList>(`/api/admin/templates?${query.toString()}`);
      setTemplates(result.items);
      setHasLoadedTemplates(true);
      if (result.items.length === 1) {
        await selectTemplate(result.items[0]);
      }
    } catch (templateError) {
      setError(toAdminErrorMessage(templateError, text.errors.templateList));
    } finally {
      setIsLoadingTemplates(false);
    }
  }

  async function selectTemplate(template: AdminTemplateListItem) {
    try {
      setIsLoadingTemplates(true);
      setError(null);
      setSelectedTemplate(template);
      const detail = await apiGet<AdminTemplateDetail | null>(`/api/admin/templates/${template.id}`);
      if (!detail) {
        setTemplateDetail(null);
        setSelectedTemplateItemIds(new Set());
        setError(text.errors.templateMissing);
        return;
      }

      setTemplateDetail(detail);
      setSelectedTemplateItemIds(new Set(detail.items.map((item) => item.id)));
    } catch (templateError) {
      setError(toAdminErrorMessage(templateError, text.errors.templateDetail));
    } finally {
      setIsLoadingTemplates(false);
    }
  }

  function toggleTemplateItem(itemId: string) {
    setSelectedTemplateItemIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  }

  function updateCustomItem(itemId: string, patch: Partial<CustomItemForm>) {
    setCustomItems((items) =>
      items.map((item) => {
        if (item.id !== itemId) {
          return item;
        }

        const next = { ...item, ...patch };
        if (patch.responsibleParty === "customer") {
          next.portalVisible = true;
        }
        if (patch.responsibleParty === "office" && patch.portalDownloadable !== true) {
          next.portalVisible = false;
        }
        if (patch.portalDownloadable === true) {
          next.portalVisible = true;
        }
        return next;
      }),
    );
  }

  function confirmCustomItem(item: CustomItemForm) {
    if (!item.title.trim()) {
      setError(text.errors.customItemTitle);
      return;
    }

    setError(null);
    updateCustomItem(item.id, { isCollapsed: true });
  }

  async function createCaseWithSelection() {
    if (customerMode === "reuse" && !selectedCustomer) {
      setError(text.errors.selectCustomer);
      return;
    }

    if (customerMode === "create" && !newCustomer.name.trim()) {
      setError(text.errors.customerName);
      return;
    }

    if (!templateDetail || !selectedTemplate) {
      setError(text.errors.selectTemplate);
      return;
    }

    if (selectedTemplateItemIds.size === 0 && validCustomItems.length === 0) {
      setError(text.errors.keepOneItem);
      return;
    }

    try {
      setIsBusy(true);
      setError(null);
      setMessage(null);
      setCreatedToken(null);
      setTokenCopyMessage(null);
      const result = await createCaseFromTemplateSelection({
        customer:
          customerMode === "reuse"
            ? {
                mode: "reuse",
                customerId: selectedCustomer?.id ?? "",
              }
            : {
                mode: "create",
                name: newCustomer.name,
                email: newCustomer.email,
                phone: newCustomer.phone,
                address: newCustomer.address,
                nationality: newCustomer.nationality,
                birthday: newCustomer.birthday,
              },
        existingVisaType: templateCurrentVisaType,
        applyingVisaType,
        title: caseTitle,
        internalNote: caseInternalNote,
        templateId: selectedTemplate.id,
        selectedTemplateItemIds: Array.from(selectedTemplateItemIds),
        customItems: validCustomItems.map(toCustomItemInput),
      });
      setCreatedCase(result);
      setMessage(
        interpolate(text.success.caseCreated, {
          caseNumber: result.caseNumber,
          count: result.requirementIds.length,
        }),
      );
    } catch (createError) {
      setError(toAdminErrorMessage(createError, text.errors.createCase));
    } finally {
      setIsBusy(false);
    }
  }

  async function createToken() {
    if (!createdCase) {
      setError(text.errors.createTokenFirstCase);
      return;
    }

    try {
      setIsBusy(true);
      setError(null);
      setTokenCopyMessage(null);
      const result = await apiPost<CreatedToken>(`/api/admin/cases/${createdCase.caseId}/token/create`, {
        reason: "Created during case creation.",
      });
      setCreatedToken(result);
      setMessage(text.success.tokenCreated);
    } catch (tokenError) {
      setError(toAdminErrorMessage(tokenError, text.errors.createToken));
    } finally {
      setIsBusy(false);
    }
  }

  async function copyToken() {
    if (!createdToken) {
      return;
    }

    try {
      await navigator.clipboard.writeText(createdToken.plaintextToken);
      setTokenCopyMessage(text.success.copied);
    } catch {
      setTokenCopyMessage(text.errors.copyFailed);
    }
  }

  function renderTemplateItemGroup(title: string, items: AdminTemplateDetail["items"]) {
    return (
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
          <span className="text-xs text-slate-500">
            {interpolate(text.labels.itemCount, { count: items.length })}
          </span>
        </div>
        {items.length === 0 ? (
          <EmptyState
            title={text.messages.noItems}
            description={text.messages.noItemsDescription}
          />
        ) : (
          <div className="grid gap-2">
            {items.map((item) => {
              const itemTitle = templateDetail
                ? displayVisaTemplateItemTitle(templateDetail, item, locale)
                : item.title;
              const itemInstruction = templateDetail
                ? displayVisaTemplateItemInstruction(templateDetail, item, locale)
                : (item.customerInstruction ?? "");

              return (
                <label
                  key={item.id}
                  className={cx(
                    "flex gap-3 rounded-2xl border p-3 text-sm transition",
                    selectedTemplateItemIds.has(item.id)
                      ? "border-blue-200 bg-blue-50"
                      : "border-slate-200 bg-white opacity-70",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedTemplateItemIds.has(item.id)}
                    onChange={() => toggleTemplateItem(item.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                    disabled={Boolean(createdCase)}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-950">
                      {locale === "ja" ? itemTitle : displayChineseText(itemTitle)}
                    </span>
                    {itemInstruction ? (
                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        {locale === "ja" ? itemInstruction : displayChineseText(itemInstruction)}
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          {text.title}
        </h1>
      </div>

      {message ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
        <DashboardCard className="h-fit">
          <SectionHeader title={text.progress} />
          <ProgressStepper
            steps={creationSteps}
            currentStep={currentStep}
            formatLabel={(step) =>
              text.stepLabels[step as keyof typeof text.stepLabels] ?? step
            }
          />
        </DashboardCard>

        <div className="grid gap-6">
          <DashboardCard>
            <SectionHeader title={text.stepTitles.customer} />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCustomerMode("create")}
                disabled={Boolean(createdCase)}
                className={cx(
                  "rounded-2xl px-3 py-2 text-sm font-medium transition",
                  customerMode === "create"
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                )}
              >
                {text.createCustomer}
              </button>
              <button
                type="button"
                onClick={() => setCustomerMode("reuse")}
                disabled={Boolean(createdCase)}
                className={cx(
                  "rounded-2xl px-3 py-2 text-sm font-medium transition",
                  customerMode === "reuse"
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                )}
              >
                {text.reuseCustomer}
              </button>
            </div>

            {customerMode === "create" ? (
              <div className="mt-4 grid gap-3">
                <input
                  value={newCustomer.name}
                  onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })}
                  required
                  placeholder={text.placeholders.customerName}
                  className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  disabled={Boolean(createdCase)}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={newCustomer.email}
                    onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })}
                    type="email"
                    placeholder={text.placeholders.email}
                    className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    disabled={Boolean(createdCase)}
                  />
                  <input
                    value={newCustomer.phone}
                    onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })}
                    placeholder={text.placeholders.phone}
                    className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    disabled={Boolean(createdCase)}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={newCustomer.nationality}
                    onChange={(event) => setNewCustomer({ ...newCustomer, nationality: event.target.value })}
                    placeholder={text.placeholders.nationality}
                    className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    disabled={Boolean(createdCase)}
                  />
                  <DateTextInput
                    value={newCustomer.birthday}
                    onChange={(event) => setNewCustomer({ ...newCustomer, birthday: event.target.value })}
                    placeholder={text.placeholders.birthday}
                    disabled={Boolean(createdCase)}
                  />
                </div>
                <input
                  value={newCustomer.address}
                  onChange={(event) => setNewCustomer({ ...newCustomer, address: event.target.value })}
                  placeholder={text.placeholders.address}
                  className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  disabled={Boolean(createdCase)}
                />
              </div>
            ) : (
              <div className="mt-4">
                <div className="grid gap-2 sm:flex">
                  <input
                    value={customerSearch}
                    onChange={(event) => setCustomerSearch(event.target.value)}
                    placeholder={text.placeholders.customerSearch}
                    className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    disabled={Boolean(createdCase)}
                  />
                  <button
                    type="button"
                    onClick={searchCustomers}
                    disabled={isSearchingCustomers || Boolean(createdCase)}
                    className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 disabled:bg-slate-300"
                  >
                    {isSearchingCustomers ? text.actions.searching : text.actions.search}
                  </button>
                </div>
                <div className="mt-3 grid gap-2">
                  {customerResults.map((customer) => (
                    <button
                      type="button"
                      key={customer.id}
                      onClick={() => setSelectedCustomer(customer)}
                      disabled={Boolean(createdCase)}
                      className={cx(
                        "rounded-2xl border p-3 text-left text-sm transition",
                        selectedCustomer?.id === customer.id
                          ? "border-blue-400 bg-blue-50 shadow-sm"
                          : "border-slate-200 hover:border-blue-200 hover:bg-slate-50",
                      )}
                    >
                      <div className="font-medium">{customer.name}</div>
                      <div className="break-words text-slate-600">
                        {customer.email ?? "-"} / {customer.phone ?? "-"} / {customer.nationality ?? "-"} /{" "}
                        {customer.birthday ? formatDateTime(customer.birthday) : "-"}
                      </div>
                      <div className="text-xs text-slate-500">
                        {locale === "ja"
                          ? `既存案件数：${customer.caseCount}`
                          : `既有案件数：${customer.caseCount}`}
                      </div>
                    </button>
                  ))}
                  {hasSearchedCustomers && !isSearchingCustomers && customerResults.length === 0 ? (
                    <EmptyState
                      title={text.messages.customerSearchEmpty}
                      description={text.messages.customerSearchEmptyDescription}
                    />
                  ) : null}
                </div>
              </div>
            )}
          </DashboardCard>

          <DashboardCard>
            <SectionHeader title={text.stepTitles.visa} />
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                {text.labels.visaBusinessType}
                <select
                  value={visaBusinessType}
                  onChange={(event) =>
                    handleVisaBusinessTypeChange(event.target.value as VisaBusinessType)
                  }
                  disabled={Boolean(createdCase)}
                  className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                >
                  {visaBusinessTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-normal leading-5 text-slate-500">
                  {businessTypeDescription}
                </span>
              </label>
            </div>
            <div
              className={cx(
                "mt-3 grid gap-3",
                visaBusinessType === "change" ? "md:grid-cols-2" : "md:grid-cols-1",
              )}
            >
              {visaBusinessType === "change" ? (
                <label className="grid gap-1 text-sm font-medium text-slate-700">
                  {text.labels.currentVisaType}
                  <select
                    value={existingVisaType}
                    onChange={(event) => handleExistingVisaTypeChange(event.target.value)}
                    disabled={Boolean(createdCase)}
                    className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  >
                    {changeCurrentVisaTypes.map((visaType) => (
                      <option key={visaType} value={visaType}>
                        {displayVisaType(visaType, locale)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                {text.labels.targetVisaType}
                <select
                  value={applyingVisaType}
                  onChange={(event) => handleApplyingVisaTypeChange(event.target.value)}
                  disabled={Boolean(createdCase)}
                  className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                >
                  {targetVisaTypes.map((visaType) => (
                    <option key={visaType} value={visaType}>
                      {displayVisaType(visaType, locale)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 grid gap-3">
              <input
                value={caseTitle}
                onChange={(event) => setCaseTitle(event.target.value)}
                placeholder={text.placeholders.caseTitle}
                disabled={Boolean(createdCase)}
                className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
              <textarea
                value={caseInternalNote}
                onChange={(event) => setCaseInternalNote(event.target.value)}
                placeholder={text.placeholders.internalNote}
                disabled={Boolean(createdCase)}
                className="min-h-24 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={loadTemplates}
                disabled={isLoadingTemplates || Boolean(createdCase)}
                className="w-fit rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 disabled:bg-slate-300"
              >
                {isLoadingTemplates ? text.actions.generating : text.actions.generate}
              </button>
            </div>
          </DashboardCard>

          <DashboardCard>
            <SectionHeader title={text.stepTitles.template} />
            {!hasLoadedTemplates ? (
              <p className="text-sm text-slate-600">{text.messages.templateIntro}</p>
            ) : templates.length === 0 ? (
              <EmptyState
                title={text.messages.noTemplate}
                description={text.messages.noTemplateDescription}
              />
            ) : (
              <div className="grid gap-3">
                {templates.map((template) => (
                  <button
                    type="button"
                    key={template.id}
                    onClick={() => selectTemplate(template)}
                    disabled={Boolean(createdCase)}
                    className={cx(
                      "rounded-2xl border p-4 text-left text-sm transition",
                      selectedTemplate?.id === template.id
                        ? "border-blue-400 bg-blue-50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-semibold text-slate-950">
                        {formatTemplateDisplayName(template, locale)}
                      </div>
                      <StatusBadge value={template.status} />
                    </div>
                    <div className="mt-2 text-xs leading-5 text-slate-500">
                      {template.templateKey} / v{template.version} /{" "}
                      {displayVisaType(template.currentVisaType, locale)} →{" "}
                      {displayVisaType(template.targetVisaType, locale)} /{" "}
                      {interpolate(text.labels.itemCount, { count: template.itemCount })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </DashboardCard>

          <DashboardCard>
            <SectionHeader title={text.stepTitles.checklist} />
            {!templateDetail ? (
              <p className="text-sm text-slate-600">{text.messages.chooseTemplate}</p>
            ) : (
              <div className="grid gap-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">{text.labels.selected}</div>
                    <div className="mt-1 text-xl font-semibold text-slate-950">{selectedCount}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">{text.labels.excluded}</div>
                    <div className="mt-1 text-xl font-semibold text-slate-950">{excludedCount}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">{text.labels.customAdded}</div>
                    <div className="mt-1 text-xl font-semibold text-slate-950">{validCustomItems.length}</div>
                  </div>
                </div>

                {renderTemplateItemGroup(text.labels.customerItems, groupedItems.customer)}
                {renderTemplateItemGroup(text.labels.officeItems, groupedItems.office)}

                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-950">
                      {text.labels.customItems}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setCustomItems((items) => [...items, createEmptyCustomItem()])}
                      disabled={Boolean(createdCase)}
                      className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {text.actions.addItem}
                    </button>
                  </div>
                  {customItems.length === 0 ? (
                    <EmptyState
                      title={text.messages.noCustomItems}
                      description={text.messages.noCustomItemsDescription}
                    />
                  ) : (
                    <div className="grid gap-3">
                      {customItems.map((item) => (
                        item.isCollapsed ? (
                          <button
                            type="button"
                            key={item.id}
                            onClick={() => updateCustomItem(item.id, { isCollapsed: false })}
                            disabled={Boolean(createdCase)}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left text-sm transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-default disabled:hover:border-slate-200 disabled:hover:bg-white"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-950">
                                {displayChineseText(item.title)}
                              </span>
                              <span className="mt-1 block text-xs text-slate-500">
                                {item.responsibleParty === "customer"
                                  ? text.labels.customerItems
                                  : text.labels.officeItems}
                                {item.dueDate ? ` / ${text.labels.dueDate} ${item.dueDate}` : ""}
                              </span>
                            </span>
                            {!createdCase ? (
                              <span className="shrink-0 text-xs font-medium text-blue-700">
                                {text.actions.edit}
                              </span>
                            ) : null}
                          </button>
                        ) : (
                        <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              {text.labels.itemName}
                              <input
                                value={item.title}
                                onChange={(event) => updateCustomItem(item.id, { title: event.target.value })}
                                placeholder={text.placeholders.customTitle}
                                disabled={Boolean(createdCase)}
                                className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                              />
                            </label>
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              {text.labels.responsibleParty}
                              <select
                                value={item.responsibleParty}
                                onChange={(event) =>
                                  updateCustomItem(item.id, {
                                    responsibleParty: event.target.value as ResponsibleParty,
                                  })
                                }
                                disabled={Boolean(createdCase)}
                                className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                              >
                                <option value="customer">{text.labels.customerItems}</option>
                                <option value="office">{text.labels.officeItems}</option>
                              </select>
                            </label>
                          </div>
                          <div className="mt-3 grid gap-3">
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              {text.labels.customerInstruction}
                              <textarea
                                value={item.customerInstruction}
                                onChange={(event) =>
                                  updateCustomItem(item.id, { customerInstruction: event.target.value })
                                }
                                placeholder={text.placeholders.customerInstruction}
                                disabled={Boolean(createdCase)}
                                className="min-h-20 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                              />
                            </label>
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              {text.labels.internalNote}
                              <textarea
                                value={item.internalNote}
                                onChange={(event) => updateCustomItem(item.id, { internalNote: event.target.value })}
                                placeholder={text.placeholders.internalOnly}
                                disabled={Boolean(createdCase)}
                                className="min-h-20 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                              />
                            </label>
                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="grid gap-1 text-sm font-medium text-slate-700">
                                {text.labels.dueDate}
                                <DateTextInput
                                  value={item.dueDate}
                                  onChange={(event) => updateCustomItem(item.id, { dueDate: event.target.value })}
                                  disabled={Boolean(createdCase)}
                                  min={todayDateValue}
                                  placeholder={text.placeholders.dueDate}
                                  className="h-12 font-normal"
                                />
                              </label>
                            </div>
                            {!createdCase ? (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => confirmCustomItem(item)}
                                  className="rounded-2xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700"
                                >
                                  {text.actions.confirm}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCustomItems((items) => items.filter((candidate) => candidate.id !== item.id))
                                  }
                                  className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
                                >
                                  {text.actions.delete}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        )
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </DashboardCard>

          <DashboardCard>
            <SectionHeader title={text.stepTitles.create} />
            <div className="grid gap-3 text-sm">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="font-medium text-slate-950">{text.labels.customer}</div>
                <div className="mt-1 text-slate-600">
                  {customerMode === "reuse"
                    ? selectedCustomer
                      ? `${selectedCustomer.name} / ${selectedCustomer.email ?? "-"}`
                      : text.messages.noExistingCustomer
                    : newCustomer.name || text.messages.noCustomerName}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="font-medium text-slate-950">{text.labels.targetVisaType}</div>
                <div className="mt-1 text-slate-600">
                  {displayVisaType(applyingVisaType, locale)}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="font-medium text-slate-950">{text.labels.templateAndItems}</div>
                <div className="mt-1 text-slate-600">
                  {selectedTemplate
                    ? `${formatTemplateDisplayName(selectedTemplate, locale)} / ${selectedTemplate.templateKey}`
                    : text.messages.noSelectedTemplate}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {interpolate(text.success.selectedSummary, {
                    selected: selectedCount,
                    excluded: excludedCount,
                    custom: validCustomItems.length,
                  })}
                </div>
              </div>
              <button
                type="button"
                disabled={isBusy || Boolean(createdCase)}
                onClick={createCaseWithSelection}
                className="w-fit rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none"
              >
                {createdCase
                  ? text.actions.created
                  : isBusy
                    ? text.actions.creating
                    : text.actions.createCase}
              </button>
              {createdCase ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  {interpolate(text.success.createdSummary, {
                    caseNumber: createdCase.caseNumber,
                    count: createdCase.requirementIds.length,
                  })}
                </div>
              ) : null}
            </div>
          </DashboardCard>

          <DashboardCard>
            <SectionHeader title={text.stepTitles.token} />
            {!createdCase ? (
              <p className="text-sm text-slate-600">{text.messages.createTokenAfterCase}</p>
            ) : (
              <div className="grid gap-4">
                <button
                  type="button"
                  disabled={isBusy || Boolean(createdToken)}
                  onClick={createToken}
                  className="w-fit rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none"
                >
                  {createdToken
                    ? text.actions.tokenCreated
                    : isBusy
                      ? text.actions.creating
                      : text.actions.createToken}
                </button>
                {createdToken ? (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
                    <div className="font-semibold">{text.messages.tokenOnceTitle}</div>
                    <p className="mt-1 text-xs leading-5">
                      {text.messages.tokenOnceDescription}
                    </p>
                    <code className="mt-2 block break-all rounded bg-white p-3">{createdToken.plaintextToken}</code>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={copyToken}
                        className="rounded-2xl bg-amber-950 px-3 py-2 text-sm font-medium text-white"
                      >
                        {text.actions.copyToken}
                      </button>
                      <span>
                        {text.labels.expiresAt}
                        {createdToken.expiresAt
                          ? formatDateTime(createdToken.expiresAt)
                          : text.messages.noFixedExpiry}
                      </span>
                    </div>
                    {tokenCopyMessage ? <div className="mt-2 text-xs">{tokenCopyMessage}</div> : null}
                  </div>
                ) : null}
                <Link
                  href={`/admin/cases/${createdCase.caseId}`}
                  className="w-fit rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  {text.actions.openCase}
                </Link>
              </div>
            )}
          </DashboardCard>
        </div>

        <DashboardCard className="h-fit">
          <SectionHeader title={locale === "ja" ? "作成概要" : "建案摘要"} />
          <div className="grid gap-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">{text.labels.customerMode}</span>
              <StatusBadge value={customerMode} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">{text.labels.targetVisaType}</span>
              <span className="text-right font-medium text-slate-900">
                {displayVisaType(applyingVisaType, locale)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">{text.labels.template}</span>
              <span className="text-right font-medium text-slate-900">
                {selectedTemplate ? selectedTemplate.templateKey : text.messages.notSelected}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">{text.labels.items}</span>
              <span className="font-medium text-slate-900">
                {selectedCount} / {totalTemplateItems} + {validCustomItems.length}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">{text.labels.case}</span>
              <span className="font-medium text-slate-900">
                {createdCase?.caseNumber ?? text.messages.notCreated}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">{text.labels.token}</span>
              <StatusBadge value={createdToken ? "active" : "pending"} />
            </div>
          </div>
        </DashboardCard>
      </div>
    </main>
  );
}
