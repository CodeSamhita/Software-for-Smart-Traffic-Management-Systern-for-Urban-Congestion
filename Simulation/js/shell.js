(function () {
    const pageId = document.body?.dataset?.simPage || "simulation";
    const backendBase = location.protocol.startsWith("http") ? location.origin : "http://127.0.0.1:8501";

    const pageMeta = {
        simulation: {
            icon: "fa-gauge",
            title: "Control Dashboard & Operations",
            subtitle: "Interactive junction twin",
        },
        analytics: {
            icon: "fa-gauge",
            title: "Control Dashboard & Operations",
            subtitle: "Live trends and archived sessions",
        },
    };

    const navItems = [
        { id: "home", href: `${backendBase}/index`, icon: "fa-house", label: "Home", external: true },
        { id: "dashboard", href: `${backendBase}/dashboard`, icon: "fa-gauge", label: "Dashboard", external: true },
        { id: "control-center", href: `${backendBase}/control-center`, icon: "fa-sliders", label: "Control Center", external: true },
        { id: "simulation", href: "simulation1.html", icon: "fa-desktop", label: "Simulation" },
        { id: "analytics", href: "traffic-analytics.html", icon: "fa-chart-line", label: "Analytics" },
    ];

    function renderHeader() {
        const target = document.getElementById("shell-header");
        if (!target) return;
        const meta = pageMeta[pageId] || pageMeta.simulation;
        target.className = "simulation-shell-header";
        target.innerHTML = `
            <header class="glass-nav py-3 mb-4">
                <div class="container-fluid px-4 shell-nav-wrap">
                    <div class="shell-nav-brand">
                        <i class="fa-solid ${meta.icon} shell-nav-icon" aria-hidden="true"></i>
                        <div class="shell-nav-copy">
                            <span class="eyebrow mb-0">Smart Traffic Suite</span>
                            <h5 class="fw-bold">${meta.title}</h5>
                        </div>
                    </div>
                    <nav class="shell-nav-links" aria-label="Primary navigation">
                        ${navItems.map(item => {
                            const active = item.id === pageId;
                            const targetAttr = item.external ? ' target="_blank" rel="noopener"' : "";
                            const currentAttr = active ? ' aria-current="page"' : "";
                            const buttonClass = active
                                ? "btn neon-btn"
                                : "btn btn-outline-secondary text-light border-secondary";
                            return `<a href="${item.href}" class="${buttonClass}"${targetAttr}${currentAttr}><i class="fa-solid ${item.icon} me-2"></i>${item.label}</a>`;
                        }).join("")}
                    </nav>
                </div>
            </header>
        `;
    }

    function renderFooter() {
        const target = document.getElementById("shell-footer");
        if (!target) return;
        const meta = pageMeta[pageId] || pageMeta.simulation;
        target.className = "simulation-shell-footer";
        target.innerHTML = `
            <div class="glass-card">
                <strong>Smart Traffic Management System</strong>
                <span>${meta.subtitle}. Shared navigation and layout are now aligned across the simulation pages.</span>
            </div>
        `;
    }

    renderHeader();
    renderFooter();
}());
