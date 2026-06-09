/* ============================================================
   Deals Dashboard Widget — scripts.js
   Visualises: Pipeline Funnel, Stage Donut, Monthly Revenue Bar,
   Win-Rate Gauge, Deal Type HBar, Lead Source HBar, Top Deals Table
   By: Christian Barbosa
   ============================================================ */

/* ── State ── */
var allDeals = [];

/* ── Colour palette (10 colours + light variants) ── */
var COLORS = [
    '#2563eb','#059669','#d97706','#dc2626',
    '#7c3aed','#0891b2','#be185d','#65a30d',
    '#ea580c','#0f766e'
];
var LIGHT_COLORS = [
    '#dbeafe','#d1fae5','#fef3c7','#fee2e2',
    '#ede9fe','#cffafe','#fce7f3','#ecfccb',
    '#ffedd5','#ccfbf1'
];

/* ── Zoho SDK bootstrap ── */
ZOHO.embeddedApp.on("PageLoad", function () {
    fetchAllDeals();
});
ZOHO.embeddedApp.init();

/* ── Fetch all deals with pagination ── */
async function fetchAllDeals() {
    try {
        var page = 1;
        var hasMore = true;
        allDeals = [];

        while (hasMore) {
            var res = await ZOHO.CRM.API.getAllRecords({
                Entity:   "Deals",
                page:     page,
                per_page: 200
            });

            if (res.data && res.data.length > 0) {
                allDeals = allDeals.concat(res.data);
                hasMore = !!(res.info && res.info.more_records);
                page++;
            } else {
                hasMore = false;
            }
        }

        console.log("Deals fetched:", allDeals.length);
        renderAll();

    } catch (err) {
        console.error("Error fetching deals:", err);
        showError("Failed to fetch deals data. Please try again.");
    }
}

/* ============================================================
   MASTER RENDER
   ============================================================ */
function renderAll() {
    if (!allDeals.length) { showError("No deals found."); return; }

    renderKPIs();
    renderFunnel();
    renderDonut();
    renderBarChart();
    renderGauge();
    renderHBar("typeHBar",   groupBy("Deal_Type"),   "deal type");
    renderHBar("sourceHBar", groupBy("Lead_Source"), "lead source");
    renderTopDeals();

    /* Timestamp */
    var now = new Date();
    document.getElementById("wg-updated").textContent =
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    document.getElementById("loadingDiv").style.display  = "none";
    document.getElementById("contentDiv").style.display  = "";
}

/* ============================================================
   HELPERS
   ============================================================ */

/* Group deals by a field → { label: count } */
function groupBy(field) {
    var map = {};
    allDeals.forEach(function (d) {
        var val = d[field] || "Unknown";
        map[val] = (map[val] || 0) + 1;
    });
    return map;
}

/* Group deals by field → { label: total_amount } */
function groupByAmount(field) {
    var map = {};
    allDeals.forEach(function (d) {
        var val = d[field] || "Unknown";
        map[val] = (map[val] || 0) + (parseFloat(d.Amount) || 0);
    });
    return map;
}

/* Format currency compactly */
function fmtCurrency(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n).toLocaleString();
}

/* Sort object by value descending → array of [key, val] */
function sortedEntries(obj) {
    return Object.entries(obj).sort(function (a, b) { return b[1] - a[1]; });
}

