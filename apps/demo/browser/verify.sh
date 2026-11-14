#!/usr/bin/env bash
# The scripted agent-browser pass behind the README's verification record.
# Usage: BASE=http://localhost:3040 bash apps/demo/browser/verify.sh [section...]
cd "$(dirname "$0")" && . ./lib.sh

run_refusals() {
  say "The server refuses the rest (curl)"
  for path in \
    "/api/orders?f.channel=web&sort=total.desc" \
    "/api/orders?f.status_code=nope" \
    "/api/orders?limit=abc" \
    "/api/orders/nope"; do
    note "$path" "$(curl -s -m 60 -w ' [%{http_code}]' "$BASE$path" | cut -c1-200)"
  done
  note "limit=100000 rows" "$(curl -s -m 60 "$BASE/api/orders?limit=100000" | grep -o '"id"' | wc -l | tr -d ' ')"
  local many=""
  for i in $(seq 1 21); do many="$many&f.customer_id=00000000-0000-7000-8000-$(printf '%012d' "$i")"; done
  note "21 customer values" "$(curl -s -m 60 -w ' [%{http_code}]' "$BASE/api/orders?${many:1}" | cut -c1-200)"
  note "POST /status completed->pending" "$(curl -s -m 60 -w ' [%{http_code}]' -X POST -H 'content-type: application/json' \
    -d "{\"id\":\"$(curl -s -m 60 "$BASE/api/orders?f.status_code=completed&limit=1" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)\",\"to\":\"pending\"}" \
    "$BASE/api/orders/status" | cut -c1-200)"
  note "GET /status" "$(curl -s -m 60 -o /dev/null -w '%{http_code}' "$BASE/api/orders/status")"
  note "headers" "$(curl -s -m 60 -D - -o /dev/null "$BASE/api/orders/count" | grep -i 'cache-control\|server-timing' | tr -d '\r' | tr '\n' ' ')"
}

run_counts() {
  say "Counts from the counter table"
  go "/orders" 4
  reset_columns; go "/orders" 4
  note "default" "$(count) [$(source_of)]"
  note "facet counts" "$(js "[...document.querySelectorAll('[data-facet]')].map((e) => e.textContent).join(' | ')")"
  pick status_code paid
  note "Paid" "$(count) [$(source_of)] url $(url)"
  note "total" "$(total)"
  go "/orders?f.region=gauteng" 4
  note "Region Gauteng facet counts" "$(js "[...document.querySelectorAll('[data-facet-count]')].map((e) => e.textContent).join('|')")"
  note "facet note" "$(text '.qg-facet-note')"

  say "Capped count, then exact"
  go "/orders?f.status_code=paid&r.total=20000..60000&sort=total.desc" 5
  note "capped" "$(count) [$(source_of)]"
  note "total" "$(total)"
  click '[data-count-exact]' 6
  note "exact" "$(count) [$(source_of)]"

  say "Totals"
  go "/orders?f.status_code=paid&r.created_at=2026-11-01T00:00:00.000000Z..2026-11-07T23:59:59.999999Z" 5
  note "Paid in a week" "$(count); $(total)"
}

run_sidebar() {
  say "Filter sidebar"
  go "/orders?f.status_code=paid&sort=total.desc" 4
  click '[data-part=filter-sidebar-trigger]' 1
  note "controls" "$(js "document.querySelectorAll('[data-part=filter-sidebar] [data-field]').length")"
  note "disabled" "$(js "[...document.querySelectorAll('[data-part=filter-sidebar] [data-unavailable]')].map((e) => e.dataset.field + ': ' + e.querySelector('[data-field-reason]')?.textContent).join(' | ')")"
  reveal '[data-part=filter-sidebar] [data-sort=direction]'
  click '[data-part=filter-sidebar] [data-sort=direction]' 2
  note "after direction toggle" "$(url) chips: $(chips)"
  reveal '[data-part=filter-sidebar] [data-filter-clear=status_code]'
  click '[data-part=filter-sidebar] [data-filter-clear=status_code]' 2
  note "after clearing Status" "$(url) count $(count)"
  click '[data-sidebar-close]' 1
}

