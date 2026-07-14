"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/components/auth/AuthProvider";

export default function AuthPage() {
  const { lang } = useApp();
  const { user, configured, signOut } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const zh = lang === "zh";

  const sendLink = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setMessage(
      error
        ? error.message
        : zh
          ? "登入連結已寄出，請查看電郵。"
          : "Magic link sent. Check your email."
    );
  };

  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl font-extrabold text-joob-cocoa">
        {zh ? "你的 jOOB 帳戶" : "Your jOOB account"}
      </h1>
      <p className="mt-2 text-sm text-joob-cocoaSoft">
        {zh
          ? "安全同步檔案、收藏、配對紀錄及申請進度。"
          : "Securely sync your profile, saved jobs, match history, and applications."}
      </p>
      {!configured ? (
        <div className="mt-6 rounded-2xl bg-joob-peach p-4 text-sm text-joob-cocoa">
          {zh
            ? "目前為本機示範模式；設定 Supabase 環境變數後可啟用帳戶。"
            : "Local demo mode is active. Configure Supabase environment variables to enable accounts."}
        </div>
      ) : user ? (
        <div className="mt-6 rounded-2xl border bg-white p-5 shadow-card">
          <p className="font-semibold text-joob-cocoa">{user.email}</p>
          <div className="mt-4 flex gap-2">
            <button className="joob-btn-primary" onClick={() => router.push("/youth")}>
              {zh ? "前往個人中心" : "Open dashboard"}
            </button>
            <button className="rounded-xl border px-4 py-2 text-sm" onClick={() => void signOut()}>
              {zh ? "登出" : "Sign out"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border bg-white p-5 shadow-card">
          <label className="text-sm font-semibold text-joob-cocoa">
            {zh ? "電郵" : "Email"}
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-xl border px-3 py-2"
              placeholder="you@example.com"
            />
          </label>
          <button
            type="button"
            disabled={!email.includes("@")}
            onClick={() => void sendLink()}
            className="joob-btn-primary mt-4 w-full disabled:opacity-40"
          >
            {zh ? "寄送登入連結" : "Email me a sign-in link"}
          </button>
          {message && <p role="status" className="mt-3 text-sm text-joob-cocoaSoft">{message}</p>}
        </div>
      )}
    </div>
  );
}
