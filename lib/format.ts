export function currency(value: number) {
  const sign = value < 0 ? "-" : "";
  const formatted = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 0,
  }).format(Math.abs(value));

  return `${sign}Rp. ${formatted}`;
}

export function shortDate(value: Date | string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function roleLabel(role: string) {
  const labels: Record<string, string> = {
    bendahara: "Bendahara",
    kepala_sekolah: "Kepala Sekolah",
    admin: "Admin",
  };

  return labels[role] ?? "Bendahara";
}

export function paymentTypeLabel(type: string) {
  const labels: Record<string, string> = {
    SPP: "SPP",
    SUMBANGAN: "Sumbangan",
    KEGIATAN: "Kegiatan",
    SERAGAM: "Seragam",
    LAINNYA: "Lain-lain",
  };

  return labels[type] ?? type;
}

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    BELUM_BAYAR: "Belum Bayar",
    CICILAN: "Cicilan",
    LUNAS: "Lunas",
  };

  return labels[status] ?? status;
}
