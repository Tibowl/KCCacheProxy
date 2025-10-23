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
};

document.addEventListener("DOMContentLoaded", () => navSystem.init());
