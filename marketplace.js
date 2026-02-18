(() => {
  const API = {
    accountStatus: "/api/account-status",
    checkout: "/api/create-checkout-session",
    customerSignup: "/api/customer-signup",
    listings: "/api/listings",
    moderation: "/api/moderate-listings",
    onboarding: "/api/start-onboarding",
    offers: "/api/offers",
    savedSearches: "/api/saved-searches",
    uploadImage: "/api/upload-image",
    wishlist: "/api/wishlist",
  };

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(el, message, tone = "") {
    if (!el) return;
    el.classList.remove("status-line--error", "status-line--ok");
    if (tone === "error") el.classList.add("status-line--error");
    if (tone === "ok") el.classList.add("status-line--ok");
    el.textContent = message || "";
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseHttpUrl(value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!/^https?:\/\//i.test(trimmed)) return "";
    return trimmed;
  }

  function parseUrlList(value) {
    if (!value || typeof value !== "string") return [];
    const seen = new Set();
    const urls = [];
    value
      .split(/[\n,]/g)
      .map((item) => parseHttpUrl(item))
      .filter(Boolean)
      .forEach((url) => {
        if (!seen.has(url)) {
          seen.add(url);
          urls.push(url);
        }
      });
    return urls;
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function offerStatusLabel(status) {
    const key = String(status || "").toLowerCase();
    if (key === "countered") return "Counter offer";
    if (key === "accepted") return "Accepted";
    if (key === "rejected") return "Rejected";
    if (key === "cancelled") return "Cancelled";
    if (key === "expired") return "Expired";
    return "Pending";
  }

  function normalizeMediaUrls(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((item) => parseHttpUrl(item)).filter(Boolean);
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => parseHttpUrl(item)).filter(Boolean);
        }
      } catch (_error) {
        return parseUrlList(value);
      }
    }
    return [];
  }

  function getListingMedia(listing) {
    const displayMedia = normalizeMediaUrls(listing.display_media_urls);
    const approvedMedia = normalizeMediaUrls(listing.approved_media_urls);
    const submittedMedia = normalizeMediaUrls(listing.media_urls);
    const fallbackPrimary = parseHttpUrl(listing.primary_image_url || listing.image_url);
    const chosen =
      displayMedia.length > 0
        ? displayMedia
        : approvedMedia.length > 0
          ? approvedMedia
          : submittedMedia.length > 0
            ? submittedMedia
            : fallbackPrimary
              ? [fallbackPrimary]
              : [];
    return chosen;
  }

  function moderationLabel(state) {
    if (state === "approved") return "Approved";
    if (state === "rejected") return "Rejected";
    return "Pending";
  }

  function moderationClass(state) {
    if (state === "approved") return "moderation-badge--approved";
    if (state === "rejected") return "moderation-badge--rejected";
    return "moderation-badge--pending";
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    const text = await response.text();

    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (_error) {
        payload = { raw: text };
      }
    }

    if (!response.ok) {
      throw new Error(payload.error || `Request failed (${response.status})`);
    }
    return payload;
  }

  function formatCurrency(priceCents, currencyCode = "eur") {
    try {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: String(currencyCode).toUpperCase(),
      }).format((priceCents || 0) / 100);
    } catch (_error) {
      return `${(priceCents || 0) / 100} ${String(currencyCode || "eur").toUpperCase()}`;
    }
  }

  function debounce(fn, delay) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  async function startCheckout(listingId, button, statusEl, buyerEmail = "") {
    button.disabled = true;
    setStatus(statusEl, "Creating secure checkout...", "");

    try {
      const data = await requestJson(API.checkout, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          origin: window.location.origin,
          buyerEmail: normalizeEmail(buyerEmail),
        }),
      });

      if (!data.url) {
        throw new Error("Checkout URL missing in API response.");
      }
      window.location.href = data.url;
    } catch (error) {
      setStatus(statusEl, error.message || "Could not start checkout.", "error");
      button.disabled = false;
    }
  }

  function listingCardTemplate(listing) {
    const title = escapeHtml(listing.title);
    const brand = escapeHtml(listing.brand);
    const condition = escapeHtml(listing.condition || (listing.is_new ? "New" : "Pre-owned"));
    const size = escapeHtml(listing.size || "One size");
    const price = formatCurrency(listing.price_cents, listing.currency);
    const mediaUrls = getListingMedia(listing);
    const firstImage = mediaUrls[0] || "";
    const isApproved = String(listing.moderation_status || "").toLowerCase() === "approved";
    const mediaClass = isApproved ? "listing-media listing-media--approved" : "listing-media";

    const media = firstImage
      ? `<img class="${mediaClass}" loading="lazy" src="${escapeHtml(firstImage)}" alt="${brand} ${title}" data-main-media />`
      : `<div class="listing-media listing-media--placeholder">No image</div>`;

    const thumbs =
      mediaUrls.length > 1
        ? `<div class="media-strip">${mediaUrls
            .map(
              (url, index) =>
                `<button type="button" class="media-dot${index === 0 ? " media-dot--active" : ""}" data-media-index="${index}"><img src="${escapeHtml(
                  url
                )}" alt="Listing image ${index + 1}" loading="lazy" /></button>`
            )
            .join("")}</div>`
        : "";

    const mediaNavigation =
      mediaUrls.length > 1
        ? `<button class="media-nav media-nav--prev" type="button" data-media-prev>&lsaquo;</button>
           <button class="media-nav media-nav--next" type="button" data-media-next>&rsaquo;</button>`
        : "";

    const videoUrl = parseHttpUrl(listing.video_url);
    const videoLink = videoUrl
      ? `<a class="listing-video-link" href="${escapeHtml(videoUrl)}" target="_blank" rel="noreferrer noopener">View product video</a>`
      : "";

    return `<article class="listing-card">
      <div class="listing-media-wrap" data-media='${encodeURIComponent(
        JSON.stringify(mediaUrls)
      )}'>
        ${media}
        ${mediaNavigation}
      </div>
      <div class="listing-content">
        <p class="listing-brand">${brand}</p>
        <h3 class="listing-title">${title}</h3>
        <p class="listing-meta">${condition} • ${size}</p>
        <p class="listing-price">${price}</p>
        ${videoLink}
        ${thumbs}
        <div class="listing-actions">
          <button class="button buy-button" data-action="buy" data-listing-id="${escapeHtml(listing.id)}">Buy now</button>
          <div class="button-row">
            <button class="button button--ghost buy-button" data-action="save" data-listing-id="${escapeHtml(
              listing.id
            )}">Save item</button>
          </div>
          <div class="offer-row">
            <input type="number" min="1" step="1" placeholder="Offer €" data-offer-input />
            <button class="button button--ghost" data-action="offer" data-listing-id="${escapeHtml(
              listing.id
            )}">Offer</button>
          </div>
        </div>
      </div>
    </article>`;
  }

  function parseMediaDataAttribute(value) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(decodeURIComponent(value));
      return Array.isArray(parsed) ? parsed.map((item) => parseHttpUrl(item)).filter(Boolean) : [];
    } catch (_error) {
      return [];
    }
  }

  function wireListingCardMedia(grid) {
    grid.querySelectorAll(".listing-card").forEach((card) => {
      const mediaWrap = card.querySelector(".listing-media-wrap");
      const mainMedia = card.querySelector("[data-main-media]");
      if (!mediaWrap || !mainMedia) return;

      const media = parseMediaDataAttribute(mediaWrap.getAttribute("data-media"));
      if (media.length <= 1) return;

      let activeIndex = 0;
      const dots = Array.from(card.querySelectorAll(".media-dot"));

      function renderMedia() {
        mainMedia.src = media[activeIndex];
        dots.forEach((dot, index) => {
          dot.classList.toggle("media-dot--active", index === activeIndex);
        });
      }

      card.querySelectorAll("[data-media-index]").forEach((button) => {
        button.addEventListener("click", () => {
          const next = Number.parseInt(button.getAttribute("data-media-index"), 10);
          if (Number.isNaN(next)) return;
          activeIndex = Math.max(0, Math.min(media.length - 1, next));
          renderMedia();
        });
      });

      const prevButton = card.querySelector("[data-media-prev]");
      const nextButton = card.querySelector("[data-media-next]");
      if (prevButton) {
        prevButton.addEventListener("click", () => {
          activeIndex = (activeIndex - 1 + media.length) % media.length;
          renderMedia();
        });
      }
      if (nextButton) {
        nextButton.addEventListener("click", () => {
          activeIndex = (activeIndex + 1) % media.length;
          renderMedia();
        });
      }
    });
  }

  function initMarketplacePage() {
    const customerSignupForm = $("customer-signup-form");
    const customerSignupStatus = $("customer-signup-status");
    const customerName = $("customer-name");
    const customerEmail = $("customer-email");
    const customerPhone = $("customer-phone");
    const customerMarketing = $("customer-marketing");
    const customerContextForm = $("customer-context-form");
    const customerContextEmail = $("customer-context-email");
    const customerContextStatus = $("customer-context-status");
    const refreshMemberDataButton = $("refresh-member-data");
    const wishlistItems = $("wishlist-items");
    const offerItems = $("offer-items");
    const savedSearchItems = $("saved-search-items");
    const searchInput = $("search");
    const brandInput = $("brand");
    const sizeInput = $("size-filter");
    const conditionSelect = $("condition");
    const minPriceInput = $("min-price");
    const maxPriceInput = $("max-price");
    const sortSelect = $("sort");
    const saveSearchButton = $("save-search");
    const resetFiltersButton = $("reset-filters");
    const quickFilterChips = $("quick-filter-chips");
    const refreshButton = $("refresh");
    const grid = $("listing-grid");
    const status = $("listing-status");

    if (
      !searchInput ||
      !brandInput ||
      !sizeInput ||
      !conditionSelect ||
      !minPriceInput ||
      !maxPriceInput ||
      !sortSelect ||
      !saveSearchButton ||
      !resetFiltersButton ||
      !refreshButton ||
      !grid ||
      !status
    ) {
      return;
    }

    const memberStorageKey = "asm_customer_email";
    const state = {
      search: "",
      brand: "",
      size: "",
      condition: "all",
      minPrice: "",
      maxPrice: "",
      sort: "newest",
      customerEmail: normalizeEmail(window.localStorage.getItem(memberStorageKey) || ""),
      loading: false,
    };

    if (customerContextEmail) {
      customerContextEmail.value = state.customerEmail;
    }

    const params = new URLSearchParams(window.location.search);
    const checkoutState = params.get("checkout");
    if (checkoutState === "success") {
      setStatus(status, "Payment completed. Your order is confirmed.", "ok");
    } else if (checkoutState === "cancelled") {
      setStatus(status, "Checkout cancelled. Listing is still available.", "");
    }

    function refreshStateFromInputs() {
      state.search = searchInput.value.trim();
      state.brand = brandInput.value.trim();
      state.size = sizeInput.value.trim();
      state.condition = conditionSelect.value;
      state.minPrice = minPriceInput.value.trim();
      state.maxPrice = maxPriceInput.value.trim();
      state.sort = sortSelect.value || "newest";
    }

    function applyStateToInputs() {
      searchInput.value = state.search;
      brandInput.value = state.brand;
      sizeInput.value = state.size;
      conditionSelect.value = state.condition;
      minPriceInput.value = state.minPrice;
      maxPriceInput.value = state.maxPrice;
      sortSelect.value = state.sort;
      if (customerContextEmail) {
        customerContextEmail.value = state.customerEmail;
      }
      syncChipState();
    }

    function syncChipState() {
      if (!quickFilterChips) return;
      quickFilterChips.querySelectorAll(".chip").forEach((chip) => {
        const chipBrand = chip.getAttribute("data-chip-brand");
        const chipCondition = chip.getAttribute("data-chip-condition");
        const chipSort = chip.getAttribute("data-chip-sort");
        const chipMinPrice = chip.getAttribute("data-chip-min-price");
        const chipMaxPrice = chip.getAttribute("data-chip-max-price");

        const matchesBrand = chipBrand ? state.brand.toLowerCase() === chipBrand.toLowerCase() : true;
        const matchesCondition = chipCondition ? state.condition === chipCondition : true;
        const matchesSort = chipSort ? state.sort === chipSort : true;
        const matchesMin = chipMinPrice ? state.minPrice === chipMinPrice : true;
        const matchesMax = chipMaxPrice ? state.maxPrice === chipMaxPrice : true;

        chip.classList.toggle(
          "chip--active",
          matchesBrand && matchesCondition && matchesSort && matchesMin && matchesMax
        );
      });
    }

    function requireCustomerEmail() {
      const value = normalizeEmail(
        customerContextEmail && customerContextEmail.value
          ? customerContextEmail.value
          : state.customerEmail
      );
      if (!value) {
        setStatus(
          customerContextStatus,
          "Connect your customer email first to use wishlist, offers, and saved searches.",
          "error"
        );
        return "";
      }
      state.customerEmail = value;
      window.localStorage.setItem(memberStorageKey, value);
      if (customerContextEmail) customerContextEmail.value = value;
      return value;
    }

    function renderWishlist(items) {
      if (!wishlistItems) return;
      if (!state.customerEmail) {
        wishlistItems.innerHTML = `<div class="member-item"><p>Connect your account to see wishlist.</p></div>`;
        return;
      }
      if (!items || items.length === 0) {
        wishlistItems.innerHTML = `<div class="member-item"><p>No saved items yet.</p></div>`;
        return;
      }
      wishlistItems.innerHTML = items
        .map((item) => {
          const listing = item.listing || null;
          if (!listing) {
            return `<article class="member-item"><p>This listing is no longer available.</p></article>`;
          }
          return `<article class="member-item">
            <p><strong>${escapeHtml(listing.brand)} ${escapeHtml(listing.title)}</strong></p>
            <p>${formatCurrency(listing.price_cents, listing.currency)} • ${escapeHtml(
              listing.condition || "Condition N/A"
            )}</p>
            <div class="button-row">
              <button class="button button--ghost" data-wishlist-buy="${escapeHtml(
                listing.id
              )}">Buy</button>
              <button class="button button--ghost" data-wishlist-remove="${escapeHtml(
                listing.id
              )}">Remove</button>
            </div>
          </article>`;
        })
        .join("");
    }

    function renderOffers(items) {
      if (!offerItems) return;
      if (!state.customerEmail) {
        offerItems.innerHTML = `<div class="member-item"><p>Connect your account to track offers.</p></div>`;
        return;
      }
      if (!items || items.length === 0) {
        offerItems.innerHTML = `<div class="member-item"><p>No offers yet.</p></div>`;
        return;
      }
      offerItems.innerHTML = items
        .map((offer) => {
          const listing = offer.listing || {};
          const counterAction =
            offer.status === "countered"
              ? `<button class="button button--ghost" data-offer-action="accept_counter" data-offer-id="${escapeHtml(
                  offer.id
                )}">Accept counter</button>`
              : "";
          const cancelAction =
            offer.status === "pending" || offer.status === "countered"
              ? `<button class="button button--ghost" data-offer-action="cancel" data-offer-id="${escapeHtml(
                  offer.id
                )}">Cancel</button>`
              : "";
          return `<article class="member-item">
            <p><strong>${escapeHtml(listing.brand || "")} ${escapeHtml(listing.title || "Listing")}</strong></p>
            <p>Status: ${escapeHtml(offerStatusLabel(offer.status))} • Offer ${formatCurrency(
              offer.amount_cents,
              offer.currency
            )}</p>
            ${
              offer.counter_amount_cents
                ? `<p>Counter: ${formatCurrency(offer.counter_amount_cents, offer.currency)}</p>`
                : ""
            }
            <div class="button-row">${counterAction}${cancelAction}</div>
          </article>`;
        })
        .join("");
    }

    function renderSavedSearches(items) {
      if (!savedSearchItems) return;
      if (!state.customerEmail) {
        savedSearchItems.innerHTML = `<div class="member-item"><p>Connect your account to use saved searches.</p></div>`;
        return;
      }
      if (!items || items.length === 0) {
        savedSearchItems.innerHTML = `<div class="member-item"><p>No saved searches yet.</p></div>`;
        return;
      }
      savedSearchItems.innerHTML = items
        .map((item) => {
          const parts = [];
          if (item.search_query) parts.push(`"${escapeHtml(item.search_query)}"`);
          if (item.brand) parts.push(`Brand: ${escapeHtml(item.brand)}`);
          if (item.size) parts.push(`Size: ${escapeHtml(item.size)}`);
          if (item.condition) parts.push(`Condition: ${escapeHtml(item.condition)}`);
          if (item.min_price !== null) parts.push(`Min: €${escapeHtml(item.min_price)}`);
          if (item.max_price !== null) parts.push(`Max: €${escapeHtml(item.max_price)}`);

          return `<article class="member-item">
            <p><strong>Search preset</strong></p>
            <p>${parts.join(" • ") || "Custom search"}</p>
            <div class="button-row">
              <button class="button button--ghost" data-saved-search-apply='${encodeURIComponent(
                JSON.stringify(item)
              )}'>Apply</button>
              <button class="button button--ghost" data-saved-search-remove="${escapeHtml(
                item.id
              )}">Delete</button>
            </div>
          </article>`;
        })
        .join("");
    }

    async function loadWishlist() {
      if (!state.customerEmail) {
        renderWishlist([]);
        return;
      }
      const data = await requestJson(
        `${API.wishlist}?customer_email=${encodeURIComponent(state.customerEmail)}`
      );
      renderWishlist(data.items || []);
    }

    async function loadOffers() {
      if (!state.customerEmail) {
        renderOffers([]);
        return;
      }
      const data = await requestJson(
        `${API.offers}?customer_email=${encodeURIComponent(state.customerEmail)}&limit=30`
      );
      renderOffers(data.offers || []);
    }

    async function loadSavedSearches() {
      if (!state.customerEmail) {
        renderSavedSearches([]);
        return;
      }
      const data = await requestJson(
        `${API.savedSearches}?customer_email=${encodeURIComponent(state.customerEmail)}&limit=30`
      );
      renderSavedSearches(data.searches || []);
    }

    async function refreshMemberData() {
      try {
        await Promise.all([loadWishlist(), loadOffers(), loadSavedSearches()]);
      } catch (error) {
        setStatus(
          customerContextStatus,
          error.message || "Could not load member data right now.",
          "error"
        );
      }
    }

    async function loadListings() {
      if (state.loading) return;
      state.loading = true;

      const query = new URLSearchParams();
      query.set("status", "active");
      query.set("limit", "30");
      if (state.search) query.set("search", state.search);
      if (state.brand) query.set("brand", state.brand);
      if (state.size) query.set("size", state.size);
      if (state.condition && state.condition !== "all") query.set("condition", state.condition);
      if (state.minPrice) query.set("min_price", state.minPrice);
      if (state.maxPrice) query.set("max_price", state.maxPrice);
      if (state.sort) query.set("sort", state.sort);

      setStatus(status, "Loading curated listings...", "");

      try {
        const data = await requestJson(`${API.listings}?${query.toString()}`);
        const listings = Array.isArray(data.listings) ? data.listings : [];

        if (listings.length === 0) {
          grid.innerHTML = `<div class="panel">No listings match your filters yet.</div>`;
          setStatus(status, "0 results", "");
        } else {
          grid.innerHTML = listings.map(listingCardTemplate).join("");
          wireListingCardMedia(grid);
          setStatus(status, `${listings.length} listings`, "");
        }
      } catch (error) {
        grid.innerHTML = "";
        setStatus(status, error.message || "Could not load listings.", "error");
      } finally {
        state.loading = false;
      }
    }

    const debouncedLoad = debounce(() => {
      refreshStateFromInputs();
      loadListings();
    }, 280);

    searchInput.addEventListener("input", debouncedLoad);
    brandInput.addEventListener("input", debouncedLoad);
    sizeInput.addEventListener("input", debouncedLoad);
    minPriceInput.addEventListener("input", debouncedLoad);
    maxPriceInput.addEventListener("input", debouncedLoad);
    conditionSelect.addEventListener("change", () => {
      refreshStateFromInputs();
      loadListings();
    });
    sortSelect.addEventListener("change", () => {
      refreshStateFromInputs();
      loadListings();
    });
    refreshButton.addEventListener("click", () => {
      refreshStateFromInputs();
      loadListings();
    });

    resetFiltersButton.addEventListener("click", () => {
      state.search = "";
      state.brand = "";
      state.size = "";
      state.condition = "all";
      state.minPrice = "";
      state.maxPrice = "";
      state.sort = "newest";
      applyStateToInputs();
      loadListings();
    });

    if (quickFilterChips) {
      quickFilterChips.addEventListener("click", (event) => {
        const chip = event.target.closest(".chip");
        if (!chip) return;

        const chipBrand = chip.getAttribute("data-chip-brand");
        const chipCondition = chip.getAttribute("data-chip-condition");
        const chipSort = chip.getAttribute("data-chip-sort");
        const chipMinPrice = chip.getAttribute("data-chip-min-price");
        const chipMaxPrice = chip.getAttribute("data-chip-max-price");

        if (chipBrand) {
          state.brand = state.brand.toLowerCase() === chipBrand.toLowerCase() ? "" : chipBrand;
        }
        if (chipCondition) {
          state.condition = state.condition === chipCondition ? "all" : chipCondition;
        }
        if (chipSort) {
          state.sort = state.sort === chipSort ? "newest" : chipSort;
        }
        if (chipMinPrice) {
          state.minPrice = state.minPrice === chipMinPrice ? "" : chipMinPrice;
        }
        if (chipMaxPrice) {
          state.maxPrice = state.maxPrice === chipMaxPrice ? "" : chipMaxPrice;
        }

        applyStateToInputs();
        loadListings();
      });
    }

    if (
      customerSignupForm &&
      customerSignupStatus &&
      customerEmail &&
      customerPhone &&
      customerMarketing
    ) {
      customerSignupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = customerSignupForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        setStatus(customerSignupStatus, "Creating your customer account...", "");

        try {
          const payload = {
            fullName: customerName ? customerName.value.trim() : "",
            email: customerEmail.value.trim(),
            phone: customerPhone.value.trim(),
            marketingOptIn: customerMarketing.checked,
          };
          const data = await requestJson(API.customerSignup, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (customerContextEmail && customerEmail.value.trim()) {
            state.customerEmail = normalizeEmail(customerEmail.value);
            customerContextEmail.value = state.customerEmail;
            window.localStorage.setItem(memberStorageKey, state.customerEmail);
            refreshMemberData();
          }

          setStatus(
            customerSignupStatus,
            data.created
              ? "Account created. You can now browse and buy designer pieces."
              : "Profile updated. You are ready to shop.",
            "ok"
          );
        } catch (error) {
          setStatus(
            customerSignupStatus,
            error.message || "Could not create customer account.",
            "error"
          );
        } finally {
          submitButton.disabled = false;
        }
      });
    }

    if (customerContextForm && customerContextEmail) {
      customerContextForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const email = normalizeEmail(customerContextEmail.value);
        if (!email) {
          setStatus(customerContextStatus, "Enter a customer email first.", "error");
          return;
        }
        state.customerEmail = email;
        window.localStorage.setItem(memberStorageKey, email);
        setStatus(customerContextStatus, "Account connected.", "ok");
        refreshMemberData();
      });
    }

    if (refreshMemberDataButton) {
      refreshMemberDataButton.addEventListener("click", () => {
        const email = requireCustomerEmail();
        if (!email) return;
        refreshMemberData();
      });
    }

    if (saveSearchButton) {
      saveSearchButton.addEventListener("click", async () => {
        const email = requireCustomerEmail();
        if (!email) return;
        refreshStateFromInputs();

        try {
          await requestJson(API.savedSearches, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerEmail: email,
              search: state.search,
              brand: state.brand,
              size: state.size,
              condition: state.condition === "all" ? "" : state.condition,
              min_price: state.minPrice || null,
              max_price: state.maxPrice || null,
              sort: state.sort,
            }),
          });
          setStatus(customerContextStatus, "Search saved to your account.", "ok");
          await loadSavedSearches();
        } catch (error) {
          setStatus(customerContextStatus, error.message || "Could not save search.", "error");
        }
      });
    }

    grid.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;

      const action = button.getAttribute("data-action");
      const listingId = button.getAttribute("data-listing-id");
      if (!listingId) return;

      if (action === "buy") {
        startCheckout(listingId, button, status, state.customerEmail);
        return;
      }

      if (action === "save") {
        const email = requireCustomerEmail();
        if (!email) return;
        button.disabled = true;
        try {
          await requestJson(API.wishlist, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerEmail: email,
              listingId,
            }),
          });
          setStatus(customerContextStatus, "Item saved to wishlist.", "ok");
          await loadWishlist();
        } catch (error) {
          setStatus(customerContextStatus, error.message || "Could not save item.", "error");
        } finally {
          button.disabled = false;
        }
        return;
      }

      if (action === "offer") {
        const email = requireCustomerEmail();
        if (!email) return;
        const row = button.closest(".offer-row");
        const input = row ? row.querySelector("[data-offer-input]") : null;
        const amount = input ? input.value.trim() : "";
        if (!amount) {
          setStatus(customerContextStatus, "Enter an offer amount first.", "error");
          return;
        }
        button.disabled = true;
        try {
          await requestJson(API.offers, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerEmail: email,
              listingId,
              amount,
            }),
          });
          if (input) input.value = "";
          setStatus(customerContextStatus, "Offer submitted to seller.", "ok");
          await loadOffers();
        } catch (error) {
          setStatus(customerContextStatus, error.message || "Could not submit offer.", "error");
        } finally {
          button.disabled = false;
        }
      }
    });

    if (wishlistItems) {
      wishlistItems.addEventListener("click", async (event) => {
        const removeButton = event.target.closest("[data-wishlist-remove]");
        const buyButton = event.target.closest("[data-wishlist-buy]");

        if (buyButton) {
          startCheckout(
            buyButton.getAttribute("data-wishlist-buy"),
            buyButton,
            status,
            state.customerEmail
          );
          return;
        }

        if (removeButton) {
          const email = requireCustomerEmail();
          if (!email) return;
          const listingId = removeButton.getAttribute("data-wishlist-remove");
          removeButton.disabled = true;
          try {
            await requestJson(API.wishlist, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customerEmail: email,
                listingId,
              }),
            });
            setStatus(customerContextStatus, "Item removed from wishlist.", "ok");
            await loadWishlist();
          } catch (error) {
            setStatus(customerContextStatus, error.message || "Could not remove wishlist item.", "error");
          } finally {
            removeButton.disabled = false;
          }
        }
      });
    }

    if (offerItems) {
      offerItems.addEventListener("click", async (event) => {
        const actionButton = event.target.closest("[data-offer-action]");
        if (!actionButton) return;
        const email = requireCustomerEmail();
        if (!email) return;
        const action = actionButton.getAttribute("data-offer-action");
        const offerId = actionButton.getAttribute("data-offer-id");

        actionButton.disabled = true;
        try {
          await requestJson(API.offers, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              offerId,
              action,
              customerEmail: email,
            }),
          });
          setStatus(customerContextStatus, "Offer updated.", "ok");
          await loadOffers();
        } catch (error) {
          setStatus(customerContextStatus, error.message || "Could not update offer.", "error");
        } finally {
          actionButton.disabled = false;
        }
      });
    }

    if (savedSearchItems) {
      savedSearchItems.addEventListener("click", async (event) => {
        const applyButton = event.target.closest("[data-saved-search-apply]");
        const deleteButton = event.target.closest("[data-saved-search-remove]");

        if (applyButton) {
          try {
            const payload = JSON.parse(
              decodeURIComponent(applyButton.getAttribute("data-saved-search-apply"))
            );
            state.search = payload.search_query || "";
            state.brand = payload.brand || "";
            state.size = payload.size || "";
            state.condition = payload.condition || "all";
            state.minPrice = payload.min_price === null || payload.min_price === undefined ? "" : String(payload.min_price);
            state.maxPrice = payload.max_price === null || payload.max_price === undefined ? "" : String(payload.max_price);
            state.sort = payload.sort_key || "newest";
            applyStateToInputs();
            loadListings();
            setStatus(customerContextStatus, "Saved search applied.", "ok");
          } catch (_error) {
            setStatus(customerContextStatus, "Could not apply saved search.", "error");
          }
          return;
        }

        if (deleteButton) {
          const email = requireCustomerEmail();
          if (!email) return;
          const savedSearchId = deleteButton.getAttribute("data-saved-search-remove");
          deleteButton.disabled = true;
          try {
            await requestJson(API.savedSearches, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                customerEmail: email,
                savedSearchId,
              }),
            });
            setStatus(customerContextStatus, "Saved search deleted.", "ok");
            await loadSavedSearches();
          } catch (error) {
            setStatus(customerContextStatus, error.message || "Could not delete saved search.", "error");
          } finally {
            deleteButton.disabled = false;
          }
        }
      });
    }

    applyStateToInputs();
    loadListings();
    refreshMemberData();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read the selected image file."));
      reader.readAsDataURL(file);
    });
  }

  function renderMediaPreview(mediaPreviewEl, urls) {
    if (!mediaPreviewEl) return;
    if (!urls || urls.length === 0) {
      mediaPreviewEl.innerHTML = "";
      return;
    }
    mediaPreviewEl.innerHTML = urls
      .map((url, index) => `<img src="${escapeHtml(url)}" alt="Selected media ${index + 1}" />`)
      .join("");
  }

  function renderSellerListingSummary(listings, container) {
    if (!container) return;
    if (!Array.isArray(listings) || listings.length === 0) {
      container.innerHTML = `<div class="submission-item">No submissions yet.</div>`;
      return;
    }

    container.innerHTML = listings
      .map((listing) => {
        const state = String(listing.moderation_status || "pending").toLowerCase();
        const reason = listing.moderation_reason
          ? `<p class="submission-meta"><strong>Reason:</strong> ${escapeHtml(
              listing.moderation_reason
            )}</p>`
          : "";
        return `<article class="submission-item">
          <div class="submission-head">
            <div>
              <h3>${escapeHtml(listing.brand)} ${escapeHtml(listing.title)}</h3>
              <p class="submission-meta">${formatCurrency(listing.price_cents, listing.currency)} • ${escapeHtml(
                listing.condition || "Condition N/A"
              )}</p>
            </div>
            <span class="moderation-badge ${moderationClass(state)}">${moderationLabel(state)}</span>
          </div>
          ${reason}
        </article>`;
      })
      .join("");
  }

  function renderSellerOfferSummary(offers, container) {
    if (!container) return;
    if (!Array.isArray(offers) || offers.length === 0) {
      container.innerHTML = `<div class="submission-item">No offers yet.</div>`;
      return;
    }

    container.innerHTML = offers
      .map((offer) => {
        const listing = offer.listing || {};
        const canAct = offer.status === "pending" || offer.status === "countered";
        const counterValue =
          offer.counter_amount_cents && Number.isFinite(offer.counter_amount_cents)
            ? String((offer.counter_amount_cents / 100).toFixed(2))
            : "";
        return `<article class="submission-item" data-seller-offer-id="${escapeHtml(offer.id)}">
          <div class="submission-head">
            <div>
              <h3>${escapeHtml(listing.brand || "")} ${escapeHtml(listing.title || "Listing")}</h3>
              <p class="submission-meta">
                Offer ${formatCurrency(offer.amount_cents, offer.currency)} • ${escapeHtml(
                  offerStatusLabel(offer.status)
                )} • Buyer ${escapeHtml(offer.customer_email || "Unknown")}
              </p>
            </div>
            <span class="moderation-badge ${offer.status === "accepted" ? "moderation-badge--approved" : offer.status === "rejected" || offer.status === "cancelled" ? "moderation-badge--rejected" : "moderation-badge--pending"}">${escapeHtml(
              offerStatusLabel(offer.status)
            )}</span>
          </div>
          ${
            offer.buyer_message
              ? `<p class="submission-meta"><strong>Buyer note:</strong> ${escapeHtml(
                  offer.buyer_message
                )}</p>`
              : ""
          }
          ${
            offer.seller_message
              ? `<p class="submission-meta"><strong>Seller note:</strong> ${escapeHtml(
                  offer.seller_message
                )}</p>`
              : ""
          }
          ${
            canAct
              ? `<div class="admin-actions">
                  <input type="number" min="1" step="0.01" placeholder="Counter amount (EUR)" value="${escapeHtml(
                    counterValue
                  )}" data-seller-counter-amount />
                  <textarea placeholder="Optional message to buyer" data-seller-offer-message></textarea>
                  <div class="button-row">
                    <button type="button" class="button button--ghost" data-seller-offer-action="accept">Accept</button>
                    <button type="button" class="button button--ghost" data-seller-offer-action="reject">Reject</button>
                    <button type="button" class="button" data-seller-offer-action="counter">Counter</button>
                  </div>
                </div>`
              : ""
          }
        </article>`;
      })
      .join("");
  }

  function initSellerPage() {
    const onboardingForm = $("onboarding-form");
    const checkStatusButton = $("check-status");
    const onboardingState = $("onboarding-state");
    const listingForm = $("listing-form");
    const listingState = $("listing-state");
    const sellerEmail = $("seller-email");
    const imageFile = $("image-file");
    const imageUrl = $("image-url");
    const imageUrls = $("image-urls");
    const videoUrl = $("video-url");
    const mediaPreview = $("media-preview");
    const refreshMyListings = $("refresh-my-listings");
    const myListings = $("my-listings");
    const refreshSellerOffers = $("refresh-seller-offers");
    const sellerOffers = $("seller-offers");

    if (
      !onboardingForm ||
      !checkStatusButton ||
      !onboardingState ||
      !listingForm ||
      !listingState ||
      !sellerEmail
    ) {
      return;
    }

    const query = new URLSearchParams(window.location.search);
    const state = query.get("state");
    const emailFromQuery = query.get("email");
    if (emailFromQuery) {
      sellerEmail.value = emailFromQuery;
    }

    if (state === "return") {
      setStatus(onboardingState, "Onboarding returned. Check status to confirm activation.", "ok");
    } else if (state === "refresh") {
      setStatus(
        onboardingState,
        "Onboarding link expired before completion. Start again.",
        "error"
      );
    }

    async function checkStatus() {
      const email = sellerEmail.value.trim().toLowerCase();
      if (!email) {
        setStatus(onboardingState, "Enter your seller email first.", "error");
        return null;
      }

      setStatus(onboardingState, "Checking Stripe account status...", "");
      try {
        const data = await requestJson(`${API.accountStatus}?email=${encodeURIComponent(email)}`);

        if (data.onboarding_complete) {
          setStatus(onboardingState, "Stripe account is active. You can publish listings.", "ok");
        } else {
          const due = data.stripe && data.stripe.requirements_due ? data.stripe.requirements_due : [];
          const hint = due.length ? ` Pending fields: ${due.join(", ")}` : "";
          setStatus(
            onboardingState,
            `Account exists but is not fully enabled yet.${hint}`,
            "error"
          );
        }
        await loadSellerListings();
        await loadSellerOffers();
        return data;
      } catch (error) {
        setStatus(onboardingState, error.message || "Status check failed.", "error");
        return null;
      }
    }

    async function loadSellerListings() {
      const email = sellerEmail.value.trim().toLowerCase();
      if (!email || !myListings) return;

      myListings.innerHTML = `<div class="submission-item">Loading your submissions...</div>`;

      try {
        const query = new URLSearchParams({
          seller_email: email,
          status: "all",
          moderation_status: "all",
          limit: "40",
        });
        const data = await requestJson(`${API.listings}?${query.toString()}`);
        renderSellerListingSummary(data.listings || [], myListings);
      } catch (error) {
        myListings.innerHTML = `<div class="submission-item">${escapeHtml(
          error.message || "Could not load seller listings."
        )}</div>`;
      }
    }

    async function loadSellerOffers() {
      const email = sellerEmail.value.trim().toLowerCase();
      if (!email || !sellerOffers) return;

      sellerOffers.innerHTML = `<div class="submission-item">Loading offers...</div>`;

      try {
        const data = await requestJson(
          `${API.offers}?seller_email=${encodeURIComponent(email)}&limit=40`
        );
        renderSellerOfferSummary(data.offers || [], sellerOffers);
      } catch (error) {
        sellerOffers.innerHTML = `<div class="submission-item">${escapeHtml(
          error.message || "Could not load offers."
        )}</div>`;
      }
    }

    onboardingForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = sellerEmail.value.trim().toLowerCase();
      if (!email) {
        setStatus(onboardingState, "Enter your seller email first.", "error");
        return;
      }

      const url =
        `${API.onboarding}?email=${encodeURIComponent(email)}&origin=` +
        encodeURIComponent(window.location.origin);
      window.location.href = url;
    });

    checkStatusButton.addEventListener("click", () => {
      checkStatus();
    });

    if (refreshMyListings) {
      refreshMyListings.addEventListener("click", () => {
        loadSellerListings();
      });
    }

    if (refreshSellerOffers) {
      refreshSellerOffers.addEventListener("click", () => {
        loadSellerOffers();
      });
    }

    function refreshPreviewFromInputs() {
      const baseUrls = [...parseUrlList(imageUrl.value || ""), ...parseUrlList(imageUrls ? imageUrls.value : "")];
      renderMediaPreview(mediaPreview, baseUrls.slice(0, 8));
    }

    if (imageUrl) {
      imageUrl.addEventListener("input", refreshPreviewFromInputs);
    }
    if (imageUrls) {
      imageUrls.addEventListener("input", refreshPreviewFromInputs);
    }

    if (imageFile) {
      imageFile.addEventListener("change", () => {
        const selectedFiles = imageFile.files ? Array.from(imageFile.files) : [];
        if (selectedFiles.length === 0) {
          refreshPreviewFromInputs();
          return;
        }

        Promise.all(selectedFiles.map((file) => fileToDataUrl(file)))
          .then((urls) => renderMediaPreview(mediaPreview, urls))
          .catch(() => renderMediaPreview(mediaPreview, []));
      });
    }

    listingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = sellerEmail.value.trim().toLowerCase();
      if (!email) {
        setStatus(listingState, "Seller email is required.", "error");
        return;
      }

      const submitButton = listingForm.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      setStatus(listingState, "Publishing listing...", "");

      try {
        const directImageUrls = [
          ...parseUrlList(imageUrl.value),
          ...parseUrlList(imageUrls ? imageUrls.value : ""),
        ];
        const uploadedImageUrls = [];

        if (imageFile && imageFile.files && imageFile.files.length > 0) {
          const files = Array.from(imageFile.files).slice(0, 8);
          for (let i = 0; i < files.length; i += 1) {
            setStatus(
              listingState,
              `Uploading image ${i + 1} of ${files.length} to Cloudinary...`,
              ""
            );
            const uploaded = await requestJson(API.uploadImage, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                imageData: await fileToDataUrl(files[i]),
              }),
            });
            if (uploaded && uploaded.secure_url) {
              uploadedImageUrls.push(uploaded.secure_url);
            }
          }
        }

        const allImageUrls = [...new Set([...uploadedImageUrls, ...directImageUrls])].slice(0, 8);
        if (allImageUrls.length === 0) {
          throw new Error("Add at least one image URL or upload one image.");
        }

        const payload = {
          sellerEmail: email,
          title: $("title").value.trim(),
          brand: $("brand").value.trim(),
          price: $("price").value,
          size: $("size").value.trim(),
          condition: $("condition-field").value.trim(),
          isNew: $("state-type").value === "new",
          description: $("description").value.trim(),
          imageUrl: allImageUrls[0],
          images: allImageUrls,
          videoUrl: videoUrl ? videoUrl.value.trim() : "",
          currency: "eur",
        };

        const data = await requestJson(API.listings, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const idSnippet =
          data && data.listing && data.listing.id ? data.listing.id.slice(0, 8).toUpperCase() : "";
        setStatus(
          listingState,
          `Listing submitted${idSnippet ? ` (#${idSnippet})` : ""}. It is now pending moderation review.`,
          "ok"
        );
        listingForm.reset();
        imageUrl.value = "";
        if (imageUrls) {
          imageUrls.value = "";
        }
        if (videoUrl) {
          videoUrl.value = "";
        }
        renderMediaPreview(mediaPreview, []);
        await loadSellerListings();
        await loadSellerOffers();
      } catch (error) {
        setStatus(listingState, error.message || "Could not publish listing.", "error");
      } finally {
        submitButton.disabled = false;
      }
    });

    if (sellerOffers) {
      sellerOffers.addEventListener("click", async (event) => {
        const actionButton = event.target.closest("[data-seller-offer-action]");
        if (!actionButton) return;

        const offerCard = actionButton.closest("[data-seller-offer-id]");
        if (!offerCard) return;

        const action = actionButton.getAttribute("data-seller-offer-action");
        const offerId = offerCard.getAttribute("data-seller-offer-id");
        const messageField = offerCard.querySelector("[data-seller-offer-message]");
        const counterField = offerCard.querySelector("[data-seller-counter-amount]");
        const message = messageField ? messageField.value.trim() : "";
        const counterAmount = counterField ? counterField.value.trim() : "";

        if (action === "counter" && !counterAmount) {
          setStatus(listingState, "Enter counter amount before sending counter offer.", "error");
          return;
        }

        actionButton.disabled = true;
        setStatus(listingState, "Updating offer...", "");
        try {
          await requestJson(API.offers, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              offerId,
              action,
              sellerEmail: sellerEmail.value.trim().toLowerCase(),
              message,
              counterAmount: counterAmount || null,
            }),
          });
          setStatus(listingState, "Offer updated successfully.", "ok");
          await loadSellerOffers();
        } catch (error) {
          setStatus(listingState, error.message || "Could not update offer.", "error");
        } finally {
          actionButton.disabled = false;
        }
      });
    }

    if (sellerEmail.value.trim()) {
      loadSellerListings();
      loadSellerOffers();
    }
    refreshPreviewFromInputs();
  }

  function renderAdminListings(listings, container) {
    if (!container) return;
    if (!Array.isArray(listings) || listings.length === 0) {
      container.innerHTML = `<div class="admin-item">No listings in this moderation state.</div>`;
      return;
    }

    container.innerHTML = listings
      .map((listing) => {
        const media = getListingMedia(listing);
        const primary = media[0] || "";
        const imagePreview = primary
          ? `<img class="listing-media listing-media--approved" src="${escapeHtml(
              primary
            )}" alt="${escapeHtml(listing.brand)} ${escapeHtml(listing.title)}" />`
          : `<div class="listing-media listing-media--placeholder">No image</div>`;

        return `<article class="admin-item" data-listing-id="${escapeHtml(listing.id)}">
          <div class="admin-head">
            <div>
              <h3>${escapeHtml(listing.brand)} ${escapeHtml(listing.title)}</h3>
              <p class="admin-meta">
                Seller: ${escapeHtml(listing.seller_email || "Unknown")} •
                ${formatCurrency(listing.price_cents, listing.currency)} •
                ${escapeHtml(listing.condition || "Condition N/A")}
              </p>
            </div>
            <span class="moderation-badge ${moderationClass(
              listing.moderation_status
            )}">${moderationLabel(listing.moderation_status)}</span>
          </div>
          <div class="admin-preview">${imagePreview}</div>
          <div class="admin-actions">
            <textarea placeholder="Reason (required when rejecting)" data-reject-reason></textarea>
            <div class="button-row">
              <button class="button" type="button" data-admin-action="approve">Approve</button>
              <button class="button button--ghost" type="button" data-admin-action="reject">Reject</button>
            </div>
          </div>
        </article>`;
      })
      .join("");
  }

  function initAdminPage() {
    const adminAuthForm = $("admin-auth-form");
    const adminTokenInput = $("admin-token");
    const authState = $("admin-auth-state");
    const listingsState = $("admin-listings-state");
    const listingsContainer = $("admin-listings");
    const refreshButton = $("refresh-admin-listings");
    const storedToken = window.localStorage.getItem("asm_admin_token") || "";

    if (!adminAuthForm || !adminTokenInput || !listingsContainer || !refreshButton) {
      return;
    }

    adminTokenInput.value = storedToken;

    function getToken() {
      return adminTokenInput.value.trim();
    }

    async function loadPendingQueue() {
      const token = getToken();
      if (!token) {
        setStatus(authState, "Enter and save your admin token before loading queue.", "error");
        return;
      }

      setStatus(listingsState, "Loading pending listings...", "");
      try {
        const data = await requestJson(`${API.moderation}?moderation_status=pending&limit=60`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        renderAdminListings(data.listings || [], listingsContainer);
        setStatus(listingsState, `${(data.listings || []).length} pending listings`, "");
      } catch (error) {
        setStatus(listingsState, error.message || "Could not load moderation queue.", "error");
      }
    }

    async function runModerationAction(listingId, action, reason, actionButton) {
      const token = getToken();
      if (!token) {
        setStatus(authState, "Save admin token first.", "error");
        return;
      }

      actionButton.disabled = true;
      setStatus(listingsState, `${action === "approve" ? "Approving" : "Rejecting"} listing...`, "");
      try {
        await requestJson(API.moderation, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            listingId,
            action,
            reason,
          }),
        });
        setStatus(
          listingsState,
          action === "approve"
            ? "Listing approved and published."
            : "Listing rejected and removed from public feed.",
          "ok"
        );
        await loadPendingQueue();
      } catch (error) {
        setStatus(listingsState, error.message || "Moderation action failed.", "error");
      } finally {
        actionButton.disabled = false;
      }
    }

    adminAuthForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const token = getToken();
      if (!token) {
        setStatus(authState, "Token cannot be empty.", "error");
        return;
      }
      window.localStorage.setItem("asm_admin_token", token);
      setStatus(authState, "Admin token saved locally in this browser.", "ok");
      loadPendingQueue();
    });

    refreshButton.addEventListener("click", () => {
      loadPendingQueue();
    });

    listingsContainer.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-admin-action]");
      if (!actionButton) return;

      const listingItem = actionButton.closest("[data-listing-id]");
      if (!listingItem) return;
      const listingId = listingItem.getAttribute("data-listing-id");
      const action = actionButton.getAttribute("data-admin-action");
      const reasonField = listingItem.querySelector("[data-reject-reason]");
      const reason = reasonField ? reasonField.value.trim() : "";

      if (action === "reject" && !reason) {
        setStatus(listingsState, "Add a rejection reason before declining a listing.", "error");
        return;
      }

      runModerationAction(listingId, action, reason, actionButton);
    });

    if (storedToken) {
      setStatus(authState, "Saved token found. You can refresh queue immediately.", "ok");
      loadPendingQueue();
    }
  }

  const pageType = document.body && document.body.dataset ? document.body.dataset.page : "";
  if (pageType === "marketplace") {
    initMarketplacePage();
  } else if (pageType === "seller") {
    initSellerPage();
  } else if (pageType === "admin") {
    initAdminPage();
  }
})();