run_chips() {
  say "Chips and Reset"
  go "/orders" 4
  pick status_code shipped
  pick region gauteng
  note "chips" "$(chips)"
  note "count" "$(count) [$(source_of)]"
  click '[data-chip-remove="eq:region"]' 2
  note "after removing Region" "$(chips); $(count) [$(source_of)]"
  click '[data-chips-reset]' 2
  note "after Reset" "$(chips); $(url); reset disabled $(js "document.querySelector('[data-chips-reset]').disabled")"
}

run_multi() {
  say "Several values per field"
  go "/orders" 4
  pick status_code paid shipped
  note "url" "$(url)"
  note "trigger" "$(text '[data-part=filter-bar] [data-filter=status_code]')"
  note "chips" "$(chips)"
  note "chip removes" "$(js "[...document.querySelectorAll('[data-chip-remove]')].map((e) => e.dataset.chipRemove + '/' + (e.dataset.chipValue ?? '')).join(' ')")"
  note "count" "$(count) [$(source_of)]"
  note "total" "$(total)"
  note "pressed facets" "$(js "[...document.querySelectorAll('[data-facet][aria-pressed=true]')].map((e) => e.dataset.facet).join(',')")"
  note "row statuses" "$(js "[...new Set([...document.querySelectorAll('.qg-cell[data-field=status_code]')].map((e) => e.textContent))].join(',')")"
  note "disabled" "$(unavailable)"
  click '[data-chip-remove="eq:status_code"][data-chip-value="paid"]' 2
  note "after removing Paid" "$(chips); $(count); $(url)"
  click '[data-facet="refunded"]' 2
  click '[data-facet="failed"]' 2
  note "after facet clicks" "$(url); $(count) [$(source_of)]"
  click '[data-facet=""]' 2
  note "after All" "$(url); $(count)"
  go "/orders?f.region=gauteng&f.region=limpopo&f.status_code=paid" 5
  note "restored from URL" "$(chips); $(count) [$(source_of)]"
  note "regions in rows" "$(js "[...new Set([...document.querySelectorAll('.qg-cell[data-field=region]')].map((e) => e.textContent))].join(',')")"
  go "/orders?view=board&f.status_code=paid&f.status_code=shipped" 6
  note "board lanes" "$(js "[...document.querySelectorAll('[data-column]')].map((e) => e.dataset.column).join(',')")"
}

run_quick() {
  say "Quick filter"
  go "/orders" 4
  ab fill '[data-part=filter-bar] [data-filter=quick]' "zanele dlamini" >/dev/null; key Enter 3
  note "zanele dlamini" "$(count); $(loaded); disabled $(unavailable)"
  click '[data-header-sort="total"]' 2
  note "sorted by Total" "$(url); first totals $(js "[...document.querySelectorAll('.qg-cell[data-field=total]')].slice(0, 4).map((e) => e.textContent).join(' ')")"
  ab fill '[data-part=filter-bar] [data-filter=quick]' "123456" >/dev/null; key Enter 3
  note "123456" "$(count); orders $(js "[...document.querySelectorAll('.qg-cell[data-field=order_number]')].map((e) => e.textContent).join(',')")"
  ab fill '[data-part=filter-bar] [data-filter=quick]' "mok" >/dev/null; key Enter 3
  note "mok" "$(count); sort disabled: $(js "document.querySelector('[data-part=filter-bar] [data-field=sort]').title")"
  ab fill '[data-part=filter-bar] [data-filter=quick]' "ab" >/dev/null; key Enter 1
  note "ab" "hint: $(text '[data-quick-hint]')"
  ab fill '[data-part=filter-bar] [data-filter=quick]' "---" >/dev/null; key Enter 4
  note "---" "grid: $(text '[data-feed-state]'); count: $(text '[data-part=count]'); total: $(total)"
}

run_customer() {
  say "Customer picker"
  go "/orders" 4
  click '[data-part=filter-bar] [data-filter=customer_id]' 1
  ab keyboard type "mokoena" >/dev/null; settle 3
  note "options" "$(js "document.querySelectorAll('[data-slot=combobox-item]').length")"
  click '[data-slot=combobox-item]' 2
  note "list stays open" "$(js "document.querySelectorAll('[data-slot=combobox-item]').length > 0")"
  click '[data-slot=combobox-item]:not([aria-selected=true])' 2
  key Escape 3
  note "two customers" "$(count) [$(source_of)]; $(total)"
  note "chips" "$(chips)"
  note "url values" "$(js "new URLSearchParams(location.search).getAll('f.customer_id').length")"
  ab reload >/dev/null; settle 5
  note "after reload" "$(chips); $(count)"
  note "input chips" "$(js "[...document.querySelectorAll('[data-part=filter-bar] [data-slot=combobox-chip]')].map((e) => e.textContent).join(' | ')")"
}

