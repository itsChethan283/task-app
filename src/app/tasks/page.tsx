"use client";

import { KeyboardEvent, MouseEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  group_id: string | null;
};

type TaskGroup = {
  id: string;
  user_id: string;
  title: string;
  position: number;
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
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showGroupCompleted, setShowGroupCompleted] = useState<Set<string>>(new Set());
  const [showGroupInput, setShowGroupInput] = useState(false);
  const [groupInput, setGroupInput] = useState("");
  const [groupTaskInputs, setGroupTaskInputs] = useState<Record<string, string>>({});
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupInput, setEditingGroupInput] = useState("");
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const ITEMS_PER_PAGE = 10;
  const [completedPage, setCompletedPage] = useState(1);
  const [dragGroupId, setDragGroupId] = useState<string | null>(null);
  const [dragOverGroupId, setDragOverGroupId] = useState<string | null>(null);
  const [dragOverGroupPosition, setDragOverGroupPosition] = useState<"before" | "after">("before");
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragTaskOverTarget, setDragTaskOverTarget] = useState<string | null>(null); // groupId or "ungrouped"
  const [recentlyDroppedTaskId, setRecentlyDroppedTaskId] = useState<string | null>(null);
  const autoExpandedGroupsRef = useRef<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const groupInputRef = useRef<HTMLInputElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);
  const editingTaskInputRef = useRef<HTMLInputElement>(null);
  const initialGroupOrderRef = useRef<TaskGroup[] | null>(null);
  const didGroupDropRef = useRef(false);
  const groupItemRefs = useRef<Record<string, HTMLLIElement | null>>({});
  const previousGroupTopsRef = useRef<Record<string, number>>({});
  const groupContentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [groupHeights, setGroupHeights] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    const nextTops: Record<string, number> = {};

    groups.forEach((group) => {
      const element = groupItemRefs.current[group.id];
      if (!element) return;

      const nextTop = element.getBoundingClientRect().top;
      nextTops[group.id] = nextTop;

      const previousTop = previousGroupTopsRef.current[group.id];
      if (previousTop == null) return;

      const deltaY = previousTop - nextTop;
      if (Math.abs(deltaY) < 1) return;

      element.style.transition = "none";
      element.style.transform = `translateY(${deltaY}px)`;

      requestAnimationFrame(() => {
        element.style.transition = "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)";
        element.style.transform = "translateY(0)";
      });
    });

    previousGroupTopsRef.current = nextTops;
  }, [groups]);

  // Measure group content heights so we can animate max-height for smooth expand/collapse
  useLayoutEffect(() => {
    const nextHeights: Record<string, number> = {};
    groups.forEach((group) => {
      const el = groupContentRefs.current[group.id];
      if (!el) return;
      // scrollHeight gives the full height regardless of max-height
      nextHeights[group.id] = el.scrollHeight;
    });
    setGroupHeights((prev) => {
      // quick shallow compare to avoid unnecessary sets
      const keys = Object.keys(nextHeights);
      let changed = false;
      if (Object.keys(prev).length !== keys.length) changed = true;
      for (const k of keys) {
        if (prev[k] !== nextHeights[k]) { changed = true; break; }
      }
      return changed ? nextHeights : prev;
    });
  }, [groups, tasks, taskComments, showGroupCompleted, showCompletedTasks]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (showGroupInput) {
        groupInputRef.current?.focus();
      } else {
        taskInputRef.current?.focus();
      }
    }, 0);
    return () => clearTimeout(id);
  }, [showGroupInput]);

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
        .select("id, user_id, title, category, importance, is_complete, created_at, group_id")
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

      const { data: groupsData, error: groupsError } = await supabase
        .from("task_groups")
        .select("id, user_id, title, position, created_at")
        .eq("user_id", session.user.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });

      if (groupsError) {
        setError(groupsError.message);
      } else {
        const loadedGroups = (groupsData as TaskGroup[] | null) ?? [];
        setGroups(loadedGroups);
        // Default to collapsed groups on each fresh load (refresh/login).
        setCollapsedGroups(new Set(loadedGroups.map((group) => group.id)));
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
      .insert({ title, user_id: user.id, category: "daily", importance, group_id: null })
      .select("id, user_id, title, category, importance, is_complete, created_at, group_id")
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
    setTimeout(() => editingTaskInputRef.current?.focus(), 0);
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

  const handleTaskCardClick = (event: MouseEvent<HTMLElement>, taskId: string) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    // Ignore clicks originating from interactive controls (buttons, inputs, links)
    if (target.closest("button") || target.closest("input") || target.closest("a")) return;
    setSelectedTaskId(selectedTaskId === taskId ? null : taskId);
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

  const createGroup = async () => {
    if (!user) return;
    const title = groupInput.trim();
    if (!title) return;
    setError(null);
    const nextPosition = groups.length > 0 ? Math.max(...groups.map((g) => g.position)) + 1 : 0;
    const { data, error: createError } = await supabase
      .from("task_groups")
      .insert({ title, user_id: user.id, position: nextPosition })
      .select("id, user_id, title, position, created_at")
      .single();
    if (createError) { setError(createError.message); return; }
    setGroups((current) => [...current, data as TaskGroup]);
    setGroupInput("");
    setShowGroupInput(false);
  };

  const removeGroup = async (groupId: string) => {
    setError(null);
    const { error: deleteError } = await supabase.from("task_groups").delete().eq("id", groupId);
    if (deleteError) { setError(deleteError.message); return; }
    setGroups((current) => current.filter((g) => g.id !== groupId));
    // Mark all tasks in the group as complete and ungroup them
    const groupTaskIds = tasks.filter((t) => t.group_id === groupId).map((t) => t.id);
    if (groupTaskIds.length > 0) {
      await supabase.from("tasks").update({ is_complete: true, group_id: null }).in("id", groupTaskIds);
      setTasks((current) => current.map((t) => groupTaskIds.includes(t.id) ? { ...t, is_complete: true, group_id: null } : t));
    }
  };

  const startGroupEdit = (group: TaskGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupInput(group.title);
  };

  const cancelGroupEdit = () => {
    setEditingGroupId(null);
    setEditingGroupInput("");
  };

  const saveGroupEdit = async (groupId: string) => {
    const title = editingGroupInput.trim();
    if (!title) return;
    setError(null);
    const { error: updateError } = await supabase.from("task_groups").update({ title }).eq("id", groupId);
    if (updateError) { setError(updateError.message); return; }
    setGroups((current) => current.map((g) => g.id === groupId ? { ...g, title } : g));
    cancelGroupEdit();
  };

  const addGroupTask = async (groupId: string) => {
    if (!user) return;
    const inputValue = groupTaskInputs[groupId] ?? "";
    const { title, importance } = parseTaskInput(inputValue);
    if (!title) return;
    setError(null);
    const { data, error: createError } = await supabase
      .from("tasks")
      .insert({ title, user_id: user.id, category: "daily", importance, group_id: groupId })
      .select("id, user_id, title, category, importance, is_complete, created_at, group_id")
      .single();
    if (createError) { setError(createError.message); return; }
    setTasks((current) => [data as Task, ...current]);
    setGroupTaskInputs((current) => ({ ...current, [groupId]: "" }));
  };

  const toggleGroupCollapse = (groupId: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const toggleGroupCompleted = (groupId: string) => {
    setShowGroupCompleted((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleGroupEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void createGroup();
  };

  const handleGroupTaskEnter = (event: KeyboardEvent<HTMLInputElement>, groupId: string) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void addGroupTask(groupId);
  };

  const handleGroupEditEnter = (event: KeyboardEvent<HTMLInputElement>, groupId: string) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void saveGroupEdit(groupId);
  };

  const handleGroupDragStart = (event: React.DragEvent, groupId: string) => {
    setDragGroupId(groupId);
    setDragOverGroupPosition("before");
    initialGroupOrderRef.current = groups;
    didGroupDropRef.current = false;

    const source = event.currentTarget as HTMLElement;
    const draggedGroup = groups.find((group) => group.id === groupId);
    const dragGhost = document.createElement("div");
    dragGhost.textContent = draggedGroup?.title ?? "Group";
    dragGhost.style.position = "fixed";
    dragGhost.style.top = "-1000px";
    dragGhost.style.left = "-1000px";
    dragGhost.style.maxWidth = `${Math.max(source.offsetWidth, 220)}px`;
    dragGhost.style.pointerEvents = "none";
    dragGhost.style.opacity = "1";
    dragGhost.style.transform = "scale(1.02)";
    dragGhost.style.boxShadow = "0 18px 34px rgba(0,0,0,0.45)";
    dragGhost.style.borderRadius = "12px";
    dragGhost.style.padding = "10px 14px";
    dragGhost.style.fontSize = "14px";
    dragGhost.style.fontWeight = "700";
    dragGhost.style.letterSpacing = "0.01em";
    dragGhost.style.whiteSpace = "nowrap";
    dragGhost.style.overflow = "hidden";
    dragGhost.style.textOverflow = "ellipsis";
    dragGhost.style.border = "1px solid";
    dragGhost.style.zIndex = "9999";
    if (isDarkMode) {
      dragGhost.style.background = "#121212";
      dragGhost.style.borderColor = "rgba(29,185,84,0.45)";
      dragGhost.style.color = "#f1f5f9";
      dragGhost.style.filter = "saturate(1.06)";
    } else {
      dragGhost.style.background = "#ffffff";
      dragGhost.style.borderColor = "rgba(29,185,84,0.35)";
      dragGhost.style.color = "#04130a";
    }
    document.body.appendChild(dragGhost);
    event.dataTransfer.setDragImage(dragGhost, 24, 24);
    setTimeout(() => dragGhost.remove(), 0);
  };

  const handleGroupDragOver = (event: React.DragEvent, groupId: string) => {
    event.preventDefault();

    // If a task is being dragged, treat the group header/row itself as a drop target
    // so users can drop tasks into groups even when they're collapsed.
    if (dragTaskId) {
      setDragTaskOverTarget(groupId);
      // Auto-expand collapsed group while dragging a task over it and remember to restore later
      setCollapsedGroups((prev) => {
        if (prev.has(groupId)) {
          autoExpandedGroupsRef.current.add(groupId);
          const next = new Set(prev);
          next.delete(groupId);
          return next;
        }
        return prev;
      });
      return;
    }

    if (groupId === dragGroupId) {
      setDragOverGroupId(null);
      return;
    }

    const target = event.currentTarget as HTMLElement;
    const bounds = target.getBoundingClientRect();
    const middleY = bounds.top + bounds.height / 2;
    const nextPosition = event.clientY < middleY ? "before" : "after";
    setDragOverGroupPosition(nextPosition);
    setDragOverGroupId(groupId);

    if (!dragGroupId) return;

    setGroups((current) => {
      const oldIndex = current.findIndex((g) => g.id === dragGroupId);
      const targetIndex = current.findIndex((g) => g.id === groupId);
      if (oldIndex === -1 || targetIndex === -1) return current;

      const reordered = [...current];
      const [moved] = reordered.splice(oldIndex, 1);

      let insertIndex = nextPosition === "after" ? targetIndex + 1 : targetIndex;
      if (oldIndex < insertIndex) {
        insertIndex -= 1;
      }
      insertIndex = Math.max(0, Math.min(insertIndex, reordered.length));

      if (insertIndex === oldIndex) {
        return current;
      }

      reordered.splice(insertIndex, 0, moved);
      return reordered;
    });
  };

  const handleGroupDrop = async (_targetGroupId: string) => {
    // If a task is being dragged, treat this drop as moving the task into this group.
    if (dragTaskId) {
      await moveTaskToGroup(dragTaskId, _targetGroupId);
      setRecentlyDroppedTaskId(dragTaskId);
      setTimeout(() => setRecentlyDroppedTaskId(null), 700);
      setDragTaskId(null);
      setDragTaskOverTarget(null);

      // Restore any groups we auto-expanded while dragging
      if (autoExpandedGroupsRef.current.size > 0) {
        setCollapsedGroups((prev) => {
          const next = new Set(prev);
          autoExpandedGroupsRef.current.forEach((id) => next.add(id));
          autoExpandedGroupsRef.current.clear();
          return next;
        });
      }

      return;
    }

    if (!dragGroupId) {
      setDragGroupId(null);
      setDragOverGroupId(null);
      setDragOverGroupPosition("before");
      return;
    }

    didGroupDropRef.current = true;
    const updated = groups.map((g, i) => ({ ...g, position: i }));
    setGroups(updated);
    setDragGroupId(null);
    setDragOverGroupId(null);
    setDragOverGroupPosition("before");
    initialGroupOrderRef.current = null;
    await Promise.all(
      updated.map((g) => supabase.from("task_groups").update({ position: g.position }).eq("id", g.id))
    );
  };

  const handleGroupDragEnd = () => {
    if (!didGroupDropRef.current && initialGroupOrderRef.current) {
      setGroups(initialGroupOrderRef.current);
    }
    setDragGroupId(null);
    setDragOverGroupId(null);
    setDragTaskOverTarget(null);
    if (autoExpandedGroupsRef.current.size > 0) {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        autoExpandedGroupsRef.current.forEach((id) => next.add(id));
        autoExpandedGroupsRef.current.clear();
        return next;
      });
    }
    setDragOverGroupPosition("before");
    initialGroupOrderRef.current = null;
    didGroupDropRef.current = false;
  };

  const moveTaskToGroup = async (taskId: string, targetGroupId: string | null) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.group_id === targetGroupId) return;
    setTasks((current) => current.map((t) => t.id === taskId ? { ...t, group_id: targetGroupId } : t));
    await supabase.from("tasks").update({ group_id: targetGroupId }).eq("id", taskId);
  };

  const handleTaskDragStart = (event: React.DragEvent, taskId: string) => {
    event.stopPropagation();
    setDragTaskId(taskId);
    try {
      // Ensure a drag is initiated in all browsers and mark it as a move
      event.dataTransfer.setData("text/plain", taskId);
      event.dataTransfer.effectAllowed = "move";
    } catch (e) {
      // ignore environments that block setData
    }
  };

  const handleTaskDragOver = (event: React.DragEvent, target: string) => {
    if (!dragTaskId) return;
    event.preventDefault();
    event.stopPropagation();
    setDragTaskOverTarget(target);
  };

  const handleTaskDrop = async (event: React.DragEvent, targetGroupId: string | null) => {
    event.stopPropagation();
    if (!dragTaskId) return;
    await moveTaskToGroup(dragTaskId, targetGroupId);
    setRecentlyDroppedTaskId(dragTaskId);
    setTimeout(() => setRecentlyDroppedTaskId(null), 700);
    setDragTaskId(null);
    setDragTaskOverTarget(null);

    // Restore any groups we auto-expanded while dragging
    if (autoExpandedGroupsRef.current.size > 0) {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        autoExpandedGroupsRef.current.forEach((id) => next.add(id));
        autoExpandedGroupsRef.current.clear();
        return next;
      });
    }
  };

  const handleTaskDragEnd = () => {
    setDragTaskId(null);
    setDragTaskOverTarget(null);

    if (autoExpandedGroupsRef.current.size > 0) {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        autoExpandedGroupsRef.current.forEach((id) => next.add(id));
        autoExpandedGroupsRef.current.clear();
        return next;
      });
    }
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

  const getCommentPreview = (content: string) => {
    const compact = content.replace(/\s+/g, " ").trim();
    if (compact.length <= 72) {
      return compact;
    }
    return `${compact.slice(0, 72)}...`;
  };

  const renderTaskRow = (task: Task) => {
    // Use color intensity as the primary importance signal.
    const isTaskComplete = task.is_complete;
    const importance = Math.min(Math.max(task.importance ?? 0, 0), 5);
    const baseBorder = isDarkMode ? "border-slate-700" : "border-slate-200";

    let priorityBg = "";
    if (isTaskComplete) {
      priorityBg = isDarkMode ? "bg-slate-800/70 opacity-70" : "bg-slate-200/70 opacity-80";
    } else {
      if (isDarkMode) {
        // Dark mode uses Spotify-like green intensity steps.
        switch (importance) {
          case 0:
            priorityBg = "spotify-panel-dark";
            break;
          case 1:
            priorityBg = "bg-emerald-400/8";
            break;
          case 2:
            priorityBg = "bg-emerald-400/14";
            break;
          case 3:
            priorityBg = "bg-emerald-300/20";
            break;
          case 4:
            priorityBg = "bg-emerald-300/26";
            break;
          default:
            priorityBg = "bg-emerald-200/32";
            break;
        }
      } else {
        // Light mode uses stronger tints for quick scanning.
        switch (importance) {
          case 0:
            priorityBg = "spotify-panel-light";
            break;
          case 1:
            priorityBg = "bg-emerald-50";
            break;
          case 2:
            priorityBg = "bg-emerald-100";
            break;
          case 3:
            priorityBg = "bg-emerald-200";
            break;
          case 4:
            priorityBg = "bg-emerald-300/90";
            break;
          default:
            priorityBg = "bg-emerald-400/80";
            break;
        }
      }
    }

    const cardClass = `${baseBorder} ${priorityBg}`;

    // Use Spotify-themed dot/button classes
    const dotClass = task.is_complete
      ? isDarkMode
        ? "dot-complete-dark"
        : "dot-complete-light"
      : isDarkMode
        ? "dot-incomplete-dark"
        : "dot-incomplete-light";
    const deleteClass = isDarkMode ? "text-slate-600 hover:text-slate-400" : "text-slate-400 hover:text-slate-500";

    const isTaskDragging = dragTaskId === task.id;
    const isTaskSelected = selectedTaskId === task.id;
    const commentsForTask = commentsByTask[task.id] ?? [];
    const latestComment = commentsForTask[0] ?? null;

    return (
      <li
        key={task.id}
        draggable
        onDragStart={(e) => handleTaskDragStart(e, task.id)}
        onDragEnd={handleTaskDragEnd}
        className={`rounded-xl shadow-sm hover:shadow-md border-l-4 px-3 py-2 transition hover:translate-x-1 ${cardClass} ${isTaskDragging ? "opacity-40" : "opacity-100"} ${isTaskSelected ? (isDarkMode ? "ring-spotify-dark" : "ring-spotify-light") : ""}${recentlyDroppedTaskId === task.id ? " watery-drop" : ""}`}
        style={{ borderLeftColor: 'var(--spotify-green)' }}
      >
        <div
          className="flex items-start gap-2"
          onClick={(e) => handleTaskCardClick(e, task.id)}
        >
            <button
            type="button"
            onClick={() => toggleTask(task)}
            className={`mt-0.5 h-9 w-9 flex items-center justify-center rounded-full border text-base font-bold transition ${dotClass} focus-ring-spotify focus-visible:outline-none`}
            aria-label={task.is_complete ? "Mark task as incomplete" : "Mark task as complete"}
            aria-pressed={task.is_complete}
            title={task.is_complete ? "Completed" : "Not completed"}
          >
            {task.is_complete ? "✓" : "○"}
          </button>

          {editingTaskId === task.id ? (
            <div className="flex-1">
              <input
                ref={editingTaskInputRef}
                type="text"
                value={editingTaskInput}
                onChange={(e) => setEditingTaskInput(e.target.value)}
                onKeyDown={(e) => handleTaskEditEnter(e, task.id)}
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${inputClassWithWater}`}
              />
              <p className={`mt-2 text-xs ${mutedText}`}>Color intensity reflects importance.</p>
            </div>
          ) : (
            <div className="min-w-0 flex-1 text-left">
              <span className={`block break-words ${getTaskTextClass(task)} ${getTaskWeightClass(task)}`}>
                {task.title}
              </span>

              <div className="mt-2 flex min-h-5 items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isDarkMode ? "comment-pill-dark" : "comment-pill-light"}`}
                >
                  {commentsForTask.length} comment{commentsForTask.length !== 1 ? "s" : ""}
                </span>
                {latestComment ? (
                  <p className={`min-w-0 truncate text-xs ${mutedText}`} title={latestComment.content}>
                    {getCommentPreview(latestComment.content)}
                  </p>
                ) : (
                  <p className={`text-xs ${mutedText}`}>No comments yet</p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 pt-0.5">
            {editingTaskId === task.id ? (
              <>
                <button
                  type="button"
                  onClick={() => saveTaskEdit(task.id)}
                  className={`text-sm text-spotify-accent transition`}
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
                  className={`text-sm text-spotify-accent transition`}
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
  const incompleteDailyTasks = dailyTasks.filter((t) => !t.is_complete);
  const completedDailyTasks = dailyTasks.filter((t) => t.is_complete);
  const ungroupedIncompleteTasks = incompleteDailyTasks.filter((t) => t.group_id === null);
  const ungroupedCompletedTasks = completedDailyTasks.filter((t) => t.group_id === null);
  const totalCompletedPages = Math.max(1, Math.ceil(ungroupedCompletedTasks.length / ITEMS_PER_PAGE));
  const paginatedUngroupedCompletedTasks = ungroupedCompletedTasks.slice((completedPage - 1) * ITEMS_PER_PAGE, completedPage * ITEMS_PER_PAGE);
  useEffect(() => {
    const total = Math.max(1, Math.ceil(ungroupedCompletedTasks.length / ITEMS_PER_PAGE));
    if (completedPage > total) {
      setCompletedPage(total);
    }
  }, [ungroupedCompletedTasks.length]);
  const selectedTask = selectedTaskId ? dailyTasks.find((t) => t.id === selectedTaskId) ?? null : null;
  const commentsByTask = taskComments.reduce<Record<string, TaskComment[]>>((acc, comment) => {
    if (!acc[comment.task_id]) {
      acc[comment.task_id] = [];
    }
    acc[comment.task_id].push(comment);
    return acc;
  }, {});
  const completedCount = tasks.filter((task) => task.is_complete).length;
  const pendingCount = tasks.filter((task) => !task.is_complete).length;
  const selectedTaskComments = selectedTask ? commentsByTask[selectedTask.id] ?? [] : [];

  const shellText = isDarkMode ? "text-slate-100" : "text-slate-900";
  const mutedText = isDarkMode ? "text-slate-400" : "text-slate-500";
  const panelClass = isDarkMode
    ? "border-emerald-500/30 bg-[#181818]/90 backdrop-blur-sm shadow-[0_10px_30px_rgba(29,185,84,0.12)]"
    : "border-emerald-200 bg-white/92 backdrop-blur-sm shadow-[0_10px_24px_rgba(29,185,84,0.14)]";
  const panelEdgeClass = isDarkMode ? "border-slate-700" : "border-slate-200";
  const inputClass = isDarkMode
    ? "border-slate-700 bg-[#121212] text-slate-100 placeholder:text-slate-500 focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/60"
    : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-400/50";

  // Watery variants
  const panelClassWithWater = `${panelClass} watery-panel`;
  const inputClassWithWater = `${inputClass} watery-input`;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden p-8">
      <div className={`pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full blur-3xl ${isDarkMode ? "spotify-glow-left-dark" : "spotify-glow-left-light"}`} />
      <div className={`pointer-events-none absolute -right-20 top-40 h-72 w-72 rounded-full blur-3xl ${isDarkMode ? "spotify-glow-right-dark" : "spotify-glow-right-light"}`} />
      <section className="relative z-10 mx-auto max-w-7xl">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-6">
            <div>
              <h1 className={`header-title text-5xl font-bold ${shellText}`}>Tasks</h1>
              <p className={`mt-1 text-lg ${mutedText}`}>Welcome, {username}</p>
              <p className={`mt-0 text-sm ${isDarkMode ? "text-slate-500" : "text-slate-400"}`}>
                <span className="mr-3">Task color intensity indicates priority.</span>
                <span>Signed in as {user?.email}</span>
              </p>
            </div>

            {tasks.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                <div className={`min-w-[90px] rounded-xl border p-3 text-center transition hover:-translate-y-0.5 hover:shadow-lg ${panelClassWithWater} ${isDarkMode ? "spotify-accent-panel-dark" : "spotify-accent-panel"}`}>
                  <p className={`text-2xl font-bold text-spotify-accent`}>{completedCount}</p>
                  <p className={`text-xs ${mutedText}`}>Completed</p>
                </div>
                <div className={`min-w-[90px] rounded-xl border p-3 text-center transition hover:-translate-y-0.5 hover:shadow-lg ${panelClassWithWater} ${isDarkMode ? "spotify-accent-panel-dark" : "spotify-accent-panel"}`}>
                  <p className={`text-2xl font-extrabold text-spotify-accent`}>{pendingCount}</p>
                  <p className={`text-xs font-semibold ${mutedText}`}>Pending</p>
                </div>
                <div className={`min-w-[90px] rounded-xl border p-3 text-center transition hover:-translate-y-0.5 hover:shadow-lg ${panelClassWithWater} ${isDarkMode ? "spotify-accent-panel-dark" : "spotify-accent-panel"}`}>
                  <p className={`text-2xl font-bold text-spotify-accent`}>{tasks.length}</p>
                  <p className={`text-xs ${mutedText}`}>Total Tasks</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDarkMode((current) => !current)}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-md ${isDarkMode ? "border-emerald-400/45 bg-[#121212]/70 text-spotify-accent hover:bg-[#121212]" : "border-emerald-300 bg-white/80 text-spotify-accent hover:bg-white"}`}
            >
              {isDarkMode ? "☀️" : "🌙"}
            </button>
            <button
              onClick={handleSignOut}
              className="rounded-xl bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:-translate-y-0.5 hover:from-rose-400 hover:to-red-400 hover:shadow-lg"
            >
              Logout
            </button>
          </div>
        </header>

        {error ? (
          <p className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <div className="grid gap-8 md:grid-cols-[minmax(0,2.35fr)_minmax(280px,0.9fr)]">
          <section className="flex flex-col gap-4">
            <h2 className={`flex items-center gap-2 text-2xl font-bold ${shellText}`}>
              <span className="h-8 w-1 rounded spotify-gradient-vertical" />Tasks
            </h2>

            {showGroupInput ? (
              <div className="flex gap-2">
                <input
                  ref={groupInputRef}
                  type="text"
                  value={groupInput}
                  onChange={(e) => setGroupInput(e.target.value)}
                  onKeyDown={handleGroupEnter}
                  placeholder="Group name..."
                  className={`w-full rounded-lg border px-3 py-2 outline-none ${inputClassWithWater}`}
                />
                <button type="button" onClick={() => createGroup()} className="rounded-xl spotify-gradient px-4 py-2 text-sm font-semibold text-spotify-on-green shadow-sm transition hover:spotify-gradient-hover watery-button">Create</button>
                <button type="button" onClick={() => { setShowGroupInput(false); setGroupInput(""); }} className={`rounded-lg border px-3 py-2 text-sm ${isDarkMode ? "border-slate-600 text-slate-400" : "border-slate-200 text-slate-500"}`}>Cancel</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  ref={taskInputRef}
                  type="text"
                  value={dailyInput}
                  onChange={(event) => setDailyInput(event.target.value)}
                  onKeyDown={handleEnter}
                  placeholder="Add a daily task..."
                    className={`w-full rounded-lg border px-3 py-2 outline-none ${inputClassWithWater}`}
                />
                <button
                  type="button"
                  onClick={() => addTask()}
                  className="rounded-xl spotify-gradient px-4 py-2 text-sm font-semibold text-spotify-on-green shadow-sm transition hover:spotify-gradient-hover watery-button"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setShowGroupInput(true)}
                  className={`rounded-xl border px-4 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-sm ${isDarkMode ? "border-slate-600 bg-[#121212]/70 text-spotify-accent hover:border-slate-500" : "border-slate-200 bg-white/80 text-spotify-accent hover:border-slate-300"}`}
                >
                  + Group
                </button>
              </div>
            )}

            <ul className="space-y-2 pr-1">
              {dailyTasks.length === 0 && groups.length === 0 ? (
                <li className={`py-12 text-center text-lg ${mutedText}`}>No tasks yet</li>
              ) : (
                <>
                  {groups.map((group) => {
                    const isCollapsed = collapsedGroups.has(group.id);
                    const groupTasks = getSortedTasks(tasks.filter((t) => t.group_id === group.id));
                    const groupIncompleteTasks = groupTasks.filter((t) => !t.is_complete);
                    const groupCompletedTasks = groupTasks.filter((t) => t.is_complete);
                    const isGroupCompletedVisible = showGroupCompleted.has(group.id);
                    const isDragging = dragGroupId === group.id;
                    const isDragOver = dragOverGroupId === group.id;
                    const isTaskDragOver = dragTaskOverTarget === group.id;
                    const dropBefore = isDragOver && dragOverGroupPosition === "before";
                    const dropAfter = isDragOver && dragOverGroupPosition === "after";
                    const groupBorderClass = (isDragOver || isTaskDragOver)
                      ? isDarkMode ? "border-emerald-400 bg-[#212121]/95 shadow-[0_0_0_1px_rgba(29,185,84,0.45)] ring-2 ring-emerald-400/35" : "border-emerald-400 bg-emerald-50/90 ring-2 ring-emerald-300/60"
                      : isDarkMode ? "border-emerald-500/35 bg-[#1a1a1a]/90 shadow-[0_6px_18px_rgba(29,185,84,0.10)]" : "border-emerald-300 bg-white/92 shadow-[0_6px_14px_rgba(29,185,84,0.10)]";
                    const groupHeaderClass = isDarkMode
                      ? "border-[#2f2f2f] bg-gradient-to-r from-[#202020] via-[#242424] to-[#2a2a2a] hover:from-[#262626] hover:to-[#303030]"
                      : "border-emerald-200 bg-gradient-to-r from-emerald-50 to-white hover:from-emerald-100 hover:to-emerald-50";
                    return (
                      <li
                        key={group.id}
                        ref={(element) => {
                          groupItemRefs.current[group.id] = element;
                        }}
                        className={`relative rounded-xl border ${groupBorderClass} ${isDragOver || isTaskDragOver ? 'watery-highlight' : ''} overflow-hidden will-change-transform transition-all duration-300 ${isDragging ? "opacity-0" : "opacity-100"}`}
                        draggable
                        onDragStart={(e) => handleGroupDragStart(e, group.id)}
                        onDragOver={(e) => handleGroupDragOver(e, group.id)}
                        onDrop={() => handleGroupDrop(group.id)}
                        onDragEnd={handleGroupDragEnd}
                      >
                        <div
                          className={`flex items-center gap-2 px-3 py-2 transition cursor-pointer select-none ${groupHeaderClass}`}
                          onClick={() => toggleGroupCollapse(group.id)}
                        >
                          <span
                            className={`cursor-grab text-base select-none ${isDarkMode ? "text-slate-600 hover:text-slate-400" : "text-slate-300 hover:text-slate-500"}`}
                            title="Drag to reorder"
                            onClick={(e) => e.stopPropagation()}
                          >
                            ⠿
                          </span>
                          <span className={`text-sm transition ${isDarkMode ? "text-slate-400" : "text-slate-500"}`}>
                            {isCollapsed ? "▶" : "▼"}
                          </span>
                          {editingGroupId === group.id ? (
                            <div className="flex flex-1 items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={editingGroupInput}
                                onChange={(e) => setEditingGroupInput(e.target.value)}
                                onKeyDown={(e) => handleGroupEditEnter(e, group.id)}
                                className={`flex-1 rounded border px-2 py-1 text-sm outline-none ${inputClassWithWater}`}
                                autoFocus
                              />
                              <button type="button" onClick={() => saveGroupEdit(group.id)} className={`text-xs text-spotify-accent`}>Save</button>
                              <button type="button" onClick={cancelGroupEdit} className={isDarkMode ? "text-xs text-slate-400 hover:text-slate-300" : "text-xs text-slate-500 hover:text-slate-400"}>Cancel</button>
                            </div>
                          ) : (
                            <>
                              <span className={`flex-1 text-sm font-semibold ${shellText}`}>{group.title}</span>
                              <span className={`text-xs ${mutedText}`}>{groupIncompleteTasks.length} task{groupIncompleteTasks.length !== 1 ? "s" : ""}</span>
                              <button type="button" onClick={(e) => { e.stopPropagation(); startGroupEdit(group); }} className={`text-xs text-spotify-accent`}>Edit</button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); removeGroup(group.id); }} className={isDarkMode ? "text-xs text-slate-500 hover:text-slate-400" : "text-xs text-slate-400 hover:text-slate-500"}>Delete</button>
                            </>
                          )}
                        </div>
                        <div
                          ref={(el) => { groupContentRefs.current[group.id] = el; }}
                          className={`group-content px-2 pb-2 pt-1 rounded-b-lg transition-colors ${dragTaskOverTarget === group.id ? (isDarkMode ? "bg-spotify-drag-dark" : "bg-spotify-drag-light") : (isDarkMode ? "spotify-panel-dark" : "spotify-panel-light")}`}
                          onDragOver={(e) => handleTaskDragOver(e, group.id)}
                          onDrop={(e) => handleTaskDrop(e, group.id)}
                          onDragLeave={() => setDragTaskOverTarget(null)}
                          style={{
                            maxHeight: collapsedGroups.has(group.id) ? "0px" : `${groupHeights[group.id] ?? 0}px`,
                            overflow: "hidden",
                          }}
                        >
                          <div className="group-inner" style={{ opacity: collapsedGroups.has(group.id) ? 0 : 1, transform: collapsedGroups.has(group.id) ? "translateY(-6px)" : "translateY(0)" }}>
                            <div className="mb-2 flex gap-2">
                              <input
                                type="text"
                                value={groupTaskInputs[group.id] ?? ""}
                                onChange={(e) => setGroupTaskInputs((current) => ({ ...current, [group.id]: e.target.value }))}
                                onKeyDown={(e) => handleGroupTaskEnter(e, group.id)}
                                placeholder="Add a task to this group..."
                                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${inputClassWithWater}`}
                              />
                              <button
                                type="button"
                                onClick={() => addGroupTask(group.id)}
                                className="rounded-lg spotify-gradient px-3 py-2 text-xs font-semibold text-spotify-on-green shadow-sm transition hover:spotify-gradient-hover"
                              >
                                Add
                              </button>
                            </div>
                            <ul className="space-y-2">
                              {groupIncompleteTasks.length === 0 ? (
                                <li className={`py-4 text-center text-sm ${mutedText}`}>No tasks in this group</li>
                              ) : (
                                groupIncompleteTasks.map((task) => renderTaskRow(task))
                              )}
                            </ul>

                            {groupCompletedTasks.length > 0 ? (
                              <div className="mt-2">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleGroupCompleted(group.id);
                                  }}
                                  className={`w-full text-left rounded-lg border px-3 py-1 text-xs font-semibold ${panelClassWithWater}`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className={isDarkMode ? "text-slate-100" : "text-slate-800"}>Completed Tasks</span>
                                    <span className={`text-sm ${mutedText}`}>{groupCompletedTasks.length}</span>
                                  </div>
                                </button>

                                {isGroupCompletedVisible ? (
                                  <div className={`mt-2 rounded-lg border p-2 ${panelClassWithWater}`}>
                                    <ul className="space-y-2 pr-1">
                                      {groupCompletedTasks.map((task) => renderTaskRow(task))}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>

                      </li>
                    );
                  })}
                  <div
                    className={`mb-2 rounded-md border px-3 py-2 transition select-none ${dragTaskOverTarget === "ungrouped" ? (isDarkMode ? "bg-emerald-900/25 ring-2 ring-emerald-400/30" : "bg-emerald-50/90 ring-2 ring-emerald-300/40") : ""}`}
                    onDragOver={(e) => handleTaskDragOver(e, "ungrouped")}
                    onDrop={(e) => handleTaskDrop(e, null)}
                    onDragLeave={() => setDragTaskOverTarget(null)}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-semibold ${shellText}`}>Ungrouped</span>
                      <span className={`text-xs ${mutedText}`}>{ungroupedIncompleteTasks.length} task{ungroupedIncompleteTasks.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>

                  <div
                    className={`space-y-2 rounded-lg p-1 transition-colors ${dragTaskOverTarget === "ungrouped" ? (isDarkMode ? "bg-slate-700/50" : "bg-slate-100") : ""}`}
                    onDragOver={(e) => handleTaskDragOver(e, "ungrouped")}
                    onDrop={(e) => handleTaskDrop(e, null)}
                    onDragLeave={() => setDragTaskOverTarget(null)}
                  >
                    {ungroupedIncompleteTasks.length === 0 ? (
                      <div className={`py-4 text-center text-sm ${mutedText}`}>No ungrouped tasks</div>
                    ) : (
                      ungroupedIncompleteTasks.map((task) => renderTaskRow(task))
                    )}
                  </div>
                </>
              )}
            </ul>

            {ungroupedCompletedTasks.length > 0 ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setShowCompletedTasks((s) => !s)}
                  className={`w-full text-left rounded-xl border px-3 py-2 font-semibold transition hover:-translate-y-0.5 hover:shadow-sm ${panelClassWithWater}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={isDarkMode ? "text-slate-100" : "text-slate-800"}>Completed Tasks</span>
                    <span className={`text-sm ${mutedText}`}>{ungroupedCompletedTasks.length}</span>
                  </div>
                </button>

                {showCompletedTasks ? (
                  <div className={`mt-2 rounded-lg border p-2 ${panelClassWithWater}`}>
                    <ul className="space-y-2 pr-1">
                      {paginatedUngroupedCompletedTasks.map((task) => renderTaskRow(task))}
                    </ul>
                    {ungroupedCompletedTasks.length > ITEMS_PER_PAGE ? (
                      <div className="mt-3 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setCompletedPage((p) => Math.max(1, p - 1))}
                          disabled={completedPage <= 1}
                          className={`rounded-lg border px-3 py-1 text-sm font-semibold ${isDarkMode ? "border-slate-700 text-slate-200 disabled:opacity-40" : "border-slate-200 text-slate-700 disabled:opacity-40"}`}
                        >
                          ◀ Prev
                        </button>

                        <div className={`text-sm ${mutedText}`}>Page {completedPage} of {totalCompletedPages}</div>

                        <button
                          type="button"
                          onClick={() => setCompletedPage((p) => Math.min(totalCompletedPages, p + 1))}
                          disabled={completedPage >= totalCompletedPages}
                          className={`rounded-lg border px-3 py-1 text-sm font-semibold ${isDarkMode ? "border-slate-700 text-slate-200 disabled:opacity-40" : "border-slate-200 text-slate-700 disabled:opacity-40"}`}
                        >
                          Next ▶
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="flex flex-col gap-4">
            <h2 className={`flex items-center gap-2 text-2xl font-bold ${shellText}`}>
              <span className="h-8 w-1 rounded spotify-gradient-vertical" />Comments
            </h2>

            <div className={`flex min-h-[64vh] flex-col rounded-xl border overflow-hidden transition hover:shadow-lg ${panelClassWithWater} ${isDarkMode ? "bg-[#181818]/95" : "bg-white/95"}`}>
              {dailyTasks.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-6">
                  <p className={`text-center text-lg ${mutedText}`}>Add daily tasks to start discussions</p>
                </div>
              ) : selectedTask == null ? (
                <div className="flex flex-1 items-center justify-center px-6">
                  <p className={`text-center text-lg ${mutedText}`}>Select a task to open its discussion thread</p>
                </div>
              ) : (
                <div className="flex flex-1 flex-col">
                  <div className={`border-b px-4 py-3 rounded-t-xl ${panelEdgeClass} ${isDarkMode ? "spotify-panel-dark" : "spotify-panel-light"}`}>
                    <p className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}>Discussion</p>
                    <p className={`mt-1 text-sm font-semibold ${shellText}`}>{selectedTask.title}</p>
                    <p className={`mt-1 text-xs ${mutedText}`}>{selectedTaskComments.length} comment{selectedTaskComments.length !== 1 ? "s" : ""}</p>
                  </div>

                  <ul className="flex-1 space-y-2 p-3">
                    {selectedTaskComments.length === 0 ? (
                      <li className={`py-6 text-center text-sm ${mutedText}`}>No comments yet</li>
                    ) : (
                      selectedTaskComments.map((comment) => (
                        <li
                          key={comment.id}
                          className={`rounded-md border px-3 py-2 text-sm ${isDarkMode ? "border-[#303030] bg-[#202020] text-slate-200" : "border-emerald-100 bg-emerald-50/60 text-slate-700"}`}
                        >
                          {editingCommentId === comment.id ? (
                            <div>
                              <input
                                type="text"
                                value={editingCommentInput}
                                onChange={(e) => setEditingCommentInput(e.target.value)}
                                onKeyDown={(e) => handleCommentEditEnter(e, comment.id)}
                                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${inputClassWithWater}`}
                              />
                              <div className="mt-2 flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => saveCommentEdit(comment.id)}
                                  className={`text-xs font-semibold text-spotify-accent transition`}
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
                                    className={`text-xs font-semibold text-spotify-accent transition`}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeComment(comment.id)}
                                    className={isDarkMode ? "text-xs font-semibold text-slate-500 transition hover:text-slate-400" : "text-xs font-semibold text-slate-400 transition hover:text-slate-500"}
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

                  <div className={`border-t p-3 ${panelEdgeClass}`}>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={currentCommentInput}
                        onChange={(event) => setCurrentCommentInput(event.target.value)}
                        onKeyDown={(event) => handleCommentEnter(event, selectedTask.id)}
                        placeholder="Add a comment..."
                        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${inputClassWithWater}`}
                      />
                      <button
                        type="button"
                        onClick={() => addComment(selectedTask.id)}
                        className="rounded-lg spotify-gradient px-3 py-2 text-xs font-semibold text-spotify-on-green shadow-sm transition hover:spotify-gradient-hover"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
