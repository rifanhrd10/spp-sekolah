import Link from "next/link";
import type { LucideIcon } from "lucide-react";

export type WorkbookTab = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export function WorkbookTabs({
  active,
  pathname,
  preserve = {},
  tabs,
}: {
  active: string;
  pathname: string;
  preserve?: Record<string, string>;
  tabs: WorkbookTab[];
}) {
  return (
    <nav aria-label="Sheet data" className="workbook-tabs">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const params = new URLSearchParams();
        params.set("sheet", tab.key);
        for (const [key, value] of Object.entries(preserve)) {
          if (key !== "sheet" && value) params.set(key, value);
        }
        return (
          <Link
            className={`workbook-tab ${active === tab.key ? "active" : ""}`}
            href={`${pathname}?${params.toString()}`}
            key={tab.key}
            title={tab.description}
          >
            <Icon size={16} />
            <span>
              <strong>{tab.label}</strong>
              <small>{tab.description}</small>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
