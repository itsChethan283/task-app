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

type TaskComment = {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
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
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [dailyInput, setDailyInput] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [currentCommentInput, setCurrentCommentInput] = useState("");
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingTaskInput, setEditingTaskInput] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentInput, setEditingCommentInput] = useState("");
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

      const { data: commentsData, error: commentsError } = await supabase
        .from("task_comments")
        .select("id, task_id, user_id, content, created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false });

      if (commentsError) {
        setError(commentsError.message);
      } else {
        setTaskComments((commentsData as TaskComment[] | null) ?? []);
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

  const addTask = async () => {
    if (!user) {
      return;
    }

    const { title, importance } = parseTaskInput(dailyInput);

    if (!title) {
      return;
    }

    setError(null);

    const { data, error: createError } = await supabase
      .from("tasks")
      .insert({ title, user_id: user.id, category: "daily", importance })
      .select("id, user_id, title, category, importance, is_complete, created_at")
      .single();

    if (createError) {
      setError(createError.message);
      return;
    }

    setTasks((current) => [data as Task, ...current]);
    setDailyInput("");
  };

  const addComment = async (taskId: string) => {
    if (!user) {
      return;
    }

    const content = currentCommentInput.trim();
    if (!content) {
      return;
    }

    setError(null);

    const { data, error: createError } = await supabase
      .from("task_comments")
      .insert({ task_id: taskId, user_id: user.id, content })
      .select("id, task_id, user_id, content, created_at")
      .single();

    if (createError) {
      setError(createError.message);
      return;
    }

    setTaskComments((current) => [data as TaskComment, ...current]);
    setCurrentCommentInput("");
  };

  const startTaskEdit = (task: Task) => {
    setEditingTaskId(task.id);
    const prefix = task.importance && task.importance > 0 ? "#".repeat(Math.min(task.importance, 5)) + " " : "";
    setEditingTaskInput(prefix + task.title);
  };

  const cancelTaskEdit = () => {
    setEditingTaskId(null);
    setEditingTaskInput("");
  };

  const saveTaskEdit = async (taskId: string) => {
    const { title, importance } = parseTaskInput(editingTaskInput);
    if (!title) return;

    setError(null);
    const { error: updateError } = await supabase
      .from("tasks")
      .update({ title, importance })
      .eq("id", taskId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setTasks((current) => current.map((t) => (t.id === taskId ? { ...t, title, importance } : t)));
    cancelTaskEdit();
  };

  const handleTaskEditEnter = (event: KeyboardEvent<HTMLInputElement>, taskId: string) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void saveTaskEdit(taskId);
  };

  const handleCommentEditEnter = (event: KeyboardEvent<HTMLInputElement>, commentId: string) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void saveCommentEdit(commentId);
  };

  const startCommentEdit = (comment: TaskComment) => {
    setEditingCommentId(comment.id);
    setEditingCommentInput(comment.content);
  };

  const cancelCommentEdit = () => {
    setEditingCommentId(null);
    setEditingCommentInput("");
  };

  const saveCommentEdit = async (commentId: string) => {
    const content = editingCommentInput.trim();
    if (!content) return;

    setError(null);
    const { error: updateError } = await supabase
      .from("task_comments")
      .update({ content })
      .eq("id", commentId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setTaskComments((current) => current.map((c) => (c.id === commentId ? { ...c, content } : c)));
    cancelCommentEdit();
  };

  const removeComment = async (commentId: string) => {
    setError(null);
    const { error: deleteError } = await supabase.from("task_comments").delete().eq("id", commentId);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setTaskComments((current) => current.filter((c) => c.id !== commentId));
    if (editingCommentId === commentId) cancelCommentEdit();
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
    setTaskComments((current) => current.filter((comment) => comment.task_id !== taskId));
    if (selectedTaskId === taskId) {
      setSelectedTaskId(null);
      setCurrentCommentInput("");
    }
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
            className={`mt-0.5 text-3xl w-12 h-12 flex items-center justify-center rounded-full transition ${dotClass}`}
            aria-label="Toggle task"
          >
            ○
          </button>

          {editingTaskId === task.id ? (
            <div className="flex-1">
              <input
                type="text"
                value={editingTaskInput}
                onChange={(e) => setEditingTaskInput(e.target.value)}
                onKeyDown={(e) => handleTaskEditEnter(e, task.id)}
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${inputClass}`}
              />
              <p className={`mt-2 text-xs ${mutedText}`}>Use # at start to update priority.</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setSelectedTaskId(selectedTaskId === task.id ? null : task.id)}
              className="min-w-0 flex-1 text-left"
            >
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
            </button>
          )}

          <div className="flex items-center gap-3 pt-0.5">
            {editingTaskId === task.id ? (
              <>
                <button
                  type="button"
                  onClick={() => saveTaskEdit(task.id)}
                  className={isDarkMode ? "text-sm text-emerald-400 transition hover:text-emerald-300" : "text-sm text-emerald-600 transition hover:text-emerald-500"}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelTaskEdit}
                  className={isDarkMode ? "text-sm text-slate-400 transition hover:text-slate-300" : "text-sm text-slate-500 transition hover:text-slate-400"}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => startTaskEdit(task)}
                  className={isDarkMode ? "text-sm text-cyan-400 transition hover:text-cyan-300" : "text-sm text-cyan-600 transition hover:text-cyan-500"}
                  aria-label="Edit task"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => removeTask(task.id)}
                  className={`text-sm transition ${deleteClass}`}
                  aria-label="Delete task"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </li>
    );
  };

  const handleEnter = (
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void addTask();
  };

  const handleCommentEnter = (
    event: KeyboardEvent<HTMLInputElement>,
    taskId: string,
  ) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void addComment(taskId);
  };

  const dailyTasks = getSortedTasks(tasks.filter((task) => task.category === "daily"));
  const selectedTask = selectedTaskId ? dailyTasks.find((t) => t.id === selectedTaskId) ?? null : null;
  const commentsByTask = taskComments.reduce<Record<string, TaskComment[]>>((acc, comment) => {
    if (!acc[comment.task_id]) {
      acc[comment.task_id] = [];
    }
    acc[comment.task_id].push(comment);
    return acc;
  }, {});
  const commentsCount = taskComments.length;
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
                  <p className="text-2xl font-bold text-cyan-500">{commentsCount}</p>
                  <p className={`text-xs ${mutedText}`}>Comments</p>
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

        <div className="grid gap-8 md:grid-cols-3">
          <section className="flex flex-col gap-4 md:col-span-2">
            <h2 className={`flex items-center gap-2 text-2xl font-bold ${shellText}`}>
              <span className="h-8 w-1 rounded bg-blue-500" />Daily Tasks
            </h2>

            <div className="flex gap-2">
              <input
                type="text"
                value={dailyInput}
                onChange={(event) => setDailyInput(event.target.value)}
                onKeyDown={handleEnter}
                placeholder="Add a daily task..."
                className={`w-full rounded-lg border px-3 py-3 outline-none ${inputClass}`}
              />
              <button
                type="button"
                onClick={() => addTask()}
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

          <section className="flex flex-col gap-4 md:col-span-1">
            <h2 className={`flex items-center gap-2 text-2xl font-bold ${shellText}`}>
              <span className="h-8 w-1 rounded bg-cyan-500" />Comments
            </h2>

            <ul className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {dailyTasks.length === 0 ? (
                <li className={`py-12 text-center text-lg ${mutedText}`}>Add daily tasks to write comments</li>
              ) : selectedTask == null ? (
                <li className={`py-12 text-center text-lg ${mutedText}`}>Click a task to view and add comments</li>
              ) : (
                <li key={`comments-${selectedTask.id}`} className={`rounded-lg border p-4 ${panelClass}`}>
                  <p className={`text-sm font-semibold ${shellText}`}>{selectedTask.title}</p>

                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={currentCommentInput}
                      onChange={(event) => setCurrentCommentInput(event.target.value)}
                      onKeyDown={(event) => handleCommentEnter(event, selectedTask.id)}
                      placeholder="Add a comment..."
                      className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${inputClass}`}
                    />
                    <button
                      type="button"
                      onClick={() => addComment(selectedTask.id)}
                      className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Add
                    </button>
                  </div>

                  <ul className="mt-3 space-y-2">
                    {(commentsByTask[selectedTask.id] ?? []).length === 0 ? (
                      <li className={`text-xs ${mutedText}`}>No comments yet</li>
                    ) : (
                      (commentsByTask[selectedTask.id] ?? []).map((comment) => (
                        <li
                          key={comment.id}
                          className={`rounded-md border px-3 py-2 text-sm ${isDarkMode ? "border-slate-700 bg-slate-900/70 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700"}`}
                        >
                          {editingCommentId === comment.id ? (
                            <div>
                              <input
                                type="text"
                                value={editingCommentInput}
                                onChange={(e) => setEditingCommentInput(e.target.value)}
                                onKeyDown={(e) => handleCommentEditEnter(e, comment.id)}
                                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${inputClass}`}
                              />
                              <div className="mt-2 flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => saveCommentEdit(comment.id)}
                                  className={isDarkMode ? "text-xs font-semibold text-emerald-400 transition hover:text-emerald-300" : "text-xs font-semibold text-emerald-600 transition hover:text-emerald-500"}
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelCommentEdit}
                                  className={isDarkMode ? "text-xs font-semibold text-slate-400 transition hover:text-slate-300" : "text-xs font-semibold text-slate-500 transition hover:text-slate-400"}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="break-words">{comment.content}</p>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <p className={`text-[11px] ${mutedText}`}>{new Date(comment.created_at).toLocaleString()}</p>
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => startCommentEdit(comment)}
                                    className={isDarkMode ? "text-xs font-semibold text-cyan-400 transition hover:text-cyan-300" : "text-xs font-semibold text-cyan-600 transition hover:text-cyan-500"}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeComment(comment.id)}
                                    className={isDarkMode ? "text-xs font-semibold text-red-400 transition hover:text-red-300" : "text-xs font-semibold text-red-500 transition hover:text-red-400"}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                </li>
              )}
            </ul>
          </section>
        </div>
      </section>
    </main>
  );
}
