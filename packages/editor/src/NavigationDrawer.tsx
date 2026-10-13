import { Drawer } from "@mantine/core";
import type { ReactNode } from "react";
import { tr } from "./i18n";
export function NavigationDrawer({
  opened,
  onChange,
  mobile,
  children,
}: {
  opened: boolean;
  onChange: (value: boolean) => void;
  mobile: boolean;
  children: ReactNode;
}) {
  if (!mobile) return opened ? <aside className="workspace-drawer">{children}</aside> : null;
  return (
    <Drawer
      opened={opened}
      onClose={() => onChange(false)}
      zIndex={200}
      position="left"
      size="min(84vw, 320px)"
      withCloseButton={false}
      title={tr("对话导航")}
      classNames={{ body: "mobile-drawer-body", header: "mobile-drawer-heading" }}
    >
      <div className="drawer-content">{children}</div>
    </Drawer>
  );
}
