import { GraduationCap, LockKeyhole, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { Notice } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-shell login-shell">
      <section className="auth-layout">
        <div className="auth-hero">
          <div className="auth-hero-surface">
            <div className="auth-identity">
              <div className="auth-identity-logo">
                <GraduationCap size={42} />
              </div>
              <div className="auth-identity-office">
                <strong>SMP NUSANTARA</strong>
                <span>Sistem Informasi Keuangan Sekolah</span>
              </div>
              <div className="auth-identity-divider" />
              <div className="auth-identity-app">
                <h1>SIKAS</h1>
                <p>Sistem Keuangan Sekolah Menengah Pertama</p>
              </div>
            </div>

            <div className="auth-hero-copy">
              <span className="auth-kicker">Portal Keuangan Sekolah</span>
              <h2>Kelola tagihan, pembayaran, dan laporan dalam satu sistem terpadu.</h2>
              <p>Data rapi, proses cepat, dan informasi keuangan mudah dipantau oleh pihak sekolah.</p>
              <small className="auth-footer-copy">&copy; 2026 SMP Nusantara</small>
            </div>
          </div>
        </div>

        <section className="login-panel">
          <div className="login-card">
            <div className="login-brand">
              <div className="login-brand-logo">
                <ShieldCheck size={27} />
              </div>
            </div>
            <div className="login-heading">
              <span>Masuk ke Aplikasi</span>
              <h3>Selamat datang di SIKAS</h3>
              <p>Silakan masuk menggunakan akun yang telah terdaftar.</p>
            </div>

            {params.error ? <Notice key="login:error" type="error" message="Email atau password tidak sesuai." /> : null}

            <form action={loginAction} className="form-grid">
              <label className="field">
                <span>Email</span>
                <input
                  autoComplete="username"
                  defaultValue="admin@smp.local"
                  name="email"
                  placeholder="Masukkan email"
                  required
                  type="email"
                />
              </label>
              <label className="field">
                <span>Password</span>
                <PasswordInput defaultValue="admin123" />
              </label>
              <button className="primary-button login-button" type="submit">
                <LockKeyhole size={18} />
                Login
              </button>
            </form>

            <details className="demo-account">
              <summary>Akun demo lokal</summary>
              <span>Admin: admin@smp.local / admin123</span>
              <span>Bendahara: bendahara@smp.local / bendahara123</span>
              <span>Kepala Sekolah: kepala@smp.local / kepala123</span>
            </details>
            <div className="auth-panel-footer">&copy; 2026 SMP Nusantara</div>
          </div>
        </section>
      </section>
    </main>
  );
}
