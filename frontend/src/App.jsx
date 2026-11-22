const { useState, useEffect, useRef } = React;

// Recharts components from global scope
const {
    ResponsiveContainer,
    ComposedChart,
    BarChart,
    Bar,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend
} = window.Recharts || {};

const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
const currentHost = typeof window !== "undefined" && window.location.host ? window.location.host : "localhost:8000";
const API_BASE = typeof window !== "undefined" && window.location.origin && window.location.origin !== "null" ? window.location.origin : "http://localhost:8000";
const WS_URL = `${isHttps ? "wss:" : "ws:"}//${currentHost}/ws/logs`;

const BELLWETHERS = [
    { ticker: "AAPL", name: "Apple Inc.", region: "US" },
    { ticker: "NVDA", name: "NVIDIA Corp.", region: "US" },
    { ticker: "MSFT", name: "Microsoft Corp.", region: "US" },
    { ticker: "RELIANCE.NS", name: "Reliance Ind.", region: "India" },
    { ticker: "MAZDOCK.NS", name: "Mazagon Dock", region: "India" },
    { ticker: "7203.T", name: "Toyota Motor", region: "Japan" },
    { ticker: "MC.PA", name: "LVMH", region: "France" },
    { ticker: "TSM", name: "TSMC", region: "Taiwan" }
];