run_resize() {
  say "Resize by mouse"
  go "/orders" 4; reset_columns; go "/orders" 4
  note "start" "$(width customer_name)"
  dragby '[data-resize="customer_name"]' 100 0
  note "drag +100" "header $(width customer_name), cell $(js "Math.round(document.querySelector('.qg-cell[data-field=customer_name]').getBoundingClientRect().width)")"
  dragby '[data-resize="customer_name"]' -180 0 hold
  note "during drag -180" "$(width customer_name)"
  key Escape; ab mouse up >/dev/null
  note "after Escape" "$(width customer_name)"
  dragby '[data-resize="customer_name"]' 900 0
  note "drag +900" "$(width customer_name)"

  say "Resize by keyboard"
  dragby '[data-resize="customer_name"]' -300 0
  note "back to" "$(width customer_name)"
  ab focus '[data-resize="customer_name"]' >/dev/null
  key ArrowRight; note "Right" "$(width customer_name)"
  key Shift+ArrowLeft; note "Shift+Left" "$(width customer_name)"
  key ArrowLeft; key ArrowLeft; note "Left twice" "$(width customer_name)"
  key Escape; note "Escape" "$(width customer_name)"
  for i in 1 2 3 4 5 6 7; do key Shift+ArrowRight 0.1; done; note "Shift+Right x7" "$(width customer_name)"
  for i in $(seq 1 12); do key Shift+ArrowLeft 0.1; done; note "Shift+Left x12" "$(width customer_name)"

  say "Resize persists"
  ab focus '[data-resize="customer_name"]' >/dev/null
  for i in 1 2 3 4; do key Shift+ArrowRight 0.1; done
  note "set to" "$(width customer_name)"; settle 1
  ab reload >/dev/null; settle 5
  note "after reload" "header $(width customer_name), cell $(js "Math.round(document.querySelector('.qg-cell[data-field=customer_name]').getBoundingClientRect().width)")"

  say "Resize while scrolled sideways"
  js "document.querySelector('[data-part=grid-scroller]').scrollTo(520, 600); 'ok'" >/dev/null; settle 1
  local before; before=$(width region)
  dragby '[data-resize="region"]' 80 0
  note "Region" "$before to $(width region)"
  note "sticky" "$(js "(() => { const g = document.querySelector('[data-part=grid-scroller]').getBoundingClientRect(); const at = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return Math.round(b.left - g.left) + ',' + Math.round(b.top - g.top); }; return 'select ' + at('.qg-row .qg-select-cell') + ' order cell x ' + at('[data-field=order_number]').split(',')[0] + ' order header ' + at('[data-header=order_number]') + ' header row ' + at('[data-part=grid-header]'); })()")"
  reset_columns
}

run_memory() {
  say "In-memory route"
  ab network requests --clear >/dev/null 2>&1
  go "/memory" 4
  note "start" "$(count); $(total); disabled '$(unavailable)'"
  pick team growth
  pick priority high
  note "Growth + High" "$(count); $(total)"
  note "facet counts" "$(js "[...document.querySelectorAll('[data-facet]')].map((e) => e.textContent).join(' | ')")"
  ab fill '[data-part=filter-bar] [data-filter=quick]' "fix" >/dev/null; key Enter 2
  click '[data-header-sort="budget"]' 1
  note "quick fix, sort Budget" "$(count); $(total); $(url)"
  note "disabled" "'$(unavailable)'"
  pick team platform
  note "two teams" "$(count); $(chips)"
  note "api requests" "$(ab network requests --filter /api 2>&1 | grep -c '/api/' )"
  click '[data-view=board]' 3
  note "board" "$(js "[...document.querySelectorAll('[data-column]')].map((e) => e.dataset.column + ':' + e.dataset.loaded).join(' ')")"
}

