import kumoBinding from "@cloudflare/kumo/styles/kumo-binding?raw";
import themeFedramp from "@cloudflare/kumo/styles/theme-fedramp?raw";
import themeKumo from "@cloudflare/kumo/styles/theme-kumo?raw";
import tailwindTheme from "tailwindcss/theme.css?raw";
import tailwindUtilities from "tailwindcss/utilities.css?raw";
import { createStyleEngine } from "./engine";

/** The Worker's style engine, loaded with the same Kumo + Tailwind CSS the app uses. */
export const styles = createStyleEngine({
  "kumo-binding.css": kumoBinding,
  "./theme-kumo.css": themeKumo,
  "./theme-fedramp.css": themeFedramp,
  "tailwindcss/theme.css": tailwindTheme,
  "tailwindcss/utilities.css": tailwindUtilities,
});

export { allClasses, collectClasses, styleIssues } from "./collect";
