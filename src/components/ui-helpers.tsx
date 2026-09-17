"use client";

import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      {icon && <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</div>}
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && <p className="text-sm text-muted-foreground max-w-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatBadge({ value, className }: { value: number; className?: string }) {
  const isPositive = value >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
        isPositive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
        className
      )}
    >
      {isPositive ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

export function Money({
  value,
  className,
  zeroDash = true,
}: {
  value: number;
  className?: string;
  zeroDash?: boolean;
}) {
  const formatted = new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  const isNegative = value < 0;
  if (zeroDash && value === 0) {
    return <span className={cn("tabular-nums text-muted-foreground/50", className)}>-</span>;
  }
  return (
    <span className={cn("tabular-nums", isNegative && "text-rose-600 dark:text-rose-400", className)}>
      {isNegative ? "(" : ""}Rp {formatted}{isNegative ? ")" : ""}
    </span>
  );
}
