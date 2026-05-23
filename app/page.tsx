import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-950">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-blue-600">签证案件资料管理系统</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">欢迎使用事务所后台</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          请从后台案件列表进入管理界面，或使用客户专属链接进入客户资料提交页面。
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/admin/cases"
            className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            进入后台
          </Link>
          <Link
            href="/admin/cases/new"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            新建案件
          </Link>
        </div>
      </section>
    </main>
  );
}
