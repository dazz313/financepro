import { db } from "@/lib/db";
import { renderNumberingTemplate, SERIES_DEFS, padNumber, type DocSeries, type NumberingContext } from "@/lib/codegen-shared";

export class CodeConflictError extends Error {
  constructor(message = "Kode sudah digunakan") {
    super(message);
    this.name = "CodeConflictError";
  }
}

export type SettingsClient = {
  companySettings: {
    findUnique: (args: { where: { id: string } }) => Promise<any | null>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<any>;
    create: (args: { data: Record<string, unknown> }) => Promise<any>;
  };
};

export interface NextCodeOptions {
  date?: Date | string;
  length?: number;
}

function getDateValue(date?: Date | string): Date {
  const value = date ? new Date(date) : new Date();
  return Number.isNaN(value.getTime()) ? new Date() : value;
}

export async function nextCode(
  client: SettingsClient,
  series: DocSeries,
  options: NextCodeOptions | number = {}
): Promise<string> {
  const def = SERIES_DEFS[series];
  const normalizedOptions = typeof options === "number" ? { length: options } : options;
  const date = getDateValue(normalizedOptions.date);
  const settings = await client.companySettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    await client.companySettings.create({ data: { id: "default" } });
    const created = await client.companySettings.findUnique({ where: { id: "default" } });
    if (!created) throw new Error("Company settings gagal dibuat");
  }

  const prefix = String(settings?.[def.prefix] || def.fallback);
  const startNum = Number(settings?.[def.start]) || 1;
  const nextVal = Number(settings?.[def.next] ?? startNum) || 1;
  const context: NumberingContext = {
    prefix,
    company: String(settings?.companyCode || ""),
    year: String(date.getFullYear()),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    seq: padNumber(nextVal, normalizedOptions.length ?? 4),
  };
  const template = String(settings?.numberingFormat || "{prefix}-{seq}");
  const code = renderNumberingTemplate(template, context);

  await client.companySettings.update({
    where: { id: "default" },
    data: { [def.next]: nextVal + 1 },
  });
  return code;
}

export async function generateOrUseCode(
  client: SettingsClient,
  series: DocSeries,
  provided: unknown,
  exists: (code: string) => Promise<boolean>,
  options: NextCodeOptions = {}
): Promise<string> {
  const manual = provided !== undefined && provided !== null && String(provided).trim() !== "";
  if (manual) {
    const code = String(provided).trim();
    if (await exists(code)) throw new CodeConflictError();
    return code;
  }
  let code = await nextCode(client, series, options);
  let attempts = 0;
  while (await exists(code) && attempts < 100) {
    code = await nextCode(client, series, options);
    attempts += 1;
  }
  if (await exists(code)) throw new Error("Gagal menghasilkan kode unik");
  return code;
}
