-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'BENDAHARA', 'KEPALA_SEKOLAH');

-- CreateEnum
CREATE TYPE "PermissionKey" AS ENUM ('DASHBOARD_VIEW', 'MASTER_STUDENT', 'MASTER_CLASS', 'MASTER_PAYMENT', 'MASTER_EXPENSE_CATEGORY', 'USER_MANAGE', 'ROLE_MANAGE', 'INVOICE_MANAGE', 'PAYMENT_MANAGE', 'EXPENSE_MANAGE', 'CASHBOOK_VIEW', 'CASHBOOK_MANAGE', 'ACCOUNTING_VIEW', 'ACCOUNTING_MANAGE', 'REPORT_VIEW', 'ANALYTICS_VIEW', 'RECEIPT_SETTING');

-- CreateEnum
CREATE TYPE "CashType" AS ENUM ('MASUK', 'KELUAR');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASET', 'KEWAJIBAN', 'MODAL', 'PENDAPATAN', 'BEBAN');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('SPP', 'SUMBANGAN', 'KEGIATAN', 'SERAGAM', 'LAINNYA');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('BELUM_BAYAR', 'CICILAN', 'LUNAS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'BENDAHARA',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "permission" "PermissionKey" NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassRoom" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "homeroom" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCategory" (
    "id" TEXT NOT NULL,
    "code" "PaymentType" NOT NULL,
    "name" TEXT NOT NULL,
    "defaultAmount" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "revenueAccountId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "nisn" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classNameSnapshot" TEXT,
    "classRoomId" TEXT,
    "gender" TEXT,
    "finalScore" DOUBLE PRECISION,
    "promotionStatus" TEXT NOT NULL DEFAULT 'BELUM_DITENTUKAN',
    "guardianName" TEXT NOT NULL,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentClassHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fromClassRoomId" TEXT,
    "fromClassNameSnapshot" TEXT,
    "fromAcademicYear" TEXT,
    "toClassRoomId" TEXT,
    "toClassNameSnapshot" TEXT,
    "toAcademicYear" TEXT,
    "academicYear" TEXT NOT NULL,
    "movementType" TEXT NOT NULL DEFAULT 'PROMOSI',
    "decisionStatus" TEXT,
    "note" TEXT,
    "movedBy" TEXT NOT NULL,
    "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentClassHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingBatch" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "paymentCategoryId" TEXT,
    "classRoomId" TEXT,
    "targetLabelSnapshot" TEXT,
    "amount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "academicYear" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "paymentCategoryId" TEXT,
    "billingBatchId" TEXT,
    "type" "PaymentType" NOT NULL,
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "academicYear" TEXT,
    "period" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'BELUM_BAYAR',
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "receiptNo" TEXT,
    "invoiceId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL DEFAULT 'Tunai',
    "note" TEXT,
    "receivedBy" TEXT NOT NULL DEFAULT 'Bendahara',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "expenseAccountId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "categoryNameSnapshot" TEXT,
    "categoryId" TEXT,
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "spentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendor" TEXT,
    "note" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'Bendahara',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashTransaction" (
    "id" TEXT NOT NULL,
    "type" "CashType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "paymentId" TEXT,
    "expenseId" TEXT,
    "assetAccountId" TEXT,
    "contraAccountId" TEXT,
    "createdBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "postedBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "schoolName" TEXT NOT NULL DEFAULT 'SMP Nusantara',
    "schoolAddress" TEXT NOT NULL DEFAULT 'Alamat sekolah belum diatur',
    "schoolPhone" TEXT,
    "headerText" TEXT DEFAULT 'BUKTI PEMBAYARAN',
    "footerText" TEXT DEFAULT 'Simpan bukti pembayaran ini dengan baik.',
    "logoUrl" TEXT,
    "signatureName" TEXT DEFAULT 'Bendahara',
    "signatureTitle" TEXT DEFAULT 'Petugas Penerima',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "RolePermission_role_idx" ON "RolePermission"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_role_permission_key" ON "RolePermission"("role", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "ClassRoom_name_key" ON "ClassRoom"("name");

-- CreateIndex
CREATE INDEX "ClassRoom_deletedAt_idx" ON "ClassRoom"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCategory_code_key" ON "PaymentCategory"("code");

-- CreateIndex
CREATE INDEX "PaymentCategory_revenueAccountId_idx" ON "PaymentCategory"("revenueAccountId");

-- CreateIndex
CREATE INDEX "PaymentCategory_deletedAt_idx" ON "PaymentCategory"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Student_nisn_key" ON "Student"("nisn");

-- CreateIndex
CREATE INDEX "Student_classNameSnapshot_idx" ON "Student"("classNameSnapshot");

-- CreateIndex
CREATE INDEX "Student_classRoomId_idx" ON "Student"("classRoomId");

-- CreateIndex
CREATE INDEX "Student_active_idx" ON "Student"("active");

-- CreateIndex
CREATE INDEX "Student_gender_idx" ON "Student"("gender");

-- CreateIndex
CREATE INDEX "Student_promotionStatus_idx" ON "Student"("promotionStatus");

-- CreateIndex
CREATE INDEX "Student_deletedAt_idx" ON "Student"("deletedAt");

-- CreateIndex
CREATE INDEX "StudentClassHistory_studentId_movedAt_idx" ON "StudentClassHistory"("studentId", "movedAt");

-- CreateIndex
CREATE INDEX "StudentClassHistory_academicYear_idx" ON "StudentClassHistory"("academicYear");

-- CreateIndex
CREATE INDEX "BillingBatch_academicYear_period_idx" ON "BillingBatch"("academicYear", "period");

-- CreateIndex
CREATE INDEX "BillingBatch_classRoomId_idx" ON "BillingBatch"("classRoomId");

-- CreateIndex
CREATE INDEX "BillingBatch_deletedAt_idx" ON "BillingBatch"("deletedAt");

-- CreateIndex
CREATE INDEX "Invoice_type_idx" ON "Invoice"("type");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_dueDate_idx" ON "Invoice"("dueDate");

-- CreateIndex
CREATE INDEX "Invoice_paymentCategoryId_idx" ON "Invoice"("paymentCategoryId");

-- CreateIndex
CREATE INDEX "Invoice_billingBatchId_idx" ON "Invoice"("billingBatchId");

-- CreateIndex
CREATE INDEX "Invoice_academicYear_period_idx" ON "Invoice"("academicYear", "period");

-- CreateIndex
CREATE INDEX "Invoice_deletedAt_idx" ON "Invoice"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNo_key" ON "Payment"("receiptNo");

-- CreateIndex
CREATE INDEX "Payment_paidAt_idx" ON "Payment"("paidAt");

-- CreateIndex
CREATE INDEX "Payment_deletedAt_idx" ON "Payment"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_code_key" ON "ExpenseCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_name_key" ON "ExpenseCategory"("name");

-- CreateIndex
CREATE INDEX "ExpenseCategory_deletedAt_idx" ON "ExpenseCategory"("deletedAt");

-- CreateIndex
CREATE INDEX "Expense_categoryNameSnapshot_idx" ON "Expense"("categoryNameSnapshot");

-- CreateIndex
CREATE INDEX "Expense_categoryId_idx" ON "Expense"("categoryId");

-- CreateIndex
CREATE INDEX "Expense_spentAt_idx" ON "Expense"("spentAt");

-- CreateIndex
CREATE INDEX "Expense_deletedAt_idx" ON "Expense"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransaction_paymentId_key" ON "CashTransaction"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "CashTransaction_expenseId_key" ON "CashTransaction"("expenseId");

-- CreateIndex
CREATE INDEX "CashTransaction_date_idx" ON "CashTransaction"("date");

-- CreateIndex
CREATE INDEX "CashTransaction_type_idx" ON "CashTransaction"("type");

-- CreateIndex
CREATE INDEX "CashTransaction_assetAccountId_idx" ON "CashTransaction"("assetAccountId");

-- CreateIndex
CREATE INDEX "CashTransaction_contraAccountId_idx" ON "CashTransaction"("contraAccountId");

-- CreateIndex
CREATE INDEX "CashTransaction_deletedAt_idx" ON "CashTransaction"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE INDEX "Account_deletedAt_idx" ON "Account"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_number_key" ON "JournalEntry"("number");

-- CreateIndex
CREATE INDEX "JournalEntry_date_idx" ON "JournalEntry"("date");

-- CreateIndex
CREATE INDEX "JournalEntry_sourceType_sourceId_idx" ON "JournalEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "JournalEntry_deletedAt_idx" ON "JournalEntry"("deletedAt");

-- CreateIndex
CREATE INDEX "JournalLine_journalEntryId_idx" ON "JournalLine"("journalEntryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- AddForeignKey
ALTER TABLE "PaymentCategory" ADD CONSTRAINT "PaymentCategory_revenueAccountId_fkey" FOREIGN KEY ("revenueAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_classRoomId_fkey" FOREIGN KEY ("classRoomId") REFERENCES "ClassRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentClassHistory" ADD CONSTRAINT "StudentClassHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingBatch" ADD CONSTRAINT "BillingBatch_classRoomId_fkey" FOREIGN KEY ("classRoomId") REFERENCES "ClassRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingBatch" ADD CONSTRAINT "BillingBatch_paymentCategoryId_fkey" FOREIGN KEY ("paymentCategoryId") REFERENCES "PaymentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentCategoryId_fkey" FOREIGN KEY ("paymentCategoryId") REFERENCES "PaymentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_billingBatchId_fkey" FOREIGN KEY ("billingBatchId") REFERENCES "BillingBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_assetAccountId_fkey" FOREIGN KEY ("assetAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_contraAccountId_fkey" FOREIGN KEY ("contraAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