/* Polar → XY for SVG arcs */
function polarToXY(cx, cy, r, angleDeg) {
    var rad = (angleDeg - 90) * (Math.PI / 180);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/* Get colour by index */
function col(i)  { return COLORS[i % COLORS.length]; }
function colL(i) { return LIGHT_COLORS[i % LIGHT_COLORS.length]; }

/* Stage → colour mapping (consistent across charts) */
var stageColorCache = {};
var stageColorIdx   = 0;
function stageColor(stage) {
    if (!stageColorCache[stage]) {
        stageColorCache[stage] = { solid: col(stageColorIdx), light: colL(stageColorIdx) };
        stageColorIdx++;
    }
    return stageColorCache[stage];
}

/* ── Tooltip helpers ── */
var tooltipEl = document.getElementById("tooltip");

function showTooltip(html, mouseEvent) {
    tooltipEl.innerHTML = html;
    tooltipEl.style.display = "block";
    positionTooltip(mouseEvent);
    requestAnimationFrame(function () { tooltipEl.classList.add("is-visible"); });
}

function hideTooltip() {
    tooltipEl.classList.remove("is-visible");
    setTimeout(function () {
        if (!tooltipEl.classList.contains("is-visible")) {
            tooltipEl.style.display = "none";
        }
    }, 160);
}

function positionTooltip(e) {
    var off = 14, tw = tooltipEl.offsetWidth || 180, th = tooltipEl.offsetHeight || 50;
    var l = e.clientX + off, t = e.clientY + off;
    if (l + tw > window.innerWidth  - 8) l = e.clientX - tw - off;
    if (t + th > window.innerHeight - 8) t = e.clientY - th - off;
    tooltipEl.style.left = l + "px";
    tooltipEl.style.top  = t + "px";
}

document.addEventListener("mousemove", function (e) {
    if (tooltipEl.classList.contains("is-visible")) positionTooltip(e);
});

/* ============================================================
   1. KPI STRIP
   ============================================================ */
function renderKPIs() {
    var total     = allDeals.length;
    var totalAmt  = allDeals.reduce(function (s, d) { return s + (parseFloat(d.Amount) || 0); }, 0);
    var won       = allDeals.filter(function (d) { return d.Stage === "Closed Won"; });
    var wonAmt    = won.reduce(function (s, d) { return s + (parseFloat(d.Amount) || 0); }, 0);
    var lost      = allDeals.filter(function (d) { return d.Stage === "Closed Lost"; });
    var open      = allDeals.filter(function (d) { return d.Stage !== "Closed Won" && d.Stage !== "Closed Lost"; });
    var openAmt   = open.reduce(function (s, d) { return s + (parseFloat(d.Amount) || 0); }, 0);
    var avgAmt    = total ? totalAmt / total : 0;

    var closedTotal = won.length + lost.length;
    var winRate = closedTotal ? ((won.length / closedTotal) * 100).toFixed(1) : '0.0';

    var kpis = [
        { label: 'Total Deals',    value: total.toLocaleString(),    sub: 'all stages',       color: '#2563eb' },
        { label: 'Pipeline Value', value: fmtCurrency(openAmt),      sub: 'open deals',       color: '#7c3aed' },
        { label: 'Won Revenue',    value: fmtCurrency(wonAmt),       sub: won.length + ' deals won', color: '#059669' },
        { label: 'Win Rate',       value: winRate + '%',             sub: closedTotal + ' closed',   color: '#d97706' },
        { label: 'Avg Deal Size',  value: fmtCurrency(avgAmt),       sub: 'across all deals', color: '#0891b2' },
    ];

    var strip = document.getElementById("kpiStrip");
    strip.innerHTML = "";
    document.getElementById("wg-total-badge").textContent = total.toLocaleString() + " deals";

    kpis.forEach(function (k, i) {
        var card = document.createElement("div");
        card.className = "kpi-card";
        card.style.setProperty("--kpi-color", k.color);
        card.style.animationDelay = (i * 0.05) + "s";
        card.innerHTML =
            '<div class="kpi-label">' + k.label + '</div>' +
            '<div class="kpi-value">' + k.value + '</div>' +
            '<div class="kpi-sub">'   + k.sub   + '</div>';
        strip.appendChild(card);
    });
}

/* ============================================================
   2. PIPELINE FUNNEL (value + count per stage)
   ============================================================ */
function renderFunnel() {
    /* Build stage map → { amount, count } */
    var stageMap = {};
    allDeals.forEach(function (d) {
        var s = d.Stage || "Unknown";
        if (!stageMap[s]) stageMap[s] = { amount: 0, count: 0 };
        stageMap[s].amount += (parseFloat(d.Amount) || 0);
        stageMap[s].count++;
    });

    /* Sort by amount descending */
    var stages = Object.keys(stageMap).sort(function (a, b) {
        return stageMap[b].amount - stageMap[a].amount;
    });

    var maxAmt = Math.max.apply(null, stages.map(function (s) { return stageMap[s].amount; }));
    var wrap   = document.getElementById("funnelWrap");
    wrap.innerHTML = "";

    stages.forEach(function (stage, idx) {
        var info  = stageMap[stage];
        var pct   = maxAmt > 0 ? (info.amount / maxAmt) * 100 : 0;
        var sc    = stageColor(stage);
        var row   = document.createElement("div");
        row.className    = "funnel-row";
        row.dataset.stage = stage;

        row.innerHTML =
            '<span class="funnel-label" title="' + stage + '">' + stage + '</span>' +
            '<div class="funnel-track">' +
                '<div class="funnel-fill" style="width:' + pct + '%;background:' + sc.solid + '">' +
                    '<span class="funnel-fill-label">' + fmtCurrency(info.amount) + '</span>' +
                '</div>' +
            '</div>' +
            '<span class="funnel-meta">' + fmtCurrency(info.amount) + '</span>' +
            '<span class="funnel-count">' + info.count + '</span>';

        /* Tooltip */
        row.addEventListener("mouseenter", function (e) {
            var pctOfTotal = ((info.count / allDeals.length) * 100).toFixed(1);
            showTooltip(
                '<strong>' + stage + '</strong>' +
                info.count + ' deals · ' + fmtCurrency(info.amount) + '<br>' +
                pctOfTotal + '% of total deals',
                e
            );
        });
        row.addEventListener("mouseleave", hideTooltip);

        wrap.appendChild(row);
    });
}

/* ============================================================
   3. STAGE DONUT
   ============================================================ */
function renderDonut() {
    var stageCounts = groupBy("Stage");
    var total       = allDeals.length;
    var svg         = document.getElementById("donutSvg");
    var legend      = document.getElementById("donutLegend");
    document.getElementById("donutNum").textContent = total.toLocaleString();

    /* Clear */
    while (svg.lastChild && svg.lastChild.tagName !== 'title') svg.removeChild(svg.lastChild);
    legend.innerHTML = "";

    var stages = Object.keys(stageCounts).sort(function (a, b) { return stageCounts[b] - stageCounts[a]; });
    var cx = 100, cy = 100, ro = 88, ri = 58, start = 0;

    stages.forEach(function (stage, idx) {
        var count   = stageCounts[stage];
        var pct     = (count / total) * 100;
        var angle   = (pct / 100) * 360;
        var end     = start + angle;
        var large   = angle > 180 ? 1 : 0;
        var sc      = stageColor(stage);

        var s  = polarToXY(cx, cy, ro, start);
        var e  = polarToXY(cx, cy, ro, end - 0.3);
        var si = polarToXY(cx, cy, ri, start);
        var ei = polarToXY(cx, cy, ri, end - 0.3);

        var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d",
            "M" + s.x + "," + s.y +
            " A" + ro + "," + ro + " 0 " + large + " 1 " + e.x + "," + e.y +
            " L" + ei.x + "," + ei.y +
            " A" + ri + "," + ri + " 0 " + large + " 0 " + si.x + "," + si.y + " Z"
        );
        path.setAttribute("fill", sc.solid);
        path.dataset.index = idx;

        path.addEventListener("mouseenter", function (ev) {
            showTooltip('<strong>' + stage + '</strong>' + count + ' deals · ' + pct.toFixed(1) + '%', ev);
            activateDonutHighlight(idx);
        });
        path.addEventListener("mouseleave", function () {
            hideTooltip();
            clearDonutHighlight();
        });

        svg.appendChild(path);
        start = end;

        /* Legend item */
        var item = document.createElement("div");
        item.className = "dl-item";
        item.dataset.index = idx;
        item.innerHTML =
            '<span class="dl-dot" style="background:' + sc.solid + '"></span>' +
            '<span class="dl-name" title="' + stage + '">' + stage + '</span>' +
            '<span class="dl-pct">' + pct.toFixed(1) + '%</span>';
        item.addEventListener("mouseenter", function (ev) {
            showTooltip('<strong>' + stage + '</strong>' + count + ' deals · ' + pct.toFixed(1) + '%', ev);
            activateDonutHighlight(idx);
        });
        item.addEventListener("mouseleave", function () {
            hideTooltip();
            clearDonutHighlight();
        });
        legend.appendChild(item);
    });
}

