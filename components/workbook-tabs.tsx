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
  tabs,
}: {
  active: string;
  pathname: string;
  tabs: WorkbookTab[];
}) {
  return (
    <nav aria-label="Sheet data" className="workbook-tabs">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <Link
            className={`workbook-tab ${active === tab.key ? "active" : ""}`}
            href={`${pathname}?sheet=${tab.key}`}
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
