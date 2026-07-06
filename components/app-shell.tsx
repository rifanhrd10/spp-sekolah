"use client";

import {
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Calculator,
  ClipboardList,
  Cog,
  FolderTree,
  GraduationCap,
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
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/actions";
import { LiveClock } from "@/components/live-clock";

type AppShellProps = {
  children: React.ReactNode;
  user: {
    name: string;
    email: string;
    role: string;
  };
  permissions: PermissionKey[];
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: PermissionKey;
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
    ],
  },
];

function roleText(role: string) {
  const labels: Record<string, string> = {
    ADMIN: "Administrator",
    BENDAHARA: "Bendahara",
    KEPALA_SEKOLAH: "Kepala Sekolah",
  };

  return labels[role] ?? role;
}

function isActivePath(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function Navigation({
  permissions,
  pathname,
  onNavigate,
}: {
  permissions: PermissionKey[];
  pathname: string;
  onNavigate: () => void;
}) {
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => permissions.includes(item.permission)),
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
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={active ? "active" : ""}
                href={item.href}
                key={item.href}
                onClick={onNavigate}
                title={item.label}
              >
                <Icon size={19} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AppShell({ children, user, permissions }: AppShellProps) {
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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

        <Navigation permissions={permissions} pathname={pathname} onNavigate={() => setMobileOpen(false)} />

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
              <small>{roleText(user.role)}</small>
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