function activateDonutHighlight(activeIdx) {
    var svg = document.getElementById("donutSvg");
    svg.classList.add("has-highlight");
    svg.querySelectorAll("path").forEach(function (p) {
        if (parseInt(p.dataset.index, 10) === activeIdx) p.classList.add("seg-active");
        else p.classList.remove("seg-active");
    });
}

function clearDonutHighlight() {
    var svg = document.getElementById("donutSvg");
    svg.classList.remove("has-highlight");
    svg.querySelectorAll("path").forEach(function (p) { p.classList.remove("seg-active"); });
}

/* ============================================================
   4. MONTHLY REVENUE BAR CHART (closed-won by close date)
   ============================================================ */
function renderBarChart() {
    /* Only closed-won deals with a close date */
    var won = allDeals.filter(function (d) {
        return d.Stage === "Closed Won" && d.Closing_Date;
    });

    /* Aggregate by YYYY-MM */
    var monthMap = {};
    won.forEach(function (d) {
        var dt  = new Date(d.Closing_Date);
        var key = dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0");
        monthMap[key] = (monthMap[key] || 0) + (parseFloat(d.Amount) || 0);
    });

    var months = Object.keys(monthMap).sort();

    /* Show last 12 months max */
    if (months.length > 12) months = months.slice(months.length - 12);

    var wrap = document.getElementById("barChartWrap");
    wrap.innerHTML = "";

    if (!months.length) {
        wrap.innerHTML = '<p style="text-align:center;color:var(--text-3);padding:40px;font-size:12px;">No closed-won deals with a closing date found.</p>';
        return;
    }

    var maxVal = Math.max.apply(null, months.map(function (m) { return monthMap[m] || 0; }));

    /* Build chart container */
    var inner = document.createElement("div");
    inner.className = "bar-chart-inner";

    /* Y-axis grid (5 lines) */
    var steps = 4;
    for (var s = 0; s <= steps; s++) {
        var frac = s / steps;
        var pct  = frac * 100;   /* % from bottom */
        var val  = maxVal * frac;

        var line = document.createElement("div");
        line.className = "bar-grid-line";
        line.style.bottom = "calc(" + pct + "% + 28px)";
        inner.appendChild(line);

        var lbl = document.createElement("div");
        lbl.className = "bar-grid-label";
        lbl.style.bottom = "calc(" + pct + "% + 28px)";
        lbl.textContent = fmtCurrency(val);
        inner.appendChild(lbl);
    }

    /* Bars */
    months.forEach(function (month) {
        var val  = monthMap[month] || 0;
        var hPct = maxVal > 0 ? (val / maxVal) * 100 : 0;
        var parts = month.split("-");
        var dt    = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
        var shortLbl = dt.toLocaleString("default", { month: "short" }) + " '" + String(dt.getFullYear()).slice(2);

        var col_el = document.createElement("div");
        col_el.className = "bar-col";

        var bar = document.createElement("div");
        bar.className = hPct === 0 ? "bar-bar bar-bar--zero" : "bar-bar";
        /* Animate: start at 0, expand to hPct */
        bar.style.height = "0%";
        bar.style.transition = "height 0.7s cubic-bezier(0.4,0,0.2,1)";

        var xLbl = document.createElement("div");
        xLbl.className = "bar-x-lbl";
        xLbl.textContent = shortLbl;

        col_el.appendChild(bar);
        col_el.appendChild(xLbl);

        /* Tooltip */
        col_el.addEventListener("mouseenter", function (e) {
            showTooltip('<strong>' + month + '</strong>' + fmtCurrency(val) + ' won revenue', e);
            bar.style.filter = "brightness(1.15)";
        });
        col_el.addEventListener("mouseleave", function () {
            hideTooltip();
            bar.style.filter = "";
        });

        inner.appendChild(col_el);

        /* Animate after paint */
        requestAnimationFrame(function () {
            requestAnimationFrame(function () {
                bar.style.height = hPct + "%";
            });
        });
    });

    wrap.appendChild(inner);
}

