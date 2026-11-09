import { Button, LinkButton } from "@cloudflare/kumo";
// Restore with the commented-out GitHub button and pill below:
// import { GithubLogo } from "@phosphor-icons/react";
// import { REPO_URL } from "../config";
// import { AnnouncementPill } from "../components/AnnouncementPill";
import { ArrowRight } from "@phosphor-icons/react";
import { useState } from "react";
import { HatchBand } from "../components/Hatch";
import { VideoDialog } from "../components/VideoDialog";
import { onInternalClick } from "../router";

const STEPS = [
  {
    title: "Say what you need",
    body: "Ask for a view of your work. Intent UI builds a page from your connected data, declared as sources rather than pasted into the UI, so it stays live.",
  },
  {
    title: "Click what isn't built yet",
    body: "Buttons and rows can carry an intent. The first click generates that UI; every click after reuses it instantly, with no model call.",
  },
  {
    title: "Keep it, replay it",
    body: "Every page is a saved document. Reload it, share it, or render it with any component library, and it comes back the same.",
  },
];

export function HomePage() {
  const [videoOpen, setVideoOpen] = useState(false);
  return (
    <main>
      <VideoDialog open={videoOpen} onClose={() => setVideoOpen(false)} />
      <section className="mx-auto max-w-3xl px-4 pt-24 pb-20 text-center sm:px-6 sm:pt-32">
        {/* <AnnouncementPill onClick={() => setVideoOpen(true)}>Watch an example video</AnnouncementPill> */}
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance text-kumo-strong sm:text-6xl">
          Interfaces that build themselves around intent
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-pretty text-kumo-subtle">
          Intent UI is continuously generative UI: describe what you need and a page is built from your data, generated lazily
          where you go next, and saved as a document anyone can reload, replay and render with their own components.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <LinkButton href="/rfc" onClick={onInternalClick} variant="primary" size="lg">
            Read the RFC
            <ArrowRight weight="bold" />
          </LinkButton>
          {/* <LinkButton href={REPO_URL} external variant="secondary" size="lg" icon={GithubLogo}>
            View on GitHub
          </LinkButton> */}
          <Button variant="secondary" size="lg" onClick={() => setVideoOpen(true)}>Watch demo</Button>
        </div>
      </section>

      <HatchBand />

      <section aria-labelledby="how">
        <h2 id="how" className="border-b border-kumo-line px-4 py-4 text-sm font-medium tracking-wide text-kumo-subtle uppercase sm:px-6">
          How it works
        </h2>
        <ol className="grid divide-y divide-kumo-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {STEPS.map((step, index) => (
            <li key={step.title} className="p-6 sm:p-8">
              <span className="font-mono text-sm text-kumo-subtle">0{index + 1}</span>
              <h3 className="mt-3 font-semibold text-kumo-strong">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-kumo-subtle">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <HatchBand className="border-b-0" />
    </main>
  );
}
