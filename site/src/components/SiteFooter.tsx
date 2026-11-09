import { Link } from "@cloudflare/kumo";

export function SiteFooter() {
  return (
    <footer className="border-t border-kumo-line">
      <div className="flex flex-col gap-2 px-4 py-8 text-sm text-kumo-subtle sm:flex-row sm:justify-between sm:px-6">
        <span>Intent UI — an open draft for intent-driven, replayable generative UI.</span>
        <span>
          © {new Date().getFullYear()}{" "}
          <Link href="https://x.com/BraydenWilmoth" target="_blank" rel="noopener noreferrer" variant="current">
            Brayden Wilmoth
          </Link>
        </span>
      </div>
    </footer>
  );
}
