"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LanguageSwitcher } from "@/app/_components/language-switcher";
import { useLanguage } from "@/app/_components/language-provider";
import { displayChineseText } from "@/app/_lib/chinese-display";
import {
  confirmPortalApplicationConfirmation,
  createPortalApplicationConfirmationAccessUrl,
  createPortalFileAccessUrl,
  deletePortalRequirementFile,
  fetchPortalCase,
  formatPortalDate,
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
  displayPortalCasePhaseLabel,
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
  "approved",
];

function normalizePortalCasePhase(casePhase: string) {
  return portalCasePhaseSteps.includes(casePhase) ? casePhase : portalCasePhaseSteps[0];
}

function shouldShowPortalSubmissionInfo(casePhase: string) {
  const submittedIndex = portalCasePhaseSteps.indexOf("submitted");
  const currentIndex = portalCasePhaseSteps.indexOf(normalizePortalCasePhase(casePhase));

  return submittedIndex >= 0 && currentIndex >= submittedIndex;
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
  const { locale, t } = useLanguage();
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
        setPageError(toPortalErrorMessage(error, locale));
        setPortalCase(null);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [locale, token]);

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
        error: t("portal.error.fileRequired"),
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

      setNotice(t("portal.notice.uploadedCount", { count: selectedFiles.length }));
      setRequirementUploadState(requirement.id, {
        files: [],
        busy: false,
        error: null,
      });
      await loadCase();
    } catch (error) {
      setRequirementUploadState(requirement.id, {
        busy: false,
        error: toPortalErrorMessage(error, locale),
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
      setNotice(t("portal.notice.submitted"));
      await loadCase();
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error, locale),
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
      setNotice(t("portal.notice.withdrawn"));
      setDialogState(null);
      await loadCase();
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error, locale),
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
      setNotice(t("portal.notice.fileDeleted"));
      await loadCase();
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error, locale),
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
        [actionId]: toPortalErrorMessage(error, locale),
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
        [actionId]: toPortalErrorMessage(error, locale),
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
      setNotice(t("portal.notice.officeConfirmed"));
      setDialogState(null);
      await loadCase();
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error, locale),
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
        [actionId]: t("portal.error.commentRequired"),
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
        reason: "客户要求修改事务所资料",
      });
      setRevisionCommentById((current) => ({ ...current, [confirmation.id]: "" }));
      setNotice(t("portal.notice.officeRevisionRequested"));
      setDialogState(null);
      await loadCase();
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error, locale),
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
      setNotice(t("portal.notice.officeRequirementConfirmed"));
      await loadCase();
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error, locale),
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
        [actionId]: t("portal.error.commentRequired"),
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
      setNotice(t("portal.notice.officeRevisionRequested"));
      await loadCase();
    } catch (error) {
      setActionErrorById((current) => ({
        ...current,
        [actionId]: toPortalErrorMessage(error, locale),
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
                <div className="font-semibold">{t("portal.loading.title")}</div>
                <p className="mt-1 text-sm text-slate-500">{t("portal.loading.short")}</p>
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
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="text-sm font-semibold text-blue-600">{t("portal.eyebrow")}</p>
              <LanguageSwitcher compact />
            </div>
            <h1 className="mt-3 text-2xl font-bold">{t("portal.invalid.title")}</h1>
            <p className="mt-3 leading-7 text-slate-600">
              {pageError ?? t("portal.invalid.description")}
            </p>
          </PortalCard>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-4 text-slate-950 sm:py-8">
      <div className="mx-auto grid max-w-4xl gap-4 sm:gap-5">
        <div className="flex justify-end">
          <LanguageSwitcher compact />
        </div>

        <SuccessMessage message={notice} />

        <PortalCaseProgress portalCase={portalCase} />

        <RequirementProgressSummary summary={summary} />

        <PortalCard>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">{t("portal.confirmations.title")}</h2>
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
                        [actionId]: t("portal.error.commentRequired"),
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
              {t("portal.confirmations.empty")}
            </div>
          )}
        </PortalCard>

        <PortalCard>
          <div className="mb-4">
            <h2 className="text-lg font-bold">{t("portal.requirements.title")}</h2>
          </div>

          {customerRequirements.length === 0 ? (
            <EmptyState
              title={t("portal.requirements.empty")}
              description={t("portal.requirements.emptyDescription")}
            />
          ) : (
            <div className="grid gap-6">
              {requirementGroups.map((group) => (
                <section key={group.status} className="grid gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-slate-500">
                      {groupTitle(group.status, locale)}
                    </h3>
                    <span className="text-xs text-slate-400">
                      {t("portal.requirements.count", { count: group.items.length })}
                    </span>
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
  const { t } = useLanguage();
  const preparedCount = summary.submitted + summary.completed;
  const percent = summary.total > 0 ? Math.round((preparedCount / summary.total) * 100) : 0;

  return (
    <PortalCard className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{t("portal.summary.title")}</h2>
          <p className="mt-2 text-sm text-slate-500">
            {t("portal.summary.prepared", { prepared: preparedCount, total: summary.total })}
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
        <ProgressCount label={t("portal.summary.pending")} value={summary.pending} />
        <ProgressCount label={t("portal.summary.needsMore")} value={summary.needsMore} />
        <ProgressCount label={t("portal.summary.needsRevision")} value={summary.needsRevision} />
        <ProgressCount label={t("portal.summary.submitted")} value={summary.submitted} />
        <ProgressCount label={t("portal.summary.completed")} value={summary.completed} />
      </div>

    </PortalCard>
  );
}

function PortalCaseProgress({ portalCase }: { portalCase: PortalCase }) {
  const { locale, t } = useLanguage();
  const currentPhase = normalizePortalCasePhase(portalCase.casePhase);
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
            {t("portal.customerDisplay", {
              name: displayChineseText(portalCase.customerName),
            })}
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
                    {displayPortalCasePhaseLabel(phase, locale)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {portalCase.submissionInfo && shouldShowPortalSubmissionInfo(portalCase.casePhase) ? (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
          {portalCase.submissionInfo.submittedAt ? (
            <div>
              <span className="text-slate-500">{t("portal.submission.submittedAt")}</span>
              <span className="font-semibold text-slate-950">
                {formatPortalDate(portalCase.submissionInfo.submittedAt, locale)}
              </span>
            </div>
          ) : null}
          {portalCase.submissionInfo.submissionNumber ? (
            <div>
              <span className="text-slate-500">{t("portal.submission.number")}</span>
              <span className="break-words font-semibold text-slate-950">
                {portalCase.submissionInfo.submissionNumber}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
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

function RequirementSourceBadge({ sourceType }: { sourceType: string }) {
  const { t } = useLanguage();

  if (sourceType !== "immigration_request") {
    return null;
  }

  return (
    <span className="inline-flex shrink-0 items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
      {t("portal.additionalRequest")}
    </span>
  );
}

function getRequirementDueDateNotice(
  requirement: PortalRequirement,
  locale: ReturnType<typeof useLanguage>["locale"],
  t: ReturnType<typeof useLanguage>["t"],
) {
  if (requirement.clientStatus !== "not_submitted" || !requirement.dueDate) {
    return null;
  }

  const dueDate = new Date(requirement.dueDate);
  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDay = new Date(dueDate);
  dueDay.setHours(0, 0, 0, 0);

  const daysUntilDue = Math.ceil(
    (dueDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  const formattedDate = formatPortalDate(requirement.dueDate, locale);

  if (daysUntilDue < 0) {
    return {
      tone: "urgent" as const,
      label: t("portal.dueDate.overdue", { date: formattedDate }),
    };
  }

  if (daysUntilDue === 0) {
    return {
      tone: "urgent" as const,
      label: t("portal.dueDate.today", { date: formattedDate }),
    };
  }

  if (daysUntilDue < 7) {
    return {
      tone: "urgent" as const,
      label: t("portal.dueDate.soon", { date: formattedDate, days: daysUntilDue }),
    };
  }

  return {
    tone: "normal" as const,
    label: t("portal.dueDate.normal", { date: formattedDate }),
  };
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
  const { locale, t } = useLanguage();
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
  const dueDateNotice = getRequirementDueDateNotice(requirement, locale, t);
  const articleClassName =
    dueDateNotice?.tone === "urgent"
      ? "rounded-3xl border border-rose-200 bg-rose-50/70 p-4 shadow-sm shadow-rose-100"
      : "rounded-3xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100";

  return (
    <article className={articleClassName}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="break-words text-lg font-bold text-slate-950">
              {displayChineseText(requirement.title)}
            </h4>
            <RequirementSourceBadge sourceType={requirement.sourceType} />
          </div>
          {dueDateNotice ? (
            <div className="mt-2">
              <span
                className={
                  dueDateNotice.tone === "urgent"
                    ? "inline-flex items-center rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold text-rose-700"
                    : "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600"
                }
              >
                {dueDateNotice.label}
              </span>
            </div>
          ) : null}
        </div>
        <StatusBadge value={requirement.clientStatus} />
      </div>

      {shouldShowCustomerInstruction ? (
        <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <div className="mb-1 text-xs font-semibold text-amber-700">
            {t("portal.instruction")}
          </div>
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
                      {busyActionId === actionId ? t("portal.files.opening") : displayName}
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
                      aria-label={t("portal.files.delete", { name: displayName })}
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
                {uploadBusy ? t("portal.actions.uploading") : t("portal.actions.upload")}
              </label>

              {canSubmit ? (
                <PortalButton
                  variant="secondary"
                  disabled={submitBusy}
                  onClick={onSubmit}
                  className="w-full sm:w-fit"
                >
                  {submitBusy ? t("portal.actions.submitting") : t("portal.actions.submit")}
                </PortalButton>
              ) : null}
            </div>

            <InlineError message={uploadState?.error ?? null} />
            <InlineError message={actionErrorById[submitActionId] ?? null} />
          </>
        ) : null}

        {!canEditFiles && requirement.clientStatus === "submitted" ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>{t("portal.requirements.inReview")}</span>
            <PortalButton
              variant="secondary"
              disabled={withdrawBusy}
              onClick={onWithdraw}
              className="w-full sm:w-fit"
            >
              {withdrawBusy ? t("portal.actions.withdrawing") : t("portal.actions.withdraw")}
            </PortalButton>
          </div>
        ) : null}
        <InlineError message={actionErrorById[withdrawActionId] ?? null} />
        {requirement.clientStatus === "accepted" ? (
          <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-700">
            {isCustomerRequirement
              ? t("portal.requirements.accepted")
              : t("portal.requirements.officeReady")}
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
  const { t } = useLanguage();
  const isCompleted = requirement.clientStatus === "accepted";
  const isConfirmed = requirement.clientStatus === "not_applicable";
  const confirmActionId = `office-confirm:${requirement.id}`;
  const revisionActionId = `office-revision:${requirement.id}`;

  return (
    <article className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="break-words text-base font-semibold text-slate-950">
              {displayChineseText(requirement.title)}
            </h4>
            <RequirementSourceBadge sourceType={requirement.sourceType} />
          </div>
        </div>
        <StatusBadge
          value={isConfirmed ? "office_confirmed" : isCompleted ? "office_completed" : "office_in_progress"}
        />
      </div>

      {requirement.customerInstruction?.trim() ? (
        <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          <div className="mb-1 text-xs font-semibold text-amber-700">
            {t("portal.instruction")}
          </div>
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
                    {busyActionId === actionId ? t("portal.files.opening") : displayName}
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
            placeholder={t("portal.dialog.officeRevisionPlaceholder")}
            disabled={busyActionId === revisionActionId}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <PortalButton
              variant="secondary"
              disabled={busyActionId === revisionActionId}
              onClick={onRequestRevision}
              className="w-full sm:w-fit"
            >
              {busyActionId === revisionActionId
                ? t("portal.actions.submitting")
                : t("portal.actions.requestRevision")}
            </PortalButton>
            <PortalButton
              disabled={busyActionId === confirmActionId}
              onClick={onConfirm}
              className="w-full sm:w-fit"
            >
              {busyActionId === confirmActionId
                ? t("portal.actions.submitting")
                : t("portal.actions.confirmOk")}
            </PortalButton>
          </div>
          <InlineError message={actionErrorById[confirmActionId] ?? null} />
          <InlineError message={actionErrorById[revisionActionId] ?? null} />
        </div>
      ) : isConfirmed ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-700">
          {t("portal.confirmations.completedMessage")}
        </p>
      ) : (
        <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm leading-6 text-slate-500">
          {t("portal.confirmations.workingMessage")}
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
  const { t } = useLanguage();
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
          <p className="mt-1 text-sm text-slate-500">
            {t("portal.confirmations.version", { version: confirmation.version })}
          </p>
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
            {busyActionId === downloadActionId ? t("portal.files.opening") : displayFileName}
          </span>
          <span className="shrink-0 text-xs font-medium text-slate-400">
            {t("portal.files.download")}
          </span>
        </button>
        <InlineError message={actionErrorById[downloadActionId] ?? null} />

        {actionable ? (
          <>
            <AutoGrowTextarea
              value={comment}
              onChange={onCommentChange}
              placeholder={t("portal.dialog.officeRevisionPlaceholder")}
              disabled={busyActionId === revisionActionId}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <PortalButton
                variant="secondary"
                disabled={busyActionId === revisionActionId}
                onClick={onRequestRevision}
                className="w-full sm:w-fit"
              >
                {t("portal.actions.requestRevision")}
              </PortalButton>
              <PortalButton
                disabled={busyActionId === confirmActionId}
                onClick={onConfirm}
                className="w-full sm:w-fit"
              >
                {busyActionId === confirmActionId
                  ? t("portal.actions.submitting")
                  : t("portal.actions.confirmOk")}
              </PortalButton>
            </div>
            <InlineError message={actionErrorById[confirmActionId] ?? null} />
            <InlineError message={actionErrorById[revisionActionId] ?? null} />
          </>
        ) : (
          <p className="text-sm leading-6 text-slate-500">
            {t("portal.confirmations.unavailable")}
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
  const { t } = useLanguage();
  const actionId = `requirement-withdraw:${requirement.id}`;
  const busy = busyActionId === actionId;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-3 sm:items-center sm:justify-center">
      <div className="relative w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
        <button
          type="button"
          aria-label={t("portal.actions.close")}
          disabled={busy}
          onClick={onClose}
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xl leading-none text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
        >
          ×
        </button>
        <div className="pr-12">
          <div>
            <h2 className="text-xl font-bold">{t("portal.dialog.withdrawTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {t("portal.dialog.withdrawDescription")}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold text-slate-500">
            {t("portal.dialog.requirementName")}
          </div>
          <p className="mt-2 break-words text-sm font-semibold text-slate-900">
            {displayChineseText(requirement.title)}
          </p>
        </div>

        <InlineError message={actionErrorById[actionId] ?? null} />

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <PortalButton variant="secondary" disabled={busy} onClick={onClose}>
            {t("portal.actions.cancel")}
          </PortalButton>
          <PortalButton disabled={busy} onClick={onConfirm}>
            {busy ? t("portal.actions.withdrawing") : t("portal.actions.confirmWithdraw")}
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
  const { t } = useLanguage();
  const confirmActionId = `confirmation-confirm:${state.confirmation.id}`;
  const revisionActionId = `confirmation-revision:${state.confirmation.id}`;
  const isRevision = state.kind === "revision";
  const busy = isRevision
    ? busyActionId === revisionActionId
    : busyActionId === confirmActionId;
  const renderHiddenRevisionInput = busy && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-3 sm:items-center sm:justify-center">
      <div className="relative w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
        <button
          type="button"
          aria-label={t("portal.actions.close")}
          disabled={busy}
          onClick={onClose}
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-xl leading-none text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
        >
          ×
        </button>
        <div className="pr-12">
          <div>
            <h2 className="text-xl font-bold">
              {isRevision
                ? t("portal.dialog.officeRevisionTitle")
                : t("portal.dialog.confirmOfficeTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {isRevision
                ? t("portal.dialog.officeRevisionDescription")
                : t("portal.dialog.confirmOfficeDescription")}
            </p>
          </div>
        </div>

        {isRevision ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold text-slate-500">
              {t("portal.dialog.revisionContent")}
            </div>
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
            placeholder={t("portal.dialog.officeRevisionPlaceholder")}
            disabled={busy}
          />
        ) : null}

        <InlineError
          message={actionErrorById[isRevision ? revisionActionId : confirmActionId] ?? null}
        />

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <PortalButton variant="secondary" disabled={busy} onClick={onClose}>
            {t("portal.actions.cancel")}
          </PortalButton>
          <PortalButton
            disabled={busy}
            onClick={isRevision ? onRequestRevision : onConfirm}
          >
            {busy
              ? t("portal.actions.submitting")
              : isRevision
                ? t("portal.actions.submitRevision")
                : t("portal.actions.confirmOk")}
          </PortalButton>
        </div>
      </div>
    </div>
  );
}

