"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { displayChineseText } from "@/app/_lib/chinese-display";
import {
  confirmPortalApplicationConfirmation,
  createPortalApplicationConfirmationAccessUrl,
  createPortalFileAccessUrl,
  deletePortalRequirementFile,
  fetchPortalCase,
  confirmPortalOfficeRequirement,
  requestPortalOfficeRequirementRevision,
  requestPortalApplicationConfirmationRevision,
  submitPortalRequirement,
  toPortalErrorMessage,
  uploadPortalRequirementFile,
  withdrawPortalRequirement,
  type PortalApplicationConfirmation,
  type PortalCase,
  type PortalDocumentStatus,
  type PortalFile,
  type PortalRequirement,
} from "../_lib/portal-api";
import {
  displayPortalLabel,
  EmptyState,
  groupTitle,
  InlineError,
  PortalButton,
  PortalCard,
  StatusBadge,
  SuccessMessage,
} from "./portal-ui";

type PortalPageProps = {
  token: string;
};

type UploadState = {
  files: File[];
  busy: boolean;
  error: string | null;
};

type ConfirmDialogState =
  | {
      kind: "confirm";
      confirmation: PortalApplicationConfirmation;
    }
  | {
      kind: "revision";
      confirmation: PortalApplicationConfirmation;
    }
  | {
      kind: "withdrawRequirement";
      requirement: PortalRequirement;
    }
  | null;

const requirementGroupOrder: PortalDocumentStatus[] = [
  "needs_more",
  "not_applicable",
  "not_submitted",
  "submitted",
  "accepted",
];

const portalCasePhaseSteps = [
  "collecting_documents",
  "preparing_application",
  "submitted",
  "under_review",
  "approved",
];

function openImmediateUrl(accessUrl: string) {
  window.open(accessUrl, "_blank", "noopener,noreferrer");
}

function groupRequirements(requirements: PortalRequirement[]) {
  return requirementGroupOrder
    .map((status) => ({
      status,
      items: requirements.filter((requirement) => requirement.clientStatus === status),
    }))
    .filter((group) => group.items.length > 0);
}

function getRequirementSummary(requirements: PortalRequirement[]) {
  const pending = requirements.filter((item) => item.clientStatus === "not_submitted").length;
  const needsAction = requirements.filter(
    (item) =>
      item.clientStatus === "not_submitted" ||
      item.clientStatus === "needs_more" ||
      item.clientStatus === "not_applicable",
  ).length;

  return {
    total: requirements.length,
    pending,
    needsAction,
    needsMore: requirements.filter((item) => item.clientStatus === "needs_more").length,
    needsRevision: requirements.filter((item) => item.clientStatus === "not_applicable").length,
    submitted: requirements.filter((item) => item.clientStatus === "submitted").length,
    completed: requirements.filter((item) => item.clientStatus === "accepted").length,
  };
}

