import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, strokeWidth = 2, children, ...rest }: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconPlus = (p: P) => <Icon strokeWidth={2.4} {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const IconCheck = (p: P) => <Icon strokeWidth={2.4} {...p}><path d="M20 6L9 17l-5-5" /></Icon>;
export const IconClose = (p: P) => <Icon strokeWidth={2.2} {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const IconSearch = (p: P) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Icon>;
export const IconEdit = (p: P) => <Icon {...p}><path d="M4 20h4L19 9l-4-4L4 16z" /></Icon>;
export const IconTrash = (p: P) => <Icon {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icon>;
export const IconBolt = (p: P) => <Icon strokeWidth={2.2} {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></Icon>;
export const IconShield = (p: P) => <Icon strokeWidth={2.6} {...p}><path d="M12 3l7 3v6c0 4-3 7.5-7 9-4-1.5-7-5-7-9V6z" /><path d="M9 12l2 2 4-4" /></Icon>;
export const IconSignIn = (p: P) => <Icon {...p}><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5" /><path d="M15 12H3" /></Icon>;
export const IconWrench = (p: P) => <Icon {...p}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></Icon>;
export const IconClock = (p: P) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
export const IconRetry = (p: P) => <Icon {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></Icon>;
