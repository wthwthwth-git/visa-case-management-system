"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { displayChineseText, displayVisaType } from "@/app/_lib/chinese-display";
import {
  confirmPortalApplicationConfirmation,
  createPortalApplicationConfirmationAccessUrl,
  createPortalFileAccessUrl,
  fetchPortalCase,
  formatPortalDateTime,
  requestPortalApplicationConfirmationRevision,
  toPortalErrorMessage,
  uploadPortalRequirementFile,
  type PortalApplicationConfirmation,
  type PortalCase,
  type PortalDocumentStatus,
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

const requirementGroupOrder: PortalDocumentStatus[] = [
  "needs_more",
  "not_submitted",
  "submitted",
  "accepted",
  "not_applicable",
];

function formatFileSize(value: string) {
  const size = Number(value);

  if (!Number.isFinite(size)) {
    return "-";
  }

  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${size} B`;
}

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
  return {
    total: requirements.length,
    needsMore: requirements.filter((item) => item.clientStatus === "needs_more").length,
    pending: requirements.filter((item) => item.clientStatus === "not_submitted").length,
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

  const summary = useMemo(
    () => getRequirementSummary(portalCase?.requirements ?? []),
    [portalCase?.requirements],
  );
  const requirementGroups = useMemo(
    () => groupRequirements(portalCase?.requirements ?? []),
    [portalCase?.requirements],
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

  function addSelectedUploadFiles(requirementId: string, files: File[]) {
    if (files.length === 0) {
      return;
    }

    setUploadStateByRequirementId((current) => {
      const previous = current[requirementId] ?? {
        files: [],
        busy: false,
        error: null,
      };

      return {
        ...current,
        [requirementId]: {
          ...previous,
          files: [...previous.files, ...files],
          error: null,
        },
      };
    });
  }

  function removeSelectedUploadFile(requirementId: string, index: number) {
    setUploadStateByRequirementId((current) => {
      const previous = current[requirementId] ?? {
        files: [],
        busy: false,
        error: null,
      };

      return {
        ...current,
        [requirementId]: {
          ...previous,
          files: previous.files.filter((_, fileIndex) => fileIndex !== index),
          error: null,
        },
      };
    });
  }

  function clearSelectedUploadFiles(requirementId: string) {
    setRequirementUploadState(requirementId, {
      files: [],
      error: null,
    });
  }

  async function handleUpload(requirement: PortalRequirement) {
    const selectedFiles = uploadStateByRequirementId[requirement.id]?.files ?? [];

    if (selectedFiles.length === 0) {
      setRequirementUploadState(requirement.id, {
        error: "请选择要上传的文件。",
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
    const confirmed = window.confirm(
      "确认后事务所会继续提交申请。如需修改，请选择要求修改。",
    );

    if (!confirmed) {
      return;
    }

    const actionId = `confirmation-confirm:${confirmation.id}`;

    try {
      setBusyActionId(actionId);
      setActionErrorById((current) => ({ ...current, [actionId]: null }));
      await confirmPortalApplicationConfirmation({
        token,
        confirmationId: confirmation.id,
      });
      setNotice("申请书已确认。");
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

    try {
      setBusyActionId(actionId);
      setActionErrorById((current) => ({ ...current, [actionId]: null }));
      await requestPortalApplicationConfirmationRevision({
        token,
        confirmationId: confirmation.id,
        comment: revisionCommentById[confirmation.id],
        reason: "Client requested revision.",
      });
      setRevisionCommentById((current) => ({ ...current, [confirmation.id]: "" }));
      setNotice("修改要求已提交。");
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
                <div className="font-semibold">正在加载客户页面</div>
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
            <h1 className="mt-3 text-2xl font-bold">链接无法使用</h1>
            <p className="mt-3 leading-7 text-slate-600">
              {pageError ?? "发生错误，请稍后再试或联系事务所。"}
            </p>
          </PortalCard>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5 text-slate-950 sm:py-8">
      <div className="mx-auto grid max-w-4xl gap-5">
        <PortalCard className="bg-gradient-to-br from-blue-700 to-slate-950 text-white">
          <p className="text-sm font-semibold text-blue-100">客户资料提交页面</p>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">资料提交</h1>
              <p className="mt-3 max-w-2xl leading-7 text-blue-50">
                请根据下方清单上传资料，或确认事务所准备的申请书。
              </p>
            </div>
            <StatusBadge value={portalCase.casePhase} />
          </div>
          <div className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-blue-100">案件编号</div>
              <div className="mt-1 break-words font-semibold">{portalCase.caseNumber}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-blue-100">申请签证类型</div>
              <div className="mt-1 break-words font-semibold">
                {displayVisaType(portalCase.targetVisaType)}
              </div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-blue-100">客户姓名</div>
              <div className="mt-1 break-words font-semibold">{portalCase.customerName}</div>
            </div>
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="text-blue-100">当前状态</div>
              <div className="mt-1 break-words font-semibold">
                {displayPortalLabel(portalCase.casePhase)}
              </div>
            </div>
          </div>
        </PortalCard>

        <SuccessMessage message={notice} />

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <PortalCard className="p-4">
            <div className="text-xs text-slate-500">客户提交材料</div>
            <div className="mt-1 text-2xl font-bold">{summary.total}</div>
          </PortalCard>
          <PortalCard className="p-4">
            <div className="text-xs text-slate-500">待上传</div>
            <div className="mt-1 text-2xl font-bold">{summary.pending}</div>
          </PortalCard>
          <PortalCard className="p-4">
            <div className="text-xs text-slate-500">需要补充</div>
            <div className="mt-1 text-2xl font-bold">{summary.needsMore}</div>
          </PortalCard>
          <PortalCard className="p-4">
            <div className="text-xs text-slate-500">已完成</div>
            <div className="mt-1 text-2xl font-bold">{summary.completed}</div>
          </PortalCard>
        </section>

        <PortalCard>
          <div className="mb-5">
            <h2 className="text-lg font-bold">客户提交材料</h2>
          </div>

          {portalCase.requirements.length === 0 ? (
            <EmptyState title="暂无需要提交的材料" description="事务所追加材料后会显示在这里。" />
          ) : (
            <div className="grid gap-6">
              {requirementGroups.map((group) => (
                <section key={group.status} className="grid gap-3">
                  <h3 className="text-sm font-semibold text-slate-500">
                    {groupTitle(group.status)}
                  </h3>
                  {group.items.map((requirement) => (
                    <RequirementCard
                      key={requirement.id}
                      requirement={requirement}
                      uploadState={uploadStateByRequirementId[requirement.id]}
                      busyActionId={busyActionId}
                      actionErrorById={actionErrorById}
                      onFilesAdd={(files) => addSelectedUploadFiles(requirement.id, files)}
                      onFileRemove={(index) => removeSelectedUploadFile(requirement.id, index)}
                      onFilesClear={() => clearSelectedUploadFiles(requirement.id)}
                      onUpload={() => void handleUpload(requirement)}
                      onFileAccess={(fileId) => void handleFileAccess(fileId)}
                    />
                  ))}
                </section>
              ))}
            </div>
          )}
        </PortalCard>

        <PortalCard>
          <div className="mb-5">
            <h2 className="text-lg font-bold">申请书确认</h2>
          </div>

          {portalCase.applicationConfirmations.length === 0 ? (
            <EmptyState title="暂无需要确认的申请书" description="事务所准备好申请书后会显示在这里。" />
          ) : (
            <div className="grid gap-4">
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
                  onConfirm={() => void handleConfirmConfirmation(confirmation)}
                  onRequestRevision={() => void handleRequestRevision(confirmation)}
                />
              ))}
            </div>
          )}
        </PortalCard>
      </div>
    </main>
  );
}

function RequirementCard({
  requirement,
  uploadState,
  busyActionId,
  actionErrorById,
  onFilesAdd,
  onFileRemove,
  onFilesClear,
  onUpload,
  onFileAccess,
}: {
  requirement: PortalRequirement;
  uploadState: UploadState | undefined;
  busyActionId: string | null;
  actionErrorById: Record<string, string | null>;
  onFilesAdd: (files: File[]) => void;
  onFileRemove: (index: number) => void;
  onFilesClear: () => void;
  onUpload: () => void;
  onFileAccess: (fileId: string) => void;
}) {
  const uploadBusy = uploadState?.busy ?? false;
  const selectedFiles = uploadState?.files ?? [];

  return (
    <article className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="break-words text-base font-semibold text-slate-950">
            {displayChineseText(requirement.title)}
          </h4>
          {requirement.customerInstruction ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">
              {displayChineseText(requirement.customerInstruction)}
            </p>
          ) : null}
        </div>
        <StatusBadge value={requirement.clientStatus} />
      </div>

      {requirement.files.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-100 bg-white p-3">
          <div className="text-sm font-semibold text-slate-700">已上传文件</div>
          <div className="mt-3 grid gap-2">
            {requirement.files.map((file) => {
              const actionId = `file:${file.id}`;

              return (
                <div
                  key={file.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-100 p-3 text-sm"
                >
                  <div className="min-w-0 text-slate-600">
                    <div>{file.mimeType || "文件"}</div>
                    <div className="text-xs text-slate-400">
                      {formatFileSize(file.fileSize)} / {formatPortalDateTime(file.createdAt)}
                    </div>
                  </div>
                  {file.portalDownloadable ? (
                    <PortalButton
                      variant="secondary"
                      disabled={busyActionId === actionId}
                      onClick={() => onFileAccess(file.id)}
                    >
                      {busyActionId === actionId ? "打开中" : "下载 / 预览"}
                    </PortalButton>
                  ) : null}
                  <InlineError message={actionErrorById[actionId] ?? null} />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        <label className="rounded-3xl border border-dashed border-blue-200 bg-blue-50/50 p-4">
          <input
            type="file"
            multiple
            className="sr-only"
            disabled={uploadBusy}
            onChange={(event) => {
              onFilesAdd(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = "";
            }}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-950">选择要上传的文件</div>
              <div className="mt-1 text-xs text-slate-500">支持一次选择多个文件</div>
            </div>
            <span className="inline-flex w-fit rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-200">
              选择文件
            </span>
          </div>
        </label>

        {selectedFiles.length > 0 ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <div className="text-sm font-semibold text-slate-600">
                已选择 {selectedFiles.length} 个文件
              </div>
              <button
                type="button"
                disabled={uploadBusy}
                onClick={onFilesClear}
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 disabled:text-slate-300"
              >
                清空
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-700">{file.name}</div>
                    <div className="text-xs text-slate-400">
                      {formatFileSize(String(file.size))}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={uploadBusy}
                    onClick={() => onFileRemove(index)}
                    aria-label={`删除 ${file.name}`}
                    className="px-1 text-lg leading-none text-rose-500 hover:text-rose-700 disabled:text-slate-300"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <InlineError message={uploadState?.error ?? null} />
        <PortalButton disabled={uploadBusy} onClick={onUpload}>
          {uploadBusy
            ? "上传中"
            : selectedFiles.length > 1
              ? `上传 ${selectedFiles.length} 个文件`
              : "上传文件"}
        </PortalButton>
      </div>
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
        <PortalButton
          variant="secondary"
          disabled={busyActionId === downloadActionId}
          onClick={onAccess}
        >
          {busyActionId === downloadActionId ? "打开中" : "下载 / 预览申请书"}
        </PortalButton>
        <InlineError message={actionErrorById[downloadActionId] ?? null} />

        {actionable ? (
          <>
            <PortalButton disabled={busyActionId === confirmActionId} onClick={onConfirm}>
              {busyActionId === confirmActionId ? "提交中" : "确认无误"}
            </PortalButton>
            <InlineError message={actionErrorById[confirmActionId] ?? null} />

            <textarea
              value={comment}
              onChange={(event) => onCommentChange(event.currentTarget.value)}
              rows={4}
              className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="如需修改，请填写希望事务所调整的内容。"
              disabled={busyActionId === revisionActionId}
            />
            <PortalButton
              variant="danger"
              disabled={busyActionId === revisionActionId}
              onClick={onRequestRevision}
            >
              {busyActionId === revisionActionId ? "提交中" : "要求修改"}
            </PortalButton>
            <InlineError message={actionErrorById[revisionActionId] ?? null} />
          </>
        ) : (
          <p className="text-sm leading-6 text-slate-500">
            当前版本已经处理完成，如需重新确认请联系事务所。
          </p>
        )}
      </div>
    </article>
  );
}
