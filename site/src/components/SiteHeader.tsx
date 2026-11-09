import { Button } from "@cloudflare/kumo";
import { Moon, Sun } from "@phosphor-icons/react";
import { onInternalClick } from "../router";
import { useTheme } from "../theme";

/** The name on the left; the theme toggle in its own framed cell in the top-right corner. */
export function SiteHeader() {
  const { mode, toggle } = useTheme();
  const label = mode === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <header className="sticky top-0 z-10 flex h-14 items-stretch border-b border-kumo-line bg-kumo-canvas">
      <a href="/" onClick={onInternalClick} className="flex items-center px-4 font-semibold text-kumo-strong no-underline sm:px-6">
        Intent UI
      </a>
      <div className="ml-auto flex w-14 items-center justify-center border-l border-kumo-line">
        <Button variant="ghost" shape="square" title={label} aria-label={label} icon={mode === "dark" ? Sun : Moon} onClick={toggle} />
      </div>
    </header>
  );
}
