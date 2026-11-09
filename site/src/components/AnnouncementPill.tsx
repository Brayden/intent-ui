import { ArrowRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";

/**
 * The pill above the hero heading: a label and an arrow. On hover the border and fill lift, the
 * label brightens, and the arrow slides forward; keyboard focus adds a focus ring.
 */
export function AnnouncementPill({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-kumo-line bg-kumo-base py-1 pr-3 pl-3.5 text-sm text-kumo-subtle shadow-xs transition-all duration-200 hover:border-kumo-brand/40 hover:bg-kumo-tint hover:text-kumo-default hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kumo-focus"
    >
      <span>{children}</span>
      <ArrowRight weight="bold" className="size-3.5 text-kumo-default transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  );
}
