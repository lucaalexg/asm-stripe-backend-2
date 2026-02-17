(() => {
  const API = {
    accountStatus: "/api/account-status",
    checkout: "/api/create-checkout-session",
    listings: "/api/listings",
    onboarding: "/api/start-onboarding",
    uploadImage: "/api/upload-image",
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

  async function startCheckout(listingId, button, statusEl) {
    button.disabled = true;
    setStatus(statusEl, "Creating secure checkout...", "");

    try {
      const data = await requestJson(API.checkout, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          origin: window.location.origin,
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
    const image = listing.image_url && /^https?:\/\//i.test(listing.image_url) ? listing.image_url : "";

    const media = image
      ? `<img class="listing-media" loading="lazy" src="${escapeHtml(image)}" alt="${brand} ${title}" />`
      : `<div class="listing-media listing-media--placeholder">No image</div>`;

    return `<article class="listing-card">
      ${media}
      <div class="listing-content">
        <p class="listing-brand">${brand}</p>
        <h3 class="listing-title">${title}</h3>
        <p class="listing-meta">${condition} • ${size}</p>
        <p class="listing-price">${price}</p>
        <button class="button buy-button" data-action="buy" data-listing-id="${escapeHtml(listing.id)}">Buy now</button>
      </div>
    </article>`;
  }

  function initMarketplacePage() {
    const searchInput = $("search");
    const conditionSelect = $("condition");
    const refreshButton = $("refresh");
    const grid = $("listing-grid");
    const status = $("listing-status");

    if (!searchInput || !conditionSelect || !refreshButton || !grid || !status) return;

    const state = {
      search: "",
      condition: "all",
      loading: false,
    };

    const params = new URLSearchParams(window.location.search);
    const checkoutState = params.get("checkout");
    if (checkoutState === "success") {
      setStatus(status, "Payment completed. Your order is confirmed.", "ok");
    } else if (checkoutState === "cancelled") {
      setStatus(status, "Checkout cancelled. Listing is still available.", "");
    }

    async function loadListings() {
      if (state.loading) return;
      state.loading = true;

      const query = new URLSearchParams();
      query.set("status", "active");
      query.set("limit", "30");
      if (state.search) query.set("search", state.search);
      if (state.condition && state.condition !== "all") query.set("condition", state.condition);

      setStatus(status, "Loading curated listings...", "");

      try {
        const data = await requestJson(`${API.listings}?${query.toString()}`);
        const listings = Array.isArray(data.listings) ? data.listings : [];

        if (listings.length === 0) {
          grid.innerHTML = `<div class="panel">No listings match your filters yet.</div>`;
          setStatus(status, "0 results", "");
        } else {
          grid.innerHTML = listings.map(listingCardTemplate).join("");
          setStatus(status, `${listings.length} listings`, "");
          grid.querySelectorAll('[data-action="buy"]').forEach((button) => {
            button.addEventListener("click", () =>
              startCheckout(button.dataset.listingId, button, status)
            );
          });
        }
      } catch (error) {
        grid.innerHTML = "";
        setStatus(status, error.message || "Could not load listings.", "error");
      } finally {
        state.loading = false;
      }
    }

    const debouncedLoad = debounce(() => {
      state.search = searchInput.value.trim();
      loadListings();
    }, 280);

    searchInput.addEventListener("input", debouncedLoad);
    conditionSelect.addEventListener("change", () => {
      state.condition = conditionSelect.value;
      loadListings();
    });
    refreshButton.addEventListener("click", loadListings);

    loadListings();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read the selected image file."));
      reader.readAsDataURL(file);
    });
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
        return data;
      } catch (error) {
        setStatus(onboardingState, error.message || "Status check failed.", "error");
        return null;
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
        let finalImageUrl = imageUrl.value.trim();

        if (imageFile && imageFile.files && imageFile.files.length > 0) {
          setStatus(listingState, "Uploading image to Cloudinary...", "");
          const uploaded = await requestJson(API.uploadImage, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageData: await fileToDataUrl(imageFile.files[0]),
            }),
          });
          finalImageUrl = uploaded.secure_url || finalImageUrl;
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
          imageUrl: finalImageUrl,
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
          `Listing published${idSnippet ? ` (#${idSnippet})` : ""}. It is live on the marketplace.`,
          "ok"
        );
        listingForm.reset();
        imageUrl.value = "";
      } catch (error) {
        setStatus(listingState, error.message || "Could not publish listing.", "error");
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  const pageType = document.body && document.body.dataset ? document.body.dataset.page : "";
  if (pageType === "marketplace") {
    initMarketplacePage();
  } else if (pageType === "seller") {
    initSellerPage();
  }
})();
