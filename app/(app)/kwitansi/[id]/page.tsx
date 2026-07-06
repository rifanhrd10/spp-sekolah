import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { currency, shortDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [payment, setting] = await Promise.all([
    prisma.payment.findUnique({
      where: { id },
      include: { invoice: { include: { student: { include: { classRoom: true } }, payments: { where: { deletedAt: null }, select: { amount: true } } } } },
    }),
    prisma.receiptSetting.findUnique({ where: { id: "default" } }),
  ]);
  if (!payment) notFound();
  const totalPaid = payment.invoice.payments.reduce((sum, item) => sum + item.amount, 0);
  const remaining = Math.max(payment.invoice.amount - totalPaid, 0);

  return <main className="mx-auto max-w-4xl">
    <div className="no-print mb-5 flex items-center justify-between gap-3">
      <Link className="btn btn-cancel" href="/transaksi/pembayaran">Kembali</Link>
      <PrintButton />
    </div>
    <article className="rounded-xl border border-slate-200 bg-white p-10 shadow-sm print:border-0 print:p-0 print:shadow-none">
      <header className="flex items-start justify-between gap-6 border-b-2 border-slate-900 pb-5">
        <div className="flex items-start gap-4">
          {setting?.logoUrl ? <Image alt="Logo sekolah" className="size-20 object-contain" height={80} src={setting.logoUrl} unoptimized width={80} /> : null}
          <div><h1 className="text-2xl font-bold">{setting?.schoolName ?? "Sekolah"}</h1><p className="mt-1 text-sm text-slate-600">{setting?.schoolAddress}</p><p className="text-sm text-slate-600">{setting?.schoolPhone}</p></div>
        </div>
        <div className="text-right"><strong className="text-lg">{setting?.headerText ?? "KWITANSI"}</strong><p className="mt-1 text-sm text-slate-500">{payment.receiptNo}</p></div>
      </header>
      <section className="grid gap-3 py-7 text-sm">
        <div className="grid grid-cols-[150px_1fr]"><span className="text-slate-500">Telah diterima dari</span><strong>{payment.invoice.student.guardianName}</strong></div>
        <div className="grid grid-cols-[150px_1fr]"><span className="text-slate-500">Untuk siswa</span><strong>{payment.invoice.student.name} / {payment.invoice.student.classRoom?.name ?? payment.invoice.student.classNameSnapshot ?? "-"}</strong></div>
        <div className="grid grid-cols-[150px_1fr]"><span className="text-slate-500">Pembayaran</span><strong>{payment.invoice.title}</strong></div>
        <div className="grid grid-cols-[150px_1fr]"><span className="text-slate-500">Tanggal / metode</span><strong>{shortDate(payment.paidAt)} / {payment.method}</strong></div>
      </section>
      <section className="grid grid-cols-3 border-y border-slate-200 py-5 text-center">
        <div><span className="text-xs font-bold uppercase text-slate-400">Dibayar</span><strong className="mt-1 block text-xl text-emerald-700">{currency(payment.amount)}</strong></div>
        <div className="border-x border-slate-200"><span className="text-xs font-bold uppercase text-slate-400">Total Terbayar</span><strong className="mt-1 block text-xl">{currency(totalPaid)}</strong></div>
        <div><span className="text-xs font-bold uppercase text-slate-400">Sisa Tagihan</span><strong className="mt-1 block text-xl text-amber-700">{currency(remaining)}</strong></div>
      </section>
      <footer className="mt-8 grid grid-cols-[1fr_220px] gap-10">
        <div><p className="text-xs text-slate-500">{setting?.footerText}</p><p className="mt-3 text-xs text-slate-400">Kwitansi dibuat otomatis oleh Sistem Keuangan Sekolah.</p></div>
        <div className="text-center text-sm"><p>{setting?.signatureTitle}</p><div className="h-16" /><strong className="border-b border-slate-700 px-4">{setting?.signatureName ?? payment.receivedBy}</strong></div>
      </footer>
    </article>
  </main>;
}
