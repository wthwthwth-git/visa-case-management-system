"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type SessionResponse = {
  user?: {
    email?: string | null;
  };
};

export function AdminSessionControls() {
  const [email, setEmail] = useState("确认登录中...");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const session = (await response.json()) as SessionResponse;

        if (isMounted) {
          setEmail(session.user?.email ?? "未登录");
        }
      } catch {
        if (isMounted) {
          setEmail("未登录");
        }
      }
    }

    void loadSession();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span
        title={email}
        className="flex h-10 min-w-0 max-w-[calc(100vw-12rem)] items-center truncate rounded-2xl border border-blue-100 bg-blue-50 px-3 text-sm font-medium text-blue-700 shadow-sm sm:max-w-[16rem] lg:max-w-[18rem]"
      >
        {email}
      </span>
      <button
        type="button"
        disabled={isLoggingOut}
        onClick={() => {
          setIsLoggingOut(true);
          void signOut({ callbackUrl: "/admin/login?reason=logged-out" });
        }}
        className="h-10 shrink-0 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isLoggingOut ? "退出中..." : "退出"}
      </button>
    </div>
  );
}
