const navSystem = {
    init() {
        const navItems = document.querySelectorAll(".nav-item");
        const pullItem = document.querySelector(".pull-item");
        const footer = document.querySelector("footer");

        for (const item of navItems) {
            item.addEventListener("click", () => this.tab(item));
            item.addEventListener("keyup", (e) => {
                if (e.key === " ") this.tab(item);
            });
        }

        footer.addEventListener("click", (e) => this.pull(pullItem));
        footer.addEventListener("keyup", (e) => {
            if (e.key === " ") this.pull(pullItem);
        });
        
        this.disableLogClicks();
        this.setupLogCopy();
    },

    tab(el) {
        const id = el.dataset.id;

        document.querySelectorAll(".nav-item-active")
            .forEach(tab => tab.classList.remove("nav-item-active"));

        el.classList.add("nav-item-active");

        document.querySelectorAll(".main-item-active")
            .forEach(panel => panel.classList.remove("main-item-active"));

        const target = document.getElementById(`${id}`);
        if (target) target.classList.add("main-item-active");
    },

    pull(el) {
        const id = el.dataset.id;
        const img = el.querySelector("img");
        const isActive = el.classList.contains("pull-item-active");
        const logFooter = document.getElementById("log-footer");

        document.querySelectorAll(".pull-item-active").forEach(tab => {
            tab.classList.remove("pull-item-active");
            const icon = tab.querySelector("img");
            if (icon) icon.src = "resources/angle-small-up.svg";
        });

        document.querySelectorAll(".content-item-active")
            .forEach(panel => panel.classList.remove("content-item-active"));

        if (isActive) {
            if (logFooter) logFooter.style.display = "block";
            return;
        }

        el.classList.add("pull-item-active");
        if (img) img.src = "resources/angle-small-down.svg";
        if (logFooter) logFooter.style.display = "none";

        const target = document.getElementById(id);
        if (target) target.classList.add("content-item-active");

        target.scrollTop = target.scrollHeight;
        target.scrollLeft = target.scrollWidth;
    },

    disableLogClicks() {
        document.querySelectorAll(".content-item").forEach(logEl => {
            logEl.addEventListener("click", (e) => e.stopPropagation());
        });
    },

    setupLogCopy() {
        const copyBtn = document.getElementById("copy-button");
        const logContainer = document.getElementById("log");
        const logFooter = document.getElementById("log-footer");

        copyBtn.addEventListener("mouseover", () => {
            copyBtn.src = "resources/copy-alt.svg";
        });

        copyBtn.addEventListener("mouseout", () => {
            copyBtn.src = "resources/journal-alt.svg";
        });

        if (copyBtn) {
            copyBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const logs = "```\n" + Array.from(logContainer.children)
                    .map(el => el.innerText)
                    .join("\n") + "\n```";
                navigator.clipboard.writeText(logs)
                    .then(() => logFooter.textContent = "Logs copied to clipboard!")
                    .catch(err => console.log(err));
            });
        }
    },
};

document.addEventListener("DOMContentLoaded", () => navSystem.init());