run_parts() {
  say "Parts mount alone"
  for part in filter-bar chips sidebar facets count total grid list board; do
    go "/parts/$part?f.status_code=refunded" 4
    note "$part" "$(js "JSON.stringify({ parts: [...new Set([...document.querySelectorAll('[data-solo-part] [data-part]')].map((e) => e.dataset.part))].join(','), query: document.querySelector('[data-part=query-readout]').textContent.slice(0, 44) })")"
  done
  go "/parts/facets?f.status_code=refunded" 4
  click '[data-facet="paid"]' 2
  note "facet click" "$(url); $(text '[data-part=query-readout]' | cut -c1-70)"

  say "Grid, list and board keep the query"
  go "/orders" 4
  pick region gauteng
  click '[data-view=list]' 3; note "list" "$(url); $(chips); cards $(js "document.querySelectorAll('[data-card]').length")"
  click '[data-view=board]' 5; note "board" "$(url); $(chips); lanes $(js "document.querySelectorAll('[data-column]').length"); counts '$(js "[...document.querySelectorAll('[data-column-count]')].map((e) => e.textContent).join('')")'"
  click '[data-view=grid]' 3; note "grid" "$(url); $(chips)"

  say "URL round-trip"
  go "/orders?f.status_code=shipped&f.region=gauteng&sort=created_at.asc&view=list" 5
  note "restored" "$(url); $(chips); view $(js "document.querySelector('[data-part=list]') ? 'list' : 'other'")"
  go "/orders?f.channel=web&sort=total.desc" 5
  note "undeclared" "$(url); $(chips)"
}

run_scroll() {
  say "Virtualised scroll and keyset paging"
  go "/orders" 4
  for i in $(seq 1 12); do
    js "(() => { const s = document.querySelector('[data-part=grid-scroller]'); s.scrollTo(0, s.scrollHeight); return 1; })()" >/dev/null; settle 1.6
  done
  note "loaded" "$(loaded)"
  note "mounted" "$(js "document.querySelector('[data-part=grid-rows]').dataset.mounted")"
  note "rows" "$(js "(() => { const rows = [...document.querySelectorAll('[data-row]')].map((e) => e.getBoundingClientRect()).sort((a, b) => a.top - b.top); const heights = rows.map((r) => Math.round(r.height)); let bad = 0; for (let i = 1; i < rows.length; i++) { if (Math.abs(rows[i].top - rows[i - 1].bottom) > 1) bad++; } return 'heights ' + Math.min(...heights) + '-' + Math.max(...heights) + ', gaps or overlaps ' + bad; })()")"

  say "Rows after an in-memory re-sort"
  go "/orders?q=zanele+dlamini" 5
  for field in total total created_at created_at; do
    click "[data-header-sort=\"$field\"]" 1.5
    note "sort $field" "$(js "(() => { const rows = [...document.querySelectorAll('[data-row]')].map((e) => e.getBoundingClientRect()).sort((a, b) => a.top - b.top); let bad = 0; for (let i = 1; i < rows.length; i++) { if (Math.abs(rows[i].top - rows[i - 1].bottom) > 1) bad++; } return rows.length + ' rows, heights ' + [...new Set(rows.map((r) => Math.round(r.height)))].join('/') + ', gaps or overlaps ' + bad; })()")"
  done
}

run_keys() {
  say "Arrow keys, range, TSV"
  go "/orders" 4
  click '[data-row="2"] [data-col="1"]' 0.5
  key ArrowDown; key ArrowRight
  note "active" "$(js "document.querySelector('[data-status=active]').dataset.value")"
  key Shift+ArrowDown; key Shift+ArrowDown; key Shift+ArrowDown; key Shift+ArrowRight; key Shift+ArrowRight; key Shift+ArrowRight
  note "range" "$(js "document.querySelector('[data-status=range]').dataset.value")"
  key Control+c 0.5
  note "copied" "$(js "(() => { const t = document.querySelector('[data-status=copied]').textContent; const lines = t.split('\\n').filter(Boolean); return lines.length + ' lines, ' + lines[0].split('\\t').length + ' columns'; })()")"
  key Home; note "Home" "$(js "document.querySelector('[data-status=active]').dataset.value")"
  key End; note "End" "$(js "document.querySelector('[data-status=active]').dataset.value")"
  key Control+Home; note "Ctrl+Home" "$(js "document.querySelector('[data-status=active]').dataset.value")"
  key Control+End 2.5; note "Ctrl+End" "$(js "document.querySelector('[data-status=active]').dataset.value"); $(loaded)"

  say "Selection"
  go "/orders" 4
  local sel='document.querySelector("[data-status=selected]").dataset.value'
  click '[data-row="0"] [data-select-row]'; note "one checkbox" "$(js "$sel")"
  js "(() => { const el = document.querySelector('[data-row=\"5\"] [data-select-row]'); el.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); return 1; })()" >/dev/null; settle
  note "Shift-click row 6" "$(js "$sel")"
  click '[data-select-all]'; note "select all" "$(js "$sel")"
  click '[data-select-all]'; note "select all again" "$(js "$sel")"
  ab focus '[data-row="3"] [data-select-row]' >/dev/null; key Space; note "Space on a row checkbox" "$(js "$sel")"
}

