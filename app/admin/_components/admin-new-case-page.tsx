"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { displayChineseText, displayVisaType } from "@/app/_lib/chinese-display";
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
const visaBusinessTypeOptions: Array<{ value: VisaBusinessType; label: string; description: string }> = [
  {
    value: "certification",
    label: "认定",
    description: "没有现有签证，从在留资格认定证明书开始申请。",
  },
  {
    value: "renewal",
    label: "更新",
    description: "现有签证和申请签证相同，只选择申请签证类型。",
  },
  {
    value: "change",
    label: "变更",
    description: "现有签证和申请签证不同，需要同时选择两种签证类型。",
  },
];
const creationSteps = ["选择客户", "选择签证", "选择材料模板", "确认材料清单", "创建案件", "生成客户链接"];

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
  currentVisaType: string | null;
  targetVisaType: string | null;
  title?: string;
}) {
  if (!template.currentVisaType || !template.targetVisaType) {
    return displayChineseText(template.title ?? "材料一览模板");
  }

  const currentVisaType = displayVisaType(template.currentVisaType);
  const targetVisaType = displayVisaType(template.targetVisaType);

  if (template.currentVisaType === "无") {
    return `${targetVisaType}认定`;
  }

  if (template.currentVisaType === template.targetVisaType) {
    return `${targetVisaType}更新`;
  }

  return `${currentVisaType}→${targetVisaType}变更`;
}

