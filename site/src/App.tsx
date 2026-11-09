import { Empty, LinkButton } from "@cloudflare/kumo";
import { useEffect } from "react";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { HomePage } from "./pages/HomePage";
import { RfcPage } from "./pages/RfcPage";
import { onInternalClick, usePathname } from "./router";

const TITLES: Record<string, string> = {
  "/": "Intent UI",
  "/rfc": "RFC 0001: Intents and Persistence · Intent UI",
};

export default function App() {
  const pathname = usePathname().replace(/\/+$/, "") || "/";
  useEffect(() => {
    document.title = TITLES[pathname] ?? "Not found · Intent UI";
  }, [pathname]);

  return (
    // The frame (see .hatch in index.css): a bordered column over a cross-hatched page.
    <div className="hatch min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col bg-kumo-canvas min-[72rem]:border-x min-[72rem]:border-kumo-line">
        <SiteHeader />
        <div className="flex-1">
          {pathname === "/" ? (
            <HomePage />
          ) : pathname === "/rfc" ? (
            <RfcPage />
          ) : (
            <div className="px-4 py-32">
              <Empty
                title="Page not found"
                description="There's nothing at this address."
                contents={
                  <LinkButton href="/" onClick={onInternalClick} variant="secondary">
                    Go home
                  </LinkButton>
                }
              />
            </div>
          )}
        </div>
        <SiteFooter />
      </div>
    </div>
  );
}