run_columns() {
  say "Column reorder"
  go "/orders" 4; reset_columns; go "/orders" 4
  note "start" "$(headers)"
  ab focus '[data-header="status_code"]' >/dev/null
  key Space; key ArrowRight; key ArrowRight; key Space
  note "Space, Right, Right, Space on Status" "$(headers)"
  note "body cells" "$(js "[...document.querySelectorAll('[data-row=\"0\"] [data-field]')].map((e) => e.dataset.field).slice(0, 8).join(',')")"
  ab focus '[data-header="status_code"]' >/dev/null
  key Space; key ArrowLeft; key Escape
  note "Space, Left, Escape" "$(headers)"
  dragto '[data-header="region"] .qg-header-label' '[data-header="created_at"] .qg-header-label'
  note "drag Region onto Created" "$(headers)"

  say "Pin and visibility"
  click '[data-part=columns-menu-trigger]' 1
  click '[data-column-toggle="currency"]'
  reveal '[data-column-toggle="id"]'; click '[data-column-toggle="id"]'
  reveal '[data-column-pin="customer_name"]'; click '[data-column-pin="customer_name"]'
  key Escape 1.5
  local pinned="(() => { const g = document.querySelector('[data-part=grid-scroller]').getBoundingClientRect(); const h = document.querySelector('[data-header=customer_name]'); return 'headers ' + [...document.querySelectorAll('[data-header]')].map((e) => e.dataset.header).slice(0, 3).join(',') + '; currency ' + !!document.querySelector('[data-header=currency]') + '; id ' + !!document.querySelector('[data-header=id]') + '; customer pinned ' + h.hasAttribute('data-pinned') + ' at x ' + Math.round(h.getBoundingClientRect().left - g.left); })()"
  note "after menu" "$(js "$pinned")"
  js "document.querySelector('[data-part=grid-scroller]').scrollTo(600, 0); 1" >/dev/null; settle 1
  note "scrolled 600 right" "$(js "$pinned")"
  ab reload >/dev/null; settle 5
  note "after reload" "$(js "$pinned")"
  click '[data-part=columns-menu-trigger]' 1; click '[data-columns-reset]'; key Escape 1
  note "after Reset columns" "$(headers)"
}

