#!/usr/bin/env bash
cd "$(dirname "$0")" && . ./lib.sh
OUT="$(cd ../../../docs/screenshots && pwd)"

shot() { ab screenshot "$OUT/$1.png" >/dev/null; echo "$1"; }

ab set viewport 1500 900 >/dev/null
go "/orders" 4; reset_columns

go "/" 3; shot 01-landing
go "/orders" 5; shot 02-default-grid

go "/orders?f.region=gauteng" 4
click '[data-part=filter-sidebar-trigger]' 1.5; shot 03-filter-sidebar

go "/orders?f.status_code=shipped&f.region=gauteng" 5; shot 04-chips-reset

go "/orders?f.status_code=paid&sort=total.desc" 4
click '[data-part=filter-sidebar-trigger]' 1.5; shot 05-disabled-with-reasons

go "/orders?f.status_code=paid&r.total=20000..60000&sort=total.desc" 5; shot 06-capped-count-no-total
click '[data-count-exact]' 6; shot 07-exact-count

go "/orders?f.status_code=paid&r.created_at=2026-11-01T00:00:00.000000Z..2026-11-07T23:59:59.999999Z" 5; shot 08-total-live
go "/orders?f.status_code=paid" 5; shot 09-total-from-counter

go "/orders?q=zanele+dlamini" 5
click '[data-header-sort="total"]' 2; shot 10-quick-filter-answered
go "/orders?q=---" 6; shot 11-quick-filter-refused

go "/orders" 4
click '[data-header-filter="status_code"] button' 1
click '[data-slot=popover-content] [data-filter=status_code]' 1; shot 12-header-filter
key Escape; key Escape

go "/orders" 4
click '[data-part=columns-menu-trigger]' 1; shot 13-columns-menu
key Escape

go "/orders" 4
click '[data-row="2"] [data-col="1"]' 0.5
for i in 1 2 3 4; do key Shift+ArrowDown 0.1; done
for i in 1 2 3; do key Shift+ArrowRight 0.1; done
shot 14-range-selection

go "/orders" 4
dragby '[data-resize="customer_name"]' 100 0
js "document.querySelector('[data-part=grid-scroller]').scrollTo(520, 600); 1" >/dev/null; settle 1.5
shot 15-resize-pinned-scrolled
reset_columns

go "/orders?view=list" 5; shot 16-list-view
go "/orders?view=board" 7; shot 17-board

card=$(js "document.querySelector('[data-column=paid] [data-card]').dataset.card")
dragto "[data-card=$card]" '[data-column="shipped"] [data-card]:nth-of-type(3)' hold
shot 18-board-drag
key Escape; ab mouse up >/dev/null

go "/parts/facets?f.status_code=refunded" 4; shot 19-part-facets-alone

go "/memory?f.team=growth&f.team=platform&f.priority=high&sort=budget.desc" 4; shot 20-in-memory
go "/restyled" 5; shot 21-token-restyle

go "/orders?f.status_code=paid&f.status_code=shipped&f.region=gauteng" 5
click '[data-part=filter-bar] [data-filter=status_code]' 1; shot 22-several-values
key Escape

go "/rtl?f.status_code=paid&f.status_code=shipped" 5
click '[data-part=filter-sidebar-trigger]' 1.5; shot 23-right-to-left
click '[data-sidebar-close]' 1

go "/components" 4
click '[data-facet="fruit"]' 0.5; click '[data-facet="grain"]' 1; shot 24-base-components
reset_columns
