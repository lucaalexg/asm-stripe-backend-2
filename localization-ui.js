// Localization UI Handler
(() => {
  let languageDropdownOpen = false;
  let currencyDropdownOpen = false;

  // Wait for both DOM and Localization to be ready
  function initLocalizationUI() {
    if (typeof Localization === "undefined") {
      setTimeout(initLocalizationUI, 100);
      return;
    }

    setupLanguageSwitcher();
    setupCurrencySwitcher();
    updateUIDisplay();
    setupDropdownToggle();

    // Listen for localization changes to update UI
    document.addEventListener("localizationChanged", updateUIDisplay);
  }

  function setupLanguageSwitcher() {
    const dropdown = document.getElementById("language-dropdown");
    if (!dropdown) return;

    const languages = Localization.getLanguages();
    const currentLang = Localization.getLanguage();

    // Sort by region then by name
    const sorted = Object.entries(languages).sort((a, b) => {
      if (a[1].region !== b[1].region) {
        return a[1].region.localeCompare(b[1].region);
      }
      return a[1].name.localeCompare(b[1].name);
    });

    let currentRegion = null;

    sorted.forEach(([code, { name, nativeName, region }]) => {
      // Add region divider
      if (region !== currentRegion) {
        if (currentRegion !== null) {
          const divider = document.createElement("div");
          divider.className = "asm-language-divider";
          divider.style.height = "1px";
          divider.style.backgroundColor = "var(--asm-border)";
          divider.style.margin = "6px 0";
          dropdown.appendChild(divider);
        }
        currentRegion = region;
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "asm-language-item";
      if (code === currentLang) btn.classList.add("active");

      btn.innerHTML = `
        <span class="asm-language-item-label">${name}</span>
        <span class="asm-language-item-native">${nativeName}</span>
      `;

      btn.addEventListener("click", () => {
        Localization.setLanguage(code);
        updateAllLanguageButtons(code);
      });

      dropdown.appendChild(btn);
    });
  }

  function setupCurrencySwitcher() {
    const dropdown = document.getElementById("currency-dropdown");
    if (!dropdown) return;

    const currencies = Localization.getCurrencies();
    const currentCur = Localization.getCurrency();

    // Sort by region then by name
    const sorted = Object.entries(currencies).sort((a, b) => {
      if (a[1].region !== b[1].region) {
        return a[1].region.localeCompare(b[1].region);
      }
      return a[1].name.localeCompare(b[1].name);
    });

    let currentRegion = null;

    sorted.forEach(([code, { name, symbol, region }]) => {
      // Add region divider
      if (region !== currentRegion) {
        if (currentRegion !== null) {
          const divider = document.createElement("div");
          divider.className = "asm-currency-divider";
          divider.style.height = "1px";
          divider.style.backgroundColor = "var(--asm-border)";
          divider.style.margin = "6px 0";
          dropdown.appendChild(divider);
        }
        currentRegion = region;
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "asm-currency-item--dropdown";
      if (code === currentCur) btn.classList.add("active");

      btn.innerHTML = `
        <span class="asm-currency-item-label">${code} - ${name}</span>
        <span class="asm-currency-item-native">${symbol}</span>
      `;

      btn.addEventListener("click", () => {
        Localization.setCurrency(code);
        updateAllCurrencyButtons(code);
      });

      dropdown.appendChild(btn);
    });
  }

  function updateAllLanguageButtons(code) {
    document.querySelectorAll(".asm-language-item").forEach((btn) => {
      btn.classList.remove("active");
    });
    document.querySelectorAll(".asm-language-item").forEach((btn) => {
      if (btn.textContent.includes(Localization.getLanguages()[code].name)) {
        btn.classList.add("active");
      }
    });
  }

  function updateAllCurrencyButtons(code) {
    document.querySelectorAll(".asm-currency-item--dropdown").forEach((btn) => {
      btn.classList.remove("active");
    });
    document.querySelectorAll(".asm-currency-item--dropdown").forEach((btn) => {
      if (btn.textContent.includes(code)) {
        btn.classList.add("active");
      }
    });
  }

  function updateUIDisplay() {
    const lang = Localization.getLanguage();
    const currency = Localization.getCurrency();

    // Update header display
    const langDisplay = document.getElementById("current-language");
    const curDisplay = document.getElementById("current-currency");
    const accountCurDisplay = document.getElementById("account-currency");
    const headerCurDisplay = document.getElementById("header-currency");

    if (langDisplay) langDisplay.textContent = lang.toUpperCase();
    if (curDisplay) curDisplay.textContent = currency;
    if (accountCurDisplay) accountCurDisplay.textContent = currency;
    if (headerCurDisplay) headerCurDisplay.textContent = currency;
  }

  function setupDropdownToggle() {
    const langBtn = document.querySelector(".asm-language-btn");
    const langDropdown = document.getElementById("language-dropdown");
    const curBtn = document.querySelector(".asm-currency-btn");
    const curDropdown = document.getElementById("currency-dropdown");

    if (langBtn && langDropdown) {
      langBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        languageDropdownOpen = !languageDropdownOpen;
        langDropdown.style.display = languageDropdownOpen ? "block" : "none";
        if (languageDropdownOpen && curDropdown) {
          curDropdown.style.display = "none";
          currencyDropdownOpen = false;
        }
      });
    }

    if (curBtn && curDropdown) {
      curBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        currencyDropdownOpen = !currencyDropdownOpen;
        curDropdown.style.display = currencyDropdownOpen ? "block" : "none";
        if (currencyDropdownOpen && langDropdown) {
          langDropdown.style.display = "none";
          languageDropdownOpen = false;
        }
      });
    }

    // Close dropdowns when clicking outside
    document.addEventListener("click", () => {
      if (langDropdown) langDropdown.style.display = "none";
      if (curDropdown) curDropdown.style.display = "none";
      languageDropdownOpen = false;
      currencyDropdownOpen = false;
    });

    // Close dropdowns when clicking inside (selecting an option)
    if (langDropdown) {
      langDropdown.addEventListener("click", () => {
        setTimeout(() => {
          langDropdown.style.display = "none";
          languageDropdownOpen = false;
        }, 100);
      });
    }

    if (curDropdown) {
      curDropdown.addEventListener("click", () => {
        setTimeout(() => {
          curDropdown.style.display = "none";
          currencyDropdownOpen = false;
        }, 100);
      });
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initLocalizationUI);
  } else {
    initLocalizationUI();
  }
})();
