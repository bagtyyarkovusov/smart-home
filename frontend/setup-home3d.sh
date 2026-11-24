#!/bin/sh
set -eu

cd "$(dirname "$0")"
revision=392bb92cbb5cf13a673795193aadb5e9c62b5bfe
upstream=https://github.com/lohith9/Home_View.git

if [ -e .home3d ]; then
  echo 'The generated frontend already exists at frontend/.home3d.' >&2
  echo 'Move it aside before regenerating it. It may contain a saved mock layout.' >&2
  exit 1
fi

archive=${1:-}
case "$archive" in
  ''|/*) ;;
  *) echo 'Pass an absolute path to the optional Home3D ZIP.' >&2; exit 1 ;;
esac

tmp=$(mktemp -d .home3d-setup.XXXXXX)
trap 'rm -rf "$tmp"' EXIT
trap 'exit 1' HUP INT TERM

if [ -n "$archive" ]; then
  if ! unzip -z "$archive" | tail -n 1 | tr -d '\r' | grep -Fxq "$revision"; then
    echo "Expected a GitHub archive of Home3D revision $revision." >&2
    exit 1
  fi
  unzip -q "$archive" -d "$tmp"
  set -- "$tmp"/*/frontend
  source=$1
else
  git init -q "$tmp/upstream"
  git -C "$tmp/upstream" fetch -q --depth=1 "$upstream" "$revision"
  git -C "$tmp/upstream" checkout -q --detach FETCH_HEAD
  source="$tmp/upstream/frontend"
fi

app="$tmp/app"
mkdir -p "$app/smart-home" "$app/tests"
cp -R "$source/src" "$source/public" "$app/"
for file in index.html package.json package-lock.json vite.config.js eslint.config.js; do
  cp "$source/$file" "$app/"
done
cp integration/*.mjs "$app/smart-home/"
cp workspace/WorkspaceTools.jsx "$app/src/components/layout/"
cp workspace/workspace.css "$app/src/"
mkdir -p "$app/public/fonts"
cp workspace/fonts/* "$app/public/fonts/"
cp tests/editor.spec.ts tests/playwright.config.ts ../docs/contracts/week-13/layout.v1.json "$app/tests/"
patch_file="$PWD/integration/home3d.patch"
(
  # Otherwise git apply discovers the enclosing checkout and skips paths outside
  # the current directory's prefix in that repository.
  GIT_CEILING_DIRECTORIES=$(cd "$tmp" && pwd -P)
  export GIT_CEILING_DIRECTORIES
  cd "$app"
  git apply --no-index --unidiff-zero "$patch_file"
  git apply --no-index --unidiff-zero --reverse --check "$patch_file"
)
mv "$app" .home3d