export function AdminNewCasePage() {
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
      setError(toAdminErrorMessage(searchError, "客户搜索失败，请稍后重试。"));
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
      setError("变更业务中，现有签证类型和申请签证类型不能相同；如果相同请选择“更新”。");
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
      setError(toAdminErrorMessage(templateError, "模板列表加载失败，请稍后重试。"));
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
        setError("模板不存在或已不可用，请重新选择。");
        return;
      }

      setTemplateDetail(detail);
      setSelectedTemplateItemIds(new Set(detail.items.map((item) => item.id)));
    } catch (templateError) {
      setError(toAdminErrorMessage(templateError, "模板详情加载失败，请稍后重试。"));
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
      setError("请先填写必填项目：材料名称。");
      return;
    }

    setError(null);
    updateCustomItem(item.id, { isCollapsed: true });
  }

  async function createCaseWithSelection() {
    if (customerMode === "reuse" && !selectedCustomer) {
      setError("请先选择一个已有客户。");
      return;
    }

    if (customerMode === "create" && !newCustomer.name.trim()) {
      setError("请填写客户姓名。");
      return;
    }

    if (!templateDetail || !selectedTemplate) {
      setError("请先选择模板并加载材料预览。");
      return;
    }

    if (selectedTemplateItemIds.size === 0 && validCustomItems.length === 0) {
      setError("请至少保留一个模板材料，或追加一个自定义材料。");
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
      setMessage(`案件 ${result.caseNumber} 已创建，已生成 ${result.requirementIds.length} 个材料项。`);
    } catch (createError) {
      setError(toAdminErrorMessage(createError, "案件创建失败，请检查材料选择后重试。"));
    } finally {
      setIsBusy(false);
    }
  }

  async function createToken() {
    if (!createdCase) {
      setError("请先创建案件，再创建客户访问链接。");
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
      setMessage("客户访问链接已创建。明文访问令牌只在当前界面显示一次。");
    } catch (tokenError) {
      setError(toAdminErrorMessage(tokenError, "客户访问链接创建失败。案件已创建，可以稍后在详情页重试。"));
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
      setTokenCopyMessage("已复制。请只通过安全渠道发送给客户。");
    } catch {
      setTokenCopyMessage("复制失败，请手动复制访问令牌文本。");
    }
  }

  function renderTemplateItemGroup(title: string, items: AdminTemplateDetail["items"]) {
    return (
      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
          <span className="text-xs text-slate-500">{items.length} 项</span>
        </div>
        {items.length === 0 ? (
          <EmptyState title="没有材料" description="当前模板在这个分组下没有材料。" />
        ) : (
          <div className="grid gap-2">
            {items.map((item) => (
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
                    {displayChineseText(item.title)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">新建案件</h1>
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
          <SectionHeader title="建案进度" />
          <ProgressStepper steps={creationSteps} currentStep={currentStep} />
        </DashboardCard>

        <div className="grid gap-6">
          <DashboardCard>
            <SectionHeader title="Step 1：选择客户" />
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
                新建客户
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
                复用客户
              </button>
            </div>

            {customerMode === "create" ? (
              <div className="mt-4 grid gap-3">
                <input
                  value={newCustomer.name}
                  onChange={(event) => setNewCustomer({ ...newCustomer, name: event.target.value })}
                  required
                  placeholder="客户姓名"
                  className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  disabled={Boolean(createdCase)}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={newCustomer.email}
                    onChange={(event) => setNewCustomer({ ...newCustomer, email: event.target.value })}
                    type="email"
                    placeholder="邮箱"
                    className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    disabled={Boolean(createdCase)}
                  />
                  <input
                    value={newCustomer.phone}
                    onChange={(event) => setNewCustomer({ ...newCustomer, phone: event.target.value })}
                    placeholder="电话"
                    className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    disabled={Boolean(createdCase)}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    value={newCustomer.nationality}
                    onChange={(event) => setNewCustomer({ ...newCustomer, nationality: event.target.value })}
                    placeholder="国籍"
                    className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    disabled={Boolean(createdCase)}
                  />
                  <DateTextInput
                    value={newCustomer.birthday}
                    onChange={(event) => setNewCustomer({ ...newCustomer, birthday: event.target.value })}
                    placeholder="出生日期 YYYY-MM-DD"
                    disabled={Boolean(createdCase)}
                  />
                </div>
                <input
                  value={newCustomer.address}
                  onChange={(event) => setNewCustomer({ ...newCustomer, address: event.target.value })}
                  placeholder="地址（可选，不会在搜索结果中显示）"
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
                    placeholder="按姓名、邮箱、电话搜索"
                    className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                    disabled={Boolean(createdCase)}
                  />
                  <button
                    type="button"
                    onClick={searchCustomers}
                    disabled={isSearchingCustomers || Boolean(createdCase)}
                    className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 disabled:bg-slate-300"
                  >
                    {isSearchingCustomers ? "搜索中..." : "搜索"}
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
                      <div className="text-xs text-slate-500">既有案件数：{customer.caseCount}</div>
                    </button>
                  ))}
                  {hasSearchedCustomers && !isSearchingCustomers && customerResults.length === 0 ? (
                    <EmptyState
                      title="没有找到匹配客户"
                      description="可以换关键词继续搜索，或切换到“新建客户”录入新客户。"
                    />
                  ) : null}
                </div>
              </div>
            )}
          </DashboardCard>

          <DashboardCard>
            <SectionHeader title="Step 2：选择签证" />
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                签证业务类型
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
                  现有签证类型
                  <select
                    value={existingVisaType}
                    onChange={(event) => handleExistingVisaTypeChange(event.target.value)}
                    disabled={Boolean(createdCase)}
                    className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  >
                    {changeCurrentVisaTypes.map((visaType) => (
                      <option key={visaType} value={visaType}>
                        {displayVisaType(visaType)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                申请签证类型
                <select
                  value={applyingVisaType}
                  onChange={(event) => handleApplyingVisaTypeChange(event.target.value)}
                  disabled={Boolean(createdCase)}
                  className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                >
                  {targetVisaTypes.map((visaType) => (
                    <option key={visaType} value={visaType}>
                      {displayVisaType(visaType)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 grid gap-3">
              <input
                value={caseTitle}
                onChange={(event) => setCaseTitle(event.target.value)}
                placeholder="案件标题（可选）"
                disabled={Boolean(createdCase)}
                className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
              <textarea
                value={caseInternalNote}
                onChange={(event) => setCaseInternalNote(event.target.value)}
                placeholder="内部备注（仅后台可见，可选）"
                disabled={Boolean(createdCase)}
                className="min-h-24 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={loadTemplates}
                disabled={isLoadingTemplates || Boolean(createdCase)}
                className="w-fit rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 disabled:bg-slate-300"
              >
                {isLoadingTemplates ? "生成材料一览中..." : "生成材料一览"}
              </button>
            </div>
          </DashboardCard>

          <DashboardCard>
            <SectionHeader title="Step 3：选择材料模板" />
            {!hasLoadedTemplates ? (
              <p className="text-sm text-slate-600">请选择签证业务类型和申请签证类型后生成材料一览。</p>
            ) : templates.length === 0 ? (
              <EmptyState
                title="没有匹配模板"
                description="请检查模板状态、签证业务类型和申请签证类型。当前模板只匹配 active 状态。"
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
                        {formatTemplateDisplayName(template)}
                      </div>
                      <StatusBadge value={template.status} />
                    </div>
                    <div className="mt-2 text-xs leading-5 text-slate-500">
                      {template.templateKey} / v{template.version} /{" "}
                      {displayVisaType(template.currentVisaType)} → {displayVisaType(template.targetVisaType)} /{" "}
                      {template.itemCount} 项
                    </div>
                  </button>
                ))}
              </div>
            )}
          </DashboardCard>

          <DashboardCard>
            <SectionHeader title="Step 4：确认材料清单" />
            {!templateDetail ? (
              <p className="text-sm text-slate-600">请先选择模板。</p>
            ) : (
              <div className="grid gap-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">已选择</div>
                    <div className="mt-1 text-xl font-semibold text-slate-950">{selectedCount}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">已排除</div>
                    <div className="mt-1 text-xl font-semibold text-slate-950">{excludedCount}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500">自定义追加</div>
                    <div className="mt-1 text-xl font-semibold text-slate-950">{validCustomItems.length}</div>
                  </div>
                </div>

                {renderTemplateItemGroup("客户提交材料", groupedItems.customer)}
                {renderTemplateItemGroup("事务所做成材料", groupedItems.office)}

                <div className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-950">自定义追加材料</h3>
                    <button
                      type="button"
                      onClick={() => setCustomItems((items) => [...items, createEmptyCustomItem()])}
                      disabled={Boolean(createdCase)}
                      className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      追加材料
                    </button>
                  </div>
                  {customItems.length === 0 ? (
                    <EmptyState title="还没有追加材料" description="可追加客户提交材料或事务所做成材料。" />
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
                                {item.responsibleParty === "customer" ? "客户提交材料" : "事务所做成材料"}
                                {item.dueDate ? ` / 截止日期 ${item.dueDate}` : ""}
                              </span>
                            </span>
                            {!createdCase ? (
                              <span className="shrink-0 text-xs font-medium text-blue-700">点击修改</span>
                            ) : null}
                          </button>
                        ) : (
                        <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              材料名称（必填）
                              <input
                                value={item.title}
                                onChange={(event) => updateCustomItem(item.id, { title: event.target.value })}
                                placeholder="例如：补充说明书"
                                disabled={Boolean(createdCase)}
                                className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                              />
                            </label>
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              负责方
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
                                <option value="customer">客户提交材料</option>
                                <option value="office">事务所做成材料</option>
                              </select>
                            </label>
                          </div>
                          <div className="mt-3 grid gap-3">
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              客户说明
                              <textarea
                                value={item.customerInstruction}
                                onChange={(event) =>
                                  updateCustomItem(item.id, { customerInstruction: event.target.value })
                                }
                                placeholder="客户提交材料时会显示给客户，可选"
                                disabled={Boolean(createdCase)}
                                className="min-h-20 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                              />
                            </label>
                            <label className="grid gap-1 text-sm font-medium text-slate-700">
                              内部备注
                              <textarea
                                value={item.internalNote}
                                onChange={(event) => updateCustomItem(item.id, { internalNote: event.target.value })}
                                placeholder="仅后台可见，可选"
                                disabled={Boolean(createdCase)}
                                className="min-h-20 rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                              />
                            </label>
                            <div className="grid gap-3 md:grid-cols-2">
                              <label className="grid gap-1 text-sm font-medium text-slate-700">
                                截止日期
                                <DateTextInput
                                  value={item.dueDate}
                                  onChange={(event) => updateCustomItem(item.id, { dueDate: event.target.value })}
                                  disabled={Boolean(createdCase)}
                                  min={todayDateValue}
                                  placeholder="截止日期 YYYY-MM-DD"
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
                                  确定
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCustomItems((items) => items.filter((candidate) => candidate.id !== item.id))
                                  }
                                  className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700"
                                >
                                  删除
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
            <SectionHeader title="Step 5：创建案件" />
            <div className="grid gap-3 text-sm">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="font-medium text-slate-950">客户</div>
                <div className="mt-1 text-slate-600">
                  {customerMode === "reuse"
                    ? selectedCustomer
                      ? `${selectedCustomer.name} / ${selectedCustomer.email ?? "-"}`
                      : "尚未选择已有客户"
                    : newCustomer.name || "尚未填写客户姓名"}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="font-medium text-slate-950">申请签证类型</div>
                <div className="mt-1 text-slate-600">
                  {displayVisaType(applyingVisaType)}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="font-medium text-slate-950">模板与材料</div>
                <div className="mt-1 text-slate-600">
                  {selectedTemplate
                    ? `${formatTemplateDisplayName(selectedTemplate)} / ${selectedTemplate.templateKey}`
                    : "尚未选择模板"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  已选择 {selectedCount} 项，排除 {excludedCount} 项，自定义 {validCustomItems.length} 项
                </div>
              </div>
              <button
                type="button"
                disabled={isBusy || Boolean(createdCase)}
                onClick={createCaseWithSelection}
                className="w-fit rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none"
              >
                {createdCase ? "案件已创建" : isBusy ? "创建中..." : "确认创建案件"}
              </button>
              {createdCase ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  已创建：{createdCase.caseNumber}，材料项 {createdCase.requirementIds.length} 个。
                </div>
              ) : null}
            </div>
          </DashboardCard>

          <DashboardCard>
            <SectionHeader title="Step 6：生成客户链接" />
            {!createdCase ? (
              <p className="text-sm text-slate-600">案件创建后可以选择创建客户访问链接。</p>
            ) : (
              <div className="grid gap-4">
                <button
                  type="button"
                  disabled={isBusy || Boolean(createdToken)}
                  onClick={createToken}
                  className="w-fit rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 disabled:bg-slate-300 disabled:shadow-none"
                >
                  {createdToken ? "客户访问链接已创建" : isBusy ? "创建中..." : "创建客户访问链接"}
                </button>
                {createdToken ? (
                  <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm">
                    <div className="font-semibold">明文访问令牌只显示一次。</div>
                    <p className="mt-1 text-xs leading-5">
                      离开或刷新页面后无法再次查看明文访问令牌。请立即复制，并通过安全渠道发送给客户。
                    </p>
                    <code className="mt-2 block break-all rounded bg-white p-3">{createdToken.plaintextToken}</code>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={copyToken}
                        className="rounded-2xl bg-amber-950 px-3 py-2 text-sm font-medium text-white"
                      >
                        复制访问令牌
                      </button>
                      <span>有效期：{createdToken.expiresAt ? formatDateTime(createdToken.expiresAt) : "无固定过期时间"}</span>
                    </div>
                    {tokenCopyMessage ? <div className="mt-2 text-xs">{tokenCopyMessage}</div> : null}
                  </div>
                ) : null}
                <Link
                  href={`/admin/cases/${createdCase.caseId}`}
                  className="w-fit rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  打开案件详情
                </Link>
              </div>
            )}
          </DashboardCard>
        </div>

        <DashboardCard className="h-fit">
          <SectionHeader title="建案摘要" />
          <div className="grid gap-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">客户模式</span>
              <StatusBadge value={customerMode} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">申请签证类型</span>
              <span className="text-right font-medium text-slate-900">
                {displayVisaType(applyingVisaType)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">模板</span>
              <span className="text-right font-medium text-slate-900">
                {selectedTemplate ? selectedTemplate.templateKey : "未选择"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">材料</span>
              <span className="font-medium text-slate-900">
                {selectedCount} / {totalTemplateItems} + {validCustomItems.length}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">案件</span>
              <span className="font-medium text-slate-900">{createdCase?.caseNumber ?? "未创建"}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">客户访问链接</span>
              <StatusBadge value={createdToken ? "active" : "pending"} />
            </div>
          </div>
        </DashboardCard>
      </div>
    </main>
  );
}