/* ============================================================
   5. WIN RATE GAUGE
   ============================================================ */
function renderGauge() {
    var won    = allDeals.filter(function (d) { return d.Stage === "Closed Won"; }).length;
    var lost   = allDeals.filter(function (d) { return d.Stage === "Closed Lost"; }).length;
    var closed = won + lost;
    var rate   = closed ? (won / closed) : 0;

    var svg = document.getElementById("gaugeSvg");
    svg.innerHTML = '<title>Win rate gauge</title>';

    var cx = 100, cy = 105, r = 78;
    /* Semi-circle: -180deg to 0deg (left to right) */
    /* We'll draw from 180° to 360° in SVG terms    */

    /* Background arc */
    var bgPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    var bStart = polarToXY(cx, cy, r, 180);
    var bEnd   = polarToXY(cx, cy, r, 360 - 0.1);
    bgPath.setAttribute("d", "M" + bStart.x + "," + bStart.y + " A" + r + "," + r + " 0 1 1 " + bEnd.x + "," + bEnd.y);
    bgPath.setAttribute("fill", "none");
    bgPath.setAttribute("stroke", "var(--border)");
    bgPath.setAttribute("stroke-width", "14");
    bgPath.setAttribute("stroke-linecap", "round");
    svg.appendChild(bgPath);

    /* Value arc */
    if (rate > 0) {
        var endAngle = 180 + rate * 180;
        var vStart   = polarToXY(cx, cy, r, 180);
        var vEnd     = polarToXY(cx, cy, r, endAngle - 0.1);
        var largeArc = rate > 0.5 ? 1 : 0;

        var vPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        vPath.setAttribute("d", "M" + vStart.x + "," + vStart.y + " A" + r + "," + r + " 0 " + largeArc + " 1 " + vEnd.x + "," + vEnd.y);
        vPath.setAttribute("fill", "none");
        vPath.setAttribute("stroke", rate >= 0.5 ? "#059669" : "#dc2626");
        vPath.setAttribute("stroke-width", "14");
        vPath.setAttribute("stroke-linecap", "round");
        svg.appendChild(vPath);
    }

    /* Centre label */
    var txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", cx);
    txt.setAttribute("y", cy - 4);
    txt.setAttribute("text-anchor", "middle");
    txt.setAttribute("font-size", "28");
    txt.setAttribute("font-weight", "700");
    txt.setAttribute("fill", "var(--text-1)");
    txt.setAttribute("font-family", "DM Mono, monospace");
    txt.textContent = (rate * 100).toFixed(1) + "%";
    svg.appendChild(txt);

    var sub = document.createElementNS("http://www.w3.org/2000/svg", "text");
    sub.setAttribute("x", cx);
    sub.setAttribute("y", cy + 18);
    sub.setAttribute("text-anchor", "middle");
    sub.setAttribute("font-size", "11");
    sub.setAttribute("fill", "var(--text-3)");
    sub.textContent = "win rate";
    svg.appendChild(sub);

    /* Stats row */
    var stats = document.getElementById("gaugeStats");
    stats.innerHTML = [
        { val: won,    lbl: "Won",    color: "#059669" },
        { val: lost,   lbl: "Lost",   color: "#dc2626" },
        { val: closed, lbl: "Closed", color: "var(--text-2)" }
    ].map(function (s) {
        return '<div class="gauge-stat">' +
            '<div class="gauge-stat-val" style="color:' + s.color + '">' + s.val + '</div>' +
            '<div class="gauge-stat-lbl">' + s.lbl + '</div>' +
        '</div>';
    }).join('<div style="width:1px;background:var(--border);align-self:stretch;margin:0 4px;"></div>');
}

