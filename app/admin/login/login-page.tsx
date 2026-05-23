"use client";

import { useMemo, useState } from "react";
import { signIn } from "next-auth/react";

function getReasonMessage(reason: string | null): string | null {
  if (reason === "session-expired") {
    return "登录已过期，请重新登录。";
  }

  if (reason === "logged-out") {
    return "已退出登录。";
  }

  return null;
}

function getErrorMessage(error: string | null): string | null {
  if (!error) {
    return null;
  }

  if (error === "AccessDenied") {
    return "该账号不在后台登录允许名单中，或账号已被停用。";
  }

  if (error === "OAuthSignin" || error === "OAuthCallback") {
    return "Google 登录失败，请检查第三方登录配置后重试。";
  }

  return "登录失败，请稍后重试。";
}

export function AdminLoginPage({
  callbackUrl,
  error,
  reason,
}: {
  callbackUrl?: string;
  error?: string;
  reason?: string;
}) {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const safeCallbackUrl = callbackUrl && callbackUrl.startsWith("/admin") ? callbackUrl : "/admin/cases";
  const message = useMemo(
    () => getErrorMessage(error ?? null) ?? getReasonMessage(reason ?? null),
    [error, reason],
  );

  return (
    <main className="mx-auto flex min-h-[calc(100vh-180px)] max-w-xl items-center justify-center">
      <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div>
          <p className="text-sm font-semibold text-blue-600">后台登录</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">登录后台管理</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            请使用已加入允许名单的 Google 账号登录。客户 Portal 仍使用独立 token 链接，不走后台登录。
          </p>
        </div>

        {message ? (
          <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {message}
          </div>
        ) : null}

        <button
          type="button"
          disabled={isSigningIn}
          onClick={() => {
            setIsSigningIn(true);
            void signIn("google", { callbackUrl: safeCallbackUrl });
          }}
          className="mt-6 flex w-full items-center justify-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
        >
          {isSigningIn ? "正在跳转..." : "使用 Google 登录"}
        </button>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
          当前为开发环境。正式部署前必须确认后台认证、页面安全校验、访问频率限制和生产环境配置。
        </div>
      </section>
    </main>
  );
}
