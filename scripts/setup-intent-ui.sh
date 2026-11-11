#!/usr/bin/env bash
# Builds the Intent UI SDK from GitHub and installs it into this project.
#
# Usage (from your project, where package.json is):
#   ./scripts/setup-intent-ui.sh             # clone or update, build, pack, install
#   ./scripts/setup-intent-ui.sh --no-pull   # rebuild from the checkout as it is (e.g. local SDK edits)
#
# Settings (environment variables):
#   INTENT_UI_DIR     where to keep the SDK checkout   (default: ../intent-ui)
#   INTENT_UI_REPO    git URL                          (default: https://github.com/Brayden/intent-ui.git)
#   INTENT_UI_BRANCH  branch                           (default: sdk-scaffold)
#   INTENT_UI_VENDOR  where the .tgz packages go, relative to this project (default: vendor/intent-ui)
#
# Re-run it any time to pick up SDK changes. Your app's code and config are not touched; see the
# steps printed at the end.
set -euo pipefail

PROJECT_DIR="$(pwd)"
INTENT_UI_DIR="${INTENT_UI_DIR:-$PROJECT_DIR/../intent-ui}"
INTENT_UI_REPO="${INTENT_UI_REPO:-https://github.com/Brayden/intent-ui.git}"
INTENT_UI_BRANCH="${INTENT_UI_BRANCH:-sdk-scaffold}"
INTENT_UI_VENDOR="${INTENT_UI_VENDOR:-vendor/intent-ui}"
PULL=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    -h|--help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[31mError:\033[0m %s\n' "$*" >&2; exit 1; }

[ -f "$PROJECT_DIR/package.json" ] || fail "Run this from your project's folder (the one with package.json)."
command -v git >/dev/null || fail "git is required."
command -v node >/dev/null || fail "Node.js is required."
command -v npm >/dev/null || fail "npm is required (it builds the SDK)."

# The SDK's build uses Bun.
if ! command -v bun >/dev/null; then
  if [ -x "$HOME/.bun/bin/bun" ]; then
    export PATH="$HOME/.bun/bin:$PATH"
  else
    step "Installing Bun (needed to build the SDK)"
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
  fi
fi

# 1. Get the SDK source.
if [ ! -d "$INTENT_UI_DIR/.git" ]; then
  step "Cloning $INTENT_UI_REPO ($INTENT_UI_BRANCH) into $INTENT_UI_DIR"
  git clone --branch "$INTENT_UI_BRANCH" "$INTENT_UI_REPO" "$INTENT_UI_DIR"
elif [ "$PULL" = 1 ]; then
  step "Updating $INTENT_UI_DIR to the latest $INTENT_UI_BRANCH"
  if [ -n "$(git -C "$INTENT_UI_DIR" status --porcelain --untracked-files=no)" ]; then
    fail "$INTENT_UI_DIR has uncommitted changes. Commit or stash them, or re-run with --no-pull to build it as it is."
  fi
  git -C "$INTENT_UI_DIR" fetch origin "$INTENT_UI_BRANCH"
  git -C "$INTENT_UI_DIR" checkout "$INTENT_UI_BRANCH"
  git -C "$INTENT_UI_DIR" merge --ff-only "origin/$INTENT_UI_BRANCH"
else
  step "Using $INTENT_UI_DIR as it is (--no-pull)"
fi
INTENT_UI_DIR="$(cd "$INTENT_UI_DIR" && pwd)"
echo "SDK commit: $(git -C "$INTENT_UI_DIR" log -1 --format='%h %s')"

# 2. Build the three packages.
step "Installing the SDK's build dependencies"
(cd "$INTENT_UI_DIR" && if [ -f package-lock.json ]; then npm ci; else npm install; fi)
step "Building @intent-ui/react, @intent-ui/server and @intent-ui/build-plugin"
(cd "$INTENT_UI_DIR" && npm run sdk:build)
for built in react/dist/index.js react/dist/styles.css server/dist/index.js build-plugin/dist/vite.js; do
  [ -f "$INTENT_UI_DIR/packages/$built" ] || fail "The SDK build didn't produce packages/$built. Check the build output above."
done

# 3. Pack them into this project.
VENDOR_DIR="$PROJECT_DIR/$INTENT_UI_VENDOR"
step "Packing into $INTENT_UI_VENDOR/"
mkdir -p "$VENDOR_DIR"
rm -f "$VENDOR_DIR"/intent-ui-*.tgz
for pkg in react server build-plugin; do
  (cd "$INTENT_UI_DIR/packages/$pkg" && npm pack --silent --pack-destination "$VENDOR_DIR" >/dev/null)
done
TARBALLS=()
for f in "$VENDOR_DIR"/intent-ui-*.tgz; do TARBALLS+=("./$INTENT_UI_VENDOR/$(basename "$f")"); done
printf '  %s\n' "${TARBALLS[@]}"

# 4. Install them (plus the React package's peer dependencies) with this project's package manager.
PEERS=(@cloudflare/kumo @phosphor-icons/react)
root="$PROJECT_DIR"; pm=""
while [ -z "$pm" ]; do
  if [ -f "$root/pnpm-lock.yaml" ]; then pm=pnpm
  elif [ -f "$root/yarn.lock" ]; then pm=yarn
  elif [ -f "$root/bun.lockb" ] || [ -f "$root/bun.lock" ]; then pm=bun
  elif [ -f "$root/package-lock.json" ] || [ "$root" = "/" ]; then pm=npm
  else root="$(dirname "$root")"; fi
done
step "Installing into $(basename "$PROJECT_DIR") with $pm"
case "$pm" in
  pnpm) pnpm add "${TARBALLS[@]}" "${PEERS[@]}" ;;
  yarn) yarn add $(printf 'file:%s ' "${TARBALLS[@]}") "${PEERS[@]}" ;;
  bun)  bun add "${TARBALLS[@]}" "${PEERS[@]}" ;;
  npm)  npm install "${TARBALLS[@]}" "${PEERS[@]}" ;;
esac

react_version="$(node -p "require(require.resolve('react/package.json', { paths: ['$PROJECT_DIR'] })).version" 2>/dev/null || echo "not found")"
case "$react_version" in
  18.*|19.*) ;;
  *) printf '\n\033[33mWarning:\033[0m this project resolves React %s; the SDK needs React 18 or 19.\n' "$react_version" ;;
esac

cat <<EOF

$(printf '\033[32mDone.\033[0m') Intent UI SDK ($(git -C "$INTENT_UI_DIR" log -1 --format=%h)) is installed (React $react_version).

Decide whether to commit $INTENT_UI_VENDOR/ (teammates and CI can install without building the
SDK) or add it to .gitignore (everyone runs this script).

If you haven't wired it up yet:
  1. Worker: mount createIntentUIHandler from "@intent-ui/server", export WorkspaceStore,
     WorkspaceDirectory and ConnectionsStore, and add the Durable Object bindings, migration and
     nodejs_compat to wrangler.jsonc. Put ANTHROPIC_API_KEY in .dev.vars.
  2. Build: add intentUI() from "@intent-ui/build-plugin/vite" before react() in vite.config
     (Next.js: withIntentUI from "@intent-ui/build-plugin/next").
  3. React: wrap your app in <IntentUIProvider endpoint="..."> and import "@intent-ui/react/styles.css".
Full guide: $INTENT_UI_DIR/packages/README.md
EOF
