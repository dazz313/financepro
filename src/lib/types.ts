// Tipe untuk CompanySettings & UserPreferences (mirror Prisma model)

// ============ ROLE & PERMISSIONS ============
export const ROLES = ["SUPERADMIN", "ADMIN", "INVENTORY_EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  SUPERADMIN: "Super Admin",
  ADMIN: "Admin",
  INVENTORY_EMPLOYEE: "Karyawan Inventaris",
};

// Permission matrix — digunakan di frontend & proxy
export const PERMISSIONS = {
  SUPERADMIN: {
    canApprove: true,
    canManageUsers: true,
    canSeeAllIndicators: true,
    canSeeEmployeeIndicators: true,
    canSeeEmployeeMenu: true,
    canSeePayroll: true,
    canEditSettings: true,
    canSeeReports: true,
    canSeeTax: true,
    canSeeInventory: true,
    canSeeBankAccounts: true,
    canSeeInvoices: true,
    canSeeContacts: true,
    canSeeFixedAssets: true,
    canSeeCsvImport: true,
    navKeys: ["dashboard", "bank-accounts", "receipts", "payments", "transfers", "accounts", "inventory", "fixed-assets", "invoices", "contacts", "employees", "csv", "reports", "tax", "settings"] as const,
  },
  ADMIN: {
    canApprove: false,
    canManageUsers: false,
    canSeeAllIndicators: true,
    canSeeEmployeeIndicators: false,
    canSeeEmployeeMenu: false,
    canSeePayroll: false,
    canEditSettings: true,
    canSeeReports: true,
    canSeeTax: true,
    canSeeInventory: true,
    canSeeBankAccounts: true,
    canSeeInvoices: true,
    canSeeContacts: true,
    canSeeFixedAssets: true,
    canSeeCsvImport: true,
    navKeys: ["dashboard", "bank-accounts", "receipts", "payments", "transfers", "accounts", "inventory", "fixed-assets", "invoices", "contacts", "csv", "reports", "tax", "settings"] as const,
  },
  INVENTORY_EMPLOYEE: {
    canApprove: false,
    canManageUsers: false,
    canSeeAllIndicators: false,
    canSeeEmployeeIndicators: false,
    canSeeEmployeeMenu: false,
    canSeePayroll: false,
    canEditSettings: false,
    canSeeReports: false,
    canSeeTax: false,
    canSeeInventory: true,
    canSeeBankAccounts: false,
    canSeeInvoices: false,
    canSeeContacts: false,
    canSeeFixedAssets: false,
    canSeeCsvImport: false,
    navKeys: ["dashboard", "inventory"] as const,
  },
} as const;

export function getPermissions(role: string): (typeof PERMISSIONS)[Role] {
  if (role in PERMISSIONS) return PERMISSIONS[role as Role];
  return PERMISSIONS.VIEWER ?? PERMISSIONS.INVENTORY_EMPLOYEE;
}

// ============ COMPANY SETTINGS ============

export type CompanySettings = {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  currencyCode: string;
  currencySymbol: string;
  currencyPosition: "before" | "after";
  decimalPlaces: number;
  thousandSeparator: string;
  decimalSeparator: string;
  locale: string;
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
  defaultTaxRate: number;
  taxIncluded: boolean;
  ppnEnabled: boolean;
  bpjsEmployerRate?: number;
  logoUrl: string | null;
  companyCode: string;
  numberingFormat: string;
  invoicePrefix: string;
  invoiceStartNumber: number;
  nextInvoiceNumber?: number | null;
  quotePrefix?: string;
  quoteStartNumber?: number;
  nextQuoteNumber?: number;
  orderPrefix?: string;
  orderStartNumber?: number;
  nextOrderNumber?: number;
  defaultPaymentTermsDays?: number | null;
  invoiceSignature?: string | null;
  invoiceSignatureTitle?: string | null;
  invoiceFooterNote?: string | null;
  invoiceNote?: string;
  docGreeting?: string | null;
  docPicName?: string | null;
  docPicPhone?: string | null;
  invoiceBankName?: string | null;
  invoiceBankAccount?: string | null;
  invoiceBankHolder?: string | null;
  journalPrefix: string;
  journalStartNumber?: number;
  nextJournalNumber?: number;
  openingPrefix?: string;
  openingStartNumber?: number;
  nextOpeningNumber?: number;
  receiptPrefix?: string;
  receiptStartNumber?: number;
  nextReceiptNumber?: number;
  paymentPrefix?: string;
  paymentStartNumber?: number;
  nextPaymentNumber?: number;
  transferPrefix?: string;
  transferStartNumber?: number;
  nextTransferNumber?: number;
  payrollPrefix?: string;
  payrollStartNumber?: number;
  nextPayrollNumber?: number;
  reimbursementPrefix?: string;
  reimbursementStartNumber?: number;
  nextReimbursementNumber?: number;
  loanPrefix?: string;
  loanStartNumber?: number;
  nextLoanNumber?: number;
  employeePrefix?: string;
  employeeStartNumber?: number;
  nextEmployeeNumber?: number;
  contactPrefix?: string;
  contactStartNumber?: number;
  nextContactNumber?: number;
  bankAccountPrefix?: string;
  bankAccountStartNumber?: number;
  nextBankAccountNumber?: number;
  fixedAssetPrefix?: string;
  fixedAssetStartNumber?: number;
  nextFixedAssetNumber?: number;
  inventoryItemPrefix?: string;
  inventoryItemStartNumber?: number;
  nextInventoryItemNumber?: number;
  updatedAt: string;
};

export type UserPreferences = {
  id: string;
  userId: string;
  theme: "light" | "dark" | "system";
  density: "comfortable" | "compact";
  numberFormat: "id-ID" | "en-US";
  dateFormat: "DD/MM/YYYY" | "YYYY-MM-DD";
  createdAt: string;
  updatedAt: string;
};
