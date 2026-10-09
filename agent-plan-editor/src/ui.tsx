import { ActionIcon, Tooltip } from "@mantine/core";
import type { ButtonHTMLAttributes } from "react";

const paths = {
  nodeSet: "M4 4h16v16H4zM8 9h8M8 13h5M14 16l3-3-3-3",
  nodeAppend: "M4 5h10M4 11h10M4 17h6M18 13v8m-4-4h8",
  nodeConcat: "M8 7H6a5 5 0 0 0 0 10h2m8-10h2a5 5 0 0 1 0 10h-2M8 12h8",
  nodeAdd: "M5 12h14M12 5v14",
  nodeSubtract: "M5 12h14",
  nodeMultiply: "m6 6 12 12M6 18 18 6",
  nodeDivide: "M5 12h14M12 5h.01M12 19h.01",
  nodeEqual: "M5 8h14M5 16h14",
  nodeNotEqual: "M5 8h14M5 16h14M16 3 8 21",
  nodeGreater: "m8 5 9 7-9 7",
  nodeLess: "m16 5-9 7 9 7",
  nodeGreaterEqual: "m7 3 9 6-9 6M6 20h12",
  nodeLessEqual: "m17 3-9 6 9 6M6 20h12",
  nodeAnd: "M5 20V10a7 7 0 0 1 14 0v10M5 20h14",
  nodeOr: "M5 20V6m14 0v14M5 20a14 14 0 0 0 14-14",
  nodeNot: "M5 4v16l12-8L5 4Zm14 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4",
  nodeIf: "M12 2v5m0 0-7 6v7m7-13 7 6v7M2 17l3 3 3-3m8 0 3 3 3-3",
  nodeWhile: "M20 8a8 8 0 0 0-14-2L3 9m0-6v6h6m-5 7a8 8 0 0 0 14 2l3-3m0 6v-6h-6",
  nodeCall: "M3 5h12v14H3M9 12h12m-4-4 4 4-4 4",

  upload: "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
  sidebarClose: "M4 3h16v18H4ZM9 3v18m7-13-4 4 4 4",
  back: "m10 5-7 7 7 7M3 12h18",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a8 8 0 0 1 16 0v2",
  grip: "M8 5h1m6 0h1M8 12h1m6 0h1M8 19h1m6 0h1",
  play: "m7 3 14 9-14 9V3Z",
  next: "m5 4 11 8-11 8V4Zm14 0v16",
  ungroup: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z",
  chevronRight: "m9 5 7 7-7 7",
  undo: "M4 10h10a6 6 0 0 1 0 12M4 10l6-6M4 10l6 6",
  stop: "M5 5h14v14H5Z",
  pause: "M8 4v16M16 4v16",
  send: "m5 12 7-7 7 7M12 5v15",

  edit: "M12 20H4V12M8 16l2-6L19 1l4 4-9 9-6 2Z",
  chat: "M21 11a9 9 0 0 1-9 9H4l-3 3V11a10 10 0 0 1 20 0Z",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  plus: "M12 4v16M4 12h16",
  loop: "M20 8a8 8 0 0 0-14-2L3 9m0-6v6h6m-5 7a8 8 0 0 0 14 2l3-3m0 6v-6h-6",
  settings: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-8 0v6",
  flow: "M4 4h16v4H4zM4 11h10v4H4zM10 18h10v4H10z",
  call: "M9 5 3 12l6 7m6-14 6 7-6 7",
  control: "M6 3v12a5 5 0 0 0 5 5h7M6 9h6a6 6 0 0 0 6-6m-3 0h6m-6 17h6",
  data: "M4 4h16v16H4zM8 8h8M8 12h8M8 16h5",
  text: "M4 5h16M12 5v15M8 20h8",
  math: "M4 7h7M7.5 3.5v7M15 7h6M4 16l7 6m0-6-7 6M15 16h6m-6 5h6",
  logic: "m12 2 10 10-10 10L2 12 12 2ZM8 12l3 3 5-6",
  up: "m5 14 7-7 7 7",
  down: "m5 10 7 7 7-7",
  copy: "M8 8h13v13H8zM16 8V3H3v13h5",
  delete: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  more: "M5 11v2m7-2v2m7-2v2",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function IconButton({
  icon,
  label,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <Tooltip label={label} openDelay={400}>
      <ActionIcon
        {...props}
        type="button"
        className={`icon-button ${className}`}
        aria-label={label}
      >
        <Icon name={icon} />
      </ActionIcon>
    </Tooltip>
  );
}
export function EllipsisText({ text }: { text: string }) {
  return (
    <span className="ellipsis-text" title={text}>
      {text}
    </span>
  );
}
