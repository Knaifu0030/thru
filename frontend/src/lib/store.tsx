/**
 * App state: registry cache (polled), the live teaching session, and UI chrome
 * (skill drawer, teaching modal, global search). All data flows through
 * lib/api.ts — these providers just hold and refresh it.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { THRUQuestion, SkillArtifact } from "./types";
import type { DraftIdentity } from "./naming";
import { deriveDraft } from "./naming";
import { api } from "./api";

/* ── Registry ─────────────────────────────────────────────────────────── */

interface RegistryState {
  skills: SkillArtifact[] | null; // null = first load in flight
  error: string | null;
  refresh: () => void;
}

const RegistryContext = createContext<RegistryState | null>(null);

const POLL_MS = 2500;

export function RegistryProvider({ children }: { children: ReactNode }) {
  const [skills, setSkills] = useState<SkillArtifact[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastJson = useRef<string>("");

  const load = useCallback(async () => {
    try {
      const next = await api.getRegistry();
      const json = JSON.stringify(next);
      if (json !== lastJson.current) {
        lastJson.current = json;
        setSkills(next);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The registry didn't load.");
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const value = useMemo<RegistryState>(
    () => ({ skills, error, refresh: () => void load() }),
    [skills, error, load],
  );

  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
}

export function useRegistry(): RegistryState {
  const ctx = useContext(RegistryContext);
  if (!ctx) throw new Error("useRegistry outside RegistryProvider");
  return ctx;
}

/* ── THRU session ────────────────────────────────────────────────────── */

export type THRUStage = "narrating" | "question" | "done" | "error";

export interface THRUSession {
  stage: THRUStage;
  lines: string[];
  question: THRUQuestion | null;
  draft: DraftIdentity;
  skill: SkillArtifact | null;
  error: string | null;
}

interface THRUState {
  session: THRUSession | null;
  start: (goal: string, url: string) => void;
  answer: (choice: string) => void;
  cancel: () => void;
  /** Clears a finished session (after the card has settled into the grid). */
  finish: () => void;
}

const THRUContext = createContext<THRUState | null>(null);

export function THRUProvider({ children }: { children: ReactNode }) {
  const { refresh } = useRegistry();
  const [session, setSession] = useState<THRUSession | null>(null);
  const controller = useRef<ReturnType<typeof api.teachSkill> | null>(null);
  const autoClear = useRef<ReturnType<typeof setTimeout> | null>(null);

  const finish = useCallback(() => {
    if (autoClear.current) clearTimeout(autoClear.current);
    autoClear.current = null;
    controller.current = null;
    setSession(null);
  }, []);

  const start = useCallback(
    (goal: string, url: string) => {
      if (controller.current) return; // one teaching session at a time — mirrors the backend
      const draft = deriveDraft(goal, url);
      setSession({ stage: "narrating", lines: [], question: null, draft, skill: null, error: null });
      controller.current = api.teachSkill(goal, url, {
        onLine: (line) =>
          setSession((s) =>
            s ? { ...s, lines: [...s.lines, line], question: null, stage: "narrating" } : s,
          ),
        onQuestion: (q) => setSession((s) => (s ? { ...s, question: q, stage: "question" } : s)),
        onDone: (skill) => {
          refresh();
          setSession((s) => (s ? { ...s, skill, stage: "done", question: null } : s));
          // Safety net for when neither the modal nor the marketplace stub is
          // mounted to hand the session over — they clear it much sooner.
          autoClear.current = setTimeout(finish, 60_000);
        },
        onError: (message) =>
          setSession((s) => (s ? { ...s, stage: "error", error: message, question: null } : s)),
      });
    },
    [refresh, finish],
  );

  const answer = useCallback((choice: string) => {
    controller.current?.answer(choice);
    setSession((s) =>
      s && s.question
        ? { ...s, lines: [...s.lines], question: null, stage: "narrating" }
        : s,
    );
  }, []);

  const cancel = useCallback(() => {
    controller.current?.cancel();
    finish();
  }, [finish]);

  const value = useMemo<THRUState>(
    () => ({ session, start, answer, cancel, finish }),
    [session, start, answer, cancel, finish],
  );

  return <THRUContext.Provider value={value}>{children}</THRUContext.Provider>;
}

export function useTHRU(): THRUState {
  const ctx = useContext(THRUContext);
  if (!ctx) throw new Error("useTHRU outside THRUProvider");
  return ctx;
}

/* ── UI chrome: drawer, modal, search ─────────────────────────────────── */

interface UIState {
  drawerId: string | null;
  openSkill: (id: string) => void;
  closeDrawer: () => void;
  teachOpen: boolean;
  openTeaching: () => void;
  closeTeaching: () => void;
  query: string;
  setQuery: (q: string) => void;
}

const UIContext = createContext<UIState | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [teachOpen, setTeachOpen] = useState(false);
  const [query, setQuery] = useState("");

  const value = useMemo<UIState>(
    () => ({
      drawerId,
      openSkill: (id: string) => setDrawerId(id),
      closeDrawer: () => setDrawerId(null),
      teachOpen,
      openTeaching: () => setTeachOpen(true),
      closeTeaching: () => setTeachOpen(false),
      query,
      setQuery,
    }),
    [drawerId, teachOpen, query],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIState {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI outside UIProvider");
  return ctx;
}
