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
        <div className="mt-6 space-y-3 rounded-2xl bg-joob-peach p-4 text-sm text-joob-cocoa">
          <p className="font-semibold">
            {zh ? "帳戶功能尚未啟用" : "Accounts not enabled on this deployment"}
          </p>
          <p>
            {zh
              ? "Vercel 需設定 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY（或 ANON_KEY），並重新 Deploy 後才會生效。"
              : "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or ANON_KEY) in Vercel, then redeploy so they are baked into the client build."}
          </p>
          <p className="text-xs opacity-80">
            {zh
              ? "本機可用 .env.local；線上必須在 Vercel → Settings → Environment Variables 設定後 Redeploy。"
              : "Local uses .env.local; production needs Vercel → Settings → Environment Variables, then Redeploy."}
          </p>
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
