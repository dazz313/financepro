"use client";

import * as React from "react";
import { create } from "zustand";
import type { CompanySettings, UserPreferences } from "@/lib/types";
import { renderNumberingTemplate, SERIES_DEFS, padNumber, type DocSeries, type NumberingContext } from "@/lib/codegen-shared";

// Preview kode otomatis berikutnya berdasarkan settings perusahaan (client-side).
// Server tetap jadi sumber kebenaran; nilai ini hanya untuk prefill form.
export function previewCode(settings: CompanySettings | null, series: DocSeries, date = new Date()): string {
  if (!settings) return "";
  const def = SERIES_DEFS[series];
  const prefix: string = (settings as Record<string, unknown>)[def.prefix] as string || def.fallback;
  const startNum = Number((settings as Record<string, unknown>)[def.start] ?? 1) || 1;
  const nextVal = Number((settings as Record<string, unknown>)[def.next] ?? startNum) || 1;
  const context: NumberingContext = {
    prefix,
    company: settings.companyCode || "",
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    seq: padNumber(nextVal),
  };
  return renderNumberingTemplate(settings.numberingFormat || "{prefix}-{seq}", context);
}

type SettingsStore = {
  company: CompanySettings | null;
  preferences: UserPreferences | null;
  loaded: boolean;
  setCompany: (c: CompanySettings) => void;
  setPreferences: (p: UserPreferences) => void;
  fetchAll: () => Promise<void>;
  fetchCompany: () => Promise<void>;
  fetchPreferences: () => Promise<void>;
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  company: null,
  preferences: null,
  loaded: false,
  setCompany: (c) => set({ company: c }),
  setPreferences: (p) => set({ preferences: p }),
  fetchAll: async () => {
    if (get().loaded) return;
    try {
      const cRes = await fetch("/api/settings/company");
      const company = cRes.ok ? (await cRes.json()).settings : null;
      set({ company, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  fetchCompany: async () => {
    try {
      const cRes = await fetch("/api/settings/company");
      if (cRes.ok) {
        const company = (await cRes.json()).settings;
        set({ company });
      }
    } catch {
      // silently fail
    }
  },
  fetchPreferences: async () => {
    try {
      const pRes = await fetch("/api/settings/preferences");
      if (pRes.ok) {
        const prefs = (await pRes.json()).preferences;
        set({ preferences: prefs });
      }
    } catch {
      // silently fail
    }
  },
}));
