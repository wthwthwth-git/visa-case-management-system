import Link from "next/link";
import type { ReactNode } from "react";
import { AdminSessionControls } from "./admin-session-controls";

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 text-slate-950 lg:grid lg:grid-cols-[220px_1fr]">
      <aside className="bg-[#071B3A] text-white lg:sticky lg:top-0 lg:h-screen">
        <div className="flex h-full min-h-0 flex-col px-4 py-4 lg:min-h-screen">
          <Link href="/admin/cases" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500 text-sm font-bold shadow-lg shadow-blue-950/30">
              VI
            </span>
            <span>
              <span className="block text-sm font-semibold">签证案件管理</span>
              <span className="block text-xs text-blue-100">事务所后台</span>
            </span>
          </Link>

          <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 text-sm lg:grid lg:overflow-visible lg:pb-0">
            <Link
              href="/admin/cases"
              className="shrink-0 rounded-xl px-3 py-2.5 font-medium text-blue-50 transition hover:bg-white/10"
            >
              案件列表
            </Link>
            <Link
              href="/admin/cases/new"
              className="shrink-0 rounded-xl px-3 py-2.5 font-medium text-blue-50 transition hover:bg-white/10"
            >
              新建案件
            </Link>
          </nav>

          <div className="mt-auto hidden rounded-2xl border border-amber-300/40 bg-amber-300/15 p-3 text-xs leading-5 text-amber-50 lg:block">
            开发环境：后台认证、页面安全校验和访问频率限制已接入；正式上线前仍需完成生产部署、监控和运维检查。
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex min-w-0 flex-wrap items-center justify-start gap-2 sm:justify-end">
              <button
                type="button"
                disabled
                className="h-9 shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-500 shadow-sm"
              >
                通知
              </button>
              <AdminSessionControls />
            </div>
          </div>
        </header>

        <div className="px-4 py-5 sm:px-5 md:px-6 lg:px-7">{children}</div>
      </div>
    </div>
  );
}