/* ============================================================
   6. HORIZONTAL BAR (Deal Type / Lead Source)
   ============================================================ */
function renderHBar(containerId, countMap, label) {
    var entries = sortedEntries(countMap).slice(0, 8);
    var maxVal  = entries.length ? entries[0][1] : 1;
    var total   = entries.reduce(function (s, e) { return s + e[1]; }, 0);
    var wrap    = document.getElementById(containerId);
    wrap.innerHTML = "";

    if (!entries.length) {
        wrap.innerHTML = '<p style="font-size:11px;color:var(--text-3);">No data available.</p>';
        return;
    }

    entries.forEach(function (entry, idx) {
        var name = entry[0], count = entry[1];
        var pct  = ((count / total) * 100).toFixed(1);
        var barW = (count / maxVal) * 100;

        var row = document.createElement("div");
        row.className = "hbar-row";
        row.innerHTML =
            '<div class="hbar-meta">' +
                '<span class="hbar-name" title="' + name + '">' + name + '</span>' +
                '<span class="hbar-val">' + count + ' <span style="color:var(--text-3);font-weight:400">(' + pct + '%)</span></span>' +
            '</div>' +
            '<div class="hbar-track">' +
                '<div class="hbar-fill" style="width:' + barW + '%;background:' + col(idx) + '"></div>' +
            '</div>';

        row.addEventListener("mouseenter", function (e) {
            showTooltip('<strong>' + name + '</strong>' + count + ' deals · ' + pct + '% of ' + label, e);
        });
        row.addEventListener("mouseleave", hideTooltip);

        wrap.appendChild(row);
    });
}