run_board() {
  say "Board moves"
  go "/orders?view=board" 7
  local counts="[...document.querySelectorAll('[data-column-count]')].map((e) => e.dataset.columnCount + ' ' + e.textContent).join(' | ')"
  note "counts" "$(js "$counts")"
  ab focus '[data-column="pending"] [data-card]' >/dev/null
  local card; card=$(js "document.activeElement.dataset.card")
  key Space; key ArrowLeft 0.6; key Space 3
  note "Space, Left, Space on a Pending card" "$(js "document.querySelector('[data-card=$card]')?.closest('[data-column]')?.dataset.column"); $(js "$counts")"
  ab focus '[data-column="completed"] [data-card]' >/dev/null
  card=$(js "document.activeElement.dataset.card")
  key Space; key ArrowRight 0.6
  note "Completed card after Right" "$(js "document.querySelector('[data-card=$card]')?.closest('[data-column]')?.dataset.column")"
  key Escape 1
  note "after Escape" "$(js "document.querySelector('[data-card=$card]')?.closest('[data-column]')?.dataset.column")"
  card=$(js "document.querySelector('[data-column=paid] [data-card]').dataset.card")
  dragto "[data-card=$card]" '[data-column="shipped"] [data-card]:nth-of-type(3)'
  settle 3
  note "drag a Paid card onto Shipped" "$(js "(() => { const el = document.querySelector('[data-card=$card]'); return el?.closest('[data-column]')?.dataset.column + ' index ' + el?.dataset.index; })()"); $(js "$counts")"
  note "message" "$(text '[data-board-message]' | cut -c1-60)"

  say "Board refusals"
  card=$(js "document.querySelector('[data-column=paid] [data-card]').dataset.card")
  dragto "[data-card=$card]" '[data-column="completed"] [data-card]'
  settle 2
  note "Paid onto Completed" "$(js "document.querySelector('[data-card=$card]')?.closest('[data-column]')?.dataset.column"); $(js "$counts")"
  card=$(js "document.querySelector('[data-column=paid] [data-card]').dataset.card")
  local a b; a=($(center "[data-card=$card]")); b=($(center '[data-column="shipped"]'))
  ab mouse move "${a[0]}" "${a[1]}" >/dev/null; ab mouse down >/dev/null
  for i in 1 2 3 4; do ab mouse move $((a[0] + (b[0] - a[0]) * i / 4)) "${a[1]}" >/dev/null; done
  local edge; edge=$(js "Math.round(document.querySelector('[data-column=shipped]').getBoundingClientRect().right + 6)")
  ab mouse move "$edge" "${a[1]}" >/dev/null; ab mouse up >/dev/null; settle 2
  note "released in the gap" "$(js "document.querySelector('[data-card=$card]')?.closest('[data-column]')?.dataset.column")"

  say "Virtualised board columns"
  for i in 1 2 3 4 5 6; do
    js "(() => { const s = document.querySelector('[data-column=completed]'); s.scrollTo(0, s.scrollHeight); return 1; })()" >/dev/null; settle 1.6
  done
  note "Completed" "loaded $(js "document.querySelector('[data-column=completed]').dataset.loaded"), mounted $(js "document.querySelector('[data-column=completed] [data-mounted]').dataset.mounted")"
}

run_rtl() {
  say "Right to left"
  go "/rtl" 4; reset_columns; go "/rtl" 5
  local at="(() => { const g = document.querySelector('[data-part=grid-scroller]').getBoundingClientRect(); const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return Math.round(g.right - b.right) + '..' + Math.round(g.right - b.left); }; return 'from the right edge: select ' + r('.qg-header-cell.qg-select-cell') + ', order ' + r('[data-header=order_number]') + ', created ' + r('[data-header=created_at]') + '; customer handle ' + r('[data-resize=customer_name]') + ' of header ' + r('[data-header=customer_name]'); })()"
  note "dir" "$(js "document.querySelector('.workspace').dir + ', computed ' + getComputedStyle(document.querySelector('[data-part=grid]')).direction")"
  note "layout" "$(js "$at")"
  dragby '[data-resize="customer_name"]' -100 0
  note "drag the handle 100 left" "$(width customer_name)"
  ab focus '[data-resize="customer_name"]' >/dev/null
  key ArrowLeft; note "ArrowLeft" "$(width customer_name)"
  key Shift+ArrowRight; note "Shift+ArrowRight" "$(width customer_name)"
  key Escape; note "Escape" "$(width customer_name)"
  ab focus '[data-header="status_code"]' >/dev/null
  key Space; key ArrowLeft; key Space
  note "Space, Left, Space on Status" "$(headers 6)"
  dragto '[data-header="region"] .qg-header-label' '[data-header="created_at"] .qg-header-label'
  note "drag Region onto Created" "$(headers 6)"
  js "document.querySelector('[data-part=grid-scroller]').scrollTo(-520, 400); 1" >/dev/null; settle 1
  note "scrolled 520 toward the end" "$(js "$at")"
  click '[data-part=columns-menu-trigger]' 1
  reveal '[data-column-pin="customer_name"]'; click '[data-column-pin="customer_name"]'; key Escape 1
  note "Customer pinned" "$(js "(() => { const g = document.querySelector('[data-part=grid-scroller]').getBoundingClientRect(); const b = document.querySelector('[data-header=customer_name]').getBoundingClientRect(); return 'starts ' + Math.round(g.right - b.right) + ' from the right edge'; })()")"
  click '[data-part=filter-sidebar-trigger]' 1.5
  note "sidebar" "$(js "(() => { const el = document.querySelector('[data-part=filter-sidebar]'); const b = el.getBoundingClientRect(); return 'side ' + el.dataset.side + ', x ' + Math.round(b.left) + '..' + Math.round(b.right) + ' of ' + innerWidth; })()")"
  click '[data-sidebar-close]' 1
  pick status_code paid shipped
  note "chips" "$(chips); first chip $(js "(() => { const c = document.querySelector('[data-chip]').getBoundingClientRect(); const r = document.querySelector('[data-chips-reset]').getBoundingClientRect(); return c.left > r.left ? 'right of Reset' : 'left of Reset'; })()"); remove button $(js "(() => { const v = document.querySelector('.qg-chip-value'); const t = v.querySelector('bdi').getBoundingClientRect(); const b = v.querySelector('button').getBoundingClientRect(); return b.left < t.left ? 'left of its value' : 'right of its value'; })()")"
  note "count text" "$(count)"
  reset_columns
}

