"use client";

import { SyntheticEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isSignUp, setIsSignUp] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return localStorage.getItem("darkMode") === "true";
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.body.classList.remove("light-mode", "dark-mode");
    document.body.classList.add(isDarkMode ? "dark-mode" : "light-mode");
    localStorage.setItem("darkMode", String(isDarkMode));
  }, [isDarkMode]);

  useEffect(() => {
    const run = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) {
        router.replace("/tasks");
      }
    };

    run();
  }, [router, supabase]);

  const handleAuth = async (
    mode: "signin" | "signup",
    event: SyntheticEvent,
  ) => {
    event.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError("Please enter email and password.");
      return;
    }

    if (mode === "signup" && password.trim().length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setIsSubmitting(true);

    const normalizedEmail = email.trim().toLowerCase();
    const action = mode === "signin"
      ? supabase.auth.signInWithPassword({ email: normalizedEmail, password })
      : supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              username: username.trim() || normalizedEmail,
            },
          },
        });

    const { data, error: authError } = await action;

    setIsSubmitting(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (mode === "signup" && !data.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError) {
        if (signInError.message.toLowerCase().includes("email not confirmed")) {
          setError("Disable Confirm email in Supabase Auth settings to allow instant sign-up.");
        } else {
          setError(signInError.message);
        }
        return;
      }
    }

    router.replace("/tasks");
    router.refresh();
  };

  const cardClass = isDarkMode
    ? "border-slate-700 bg-slate-800 text-slate-100"
    : "border-slate-200 bg-white text-slate-900";

  const mutedText = isDarkMode ? "text-slate-400" : "text-slate-500";

  const inputClass = isDarkMode
    ? "border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
    : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400";

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className={`w-full max-w-md rounded-2xl border p-6 shadow-xl ${cardClass}`}>
        <h1 className="header-title text-center text-4xl font-bold">Tasks</h1>
        <p className={`mt-2 text-center text-sm ${mutedText}`}>
          {isSignUp ? "Create an account" : "Sign in to your account"}
        </p>

        <p className="mt-4 rounded-md spotify-accent-panel px-3 py-2 text-center text-xs text-spotify-accent">
          Supabase connected - cloud sync enabled.
        </p>

        {error ? (
          <p className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <form className="mt-5 space-y-3" onSubmit={(event) => handleAuth(isSignUp ? "signup" : "signin", event)}>
          {isSignUp ? (
            <input
              id="username"
              name="username"
              type="text"
              placeholder="Username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={`w-full rounded-lg border px-3 py-3 outline-none ${inputClass}`}
            />
          ) : null}

          <input
            id="email"
            name="email"
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={`w-full rounded-lg border px-3 py-3 outline-none ${inputClass}`}
          />

          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`w-full rounded-lg border px-3 py-3 pr-10 outline-none ${inputClass}`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm ${mutedText}`}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          <div className="pt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg spotify-gradient px-3 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isSubmitting ? "Please wait..." : isSignUp ? "Sign Up" : "Sign In"}
            </button>
          </div>

          <p className={`text-center text-sm ${mutedText}`}>
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsSignUp((current) => !current);
                setShowPassword(false);
                setError(null);
              }}
              className="font-semibold text-spotify-accent"
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </p>
        </form>

        <button
          onClick={() => setIsDarkMode((current) => !current)}
          className={`mt-4 w-full rounded-lg border px-3 py-2 text-sm font-medium ${isDarkMode ? "border-slate-600 text-amber-300" : "border-slate-200 text-amber-500"}`}
        >
          {isDarkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
        </button>
      </section>
    </main>
  );
}