/* ============================================================
   7. TOP DEALS TABLE (top 15 by amount)
   ============================================================ */
function renderTopDeals() {
    var sorted = allDeals.slice().sort(function (a, b) {
        return (parseFloat(b.Amount) || 0) - (parseFloat(a.Amount) || 0);
    }).slice(0, 15);

    var tbody = document.getElementById("dealsTableBody");
    tbody.innerHTML = "";

    sorted.forEach(function (deal, idx) {
        var stage = deal.Stage || "—";
        var sc    = stageColor(stage);
        var amt   = parseFloat(deal.Amount) || 0;
        var prob  = parseInt(deal.Probability) || 0;
        var closeDate = deal.Closing_Date
            ? new Date(deal.Closing_Date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
            : "—";

        var row = document.createElement("tr");
        row.innerHTML =
            '<td class="td-rank">' + (idx + 1) + '</td>' +
            '<td class="td-deal-name" title="' + (deal.Deal_Name || "—") + '">' + (deal.Deal_Name || "—") + '</td>' +
            '<td class="td-account" title="' + (deal.Account_Name ? deal.Account_Name.name || "—" : "—") + '">' +
                (deal.Account_Name ? deal.Account_Name.name || "—" : "—") + '</td>' +
            '<td><span class="stage-chip" style="background:' + sc.light + ';color:' + sc.solid + '">' + stage + '</span></td>' +
            '<td class="td-amount">' + fmtCurrency(amt) + '</td>' +
            '<td>' +
                '<div class="prob-bar-wrap">' +
                    '<div class="prob-bar-track"><div class="prob-bar-fill" style="width:' + prob + '%;background:' + sc.solid + '"></div></div>' +
                    '<span class="prob-pct">' + prob + '%</span>' +
                '</div>' +
            '</td>' +
            '<td>' + closeDate + '</td>';

        row.addEventListener("mouseenter", function (e) {
            showTooltip(
                '<strong>' + (deal.Deal_Name || "Deal") + '</strong>' +
                'Amount: ' + fmtCurrency(amt) + '<br>' +
                'Stage: ' + stage + '<br>' +
                'Probability: ' + prob + '%',
                e
            );
        });
        row.addEventListener("mouseleave", hideTooltip);

        tbody.appendChild(row);
    });
}

/* ============================================================
   ERROR STATE
   ============================================================ */
function showError(msg) {
    document.getElementById("loadingDiv").style.display  = "none";
    document.getElementById("contentDiv").style.display  = "none";
    document.getElementById("errorDiv").style.display    = "block";
    document.getElementById("errorMessage").textContent  = msg;
}