run_components() {
  say "Base components alone"
  ab network requests --clear >/dev/null 2>&1
  go "/components" 4
  note "start" "$(count); $(loaded); rows $(js "document.querySelectorAll('[data-row]').length")"
  click '[data-facet="fruit"]' 1; click '[data-facet="grain"]' 1
  note "Fruit + Grain" "$(count); $(chips); kinds $(js "[...new Set([...document.querySelectorAll('.qg-cell[data-field=kind]')].map((e) => e.textContent))].join(',')")"
  click '[data-header-sort="price"]' 1
  note "sorted by Price" "$(js "[...document.querySelectorAll('.qg-cell[data-field=price]')].slice(0, 3).map((e) => e.textContent).join(' ')")"
  click '[data-chip-remove="kind"][data-chip-value="fruit"]' 1
  note "after removing Fruit" "$(count); $(chips)"
  dragby '[data-resize="name"]' 60 0
  note "resize Name" "$(width name)"
  note "api requests" "$(ab network requests --filter /api 2>&1 | grep -c '/api/')"
  note "provider" "$(js "document.querySelector('[data-part=query-readout]') ? 'query readout present' : 'no query state on the page'")"
}

run_history() {
  say "URL history"
  ab tab new >/dev/null; settle 1
  go "/" 2; go "/orders" 4
  local len="history.length"
  local start; start=$(js "$len")
  pick status_code paid
  pick region gauteng
  click '[data-header-sort="created_at"]' 1.5
  click '[data-view=list]' 2
  note "four discrete changes" "entries +$(( $(js "$len") - start )); $(url)"
  ab back >/dev/null; settle 2; note "Back" "$(url); $(chips); view $(js "document.querySelector('[data-part=list]') ? 'list' : 'grid'")"
  ab back >/dev/null; settle 2; note "Back" "$(url); $(chips)"
  ab back >/dev/null; settle 2; note "Back" "$(url); $(chips); $(count)"
  ab back >/dev/null; settle 3; note "Back" "$(url); $(chips); $(count)"
  ab forward >/dev/null; settle 3; note "Forward" "$(url); $(chips); $(count)"
  go "/orders" 4
  start=$(js "$len")
  ab fill '[data-part=filter-bar] [data-filter=quick]' "zanele dlamini" >/dev/null; key Enter 3
  ab fill '[data-part=filter-bar] [data-filter=quick]' "zanele dlam" >/dev/null; key Enter 3
  note "two quick filters" "entries +$(( $(js "$len") - start )); $(url)"
  go "/" 2
  click 'a[href="/orders?view=board"]' 6
  note "Link to the board" "$(url); lanes $(js "document.querySelectorAll('[data-column]').length")"
  ab back >/dev/null; settle 2; ab forward >/dev/null; settle 5
  note "Back then Forward" "$(url); lanes $(js "document.querySelectorAll('[data-column]').length")"
}

run_errors() {
  say "No errors"
  note "browser errors" "'$(errors)'"
}

SECTIONS="${*:-refusals counts sidebar chips multi history quick customer resize memory parts scroll keys columns board rtl components errors}"
for section in $SECTIONS; do
  "run_$section"
done
