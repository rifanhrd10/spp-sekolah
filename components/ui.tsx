"use client";

import { AlertCircle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type Tone = "success" | "error" | "info" | "warning";

const toneStyles: Record<Tone, string> = {
  success: "border-emerald-200/90 bg-white text-slate-800 shadow-[0_22px_48px_rgba(15,23,42,0.12)]",
  error: "border-rose-200/90 bg-white text-slate-800 shadow-[0_22px_48px_rgba(15,23,42,0.14)]",
  info: "border-sky-200/90 bg-white text-slate-800 shadow-[0_22px_48px_rgba(15,23,42,0.12)]",
  warning: "border-amber-200/90 bg-white text-slate-800 shadow-[0_22px_48px_rgba(15,23,42,0.12)]",
};

const toneIcons = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertCircle,
};

const toneBadgeStyles: Record<Tone, string> = {
  success: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100",
  error: "bg-rose-50 text-rose-600 ring-1 ring-rose-100",
  info: "bg-sky-50 text-sky-600 ring-1 ring-sky-100",
  warning: "bg-amber-50 text-amber-600 ring-1 ring-amber-100",
};

const toneProgressStyles: Record<Tone, string> = {
  success: "bg-emerald-500",
  error: "bg-rose-500",
  info: "bg-sky-500",
  warning: "bg-amber-500",
};

const toneTitles: Record<Tone, string> = {
  success: "Berhasil",
  error: "Gagal",
  info: "Informasi",
  warning: "Perhatian",
};

export function Notice({
  type,
  message,
  autoDismissMs = 2000,
}: {
  type?: string;
  message?: string;
  autoDismissMs?: number;
}) {
  const [visible, setVisible] = useState(true);
  const [rendered, setRendered] = useState(true);

  useEffect(() => {
    if (!type && !message) return;
    const timer = window.setTimeout(() => setVisible(false), autoDismissMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [autoDismissMs, message, type]);

  useEffect(() => {
    if (!visible) {
      const cleanupTimer = window.setTimeout(() => setRendered(false), 220);
      return () => window.clearTimeout(cleanupTimer);
    }
    return undefined;
  }, [visible]);

  if (!type && !message) return null;
  if (!visible && !rendered) return null;

  const tone = type === "error" ? "error" : type === "warning" ? "warning" : type === "info" ? "info" : "success";
  const Icon = toneIcons[tone];

  return (
    <div className="pointer-events-none fixed right-7 top-24 z-[80] w-full max-w-[420px] px-4 sm:px-0">
      <div
        className={`pointer-events-auto relative overflow-hidden rounded-xl border backdrop-blur-sm transition-all duration-200 ${toneStyles[tone]} ${
          visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
        }`}
      >
        <div className="flex items-start gap-3 px-4 py-3.5">
          <div className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl ${toneBadgeStyles[tone]}`}>
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <strong className="block text-sm font-extrabold tracking-[0.01em] text-slate-900">{toneTitles[tone]}</strong>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-600">
              {message || (tone === "error" ? "Data gagal diproses." : "Data berhasil diproses.")}
            </p>
          </div>
          <button
            className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            onClick={() => setVisible(false)}
            type="button"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-slate-100/90">
          <div
            className={`h-full origin-left ${toneProgressStyles[tone]}`}
            style={{
              animation: `notice-progress ${autoDismissMs}ms linear forwards`,
            }}
          />
        </div>
      </div>
      <style jsx>{`
        @keyframes notice-progress {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0);
          }
        }
      `}</style>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <section className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {actionHref && actionLabel ? (
        <Link
          className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-900 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
          href={actionHref}
        >
          {actionLabel}
        </Link>
      ) : null}
    </section>
  );
}

export function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || subtitle || right) && (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            {title ? <h3 className="font-black text-slate-950">{title}</h3> : null}
            {subtitle ? <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p> : null}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="px-5 py-10 text-center text-sm font-medium text-slate-500">{text}</div>;
}

export function StatCard({
  label,
  value,
  helper,
  icon,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: React.ReactNode;
  tone?: "slate" | "emerald" | "amber" | "rose" | "sky";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-900",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    sky: "bg-blue-50 text-blue-700",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
          <strong className="mt-3 block text-2xl font-black tracking-tight text-slate-950">{value}</strong>
        </div>
        <div className={`grid size-11 place-items-center rounded-lg ${tones[tone]}`}>{icon}</div>
      </div>
      <p className="mt-5 text-sm font-medium text-slate-500">{helper}</p>
    </div>
  );
}
