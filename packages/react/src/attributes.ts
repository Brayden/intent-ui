/** DOM attributes shared by the SDK and the Vite plugin (keep in sync with @intent-ui/build-plugin). */

/** Stable element id added at build time: "<file>:<Component>:<n>". Patches target it. */
export const ID_ATTRIBUTE = "data-iui-id";

/** Marks a subtree Intent UI must never change. Its value is an optional reason. */
export const PROTECTED_ATTRIBUTE = "data-iui-protected";

/** Set on <html>: "on" or "off", for host CSS that should differ while customizations are off. */
export const STATE_ATTRIBUTE = "data-intent-ui";
