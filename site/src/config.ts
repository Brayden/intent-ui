/** Where the source lives. Relative links in the RFC resolve against this. */
export const REPO_URL = "https://github.com/Brayden/intent-ui";
export const REPO_BRANCH = "main";

/** The RFC the site presents, as a path in the repo. */
export const RFC_PATH = "docs/rfcs/0003-intents-and-persistence.md";

/**
 * The example video the home page's pill opens. Either a video file (put it in `site/public`,
 * e.g. "/intent-ui-demo.mp4") or an embed URL (YouTube "https://www.youtube.com/embed/…",
 * Vimeo "https://player.vimeo.com/video/…"). Empty shows a "coming soon" state.
 */
export const DEMO_VIDEO = {
  src: "/demo.mp4",
  poster: "/demo-poster.jpg",
  title: "Intent UI in action",
  description: "Build a page from a sentence, click into something that doesn't exist yet, and reload to find it all still there.",
};
