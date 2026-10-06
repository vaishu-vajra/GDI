import React from "react";
import "./Dashboard.css";


// ============================================================
// STATIC DEMO DATA
// Replace these with API data later.
// ============================================================

const STATIC_INVESTMENTS = [
  {
    company: "NVIDIA",
    shares: 10,
    buyPrice: 4000,
    investedAmount: 40000,
    currentPrice: 5200,
    currentValue: 52000,
    profitLoss: 12000,
    returnPct: 30,
  },
  {
    company: "Apple",
    shares: 15,
    buyPrice: 7000,
    investedAmount: 105000,
    currentPrice: 6500,
    currentValue: 97500,
    profitLoss: -7500,
    returnPct: -7.1,
  },
  {
    company: "Microsoft",
    shares: 8,
    buyPrice: 6875,
    investedAmount: 55000,
    currentPrice: 8400,
    currentValue: 67200,
    profitLoss: 12200,
    returnPct: 22.2,
  },
];

const STATIC_COMPANIES = [
  {
    company: "NVIDIA",
    revenue: "$130.5B",
    netIncome: "$72.9B",
    growth: "+18.4%",
    cashFlow: "↑",
    debt: "→",
    outlook: "Positive",
    insight: "Strong AI and data-center growth",
    warning: "High valuation risk mentioned",
  },
  {
    company: "Apple",
    revenue: "$383.3B",
    netIncome: "$97.0B",
    growth: "+5.2%",
    cashFlow: "↑",
    debt: "→",
    outlook: "Stable",
    insight: "Services growth, stable margins",
    warning: "Macroeconomic challenges",
  },
  {
    company: "Microsoft",
    revenue: "$211.9B",
    netIncome: "$72.4B",
    growth: "+15.2%",
    cashFlow: "↑",
    debt: "→",
    outlook: "Positive",
    insight: "Cloud growth, strong cash flow",
    warning: "Cloud business continues to grow",
  },
];


/*
  FinSight Dashboard
  ------------------
  This component is intentionally separate from App.jsx.

  Expected props:
    documents: array from GET /dashboard
    investments: customer investment records
    onNavigate: optional function for sidebar/page navigation

  Investment object shape:
    {
      company: "NVIDIA",
      shares: 10,
      buyPrice: 4000,
      investedAmount: 40000,
      currentPrice: 5200,
      currentValue: 52000,
      profitLoss: 12000,
      returnPct: 30
    }
*/

export default function Dashboard({
  documents = [],
  investments = [],
  onNavigate = () => {},
}) {
  // Static data for the current UI phase.
  // API integration can replace these later.
  const dashboardInvestments =
    investments.length ? investments : STATIC_INVESTMENTS;

  const dashboardCompanies = STATIC_COMPANIES;

  const totalInvested = dashboardInvestments.reduce(
    (sum, item) => sum + Number(item.investedAmount || item.invested || 0),
    0
  );

  const currentValue = dashboardInvestments.reduce(
    (sum, item) => sum + Number(item.currentValue || item.current || 0),
    0
  );

  const totalProfitLoss = currentValue - totalInvested;

  const portfolioReturn =
    totalInvested > 0
      ? (totalProfitLoss / totalInvested) * 100
      : 0;

  const latestDocuments = [...documents]
    .sort((a, b) =>
      String(b.modified_time || "").localeCompare(
        String(a.modified_time || "")
      )
    )
    .slice(0, 6);

  return (
    <div className="fs-dashboard">
      {/* PAGE HEADER */}
      <div className="fs-dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>Your investments and company insights in one place.</p>
        </div>

        <div className="fs-dashboard-header-right">
          <span>
            {documents.length
              ? "Latest indexed company data"
              : "No company data indexed yet"}
          </span>

          <button
            className="fs-refresh-btn"
            onClick={() => window.location.reload()}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* INVESTMENT OVERVIEW */}
      <section className="fs-overview-card">
        <div className="fs-section-heading">
          <div className="fs-section-icon">▣</div>

          <div>
            <h2>Investment Overview</h2>
            <p>Summary of your portfolio performance</p>
          </div>
        </div>

        <div className="fs-metric-grid">
          <MetricCard
            type="green"
            icon="▰"
            label="Total Invested"
            value={formatMoney(totalInvested)}
          />

          <MetricCard
            type="blue"
            icon="▥"
            label="Current Value"
            value={formatMoney(currentValue)}
            badge={
              totalInvested > 0
                ? `${totalProfitLoss >= 0 ? "↑" : "↓"} ${Math.abs(
                    portfolioReturn
                  ).toFixed(1)}%`
                : null
            }
          />

          <MetricCard
            type="green"
            icon="↗"
            label="Total Profit / Loss"
            value={formatSignedMoney(totalProfitLoss)}
          />

          <MetricCard
            type="purple"
            icon="%"
            label="Portfolio Return"
            value={`${portfolioReturn >= 0 ? "+" : ""}${portfolioReturn.toFixed(
              1
            )}%`}
          />
        </div>
      </section>

      {/* PORTFOLIO + CHART */}
      <div className="fs-two-column">
        <section className="fs-card fs-investments-card">
          <div className="fs-card-heading">
            <div className="fs-section-heading">
              <div className="fs-section-icon">▥</div>

              <div>
                <h2>My Investments</h2>
                <p>Your current holdings and performance</p>
              </div>
            </div>

            <button
              className="fs-primary-small"
              onClick={() => onNavigate("My Portfolio")}
            >
              + Add Investment
            </button>
          </div>

          <InvestmentTable investments={dashboardInvestments} />
        </section>

        <section className="fs-card fs-performance-card">
          <div className="fs-card-heading">
            <div className="fs-section-heading">
              <div className="fs-section-icon">↗</div>

              <div>
                <h2>Portfolio Performance</h2>
                <p>Your portfolio value over time</p>
              </div>
            </div>

            <div className="fs-time-tabs">
              <button>1M</button>
              <button>3M</button>
              <button className="active">6M</button>
              <button>1Y</button>
              <button>ALL</button>
            </div>
          </div>

          <PortfolioChart hasData={true} />
        </section>
      </div>

      {/* COMPANY INSIGHTS + WATCHLIST */}
      <div className="fs-two-column fs-second-row">
        <section className="fs-card">
          <div className="fs-card-heading">
            <div className="fs-section-heading">
              <div className="fs-section-icon">▤</div>

              <div>
                <h2>Company Insights</h2>
                <p>Key financial metrics from your latest reports</p>
              </div>
            </div>

            <select className="fs-select" defaultValue="latest">
              <option value="latest">Latest Reports</option>
            </select>
          </div>

          <CompanyInsights
            companies={dashboardCompanies}
            documents={documents}
          />
        </section>

        <section className="fs-card">
          <div className="fs-card-heading">
            <div className="fs-section-heading">
              <div className="fs-section-icon yellow">●</div>

              <div>
                <h2>Watchlist & Key Insights</h2>
                <p>Important points from latest reports</p>
              </div>
            </div>

            <button
              className="fs-link-btn"
              onClick={() => onNavigate("Watchlist")}
            >
              View All →
            </button>
          </div>

          <WatchlistInsights />
        </section>
      </div>


    </div>
  );
}

