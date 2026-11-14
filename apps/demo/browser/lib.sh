#!/usr/bin/env bash
# Shared helpers for the scripted agent-browser pass. Source it; it expects BASE and SID.

BASE="${BASE:-http://localhost:3040}"
SID="${SID:-$(agent-browser session id --scope worktree --prefix qg)}"

ab() { agent-browser --session "$SID" "$@"; }
js() { ab eval "$1" | tail -1; }
say() { printf '\n== %s\n' "$1"; }
note() { printf '   %s: %s\n' "$1" "$2"; }
go() { ab open "$BASE$1" >/dev/null; sleep "${2:-3}"; }
settle() { sleep "${1:-1.5}"; }
click() { ab click "$1" >/dev/null; settle "${2:-0.6}"; }
key() { ab press "$1" >/dev/null; settle "${2:-0.3}"; }

center() {
  js "(() => { const b = document.querySelector('$1').getBoundingClientRect(); return Math.round(b.left + b.width / 2) + ' ' + Math.round(b.top + b.height / 2); })()" | tr -d '"'
}

# dragby <selector> <dx> <dy> [hold]: press on the element, move in four steps, release unless hold is set
dragby() {
  local c; c=($(center "$1")); local x=${c[0]} y=${c[1]}
  ab mouse move "$x" "$y" >/dev/null
  ab mouse down >/dev/null
  for i in 1 2 3 4; do
    ab mouse move $((x + $2 * i / 4)) $((y + $3 * i / 4)) >/dev/null
  done
  if [ -z "$4" ]; then ab mouse up >/dev/null; fi
  settle 0.5
}

# dragto <from selector> <to selector> [hold]
dragto() {
  local a b; a=($(center "$1")); b=($(center "$2"))
  ab mouse move "${a[0]}" "${a[1]}" >/dev/null
  ab mouse down >/dev/null
  for i in 1 2 3 4 5 6; do
    ab mouse move $((a[0] + (b[0] - a[0]) * i / 6)) $((a[1] + (b[1] - a[1]) * i / 6)) >/dev/null
  done
  if [ -z "$3" ]; then ab mouse up >/dev/null; fi
  settle 0.8
}

text() { js "document.querySelector('$1')?.textContent ?? null"; }
count() { text '[data-count]'; }
source_of() { js "document.querySelector('[data-count]')?.dataset.countSource ?? null"; }
total() { js "document.querySelector('[data-part=total]')?.textContent ?? null"; }
chips() { js "[...document.querySelectorAll('[data-chip]')].map((e) => e.textContent).join(' | ')"; }
url() { js "location.pathname + location.search"; }
loaded() { js "document.querySelector('[data-status=loaded]')?.textContent ?? null"; }
unavailable() { js "[...document.querySelectorAll('[data-part=filter-bar] [data-unavailable]')].map((e) => e.dataset.field).join(',')"; }
width() { js "Math.round(document.querySelector('[data-header=$1]').getBoundingClientRect().width)"; }
headers() { js "[...document.querySelectorAll('[data-header]')].map((e) => e.dataset.header).slice(0, ${1:-8}).join(',')"; }
errors() { ab errors 2>&1 | grep -v '^✗ *$' | head -20; }

# pick <field> <option...>: open a filter-bar select and choose options; a multi-select stays open, so close it
pick() {
  local field="$1"; shift
  click "[data-part=filter-bar] [data-filter=\"$field\"]"
  for option in "$@"; do click "[data-option=\"$option\"]"; done
  ab press Escape >/dev/null; settle 1.2
}

reset_columns() {
  js "localStorage.removeItem('query-grid:orders:columns'); localStorage.removeItem('query-grid:tasks:columns'); 'cleared'" >/dev/null
}
