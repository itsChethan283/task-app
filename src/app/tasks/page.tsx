"use client";

import { KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Task = {
  id: string;
  user_id: string;
  title: string;
  category: "daily" | "open";
  importance: number;
  is_complete: boolean;
  created_at: string;
};

type UserState = {
  id: string;
  email: string | null;
};

export default function TasksPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<UserState | null>(null);
  const [username, setUsername] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dailyInput, setDailyInput] = useState("");
  const [openInput, setOpenInput] = useState("");
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return localStorage.getItem("darkMode") === "true";
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

      if (!session?.user) {
        router.replace("/login");
        setIsLoading(false);
        return;
      }

      setUser({ id: session.user.id, email: session.user.email ?? null });
      const rawName = session.user.user_metadata?.username;
      setUsername(typeof rawName === "string" && rawName.trim() ? rawName : session.user.email?.split("@")[0] ?? "User");

      const { data, error: taskError } = await supabase
        .from("tasks")
        .select("id, user_id, title, category, importance, is_complete, created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (taskError) {
        setError(taskError.message);
      } else {
        setTasks((data as Task[] | null) ?? []);
      }

      setIsLoading(false);
    };

    run();
  }, [router, supabase]);

  const parseTaskInput = (inputValue: string) => {
    const trimmed = inputValue.trim();
    const importanceMatches = trimmed.match(/^#+/);
    const importance = Math.min(importanceMatches ? importanceMatches[0].length : 0, 5);
    const title = trimmed.replace(/^#+\s*/, "").trim();
    return { title, importance };
  };

  const addTask = async (category: "daily" | "open") => {
    if (!user) {
      return;
    }

    const inputValue = category === "daily" ? dailyInput : openInput;
    const { title, importance } = parseTaskInput(inputValue);

    if (!title) {
      return;
    }

    setError(null);

    const { data, error: createError } = await supabase
      .from("tasks")
      .insert({ title, user_id: user.id, category, importance })
      .select("id, user_id, title, category, importance, is_complete, created_at")
      .single();

    if (createError) {
      setError(createError.message);
      return;
    }

    setTasks((current) => [data as Task, ...current]);

    if (category === "daily") {
      setDailyInput("");
    } else {
      setOpenInput("");
    }
  };

  const toggleTask = async (task: Task) => {
    setError(null);

    const { error: toggleError } = await supabase
      .from("tasks")
      .update({ is_complete: !task.is_complete })
      .eq("id", task.id);

    if (toggleError) {
      setError(toggleError.message);
      return;
    }

    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, is_complete: !item.is_complete } : item,
      ),
    );
  };

  const removeTask = async (taskId: string) => {
    setError(null);

    const { error: deleteError } = await supabase.from("tasks").delete().eq("id", taskId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setTasks((current) => current.filter((task) => task.id !== taskId));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  const getSortedTasks = (taskList: Task[]) => {
    return [...taskList].sort((first, second) => {
      if (first.is_complete === second.is_complete) {
        if (first.importance === second.importance) {
          return new Date(second.created_at).getTime() - new Date(first.created_at).getTime();
        }
        return second.importance - first.importance;
      }
      return first.is_complete ? 1 : -1;
    });
  };

  const getTaskTextClass = (task: Task) => {
    if (task.is_complete) {
      return isDarkMode ? "text-slate-500 line-through" : "text-slate-400 line-through";
    }

    const darkClasses = ["text-slate-300", "text-slate-200", "text-slate-100", "text-white", "text-white"];
    const lightClasses = ["text-slate-500", "text-slate-700", "text-slate-800", "text-slate-900", "text-slate-900"];
    return isDarkMode
      ? darkClasses[Math.min(task.importance, 4)]
      : lightClasses[Math.min(task.importance, 4)];
  };

  const getTaskWeightClass = (task: Task) => {
    const classes = ["font-normal", "font-semibold", "font-bold", "font-extrabold", "font-extrabold"];
    return classes[Math.min(task.importance, 4)];
  };

  const renderTaskRow = (task: Task) => {
    const cardClass = task.is_complete
      ? isDarkMode
        ? "border-slate-700 bg-slate-800/70 opacity-70"
        : "border-slate-200 bg-slate-200/70 opacity-80"
      : isDarkMode
        ? "border-slate-700 bg-slate-800"
        : "border-slate-200 bg-white";

    const dotClass = task.is_complete ? "text-slate-500" : isDarkMode ? "text-slate-600 hover:text-blue-400" : "text-slate-300 hover:text-blue-500";
    const deleteClass = isDarkMode ? "text-slate-500 hover:text-red-400" : "text-slate-300 hover:text-red-500";

    return (
      <li
        key={task.id}
        className={`rounded-lg border-l-4 border-l-blue-500 px-4 py-3 transition hover:translate-x-1 ${cardClass}`}
      >
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => toggleTask(task)}
            className="flex flex-1 items-start gap-3 text-left"
            aria-label="Toggle task"
          >
            <span className={`mt-0.5 text-lg transition ${dotClass}`}>
              ○
            </span>

            <span className="min-w-0 flex-1">
              <span className={`block break-words ${getTaskTextClass(task)} ${getTaskWeightClass(task)}`}>
                {task.title}
              </span>
              {task.importance > 0 ? (
                <span className="mt-2 flex gap-1">
                  {Array.from({ length: task.importance }).map((_, index) => (
                    <span key={`${task.id}-${index}`} className="h-2 w-2 rounded-full bg-blue-500" />
                  ))}
                </span>
              ) : null}
            </span>
          </button>

          <button
            type="button"
            onClick={() => removeTask(task.id)}
            className={`text-sm transition ${deleteClass}`}
            aria-label="Delete task"
          >
            Delete
          </button>
        </div>
      </li>
    );
  };

  const handleEnter = (
    event: KeyboardEvent<HTMLInputElement>,
    category: "daily" | "open",
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void addTask(category);
  };

  const dailyTasks = getSortedTasks(tasks.filter((task) => task.category === "daily"));
  const openTasks = getSortedTasks(tasks.filter((task) => task.category === "open"));
  const completedCount = tasks.filter((task) => task.is_complete).length;
  const priorityCount = tasks.filter((task) => task.importance > 0).length;

  const shellText = isDarkMode ? "text-slate-100" : "text-slate-900";
  const mutedText = isDarkMode ? "text-slate-400" : "text-slate-500";
  const panelClass = isDarkMode ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white";
  const inputClass = isDarkMode
    ? "border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
    : "border-slate-200 bg-white text-slate-900 placeholder:text-slate-400";

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8">
      <section className="mx-auto max-w-7xl">
        <header className="mb-12 flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className={`header-title text-5xl font-bold ${shellText}`}>Tasks</h1>
            <p className={`mt-2 text-lg ${mutedText}`}>Welcome, {username}</p>
            <p className={`mt-4 text-sm ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
              Use #, ##, ### or more at task start to mark priority.
            </p>
            <p className={`text-sm ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
              Signed in as {user?.email}
            </p>
          </div>

          <div className="flex flex-col items-end gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setIsDarkMode((current) => !current)}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${isDarkMode ? "border-slate-600 text-amber-300" : "border-slate-200 text-amber-500"}`}
              >
                {isDarkMode ? "☀️" : "🌙"}
              </button>
              <button
                onClick={handleSignOut}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white"
              >
                Logout
              </button>
            </div>

            {tasks.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                <div className={`min-w-[90px] rounded-lg border p-3 text-center ${panelClass}`}>
                  <p className="text-2xl font-bold text-blue-500">{dailyTasks.length}</p>
                  <p className={`text-xs ${mutedText}`}>Daily</p>
                </div>
                <div className={`min-w-[90px] rounded-lg border p-3 text-center ${panelClass}`}>
                  <p className="text-2xl font-bold text-purple-500">{openTasks.length}</p>
                  <p className={`text-xs ${mutedText}`}>Open</p>
                </div>
                <div className={`min-w-[90px] rounded-lg border p-3 text-center ${panelClass}`}>
                  <p className="text-2xl font-bold text-emerald-500">{completedCount}</p>
                  <p className={`text-xs ${mutedText}`}>Done</p>
                </div>
                <div className={`min-w-[90px] rounded-lg border p-3 text-center ${panelClass}`}>
                  <p className="text-2xl font-bold text-orange-500">{priorityCount}</p>
                  <p className={`text-xs ${mutedText}`}>Priority</p>
                </div>
              </div>
            ) : null}
          </div>
        </header>

        {error ? (
          <p className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="grid gap-8 md:grid-cols-2">
          <section className="flex flex-col gap-4">
            <h2 className={`flex items-center gap-2 text-2xl font-bold ${shellText}`}>
              <span className="h-8 w-1 rounded bg-blue-500" />Daily Tasks
            </h2>

            <div className="flex gap-2">
              <input
                type="text"
                value={dailyInput}
                onChange={(event) => setDailyInput(event.target.value)}
                onKeyDown={(event) => handleEnter(event, "daily")}
                placeholder="Add a daily task..."
                className={`w-full rounded-lg border px-3 py-3 outline-none ${inputClass}`}
              />
              <button
                type="button"
                onClick={() => addTask("daily")}
                className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-semibold text-white"
              >
                Add
              </button>
            </div>

            <ul className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {dailyTasks.length === 0 ? (
                <li className={`py-12 text-center text-lg ${mutedText}`}>No daily tasks yet</li>
              ) : (
                dailyTasks.map((task) => renderTaskRow(task))
              )}
            </ul>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className={`flex items-center gap-2 text-2xl font-bold ${shellText}`}>
              <span className="h-8 w-1 rounded bg-purple-500" />Open Tasks
            </h2>

            <div className="flex gap-2">
              <input
                type="text"
                value={openInput}
                onChange={(event) => setOpenInput(event.target.value)}
                onKeyDown={(event) => handleEnter(event, "open")}
                placeholder="Add an open task..."
                className={`w-full rounded-lg border px-3 py-3 outline-none ${inputClass}`}
              />
              <button
                type="button"
                onClick={() => addTask("open")}
                className="rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white"
              >
                Add
              </button>
            </div>

            <ul className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {openTasks.length === 0 ? (
                <li className={`py-12 text-center text-lg ${mutedText}`}>No open tasks yet</li>
              ) : (
                openTasks.map((task) => renderTaskRow(task))
              )}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}
