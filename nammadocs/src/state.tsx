import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { DemoApplication, Locale, RunTelemetry } from "./types";

const initialApplication: DemoApplication = { reference: null, status: "draft", documents: { identity: false, address: false, income: false, photo: false }, applicant: { name: "Ananya Rao", dob: "2002-04-12", district: "Bengaluru Urban", taluk: "Bengaluru North", income: "180000", purpose: "Scholarship" } };
const initialTelemetry: RunTelemetry = { runId: null, queueState: "idle", skillId: null, input: null, envelope: null, error: null, startedAt: null };
interface DemoContextValue { locale: Locale; setLocale: (locale: Locale) => void; application: DemoApplication; setApplication: React.Dispatch<React.SetStateAction<DemoApplication>>; telemetry: RunTelemetry; setTelemetry: (value: RunTelemetry) => void; reset: () => void }
const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => localStorage.getItem("nammadocs-locale") === "kn" ? "kn" : "en");
  const [application, setApplication] = useState<DemoApplication>(() => { try { return JSON.parse(localStorage.getItem("nammadocs-application") || "null") || initialApplication; } catch { return initialApplication; } });
  const [telemetry, setTelemetry] = useState(initialTelemetry);
  useEffect(() => localStorage.setItem("nammadocs-locale", locale), [locale]);
  useEffect(() => localStorage.setItem("nammadocs-application", JSON.stringify(application)), [application]);
  const value = useMemo(() => ({ locale, setLocale, application, setApplication, telemetry, setTelemetry, reset: () => { setApplication(initialApplication); setTelemetry(initialTelemetry); localStorage.removeItem("nammadocs-application"); } }), [locale, application, telemetry]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
export function useDemo() { const context = useContext(DemoContext); if (!context) throw new Error("useDemo must be used inside DemoProvider"); return context; }
