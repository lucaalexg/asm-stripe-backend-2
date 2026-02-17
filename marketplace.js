(() => {
  const API = {
    accountStatus: "/api/account-status",
    checkout: "/api/create-checkout-session",
    customerSignup: "/api/customer-signup",
    listings: "/api/listings",
    moderation: "/api/moderate-listings",
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
        <button class="button buy-button" data-action="buy" data-listing-id="${escapeHtml(listing.id)}">Buy now</button>
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
          wireListingCardMedia(grid);
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
      } catch (error) {
        setStatus(listingState, error.message || "Could not publish listing.", "error");
      } finally {
        submitButton.disabled = false;
      }
    });

    if (sellerEmail.value.trim()) {
      loadSellerListings();
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