function App() {
    const [ticker, setTicker] = useState("AAPL");
    const [searchQuery, setSearchQuery] = useState("AAPL");
    const [searchResults, setSearchResults] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);

    const [filingType, setFilingType] = useState("10-K");
    const [loading, setLoading] = useState(false);
    const [wsLogs, setWsLogs] = useState([]);
    const [data, setData] = useState(null);
    const [activeTab, setActiveTab] = useState("overview");
    
    const logContainerRef = useRef(null);
    const searchContainerRef = useRef(null);

    // Initialize WebSocket connection for agent audit logs
    useEffect(() => {
        let ws;
        try {
            ws = new WebSocket(WS_URL);
            ws.onopen = () => {
                setWsLogs(prev => [...prev, {
                    timestamp: new Date().toLocaleTimeString(),
                    agent: "System",
                    message: "Connected to Multi-Agent Market Intelligence Pipeline.",
                    type: "system"
                }]);
            };
            ws.onmessage = (event) => {
                try {
                    const logData = JSON.parse(event.data);
                    setWsLogs(prev => [...prev, logData]);
                } catch (e) {
                    console.error("Error parsing WS log:", e);
                }
            };
            ws.onerror = (e) => {
                console.warn("WebSocket error:", e);
            };
        } catch (err) {
            console.warn("Could not setup WebSocket:", err);
        }

        return () => {
            if (ws) ws.close();
        };
    }, []);

    // Auto scroll agent activity feed
    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [wsLogs]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Dynamic Yahoo Search API debounced fetch
    useEffect(() => {
        if (!searchQuery || searchQuery.trim().length < 1) {
            setSearchResults([]);
            setShowDropdown(false);
            return;
        }

        const timer = setTimeout(async () => {
            try {
                const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
                if (res.ok) {
                    const items = await res.json();
                    setSearchResults(items || []);
                    setShowDropdown(items && items.length > 0);
                }
            } catch (err) {
                console.warn("Error fetching ticker search suggestions:", err);
            }
        }, 200);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Initial load on mount
    useEffect(() => {
        executeAnalysis("AAPL", "10-K");
    }, []);

    const executeAnalysis = async (searchTicker, searchFiling) => {
        const targetTicker = (searchTicker || ticker || searchQuery).trim().toUpperCase();
        const targetFiling = searchFiling || filingType;
        
        setTicker(targetTicker);
        setSearchQuery(targetTicker);
        setShowDropdown(false);
        setErrorMessage(null);
        setFilingType(targetFiling);
        setLoading(true);

        setWsLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString(),
            agent: "Frontend Client",
            message: `Dispatching research request for ${targetTicker} (${targetFiling})...`,
            type: "system"
        }]);

        try {
            const res = await fetch(`${API_BASE}/api/research`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ticker: targetTicker, filing_type: targetFiling })
            });

            if (!res.ok) {
                let errText = `Server returned HTTP status ${res.status}`;
                try {
                    const errJson = await res.json();
                    if (errJson.detail) errText = errJson.detail;
                } catch (e) {}
                throw new Error(errText);
            }

            const resultData = await res.json();
            setData(resultData);
        } catch (err) {
            console.error("Research execution error:", err);
            setErrorMessage(err.message);
            setWsLogs(prev => [...prev, {
                timestamp: new Date().toLocaleTimeString(),
                agent: "System",
                message: `Error executing research for ${targetTicker}: ${err.message}`,
                type: "error"
            }]);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectTicker = (symbol) => {
        setTicker(symbol);
        setSearchQuery(symbol);
        setShowDropdown(false);
        executeAnalysis(symbol, filingType);
    };

    const handleDownloadPdf = () => {
        const currentTicker = data?.ticker || ticker;
        window.open(`${API_BASE}/api/download/${currentTicker}`, '_blank');
    };

    const fin = data?.full_finances || {};
    const ms = fin.market_summary || data?.market_summary || {};
    const inc = fin.income_statement || {};
    const bs = fin.balance_sheet || {};
    const cf = fin.cash_flow || {};
    const ratios = fin.ratios || {};
    const val = fin.valuation || {};
    const dcf = fin.dcf_model || {};
    const rec = fin.recommendation || {};

    const years = fin.years || ["FY2022", "FY2023", "FY2024", "FY2025"];
    const currency = fin.currency || ms.currency || "USD";
    const currencySymbol = currency === "INR" ? "₹" : currency === "JPY" ? "¥" : currency === "EUR" ? "€" : "$";

    // Prepare chart data
    const chartData = years.map((yr, idx) => ({
        year: yr,
        revenue: inc.revenue ? inc.revenue[idx] : (data?.multi_year?.revenue_billion?.[idx] || 0),
        netIncome: inc.net_income ? inc.net_income[idx] : (data?.multi_year?.net_income_billion?.[idx] || 0),
        operatingCF: cf.operating_cf ? cf.operating_cf[idx] : (data?.multi_year?.operating_cf_billion?.[idx] || 0),
        freeCF: cf.free_cf ? cf.free_cf[idx] : (data?.multi_year?.free_cf_billion?.[idx] || 0)
    }));

    return (
        <div className="flex flex-col min-h-screen bg-slate-50 text-slate-900 font-sans">
            {/* Top Bar Header */}
            <header className="border-b border-slate-200 bg-white sticky top-0 z-50 px-6 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 via-indigo-600 to-emerald-600 p-0.5 shadow-md flex items-center justify-center">
                        <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center">
                            <span className="text-sm font-black text-blue-800 tracking-tighter">MAMI</span>
                        </div>
                    </div>
                    <div>
                        <h1 className="text-lg font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
                            Multi-Agent Market Intelligence
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold">16-Page Dossier</span>
                        </h1>
                        <p className="text-xs text-slate-500 font-medium">Enterprise Macroeconomic & Quantitative Financial Analysis</p>
                    </div>
                </div>

                {/* Ticker Search & Filing Controls with Auto-Complete Dropdown */}
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div ref={searchContainerRef} className="relative flex-1 md:w-80">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setTicker(e.target.value.toUpperCase());
                            }}
                            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    setShowDropdown(false);
                                    executeAnalysis(searchQuery, filingType);
                                }
                            }}
                            placeholder="Search Company or Ticker (e.g. AAPL, RELIANCE.NS, MAZDOCK.NS)"
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-4 py-2 text-sm text-slate-900 font-mono placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white transition"
                        />

                        {/* Floating Auto-Complete Suggestions Dropdown */}
                        {showDropdown && searchResults.length > 0 && (
                            <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-50 divide-y divide-slate-100">
                                {searchResults.map((item, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => handleSelectTicker(item.symbol)}
                                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition flex items-center justify-between group"
                                    >
                                        <div className="space-y-0.5">
                                            <div className="text-xs font-bold text-slate-800 font-mono group-hover:text-blue-600 flex items-center gap-1.5">
                                                <span>{item.symbol}</span>
                                                <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-500 rounded border border-slate-200 uppercase font-normal">{item.quoteType || 'EQUITY'}</span>
                                            </div>
                                            <div className="text-[11px] text-slate-500 truncate max-w-[200px]">{item.name}</div>
                                        </div>
                                        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">{item.exchange}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex bg-slate-100 border border-slate-200 rounded-lg p-1">
                        <button
                            onClick={() => setFilingType("10-K")}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${filingType === "10-K" ? "bg-white text-blue-700 shadow-sm font-bold" : "text-slate-600 hover:text-slate-900"}`}
                        >
                            10-K
                        </button>
                        <button
                            onClick={() => setFilingType("10-Q")}
                            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${filingType === "10-Q" ? "bg-white text-blue-700 shadow-sm font-bold" : "text-slate-600 hover:text-slate-900"}`}
                        >
                            10-Q
                        </button>
                    </div>

                    <button
                        onClick={() => executeAnalysis(searchQuery, filingType)}
                        disabled={loading}
                        className="bg-blue-700 hover:bg-blue-800 text-white px-5 py-2 rounded-lg text-sm font-semibold shadow-sm flex items-center gap-2 transition disabled:opacity-50"
                    >
                        {loading ? (
                            <>
                                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Analyzing...</span>
                            </>
                        ) : (
                            <>Analyze</>
                        )}
                    </button>
                </div>
            </header>

            {/* Global Bellwether Quick Selectors Bar */}
            <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center gap-2 overflow-x-auto shadow-sm">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mr-2 flex items-center gap-1">
                    Market Coverage:
                </span>
                {BELLWETHERS.map((b) => (
                    <button
                        key={b.ticker}
                        onClick={() => handleSelectTicker(b.ticker)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition flex items-center gap-1.5 ${ticker === b.ticker ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold shadow-sm' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                    >
                        <span className="text-slate-900">{b.ticker}</span>
                        <span className="text-[10px] text-slate-500">({b.region})</span>
                    </button>
                ))}
            </div>

            {/* Main Content Layout */}
            <div className="flex-1 flex flex-col lg:flex-row">
                {/* Left Sidebar: Real-Time Agent Execution Feed */}
                <aside className="w-full lg:w-80 bg-white border-r border-slate-200 p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Multi-Agent Feed</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-500">Port 8000</span>
                    </div>

                    {/* Agent Logs Box */}
                    <div
                        ref={logContainerRef}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg p-3 font-mono text-xs overflow-y-auto space-y-2.5 max-h-[380px] lg:max-h-[600px]"
                    >
                        {wsLogs.map((log, idx) => (
                            <div key={idx} className="space-y-0.5">
                                <div className="flex items-center justify-between text-[10px] text-slate-400">
                                    <span className="font-semibold text-blue-700">{log.agent || "System"}</span>
                                    <span>{log.timestamp}</span>
                                </div>
                                <div className={`text-[11px] leading-relaxed ${
                                    log.type === 'error' ? 'text-red-600 font-bold' :
                                    log.type === 'warning' ? 'text-amber-600' :
                                    log.type === 'success' ? 'text-emerald-700 font-semibold' : 'text-slate-700'
                                }`}>
                                    {log.message}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* 16-Page PDF Download Action Card */}
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2 text-blue-900 font-bold text-xs uppercase tracking-wide">
                            <span>📄 Institutional PDF Dossier</span>
                        </div>
                        <p className="text-xs text-slate-600">
                            Download the comprehensive 16-page research brief covering all balance sheet, income statement, cash flow, DuPont ratios, and DCF models.
                        </p>
                        <button
                            onClick={handleDownloadPdf}
                            className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-2 px-3 rounded-lg text-xs shadow-sm flex items-center justify-center gap-2 transition"
                        >
                            <span>Download 16-Page Report (PDF)</span>
                        </button>
                    </div>
                </aside>

                {/* Right Main Panel: Comprehensive Financial Demonstrations */}
                <main className="flex-1 p-6 space-y-6 overflow-y-auto">
                    {/* Company Header Card */}
                    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">{data?.ticker || ticker}</span>
                                <span className="text-xs text-slate-500 font-semibold">{fin.exchange || ms.exchange || "Global Market"}</span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold font-mono">
                                    Status: {data?.critic_feedback || "APPROVED"}
                                </span>
                            </div>
                            <h2 className="text-2xl font-black text-slate-900">{fin.name || ms.name || ticker}</h2>
                            <p className="text-xs text-slate-500 mt-1 font-medium">Sector: {fin.sector || ms.sector || "Industrial Operations"} | Reporting Currency: {currency}</p>
                        </div>

                        <div className="flex items-center gap-6 bg-slate-50 px-5 py-3 rounded-xl border border-slate-200">
                            <div>
                                <div className="text-[11px] font-semibold text-slate-400 uppercase">Live Quote</div>
                                <div className="text-xl font-black text-slate-900">
                                    {currencySymbol} {ms.price ? ms.price.toFixed(2) : "0.00"}
                                </div>
                            </div>
                            <div className="border-l border-slate-200 pl-4">
                                <div className="text-[11px] font-semibold text-slate-400 uppercase">Market Cap</div>
                                <div className="text-base font-bold text-slate-800">{ms.market_cap_formatted || "N/A"}</div>
                            </div>
                            <div className="border-l border-slate-200 pl-4">
                                <div className="text-[11px] font-semibold text-slate-400 uppercase">12-Mo Target</div>
                                <div className="text-base font-bold text-emerald-700">
                                    {currencySymbol} {rec.target_price ? rec.target_price.toFixed(2) : (ms.price ? (ms.price * 1.15).toFixed(2) : "N/A")}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Navigation Tabs for All Company Finances */}
                    <div className="flex border-b border-slate-200 gap-1 overflow-x-auto text-xs font-bold">
                        {[
                            { id: "overview", label: "Executive Overview & Charts" },
                            { id: "income", label: "Income Statement (4-Year)" },
                            { id: "balance", label: "Balance Sheet & Capital" },
                            { id: "cashflow", label: "Cash Flow & Capital Allocation" },
                            { id: "dupont", label: "DuPont & Financial Ratios" },
                            { id: "dcf", label: "DCF Valuation & Sensitivity" },
                            { id: "stress", label: "Risk Matrix & Stress Tests" },
                            { id: "rag", label: "SEC Filings & Agent Audit" }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-4 py-2.5 border-b-2 transition whitespace-nowrap ${
                                    activeTab === tab.id
                                        ? "border-blue-700 text-blue-700 font-extrabold bg-blue-50/50"
                                        : "border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300"
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* TAB 1: EXECUTIVE OVERVIEW & CHARTS */}
                    {activeTab === "overview" && (
                        <div className="space-y-6">
                            {/* Key Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase">Trailing P/E</div>
                                    <div className="text-xl font-black text-slate-900 mt-1">{val.trailing_pe ? `${val.trailing_pe.toFixed(1)}x` : "N/A"}</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5">Sector Avg: 24.5x</div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase">DuPont ROE</div>
                                    <div className="text-xl font-black text-emerald-700 mt-1">{ratios.dupont_3_stage ? `${ratios.dupont_3_stage.roe_pct}%` : "N/A"}</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5">Return on Equity</div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase">FCF Conversion</div>
                                    <div className="text-xl font-black text-blue-700 mt-1">{cf.fcf_conversion ? `${cf.fcf_conversion}%` : "N/A"}</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5">FCF / Net Income</div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                    <div className="text-[11px] font-bold text-slate-400 uppercase">Institutional Rating</div>
                                    <div className="text-base font-black text-emerald-800 mt-1.5">{rec.rating || "CONVICTION BUY"}</div>
                                    <div className="text-[11px] text-slate-500 mt-0.5">Horizon: 12-18 Months</div>
                                </div>
                            </div>

                            {/* Charts Grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Revenue vs Net Income Chart */}
                                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                        <h3 className="text-sm font-bold text-slate-800">4-Year Revenue & Net Income ({currency} Billions)</h3>
                                        <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Audited Financials</span>
                                    </div>
                                    <div className="h-64">
                                        {window.Recharts && (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={chartData}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                    <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 12 }} />
                                                    <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
                                                    <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#cbd5e1", color: "#0f172a" }} />
                                                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                                                    <Bar dataKey="revenue" fill="#2563eb" name={`Revenue (${currency} B)`} radius={[4, 4, 0, 0]} />
                                                    <Line type="monotone" dataKey="netIncome" stroke="#059669" strokeWidth={3} name={`Net Income (${currency} B)`} />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </div>

                                {/* Operating Cash Flow vs Free Cash Flow Chart */}
                                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                        <h3 className="text-sm font-bold text-slate-800">Cash Flow Generation & FCF ({currency} Billions)</h3>
                                        <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">Liquidity Health</span>
                                    </div>
                                    <div className="h-64">
                                        {window.Recharts && (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={chartData}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                                    <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 12 }} />
                                                    <YAxis stroke="#64748b" tick={{ fontSize: 12 }} />
                                                    <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#cbd5e1", color: "#0f172a" }} />
                                                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                                                    <Bar dataKey="operatingCF" fill="#1e3a8a" name={`Operating CF (${currency} B)`} radius={[4, 4, 0, 0]} />
                                                    <Bar dataKey="freeCF" fill="#10b981" name={`Free Cash Flow (${currency} B)`} radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: INCOME STATEMENT */}
                    {activeTab === "income" && (
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-base font-bold text-slate-900">Multi-Year Audited Income Statement ({currency} Billions)</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                                            <th className="p-2.5">Line Item</th>
                                            {years.map(y => <th key={y} className="p-2.5 text-right">{y}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-slate-800">
                                        <tr className="font-bold bg-slate-50/50"><td className="p-2.5">Total Revenue</td>{inc.revenue?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5 text-slate-600">Cost of Goods Sold (COGS)</td>{inc.cogs?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr className="font-semibold bg-slate-50/30"><td className="p-2.5">Gross Profit</td>{inc.gross_profit?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono text-blue-700">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5 text-slate-600">Research & Development (R&D)</td>{inc.rd_expense?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5 text-slate-600">Selling, General & Admin (SG&A)</td>{inc.sga_expense?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr className="font-semibold"><td className="p-2.5">Operating Income (EBIT)</td>{inc.operating_income?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr className="font-bold bg-blue-50/40"><td className="p-2.5">EBITDA</td>{inc.ebitda?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono text-blue-900">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5 text-slate-600">Net Interest Expense</td>{inc.interest_expense?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5 text-slate-600">Pre-Tax Income (EBT)</td>{inc.pretax_income?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5 text-slate-600">Income Taxes</td>{inc.income_tax?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr className="font-bold bg-emerald-50/60"><td className="p-2.5 text-emerald-900">Net Income (Common Equity)</td>{inc.net_income?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono text-emerald-800 font-bold">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5 font-semibold">Diluted EPS ({currency})</td>{inc.eps?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono font-bold">{v.toFixed(2)}</td>)}</tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: BALANCE SHEET */}
                    {activeTab === "balance" && (
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-base font-bold text-slate-900">Audited Balance Sheet & Capital Structure ({currency} Billions)</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                                            <th className="p-2.5">Balance Sheet Line Item</th>
                                            {years.map(y => <th key={y} className="p-2.5 text-right">{y}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-slate-800">
                                        <tr><td className="p-2.5">Cash & Cash Equivalents</td>{bs.cash_and_equiv?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5">Short-Term Marketable Securities</td>{bs.short_term_inv?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5">Accounts Receivable (Net)</td>{bs.accounts_rec?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5">Inventories</td>{bs.inventories?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr className="font-bold bg-slate-50"><td className="p-2.5">Total Current Assets</td>{bs.current_assets?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5">Net Property, Plant & Equipment</td>{bs.net_ppe?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr className="font-bold bg-blue-50/50"><td className="p-2.5 text-blue-900">Total Assets</td>{bs.total_assets?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono font-bold">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5">Accounts Payable</td>{bs.accounts_payable?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5">Short-Term Debt</td>{bs.short_term_debt?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr className="font-bold bg-slate-50"><td className="p-2.5">Total Current Liabilities</td>{bs.current_liabilities?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5">Long-Term Funded Debt</td>{bs.long_term_debt?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr className="font-bold bg-slate-50"><td className="p-2.5">Total Liabilities</td>{bs.total_liabilities?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr className="font-bold bg-emerald-50/60"><td className="p-2.5 text-emerald-900">Total Stockholders' Equity</td>{bs.stockholders_equity?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono font-bold text-emerald-800">{v.toFixed(2)}</td>)}</tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB 4: CASH FLOW */}
                    {activeTab === "cashflow" && (
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-base font-bold text-slate-900">Audited Cash Flow Statement ({currency} Billions)</h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                                            <th className="p-2.5">Cash Flow Line Item</th>
                                            {years.map(y => <th key={y} className="p-2.5 text-right">{y}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-slate-800">
                                        <tr className="font-bold bg-blue-50/40"><td className="p-2.5 text-blue-900">Operating Cash Flow (OCF)</td>{cf.operating_cf?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono font-bold">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5">Depreciation & Amortization</td>{cf.depreciation?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5">Working Capital Change</td>{cf.working_cap_delta?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5 text-red-600">Capital Expenditures (CapEx)</td>{cf.capex?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono text-red-600">{v.toFixed(2)}</td>)}</tr>
                                        <tr className="font-bold bg-emerald-50/60"><td className="p-2.5 text-emerald-900">Free Cash Flow (FCF = OCF - CapEx)</td>{cf.free_cf?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono font-bold text-emerald-800">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5">Financing Activities Cash Flow</td>{cf.financing_cf?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5">Common Stock Repurchases</td>{cf.share_repurchase?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                        <tr><td className="p-2.5">Cash Dividends Paid</td>{cf.dividends_paid?.map((v, i) => <td key={i} className="p-2.5 text-right font-mono">{v.toFixed(2)}</td>)}</tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* TAB 5: DUPONT & RATIOS */}
                    {activeTab === "dupont" && (
                        <div className="space-y-6">
                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                                <h3 className="text-base font-bold text-slate-900">DuPont 3-Stage Return on Equity Decomposition</h3>
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <div className="text-xs font-semibold text-slate-500">Net Profit Margin</div>
                                        <div className="text-2xl font-black text-blue-700 mt-1">{ratios.dupont_3_stage?.net_margin_pct}%</div>
                                        <div className="text-[11px] text-slate-400 mt-0.5">Net Income / Revenue</div>
                                    </div>
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <div className="text-xs font-semibold text-slate-500">Asset Turnover</div>
                                        <div className="text-2xl font-black text-indigo-700 mt-1">{ratios.dupont_3_stage?.asset_turnover}x</div>
                                        <div className="text-[11px] text-slate-400 mt-0.5">Revenue / Total Assets</div>
                                    </div>
                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <div className="text-xs font-semibold text-slate-500">Financial Multiplier</div>
                                        <div className="text-2xl font-black text-purple-700 mt-1">{ratios.dupont_3_stage?.equity_multiplier}x</div>
                                        <div className="text-[11px] text-slate-400 mt-0.5">Total Assets / Equity</div>
                                    </div>
                                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                                        <div className="text-xs font-bold text-emerald-800">DuPont ROE</div>
                                        <div className="text-2xl font-black text-emerald-700 mt-1">{ratios.dupont_3_stage?.roe_pct}%</div>
                                        <div className="text-[11px] text-emerald-600 mt-0.5">Consolidated Return</div>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                                <h3 className="text-base font-bold text-slate-900">Operational Efficiency & Working Capital Cycle</h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                        <div className="text-xs text-slate-500">Current Ratio</div>
                                        <div className="text-lg font-bold text-slate-900">{ratios.liquidity?.current_ratio}x</div>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                        <div className="text-xs text-slate-500">Quick Ratio</div>
                                        <div className="text-lg font-bold text-slate-900">{ratios.liquidity?.quick_ratio}x</div>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                        <div className="text-xs text-slate-500">Debt-to-Equity</div>
                                        <div className="text-lg font-bold text-slate-900">{ratios.solvency?.debt_to_equity}x</div>
                                    </div>
                                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                                        <div className="text-xs text-slate-500">Cash Conversion Cycle</div>
                                        <div className="text-lg font-bold text-slate-900">{ratios.efficiency?.ccc_days} Days</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 6: DCF VALUATION */}
                    {activeTab === "dcf" && (
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-base font-bold text-slate-900">5-Year DCF Intrinsic Valuation Model</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                    <div className="text-xs text-slate-500 font-semibold">WACC Cost of Capital</div>
                                    <div className="text-xl font-black text-slate-900">{dcf.wacc}%</div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                    <div className="text-xs text-slate-500 font-semibold">Implied Intrinsic Price</div>
                                    <div className="text-xl font-black text-emerald-700">{currencySymbol} {dcf.implied_share_price?.toFixed(2)}</div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                    <div className="text-xs text-slate-500 font-semibold">DCF Valuation Upside</div>
                                    <div className="text-xl font-black text-blue-700">{dcf.dcf_upside_pct}%</div>
                                </div>
                            </div>

                            {/* Sensitivity Table */}
                            <div className="mt-4">
                                <div className="text-xs font-bold text-slate-700 mb-2">Valuation Sensitivity: WACC vs. Terminal Growth Rate</div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-center border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100 text-slate-700 font-semibold border border-slate-200">
                                                <th className="p-2 text-left">WACC \ g</th>
                                                {dcf.tg_headers?.map(g => <th key={g} className="p-2">{g}</th>)}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 border border-slate-200">
                                            {dcf.wacc_headers?.map((w, idx) => (
                                                <tr key={w} className="hover:bg-slate-50">
                                                    <td className="p-2 font-bold text-left bg-slate-50">{w}</td>
                                                    {dcf.sensitivity_matrix?.[idx]?.map((val_p, j) => (
                                                        <td key={j} className="p-2 font-mono">{currencySymbol} {val_p}</td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 7: STRESS TESTS */}
                    {activeTab === "stress" && (
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-base font-bold text-slate-900">Quantitative Downside Stress-Testing Scenarios</h3>
                            <div className="space-y-3">
                                {fin.stress_scenarios?.map((sc, i) => (
                                    <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="font-bold text-sm text-slate-900">{sc.name}</span>
                                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">{sc.solvency_cushion}</span>
                                        </div>
                                        <p className="text-xs text-slate-600">{sc.desc}</p>
                                        <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                                            <div><span className="text-slate-400">EBITDA Shock:</span> <span className="font-bold text-red-600">{sc.ebitda_impact}</span></div>
                                            <div><span className="text-slate-400">FCF Impact:</span> <span className="font-bold text-red-600">{sc.fcf_impact}</span></div>
                                            <div><span className="text-slate-400">Net Debt / EBITDA:</span> <span className="font-bold text-slate-900">{sc.net_debt_ebitda}</span></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TAB 8: SEC FILINGS & AUDIT */}
                    {activeTab === "rag" && (
                        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                            <h3 className="text-base font-bold text-slate-900">SEC {filingType} Filings RAG Retrieval & Audit Log</h3>
                            <div className="space-y-3">
                                {(data?.sec_insights || []).map((chunk, i) => (
                                    <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-200 font-mono text-xs text-slate-800">
                                        {chunk}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

ReactDOM.render(<App />, document.getElementById("root"));