function MetricCard({ type, icon, label, value, badge }) {
  return (
    <div className={`fs-metric-card ${type}`}>
      <div className="fs-metric-icon">{icon}</div>

      <div className="fs-metric-content">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>

      {badge && <span className="fs-metric-badge">{badge}</span>}
    </div>
  );
}

function InvestmentTable({ investments }) {
  if (!investments.length) {
    return (
      <div className="fs-empty-investments">
        <div className="fs-empty-investment-icon">▥</div>

        <div>
          <strong>No investment data yet</strong>
          <p>
            Customer holdings will appear here once investment data is
            connected.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fs-table-wrap">
      <div className="fs-investment-head">
        <span>Company</span>
        <span>Shares</span>
        <span>Buy Price</span>
        <span>Invested</span>
        <span>Current Price</span>
        <span>Current Value</span>
        <span>Profit / Loss</span>
        <span>Return %</span>
      </div>

      {investments.map((item, index) => {
        const pnl = Number(
          item.profitLoss ?? item.pnl ?? 0
        );

        const returnPct = Number(
          item.returnPct ??
            item.return_percentage ??
            (item.investedAmount
              ? (pnl / item.investedAmount) * 100
              : 0)
        );

        return (
          <div
            className="fs-investment-row"
            key={`${item.company}-${index}`}
          >
            <strong>
              <span className="fs-company-logo">
                {String(item.company || "?").slice(0, 1)}
              </span>
              {item.company}
            </strong>

            <span>{item.shares ?? "—"}</span>
            <span>{formatMoney(item.buyPrice)}</span>
            <span>{formatMoney(item.investedAmount ?? item.invested)}</span>
            <span>{formatMoney(item.currentPrice)}</span>
            <span>{formatMoney(item.currentValue ?? item.current)}</span>

            <span className={pnl >= 0 ? "positive" : "negative"}>
              {formatSignedMoney(pnl)}
            </span>

            <span className={returnPct >= 0 ? "positive" : "negative"}>
              {returnPct >= 0 ? "+" : ""}
              {returnPct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PortfolioChart({ hasData }) {
  return (
    <div className="fs-chart-container">
      <svg
        className="fs-chart"
        viewBox="0 0 600 230"
        preserveAspectRatio="none"
      >
        <line x1="45" y1="25" x2="45" y2="195" className="grid-line" />
        <line x1="45" y1="195" x2="580" y2="195" className="grid-line" />

        {[55, 95, 135, 175].map((y) => (
          <line
            key={y}
            x1="45"
            y1={y}
            x2="580"
            y2={y}
            className="grid-line"
          />
        ))}

        <polyline
          points={
            hasData
              ? "45,160 95,145 145,150 195,126 245,133 295,105 345,115 395,90 445,98 495,70 535,80 580,50"
              : "45,165 95,165 145,165 195,165 245,165 295,165 345,165 395,165 445,165 495,165 535,165 580,165"
          }
          className={hasData ? "chart-line" : "chart-line empty"}
        />

        {hasData &&
          [
            [45, 160],
            [95, 145],
            [145, 150],
            [195, 126],
            [245, 133],
            [295, 105],
            [345, 115],
            [395, 90],
            [445, 98],
            [495, 70],
            [535, 80],
            [580, 50],
          ].map(([cx, cy], index) => (
            <circle
              key={index}
              cx={cx}
              cy={cy}
              r="4"
              className="chart-point"
            />
          ))}
      </svg>

      {!hasData && (
        <div className="fs-chart-empty">
          Portfolio history will appear after investment data is connected.
        </div>
      )}

      {hasData && (
        <div className="fs-chart-value">
          Current portfolio value
        </div>
      )}
    </div>
  );
}

function CompanyInsights() {
  return (
    <div className="fs-insights-table">
      <div className="fs-insights-head">
        <span>Company</span>
        <span>Revenue</span>
        <span>Net Income</span>
        <span>Growth</span>
        <span>Cash Flow</span>
        <span>Debt</span>
        <span>Overall Outlook</span>
      </div>

      {STATIC_COMPANIES.map((item) => (
        <div className="fs-insights-row" key={item.company}>
          <strong>
            <span className="fs-company-logo">
              {item.company.slice(0, 1)}
            </span>
            {item.company}
          </strong>

          <span>{item.revenue}</span>
          <span>{item.netIncome}</span>
          <span className="positive">{item.growth}</span>
          <span className="positive">{item.cashFlow}</span>
          <span>{item.debt}</span>
          <em className="fs-neutral-pill">{item.outlook}</em>
        </div>
      ))}
    </div>
  );
}


function WatchlistInsights() {
  return (
    <div className="fs-watchlist-list">
      {STATIC_COMPANIES.map((item, index) => (
        <div className="fs-watch-item" key={item.company}>
          <div
            className={`fs-watch-status ${
              index === 1 ? "warning" : "positive"
            }`}
          >
            {index === 1 ? "!" : "✓"}
          </div>

          <div>
            <strong>{item.company}</strong>
            <p>{item.warning}</p>
          </div>

          <span className="fs-watch-arrow">›</span>
        </div>
      ))}
    </div>
  );
}


function EmptyState({ text }) {
  return (
    <div className="fs-empty-state">
      <span>▤</span>
      <strong>{text}</strong>
    </div>
  );
}

function getCompanies(documents) {
  return [
    ...new Set(
      documents
        .map((doc) => companyFromFile(doc.file_name))
        .filter(Boolean)
    ),
  ];
}

function latestDocumentFor(company, documents) {
  return documents
    .filter(
      (doc) =>
        companyFromFile(doc.file_name) === company
    )
    .sort((a, b) =>
      String(b.modified_time || "").localeCompare(
        String(a.modified_time || "")
      )
    )[0];
}

function companyFromFile(fileName = "") {
  const base = fileName
    .replace(/\.[^/.]+$/, "")
    .replace(/[_-]+/g, " ");

  const cleaned = base
    .replace(
      /\b(quarterly|annual|earnings|report|presentation|release|q[1-4]|fy\d{2,4}|20\d{2})\b/gi,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fileName;
}

function documentType(fileName = "") {
  if (!fileName) return "Financial Document";
  if (/earnings/i.test(fileName)) return "Earnings Report";
  if (/annual|10-k/i.test(fileName)) return "Annual Report";
  if (/quarter|10-q/i.test(fileName)) return "Quarterly Report";
  return "Financial Document";
}

function reportingPeriod(document) {
  const name = document?.file_name || "";
  const year = name.match(/\b20\d{2}\b/);

  if (year) return year[0];

  if (document?.modified_time) {
    const date = new Date(document.modified_time);

    if (!Number.isNaN(date.getTime())) {
      return String(date.getFullYear());
    }
  }

  return "—";
}

function extractMetric(text = "", terms = []) {
  if (!text) return "—";

  const lines = String(text)
    .split(/\n|(?<=\.)\s+/)
    .map((line) => line.trim());

  const line = lines.find((item) =>
    terms.some((term) =>
      item.toLowerCase().includes(term.toLowerCase())
    )
  );

  if (!line) return "—";

  const match = line.match(
    /(?:₹|\$|€|£)?\s*[\d,.]+(?:\s*(?:billion|million|thousand|bn|mn|k|m|b))?/i
  );

  return match ? match[0].trim() : "—";
}

function firstKnowledgeLine(text = "") {
  if (!text) return "Report indexed";

  const lines = String(text)
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    lines[0]
      ?.replace(/^[-*#\d.)\s]+/, "")
      .slice(0, 90) || "Report indexed"
  );
}

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function formatSignedMoney(value) {
  const amount = Number(value || 0);

  return `${amount >= 0 ? "+" : "-"}₹${Math.abs(
    amount
  ).toLocaleString("en-IN")}`;
}
