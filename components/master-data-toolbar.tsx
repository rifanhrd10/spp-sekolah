import type { ReactNode } from "react";

export function MasterDataToolbar({
  actions,
  children,
}: {
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="master-data-toolbar">
      <div className="master-data-toolbar-main">{children}</div>
      {actions ? <div className="master-data-toolbar-actions">{actions}</div> : null}
    </section>
  );
}
