import { Notice } from "@/components/ui";

export type PageSearchParams = Promise<Record<string, string | string[] | undefined>>;

function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function NoticeFromParams({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const message = param(params.notice);
  const type = param(params.noticeType);
  return <Notice key={`${type ?? ""}:${message ?? ""}`} message={message} type={type} />;
}
