import { PermissionKey } from "@prisma/client";
import Image from "next/image";
import { saveReceiptSetting } from "@/app/actions";
import { NoticeFromParams, type PageSearchParams } from "@/components/notice-from-params";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ReceiptSettingsPage({ searchParams }: { searchParams: PageSearchParams }) {
  await requirePermission(PermissionKey.RECEIPT_SETTING);
  const setting = await prisma.receiptSetting.findUnique({ where: { id: "default" } });

  return <main className="page">
    <NoticeFromParams searchParams={searchParams} />
    <section className="content-grid two">
      <div className="panel">
        <div className="panel-header"><h3>Identitas Kwitansi</h3><span>Digunakan pada bukti pembayaran</span></div>
        <form action={saveReceiptSetting} className="form-stack">
          <label>Nama Sekolah<input defaultValue={setting?.schoolName} name="schoolName" required /></label>
          <label>Alamat Sekolah<textarea defaultValue={setting?.schoolAddress} name="schoolAddress" required /></label>
          <div className="field-grid"><label>Telepon<input defaultValue={setting?.schoolPhone ?? ""} name="schoolPhone" /></label><label>URL Logo<input defaultValue={setting?.logoUrl ?? ""} name="logoUrl" placeholder="https://..." /></label></div>
          <label>Header Nota<input defaultValue={setting?.headerText ?? ""} name="headerText" /></label>
          <label>Footer Nota<textarea defaultValue={setting?.footerText ?? ""} name="footerText" /></label>
          <div className="field-grid"><label>Nama Penanda Tangan<input defaultValue={setting?.signatureName ?? ""} name="signatureName" /></label><label>Jabatan<input defaultValue={setting?.signatureTitle ?? ""} name="signatureTitle" /></label></div>
          <div className="form-actions"><button className="btn btn-save" type="submit">Simpan Pengaturan</button></div>
        </form>
      </div>
      <div className="panel">
        <div className="panel-header"><h3>Pratinjau Kwitansi</h3><span>Tampilan ringkas format cetak</span></div>
        <div className="p-8 text-center">
          {setting?.logoUrl ? <Image alt="Logo sekolah" className="mx-auto mb-3 size-16 object-contain" height={64} src={setting.logoUrl} unoptimized width={64} /> : null}
          <h3 className="text-xl font-bold">{setting?.schoolName}</h3>
          <p className="mt-1 text-sm text-slate-500">{setting?.schoolAddress}</p>
          <p className="text-sm text-slate-500">{setting?.schoolPhone}</p>
          <div className="my-5 border-t-2 border-slate-900" />
          <strong>{setting?.headerText}</strong>
          <p className="mt-20 border-t border-slate-200 pt-4 text-xs text-slate-500">{setting?.footerText}</p>
        </div>
      </div>
    </section>
  </main>;
}