export function PortalPage({ token }: PortalPageProps) {
  const [portalCase, setPortalCase] = useState<PortalCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadStateByRequirementId, setUploadStateByRequirementId] = useState<
    Record<string, UploadState>
  >({});
  const [actionErrorById, setActionErrorById] = useState<Record<string, string | null>>({});
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const [revisionCommentById, setRevisionCommentById] = useState<Record<string, string>>({});
  const [officeRevisionCommentById, setOfficeRevisionCommentById] = useState<
    Record<string, string>
  >({});
  const [dialogState, setDialogState] = useState<ConfirmDialogState>(null);
  const mountedRef = useRef(true);

  const loadCase = useCallback(async () => {
    try {
      setPageError(null);
      const data = await fetchPortalCase(token);

      if (mountedRef.current) {
        setPortalCase(data);
      }
    } catch (error) {
      if (mountedRef.current) {
        setPageError(toPortalErrorMessage(error));
        setPortalCase(null);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [token]);

  useEffect(() => {
    mountedRef.current = true;
    void loadCase();

    return () => {
      mountedRef.current = false;
    };
  }, [loadCase]);

  const customerRequirements = useMemo(
    () =>
      (portalCase?.requirements ?? []).filter(
        (requirement) => requirement.responsibleParty === "customer",
      ),
    [portalCase?.requirements],
  );
  const officeRequirements = useMemo(
    () =>
      (portalCase?.requirements ?? []).filter(
        (requirement) =>
          requirement.responsibleParty === "office" &&
          (requirement.clientStatus === "accepted" ||
            requirement.clientStatus === "not_applicable"),
      ),
    [portalCase?.requirements],
  );
  const summary = useMemo(() => getRequirementSummary(customerRequirements), [customerRequirements]);
  const requirementGroups = useMemo(
    () => groupRequirements(customerRequirements),
    [customerRequirements],
  );

  function setRequirementUploadState(requirementId: string, patch: Partial<UploadState>) {
    setUploadStateByRequirementId((current) => ({
      ...current,
      [requirementId]: {
        ...(current[requirementId] ?? {
          files: [],
          busy: false,
          error: null,
        }),
        ...patch,
      },
    }));
  }

  async function handleUpload(requirement: PortalRequirement, selectedFiles: File[]) {
    if (selectedFiles.length === 0) {
      setRequirementUploadState(requirement.id, {
        error: "请选择需要上传的文件。",
      });
      return;
    }

    try {
      setRequirementUploadState(requirement.id, {
        busy: true,
        error: null,
      });

      for (const file of selectedFiles) {
        await uploadPortalRequirementFile({
          token,
          requirementId: requirement.id,
          file,
        });
      }

      setNotice(`已上传 ${selectedFiles.length} 个文件。`);
      setRequirementUploadState(requirement.id, {
        files: [],
        busy: false,
        error: null,
      });
      await loadCase();
    } catch (error) {
      setRequirementUploadState(requirement.id, {
        busy: false,
        error: toPortalErrorMessage(error),
      });
    }
  }

  async function handleSubmitRequirement(requirement: PortalRequirement) {
    const actionId = `requirement-submit:${requirement.id}`;

    try {
      setBusyActionId(actionId);
      setActionErrorById((current) => ({ ...current, [actionId]: null }));
      await submitPortalRequirement({
        token,
        requirementId: requirement.id,
      });
      setNotice("资料已提交。");
      await loadCase();
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error),
      }));
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleWithdrawRequirement(requirement: PortalRequirement) {
    const actionId = `requirement-withdraw:${requirement.id}`;

    try {
      setBusyActionId(actionId);
      setActionErrorById((current) => ({ ...current, [actionId]: null }));
      await withdrawPortalRequirement({
        token,
        requirementId: requirement.id,
      });
      setNotice("资料已撤回，可以继续修改。");
      setDialogState(null);
      await loadCase();
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error),
      }));
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleDeleteUploadedFile(requirement: PortalRequirement, file: PortalFile) {
    const fileId = file.id;
    const actionId = `file-delete:${fileId}`;

    try {
      setBusyActionId(actionId);
      setActionErrorById((current) => ({ ...current, [actionId]: null }));
      await deletePortalRequirementFile({
        token,
        requirementId: requirement.id,
        fileId,
      });
      setNotice("文件已删除。");
      await loadCase();
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error),
      }));
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleFileAccess(fileId: string) {
    const actionId = `file:${fileId}`;

    try {
      setBusyActionId(actionId);
      setActionErrorById((current) => ({ ...current, [actionId]: null }));
      const result = await createPortalFileAccessUrl({ token, fileId });
      openImmediateUrl(result.accessUrl);
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error),
      }));
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleConfirmationAccess(confirmationId: string) {
    const actionId = `confirmation-download:${confirmationId}`;

    try {
      setBusyActionId(actionId);
      setActionErrorById((current) => ({ ...current, [actionId]: null }));
      const result = await createPortalApplicationConfirmationAccessUrl({
        token,
        confirmationId,
      });
      openImmediateUrl(result.accessUrl);
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error),
      }));
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleConfirmConfirmation(confirmation: PortalApplicationConfirmation) {
    const actionId = `confirmation-confirm:${confirmation.id}`;

    try {
      setBusyActionId(actionId);
      setActionErrorById((current) => ({ ...current, [actionId]: null }));
      await confirmPortalApplicationConfirmation({
        token,
        confirmationId: confirmation.id,
      });
      setNotice("已确认完成资料。");
      setDialogState(null);
      await loadCase();
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error),
      }));
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleRequestRevision(confirmation: PortalApplicationConfirmation) {
    const actionId = `confirmation-revision:${confirmation.id}`;
    const comment = revisionCommentById[confirmation.id]?.trim() ?? "";

    if (!comment) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: "请填写需要事务所确认或调整的内容。",
      }));
      return;
    }

    try {
      setBusyActionId(actionId);
      setActionErrorById((current) => ({ ...current, [actionId]: null }));
      await requestPortalApplicationConfirmationRevision({
        token,
        confirmationId: confirmation.id,
        comment,
        reason: "Client requested revision.",
      });
      setRevisionCommentById((current) => ({ ...current, [confirmation.id]: "" }));
      setNotice("修改请求已提交。");
      setDialogState(null);
      await loadCase();
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error),
      }));
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleConfirmOfficeRequirement(requirement: PortalRequirement) {
    const actionId = `office-confirm:${requirement.id}`;

    try {
      setBusyActionId(actionId);
      setActionErrorById((current) => ({ ...current, [actionId]: null }));
      await confirmPortalOfficeRequirement({
        token,
        requirementId: requirement.id,
      });
      setNotice("已确认事务所资料。");
      await loadCase();
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error),
      }));
    } finally {
      setBusyActionId(null);
    }
  }

  async function handleRequestOfficeRequirementRevision(requirement: PortalRequirement) {
    const actionId = `office-revision:${requirement.id}`;
    const comment = officeRevisionCommentById[requirement.id]?.trim() ?? "";

    if (!comment) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: "请填写需要事务所确认或调整的内容。",
      }));
      return;
    }

    try {
      setBusyActionId(actionId);
      setActionErrorById((current) => ({ ...current, [actionId]: null }));
      await requestPortalOfficeRequirementRevision({
        token,
        requirementId: requirement.id,
        comment,
      });
      setOfficeRevisionCommentById((current) => ({ ...current, [requirement.id]: "" }));
      setNotice("修改请求已提交。");
      await loadCase();
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error),
      }));
    } finally {
      setBusyActionId(null);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950">
        <div className="mx-auto max-w-3xl">
          <PortalCard>
            <div className="flex items-center gap-3">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
              <div>
                <div className="font-semibold">资料加载中</div>
                <p className="mt-1 text-sm text-slate-500">请稍候。</p>
              </div>
            </div>
          </PortalCard>
        </div>
      </main>
    );
  }

  if (pageError || !portalCase) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950">
        <div className="mx-auto max-w-3xl">
          <PortalCard>
            <p className="text-sm font-semibold text-blue-600">客户资料提交页面</p>
            <h1 className="mt-3 text-2xl font-bold">链接无效或已过期</h1>
            <p className="mt-3 leading-7 text-slate-600">
              {pageError ?? "此链接无法继续使用，请联系事务所。"}
            </p>
          </PortalCard>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:py-8">
      <div className="mx-auto grid max-w-4xl gap-4 sm:gap-5">
        <SuccessMessage message={notice} />

        <PortalCaseProgress portalCase={portalCase} />

        <RequirementProgressSummary summary={summary} />

        <PortalCard>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">完成资料确认</h2>
          </div>
          {portalCase.applicationConfirmations.length > 0 || officeRequirements.length > 0 ? (
            <div className="grid gap-3">
              {portalCase.applicationConfirmations.map((confirmation) => (
                <ConfirmationCard
                  key={confirmation.id}
                  confirmation={confirmation}
                  busyActionId={busyActionId}
                  actionErrorById={actionErrorById}
                  comment={revisionCommentById[confirmation.id] ?? ""}
                  onCommentChange={(comment) =>
                    setRevisionCommentById((current) => ({
                      ...current,
                      [confirmation.id]: comment,
                    }))
                  }
                  onAccess={() => void handleConfirmationAccess(confirmation.id)}
                  onConfirm={() => setDialogState({ kind: "confirm", confirmation })}
                  onRequestRevision={() => {
                    const actionId = `confirmation-revision:${confirmation.id}`;
                    const comment = revisionCommentById[confirmation.id]?.trim() ?? "";

                    if (!comment) {
                      setActionErrorById((current) => ({
                        ...current,
                        [actionId]: "请填写需要事务所确认或调整的内容。",
                      }));
                      return;
                    }

                    setActionErrorById((current) => ({ ...current, [actionId]: null }));
                    setDialogState({ kind: "revision", confirmation });
                  }}
                />
              ))}
              {officeRequirements.map((requirement) => (
                <OfficeRequirementConfirmationCard
                  key={requirement.id}
                  requirement={requirement}
                  busyActionId={busyActionId}
                  actionErrorById={actionErrorById}
                  comment={officeRevisionCommentById[requirement.id] ?? ""}
                  onCommentChange={(comment) =>
                    setOfficeRevisionCommentById((current) => ({
                      ...current,
                      [requirement.id]: comment,
                    }))
                  }
                  onFileAccess={(fileId) => void handleFileAccess(fileId)}
                  onConfirm={() => void handleConfirmOfficeRequirement(requirement)}
                  onRequestRevision={() => void handleRequestOfficeRequirementRevision(requirement)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-500">
              暂无需要确认的事务所资料。
            </div>
          )}
        </PortalCard>

        <PortalCard>
          <div className="mb-4">
            <h2 className="text-lg font-bold">提交资料</h2>
          </div>

          {customerRequirements.length === 0 ? (
            <EmptyState title="暂无需要提交的资料" description="目前没有客户需要提交的资料。" />
          ) : (
            <div className="grid gap-6">
              {requirementGroups.map((group) => (
                <section key={group.status} className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-500">
                      {groupTitle(group.status)}
                    </h3>
                    <span className="text-xs text-slate-400">{group.items.length} 项</span>
                  </div>
                  {group.items.map((requirement) => (
                    <RequirementCard
                      key={requirement.id}
                      requirement={requirement}
                      uploadState={uploadStateByRequirementId[requirement.id]}
                      busyActionId={busyActionId}
                      actionErrorById={actionErrorById}
                      onUpload={(files) => void handleUpload(requirement, files)}
                      onSubmit={() => void handleSubmitRequirement(requirement)}
                      onWithdraw={() =>
                        setDialogState({ kind: "withdrawRequirement", requirement })
                      }
                      onFileAccess={(fileId) => void handleFileAccess(fileId)}
                      onFileDelete={(file) => void handleDeleteUploadedFile(requirement, file)}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}
        </PortalCard>
      </div>

      {dialogState?.kind === "withdrawRequirement" ? (
        <WithdrawRequirementDialog
          requirement={dialogState.requirement}
          busyActionId={busyActionId}
          actionErrorById={actionErrorById}
          onClose={() => {
            if (!busyActionId) {
              setDialogState(null);
            }
          }}
          onConfirm={() => void handleWithdrawRequirement(dialogState.requirement)}
        />
      ) : null}

      {dialogState?.kind === "confirm" || dialogState?.kind === "revision" ? (
        <ConfirmationDialog
          state={dialogState}
          busyActionId={busyActionId}
          actionErrorById={actionErrorById}
          comment={revisionCommentById[dialogState.confirmation.id] ?? ""}
          onClose={() => {
            if (!busyActionId) {
              setDialogState(null);
            }
          }}
          onConfirm={() => void handleConfirmConfirmation(dialogState.confirmation)}
          onRequestRevision={() => void handleRequestRevision(dialogState.confirmation)}
        />
      ) : null}
    </main>
  );
}

function RequirementProgressSummary({
  summary,
}: {
  summary: ReturnType<typeof getRequirementSummary>;
}) {
  const preparedCount = summary.submitted + summary.completed;
  const percent = summary.total > 0 ? Math.round((preparedCount / summary.total) * 100) : 0;

  return (
    <PortalCard className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">资料准备情况</h2>
          <p className="mt-2 text-sm text-slate-500">
            已准备 {preparedCount} / {summary.total} 项
          </p>
        </div>
        <div className="text-2xl font-bold text-blue-700">{percent}%</div>
      </div>

      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        <ProgressCount label="待提交" value={summary.pending} />
        <ProgressCount label="需补充" value={summary.needsMore} />
        <ProgressCount label="需修改" value={summary.needsRevision} />
        <ProgressCount label="已提交" value={summary.submitted} />
        <ProgressCount label="事务所已确认" value={summary.completed} />
      </div>
    </PortalCard>
  );
}

function PortalCaseProgress({ portalCase }: { portalCase: PortalCase }) {
  const currentPhase = portalCase.casePhase;
  const phaseIndex = portalCasePhaseSteps.indexOf(currentPhase);
  const currentIndex = phaseIndex >= 0 ? phaseIndex : 0;
  const completedWidth =
    portalCasePhaseSteps.length > 1
      ? (currentIndex / (portalCasePhaseSteps.length - 1)) * 100
      : 0;

  return (
    <PortalCard className="p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold">
            {displayChineseText(portalCase.customerName)} 様
          </h1>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="relative min-w-[640px] px-8">
          <div className="absolute left-12 right-12 top-4 h-0.5 bg-slate-200" />
          <div
            className="absolute left-12 top-4 h-0.5 bg-blue-600"
            style={{ width: `calc((100% - 6rem) * ${completedWidth / 100})` }}
          />
          <div
            className="relative grid gap-0"
            style={{
              gridTemplateColumns: `repeat(${portalCasePhaseSteps.length}, minmax(0, 1fr))`,
            }}
          >
            {portalCasePhaseSteps.map((phase, index) => {
              const isDone = index < currentIndex;
              const isCurrent = index === currentIndex;

              return (
                <div key={phase} className="grid justify-items-center gap-2">
                  <div
                    className={
                      isCurrent
                        ? "flex h-8 w-8 items-center justify-center rounded-full border-2 border-blue-600 bg-white text-sm font-bold text-blue-700"
                        : isDone
                          ? "flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white"
                          : "flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-400"
                    }
                  >
                    {index + 1}
                  </div>
                  <div
                    className={
                      isCurrent
                        ? "text-center text-xs font-bold text-blue-700"
                        : "text-center text-xs font-medium text-slate-500"
                    }
                  >
                    {displayPortalLabel(phase)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </PortalCard>
  );
}

function ProgressCount({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-950">{label}</div>
      <div className="mt-1 text-lg font-bold text-slate-950">{value}</div>
    </div>
  );
}

function RequirementCard({
  requirement,
  uploadState,
  busyActionId,
  actionErrorById,
  onUpload,
  onSubmit,
  onWithdraw,
  onFileAccess,
  onFileDelete,
}: {
  requirement: PortalRequirement;
  uploadState: UploadState | undefined;
  busyActionId: string | null;
  actionErrorById: Record<string, string | null>;
  onUpload: (files: File[]) => void;
  onSubmit: () => void;
  onWithdraw: () => void;
  onFileAccess: (fileId: string) => void;
  onFileDelete: (file: PortalFile) => void;
}) {
  const uploadBusy = uploadState?.busy ?? false;
  const submitActionId = `requirement-submit:${requirement.id}`;
  const withdrawActionId = `requirement-withdraw:${requirement.id}`;
  const submitBusy = busyActionId === submitActionId;
  const withdrawBusy = busyActionId === withdrawActionId;
  const isCustomerRequirement = requirement.responsibleParty === "customer";
  const canEditFiles =
    isCustomerRequirement &&
    (requirement.clientStatus === "not_submitted" ||
      requirement.clientStatus === "needs_more" ||
      requirement.clientStatus === "not_applicable");
  const canSubmit = canEditFiles && requirement.files.length > 0 && !uploadBusy;
  const shouldShowCustomerInstruction =
    Boolean(requirement.customerInstruction?.trim()) &&
    (requirement.clientStatus === "not_submitted" ||
      requirement.clientStatus === "needs_more" ||
      requirement.clientStatus === "not_applicable");

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="break-words text-lg font-bold text-slate-950">
            {displayChineseText(requirement.title)}
          </h4>
        </div>
        <StatusBadge value={requirement.clientStatus} />
      </div>

      {shouldShowCustomerInstruction ? (
        <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <div className="mb-1 text-xs font-semibold text-amber-700">说明</div>
          <div className="whitespace-pre-wrap break-words">
            {displayChineseText(requirement.customerInstruction)}
          </div>
        </div>
      ) : null}

      {requirement.files.length > 0 ? (
        <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
          {requirement.files.map((file) => {
            const actionId = `file:${file.id}`;
            const deleteActionId = `file-delete:${file.id}`;
            const displayName = displayChineseText(file.displayName);

            return (
              <div key={file.id} className="py-2">
                <div className="flex min-w-0 items-center gap-3 text-sm">
                  {file.portalDownloadable ? (
                    <button
                      type="button"
                      disabled={busyActionId === actionId}
                      onClick={() => onFileAccess(file.id)}
                      className="min-w-0 flex-1 truncate text-left font-medium text-slate-900 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60"
                    >
                      {busyActionId === actionId ? "正在打开..." : displayName}
                    </button>
                  ) : (
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-700">
                      {displayName}
                    </span>
                  )}
                  {canEditFiles ? (
                    <button
                      type="button"
                      disabled={busyActionId === deleteActionId}
                      onClick={() => onFileDelete(file)}
                      aria-label={`删除 ${displayName}`}
                      className="shrink-0 px-1 text-lg leading-none text-rose-500 transition hover:text-rose-700 disabled:text-slate-300"
                    >
                      {"×"}
                    </button>
                  ) : null}
                </div>
                <InlineError message={actionErrorById[actionId] ?? null} />
                <InlineError message={actionErrorById[deleteActionId] ?? null} />
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        {canEditFiles ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 sm:w-fit">
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  disabled={uploadBusy}
                  onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = "";
                    if (files.length > 0) {
                      onUpload(files);
                    }
                  }}
                />
                {uploadBusy ? "上传中" : "上传文件"}
              </label>

              {canSubmit ? (
                <PortalButton
                  variant="secondary"
                  disabled={submitBusy}
                  onClick={onSubmit}
                  className="w-full sm:w-fit"
                >
                  {submitBusy ? "提交中" : "提交材料"}
                </PortalButton>
              ) : null}
            </div>

            <InlineError message={uploadState?.error ?? null} />
            <InlineError message={actionErrorById[submitActionId] ?? null} />
          </>
        ) : null}

        {!canEditFiles && requirement.clientStatus === "submitted" ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>{"资料已提交，事务所确认中。"}</span>
            <PortalButton
              variant="secondary"
              disabled={withdrawBusy}
              onClick={onWithdraw}
              className="w-full sm:w-fit"
            >
              {withdrawBusy ? "撤回中" : "撤回"}
            </PortalButton>
          </div>
        ) : null}
        <InlineError message={actionErrorById[withdrawActionId] ?? null} />
        {requirement.clientStatus === "accepted" ? (
          <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">
            {isCustomerRequirement
              ? "资料已确认。"
              : "事务所已完成此资料，请点击文件名查看。"}
          </p>
        ) : null}
      </div>
    </article>
  );
}

function OfficeRequirementConfirmationCard({
  requirement,
  busyActionId,
  actionErrorById,
  comment,
  onCommentChange,
  onFileAccess,
  onConfirm,
  onRequestRevision,
}: {
  requirement: PortalRequirement;
  busyActionId: string | null;
  actionErrorById: Record<string, string | null>;
  comment: string;
  onCommentChange: (comment: string) => void;
  onFileAccess: (fileId: string) => void;
  onConfirm: () => void;
  onRequestRevision: () => void;
}) {
  const isCompleted = requirement.clientStatus === "accepted";
  const isConfirmed = requirement.clientStatus === "not_applicable";
  const confirmActionId = `office-confirm:${requirement.id}`;
  const revisionActionId = `office-revision:${requirement.id}`;

  return (
    <article className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="break-words text-base font-semibold text-slate-950">
            {displayChineseText(requirement.title)}
          </h4>
        </div>
        <StatusBadge
          value={isConfirmed ? "office_confirmed" : isCompleted ? "office_completed" : "office_in_progress"}
        />
      </div>

      {requirement.customerInstruction?.trim() ? (
        <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <div className="mb-1 text-xs font-semibold text-amber-700">说明</div>
          <div className="whitespace-pre-wrap break-words">
            {displayChineseText(requirement.customerInstruction)}
          </div>
        </div>
      ) : null}

      {requirement.files.length > 0 ? (
        <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
          {requirement.files.map((file) => {
            const actionId = `file:${file.id}`;
            const displayName = displayChineseText(file.displayName);

            return (
              <div key={file.id} className="py-2">
                {file.portalDownloadable ? (
                  <button
                    type="button"
                    disabled={busyActionId === actionId}
                    onClick={() => onFileAccess(file.id)}
                    className="block w-full truncate text-left text-sm font-medium text-slate-900 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60"
                  >
                    {busyActionId === actionId ? "正在打开..." : displayName}
                  </button>
                ) : (
                  <span className="block truncate text-sm font-medium text-slate-700">
                    {displayName}
                  </span>
                )}
                <InlineError message={actionErrorById[actionId] ?? null} />
              </div>
            );
          })}
        </div>
      ) : null}

      {isCompleted ? (
        <div className="mt-4 grid gap-3">
          <AutoGrowTextarea
            value={comment}
            onChange={onCommentChange}
            placeholder="如需修改，请填写希望事务所确认或调整的内容。"
            disabled={busyActionId === revisionActionId}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <PortalButton
              variant="secondary"
              disabled={busyActionId === revisionActionId}
              onClick={onRequestRevision}
              className="w-full sm:w-fit"
            >
              {busyActionId === revisionActionId ? "提交中" : "要求修改"}
            </PortalButton>
            <PortalButton
              disabled={busyActionId === confirmActionId}
              onClick={onConfirm}
              className="w-full sm:w-fit"
            >
              {busyActionId === confirmActionId ? "提交中" : "确认无误"}
            </PortalButton>
          </div>
          <InlineError message={actionErrorById[confirmActionId] ?? null} />
          <InlineError message={actionErrorById[revisionActionId] ?? null} />
        </div>
      ) : isConfirmed ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
          已确认此资料。
        </p>
      ) : (
        <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-slate-500">
          事务所正在制作此资料。
        </p>
      )}






    </article>
  );
}

function ConfirmationCard({
  confirmation,
  busyActionId,
  actionErrorById,
  comment,
  onCommentChange,
  onAccess,
  onConfirm,
  onRequestRevision,
}: {
  confirmation: PortalApplicationConfirmation;
  busyActionId: string | null;
  actionErrorById: Record<string, string | null>;
  comment: string;
  onCommentChange: (comment: string) => void;
  onAccess: () => void;
  onConfirm: () => void;
  onRequestRevision: () => void;
}) {
  const downloadActionId = `confirmation-download:${confirmation.id}`;
  const confirmActionId = `confirmation-confirm:${confirmation.id}`;
  const revisionActionId = `confirmation-revision:${confirmation.id}`;
  const actionable =
    confirmation.status === "pending" || confirmation.status === "needs_revision";
  const displayFileName = `${displayChineseText(confirmation.title)} v${confirmation.version}`;

  return (
    <article className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="break-words text-base font-semibold text-slate-950">
            {displayChineseText(confirmation.title)}
          </h4>
          <p className="mt-1 text-sm text-slate-500">版本 {confirmation.version}</p>
        </div>
        <StatusBadge value={confirmation.status} />
      </div>

      <div className="mt-4 grid gap-3">
        <button
          type="button"
          disabled={busyActionId === downloadActionId}
          onClick={onAccess}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-950 transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-wait disabled:opacity-60"
        >
          <span className="min-w-0 truncate">
            {busyActionId === downloadActionId ? "正在打开..." : displayFileName}
          </span>
          <span className="shrink-0 text-xs font-medium text-slate-400">下载</span>
        </button>
        <InlineError message={actionErrorById[downloadActionId] ?? null} />

        {actionable ? (
          <>
            <AutoGrowTextarea
              value={comment}
              onChange={onCommentChange}
              placeholder="如需修改，请填写希望事务所确认或调整的内容。"
              disabled={busyActionId === revisionActionId}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <PortalButton
                variant="secondary"
                disabled={busyActionId === revisionActionId}
                onClick={onRequestRevision}
                className="w-full sm:w-fit"
              >
                要求修改
              </PortalButton>
              <PortalButton
                disabled={busyActionId === confirmActionId}
                onClick={onConfirm}
                className="w-full sm:w-fit"
              >
                {busyActionId === confirmActionId ? "提交中" : "确认无误"}
              </PortalButton>
            </div>
            <InlineError message={actionErrorById[confirmActionId] ?? null} />
            <InlineError message={actionErrorById[revisionActionId] ?? null} />
          </>
        ) : (
          <p className="text-sm leading-6 text-slate-500">
            此确认资料暂不可操作。
          </p>
        )}
      </div>
    </article>
  );
}

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      rows={2}
      className="min-h-24 w-full resize-none overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

function WithdrawRequirementDialog({
  requirement,
  busyActionId,
  actionErrorById,
  onClose,
  onConfirm,
}: {
  requirement: PortalRequirement;
  busyActionId: string | null;
  actionErrorById: Record<string, string | null>;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const actionId = `requirement-withdraw:${requirement.id}`;
  const busy = busyActionId === actionId;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-3 sm:items-center sm:justify-center">
      <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">撤回已提交资料</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              撤回后可以继续修改或删除已上传文件，确认无误后请再次提交资料。
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 disabled:opacity-50"
          >
            关闭
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold text-slate-500">资料名称</div>
          <p className="mt-2 break-words text-sm font-semibold text-slate-900">
            {displayChineseText(requirement.title)}
          </p>
        </div>

        <InlineError message={actionErrorById[actionId] ?? null} />

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <PortalButton variant="secondary" disabled={busy} onClick={onClose}>
            取消
          </PortalButton>
          <PortalButton disabled={busy} onClick={onConfirm}>
            {busy ? "撤回中" : "确认撤回"}
          </PortalButton>
        </div>
      </div>
    </div>
  );
}

function ConfirmationDialog({
  state,
  busyActionId,
  actionErrorById,
  comment,
  onClose,
  onConfirm,
  onRequestRevision,
}: {
  state: Extract<NonNullable<ConfirmDialogState>, { confirmation: PortalApplicationConfirmation }>;
  busyActionId: string | null;
  actionErrorById: Record<string, string | null>;
  comment: string;
  onClose: () => void;
  onConfirm: () => void;
  onRequestRevision: () => void;
}) {
  const confirmActionId = `confirmation-confirm:${state.confirmation.id}`;
  const revisionActionId = `confirmation-revision:${state.confirmation.id}`;
  const isRevision = state.kind === "revision";
  const busy = isRevision
    ? busyActionId === revisionActionId
    : busyActionId === confirmActionId;
  const renderHiddenRevisionInput = busy && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-3 sm:items-center sm:justify-center">
      <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">
              {isRevision ? "要求修改完成资料" : "确认完成资料"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {isRevision
                ? "请确认要提交给事务所的修改内容。"
                : "确认后事务所会继续处理。如需调整，请选择要求修改。"}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600 disabled:opacity-50"
          >
            关闭
          </button>
        </div>

        {isRevision ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">修改内容</div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">
              {comment.trim()}
            </p>
          </div>
        ) : null}

        {renderHiddenRevisionInput ? (
          <textarea
            value={comment}
            rows={4}
            className="hidden"
            placeholder="请填写希望事务所确认或调整的内容。"
            disabled={busy}
          />
        ) : null}

        <InlineError
          message={actionErrorById[isRevision ? revisionActionId : confirmActionId] ?? null}
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <PortalButton variant="secondary" disabled={busy} onClick={onClose}>
            取消
          </PortalButton>
          <PortalButton
            disabled={busy}
            onClick={isRevision ? onRequestRevision : onConfirm}
          >
            {busy ? "提交中" : isRevision ? "提交修改请求" : "确认无误"}
          </PortalButton>
        </div>
      </div>
    </div>
  );
}

