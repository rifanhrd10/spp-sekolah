"use client";

import {
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Calculator,
  ChevronDown,
  ClipboardList,
  Cog,
  FolderTree,
  GraduationCap,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ReceiptText,
  School,
  Tags,
  TrendingUp,
  Users,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { PermissionKey } from "@prisma/client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/actions";
import { LiveClock } from "@/components/live-clock";

type AppShellProps = {
  children: React.ReactNode;
  user: {
    name: string;
    email: string;
    role: string;
    roleName?: string;
  };
  permissions: PermissionKey[];
  expenseCategories: { id: string; name: string }[];
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: PermissionKey;
  superadminOnly?: boolean;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    title: "Ringkasan",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: PermissionKey.DASHBOARD_VIEW }],
  },
  {
    title: "Data Sekolah",
    items: [
      { href: "/master/siswa", label: "Siswa", icon: Users, permission: PermissionKey.MASTER_STUDENT },
      { href: "/master/kelas", label: "Kelas", icon: School, permission: PermissionKey.MASTER_CLASS },
    ],
  },
  {
    title: "Akademik",
    items: [
      { href: "/master/kenaikan-kelas", label: "Kenaikan Kelas", icon: GraduationCap, permission: PermissionKey.MASTER_CLASS },
    ],
  },
  {
    title: "Transaksi Keuangan",
    items: [
      { href: "/transaksi/tagihan", label: "Tagihan", icon: ClipboardList, permission: PermissionKey.INVOICE_MANAGE },
      { href: "/transaksi/pembayaran", label: "Pembayaran", icon: ReceiptText, permission: PermissionKey.PAYMENT_MANAGE },
      { href: "/transaksi/pengeluaran", label: "Pengeluaran", icon: WalletCards, permission: PermissionKey.EXPENSE_MANAGE },
    ],
  },
  {
    title: "Referensi Keuangan",
    items: [
      { href: "/master/jenis-pembayaran", label: "Jenis Pembayaran", icon: Tags, permission: PermissionKey.MASTER_PAYMENT },
      { href: "/master/kategori-pengeluaran", label: "Kategori Pengeluaran", icon: FolderTree, permission: PermissionKey.MASTER_EXPENSE_CATEGORY },
    ],
  },
  {
    title: "Pembukuan & Laporan",
    items: [
      { href: "/buku-kas", label: "Buku Kas", icon: BookOpen, permission: PermissionKey.CASHBOOK_VIEW },
      { href: "/akuntansi", label: "Akuntansi", icon: Calculator, permission: PermissionKey.ACCOUNTING_VIEW },
      { href: "/laporan", label: "Laporan", icon: BarChart3, permission: PermissionKey.REPORT_VIEW },
      { href: "/analisa", label: "Analisis", icon: TrendingUp, permission: PermissionKey.ANALYTICS_VIEW },
    ],
  },
  {
    title: "Administrasi",
    items: [
      { href: "/master/pengguna", label: "Pengguna & Akses", icon: BookOpenCheck, permission: PermissionKey.USER_MANAGE },
      { href: "/pengaturan/kwitansi", label: "Pengaturan Kwitansi", icon: Cog, permission: PermissionKey.RECEIPT_SETTING },
      { href: "/pengaturan/log-activity", label: "Log Activity", icon: History, superadminOnly: true },
    ],
  },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function Navigation({
  expenseCategories,
  isSuperadminUser,
  permissions,
  pathname,
  onNavigate,
  selectedAccountingExpenseCategoryId,
  selectedAccountingSource,
  selectedCashExpenseCategoryId,
  selectedCashType,
  selectedExpenseCategoryId,
}: {
  expenseCategories: { id: string; name: string }[];
  isSuperadminUser: boolean;
  permissions: PermissionKey[];
  pathname: string;
  onNavigate: () => void;
  selectedAccountingExpenseCategoryId: string;
  selectedAccountingSource: string;
  selectedCashExpenseCategoryId: string;
  selectedCashType: string;
  selectedExpenseCategoryId: string;
}) {
  const [openMenus, setOpenMenus] = useState({ accounting: true, cashbook: true, expense: true });
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.superadminOnly ? isSuperadminUser : item.permission ? permissions.includes(item.permission) : true),
    }))
    .filter((group) => group.items.length);

  return (
    <nav className="nav-list" aria-label="Menu aplikasi">
      {visibleGroups.map((group, groupIndex) => (
        <div className={`nav-section ${groupIndex ? "section-start" : ""}`} key={group.title}>
          <span className="nav-section-title">{group.title}</span>
          {group.items.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            const showExpenseSubmenu = item.href === "/transaksi/pengeluaran"
              && permissions.includes(PermissionKey.EXPENSE_MANAGE)
              && expenseCategories.length > 0;
            const showCashbookSubmenu = item.href === "/buku-kas"
              && permissions.includes(PermissionKey.CASHBOOK_VIEW)
              && expenseCategories.length > 0;
            const showAccountingSubmenu = item.href === "/akuntansi"
              && permissions.includes(PermissionKey.ACCOUNTING_VIEW)
              && expenseCategories.length > 0;
            const expenseSubmenuOpen = showExpenseSubmenu && (openMenus.expense || active);
            const cashbookSubmenuOpen = showCashbookSubmenu && (openMenus.cashbook || active);
            const accountingSubmenuOpen = showAccountingSubmenu && (openMenus.accounting || active);
            return (
              <div className="nav-item-wrap" key={item.href}>
                {showExpenseSubmenu ? (
                  <button
                    aria-expanded={expenseSubmenuOpen}
                    className={`nav-dropdown-toggle ${active ? "active" : ""}`}
                    onClick={() => setOpenMenus((current) => ({ ...current, expense: !current.expense }))}
                    title={item.label}
                    type="button"
                  >
                    <Icon size={19} />
                    <span>{item.label}</span>
                    <ChevronDown className={expenseSubmenuOpen ? "rotate" : ""} size={15} />
                  </button>
                ) : showCashbookSubmenu ? (
                  <button
                    aria-expanded={cashbookSubmenuOpen}
                    className={`nav-dropdown-toggle ${active ? "active" : ""}`}
                    onClick={() => setOpenMenus((current) => ({ ...current, cashbook: !current.cashbook }))}
                    title={item.label}
                    type="button"
                  >
                    <Icon size={19} />
                    <span>{item.label}</span>
                    <ChevronDown className={cashbookSubmenuOpen ? "rotate" : ""} size={15} />
                  </button>
                ) : showAccountingSubmenu ? (
                  <button
                    aria-expanded={accountingSubmenuOpen}
                    className={`nav-dropdown-toggle ${active ? "active" : ""}`}
                    onClick={() => setOpenMenus((current) => ({ ...current, accounting: !current.accounting }))}
                    title={item.label}
                    type="button"
                  >
                    <Icon size={19} />
                    <span>{item.label}</span>
                    <ChevronDown className={accountingSubmenuOpen ? "rotate" : ""} size={15} />
                  </button>
                ) : (
                  <Link
                    aria-current={active && !selectedExpenseCategoryId ? "page" : undefined}
                    className={active && !selectedExpenseCategoryId ? "active" : ""}
                    href={item.href}
                    onClick={onNavigate}
                    title={item.label}
                  >
                    <Icon size={19} />
                    <span>{item.label}</span>
                  </Link>
                )}
                {expenseSubmenuOpen ? (
                  <div className="nav-submenu">
                    {expenseCategories.map((category) => {
                      const href = `/transaksi/pengeluaran?categoryId=${encodeURIComponent(category.id)}`;
                      const categoryActive = active && selectedExpenseCategoryId === category.id;
                      return (
                        <Link
                          aria-current={categoryActive ? "page" : undefined}
                          className={categoryActive ? "active" : ""}
                          href={href}
                          key={category.id}
                          onClick={onNavigate}
                          title={category.name}
                        >
                          <span>{category.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
                {cashbookSubmenuOpen ? (
                  <div className="nav-submenu">
                    <Link
                      aria-current={active && !selectedCashType && !selectedCashExpenseCategoryId ? "page" : undefined}
                      className={active && !selectedCashType && !selectedCashExpenseCategoryId ? "active" : ""}
                      href="/buku-kas"
                      onClick={onNavigate}
                      title="Semua Buku Kas"
                    >
                      <span>Semua Buku Kas</span>
                    </Link>
                    <Link
                      aria-current={active && selectedCashType === "MASUK" ? "page" : undefined}
                      className={active && selectedCashType === "MASUK" ? "active" : ""}
                      href="/buku-kas?type=MASUK"
                      onClick={onNavigate}
                      title="Kas Masuk"
                    >
                      <span>Kas Masuk</span>
                    </Link>
                    {expenseCategories.map((category) => {
                      const href = `/buku-kas?type=KELUAR&expenseCategoryId=${encodeURIComponent(category.id)}`;
                      const categoryActive = active && selectedCashExpenseCategoryId === category.id;
                      return (
                        <Link
                          aria-current={categoryActive ? "page" : undefined}
                          className={categoryActive ? "active" : ""}
                          href={href}
                          key={category.id}
                          onClick={onNavigate}
                          title={`Pengeluaran ${category.name}`}
                        >
                          <span>{category.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
                {accountingSubmenuOpen ? (
                  <div className="nav-submenu">
                    <Link
                      aria-current={active && !selectedAccountingSource && !selectedAccountingExpenseCategoryId ? "page" : undefined}
                      className={active && !selectedAccountingSource && !selectedAccountingExpenseCategoryId ? "active" : ""}
                      href="/akuntansi"
                      onClick={onNavigate}
                      title="Semua Akuntansi"
                    >
                      <span>Semua Akuntansi</span>
                    </Link>
                    <Link
                      aria-current={active && selectedAccountingSource === "PAYMENT" ? "page" : undefined}
                      className={active && selectedAccountingSource === "PAYMENT" ? "active" : ""}
                      href="/akuntansi?source=PAYMENT"
                      onClick={onNavigate}
                      title="Pembayaran"
                    >
                      <span>Pembayaran</span>
                    </Link>
                    <Link
                      aria-current={active && selectedAccountingSource === "CASH" ? "page" : undefined}
                      className={active && selectedAccountingSource === "CASH" ? "active" : ""}
                      href="/akuntansi?source=CASH"
                      onClick={onNavigate}
                      title="Buku Kas Manual"
                    >
                      <span>Buku Kas Manual</span>
                    </Link>
                    {expenseCategories.map((category) => {
                      const href = `/akuntansi?source=EXPENSE&expenseCategoryId=${encodeURIComponent(category.id)}`;
                      const categoryActive = active && selectedAccountingExpenseCategoryId === category.id;
                      return (
                        <Link
                          aria-current={categoryActive ? "page" : undefined}
                          className={categoryActive ? "active" : ""}
                          href={href}
                          key={category.id}
                          onClick={onNavigate}
                          title={`Pengeluaran ${category.name}`}
                        >
                          <span>{category.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children, expenseCategories, user, permissions }: AppShellProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const selectedExpenseCategoryId = searchParams.get("categoryId") ?? "";
  const selectedAccountingExpenseCategoryId = searchParams.get("expenseCategoryId") ?? "";
  const selectedAccountingSource = searchParams.get("source") ?? "";
  const selectedCashExpenseCategoryId = searchParams.get("expenseCategoryId") ?? "";
  const selectedCashType = searchParams.get("type") ?? "";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSidebarCollapsed(window.localStorage.getItem("spp-sidebar-collapsed") === "true");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const currentItem = navGroups
    .flatMap((group) => group.items)
    .find((item) => isActivePath(pathname, item.href));
  const CurrentIcon = currentItem?.icon ?? LayoutDashboard;
  const pageTitle = currentItem?.label ?? "Sistem Keuangan";

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    window.localStorage.setItem("spp-sidebar-collapsed", String(next));
  }

  return (
    <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand">
          <Link className="brand-logo" href="/dashboard" aria-label="Dashboard">
            <GraduationCap size={31} />
          </Link>
          <div className="brand-copy">
            <strong>SIKAS</strong>
            <small className="brand-subtitle">Sistem Keuangan Sekolah Menengah Pertama</small>
          </div>
          <button className="sidebar-mobile-close" onClick={() => setMobileOpen(false)} title="Tutup menu" type="button">
            <X size={20} />
          </button>
        </div>

        <Navigation
          expenseCategories={expenseCategories}
          isSuperadminUser={user.role === "SUPERADMIN"}
          permissions={permissions}
          pathname={pathname}
          selectedAccountingExpenseCategoryId={selectedAccountingExpenseCategoryId}
          selectedAccountingSource={selectedAccountingSource}
          selectedCashExpenseCategoryId={selectedCashExpenseCategoryId}
          selectedCashType={selectedCashType}
          selectedExpenseCategoryId={selectedExpenseCategoryId}
          onNavigate={() => setMobileOpen(false)}
        />

        <footer className="sidebar-credit">
          <strong>SMP Nusantara</strong>
          <span>&copy; 2026 Sistem Keuangan Sekolah</span>
        </footer>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} title="Buka menu" type="button">
            <Menu size={20} />
          </button>
          <button
            aria-label={sidebarCollapsed ? "Perluas sidebar" : "Minimalkan sidebar"}
            className="icon-button sidebar-toggle"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Perluas sidebar" : "Minimalkan sidebar"}
            type="button"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>

          <div className="topbar-page">
            <CurrentIcon size={24} />
            <div>
              <span>Sistem Keuangan SMP</span>
              <h1>{pageTitle}</h1>
            </div>
            <LiveClock />
          </div>

          <div className="top-actions">
            <div className="user-chip">
              <BookOpenCheck size={18} />
              <span>{user.name}</span>
              <small>{user.roleName ?? user.role}</small>
            </div>
            <form action={logoutAction}>
              <button className="icon-button danger-icon" type="submit" title="Keluar">
                <LogOut size={20} />
              </button>
            </form>
          </div>
        </header>

        {mobileOpen ? (
          <button className="scrim" onClick={() => setMobileOpen(false)} aria-label="Tutup menu" type="button" />
        ) : null}

        <div className="content-area">{children}</div>
      </section>
    </main>
  );
}
