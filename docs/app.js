(function () {
  const API_BASE = "https://edushare-h9d4ffeqh2fqacfz.germanywestcentral-01.azurewebsites.net";

  // ---------------- LOGIN PAGE ----------------
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    const passwordEl = document.getElementById("password");
    const toggleBtn = document.getElementById("togglePassword");

    // If user got redirected here from a share link, we'll have ?next=...
    const url = new URL(window.location.href);
    const nextUrl = url.searchParams.get("next"); // encoded full url back to portal

    if (toggleBtn && passwordEl) {
      toggleBtn.addEventListener("click", () => {
        const isHidden = passwordEl.type === "password";
        passwordEl.type = isHidden ? "text" : "password";
        toggleBtn.innerHTML = isHidden
          ? '<i class="bi bi-eye-slash"></i>'
          : '<i class="bi bi-eye"></i>';
        toggleBtn.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
      });
    }

    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();

      const emailEl = document.getElementById("email");
      const passEl = document.getElementById("password");

      const email = emailEl?.value?.trim() || "";
      const pass = passEl?.value || "";

      if (!email) return alert("Please enter your email/username.");
      if (!pass) return alert("Please enter your password.");

      if (email.includes("@") && !/^\S+@\S+\.\S+$/.test(email)) {
        return alert("Please enter a valid email address.");
      }

      sessionStorage.setItem("edushare_user", email);

      // Return to where they were going (share link), otherwise portal
      if (nextUrl) {
        window.location.href = decodeURIComponent(nextUrl);
      } else {
        window.location.href = "portal.html";
      }
    });

    return;
  }

  // ---------------- PORTAL PAGE ----------------
  const tableBody = document.getElementById("tableBody");
  const searchInput = document.getElementById("searchInput");
  const breadcrumbEl = document.getElementById("breadcrumb");
  const backBtn = document.getElementById("backBtn");
  const selectAll = document.getElementById("selectAll");
  const profileNameEl = document.getElementById("profileName");

  const backToLoginBtn = document.getElementById("backToLoginBtn");
  const uploadBtn = document.getElementById("uploadBtn");
  const shareBtn = document.getElementById("shareBtn");
  const renameBtn = document.getElementById("renameBtn");
  const viewBtn = document.getElementById("viewBtn");
  const deleteBtn = document.getElementById("deleteBtn");

  const ctxMenu = document.getElementById("ctxMenu");
  const ctxView = document.getElementById("ctxView");
  const ctxRename = document.getElementById("ctxRename");
  const ctxDelete = document.getElementById("ctxDelete");

  const filePicker = document.getElementById("filePicker");

  const viewModal = document.getElementById("viewModal");
  const viewTitle = document.getElementById("viewTitle");
  const viewBody = document.getElementById("viewBody");
  const closeViewBtn = document.getElementById("closeViewBtn");

  const shareModal = document.getElementById("shareModal");
  const shareLink = document.getElementById("shareLink");
  const copyShareBtn = document.getElementById("copyShareBtn");
  const createShareBtn = document.getElementById("createShareBtn");
  const closeShareBtn = document.getElementById("closeShareBtn");

  if (!tableBody) return;

  function getUser() {
    return sessionStorage.getItem("edushare_user") || "";
  }

  function requireLoggedInIfShare() {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("share");
    if (!token) return;

    if (!getUser()) {
      // force login, then return here
      const next = encodeURIComponent(url.toString());
      window.location.href = `login.html?next=${next}`;
    }
  }

  requireLoggedInIfShare();

  async function apiFetch(path, opts = {}) {
    const u = getUser();
    if (!u) throw new Error("Not logged in");

    const headers = new Headers(opts.headers || {});
    headers.set("X-User", u);

    if (opts.json) {
      headers.set("Content-Type", "application/json");
      opts.body = JSON.stringify(opts.json);
      delete opts.json;
    }

    const res = await fetch(API_BASE + path, { ...opts, headers });

    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const data = await res.json();
        msg = data.detail || JSON.stringify(data);
      } catch {}
      throw new Error(msg);
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return res.json();
    return res.text();
  }

  async function apiFetchBlob(path, opts = {}) {
    const u = getUser();
    if (!u) throw new Error("Not logged in");

    const headers = new Headers(opts.headers || {});
    headers.set("X-User", u);

    const res = await fetch(API_BASE + path, { ...opts, headers });

    if (!res.ok) {
      let msg = `${res.status} ${res.statusText}`;
      try {
        const data = await res.json();
        msg = data.detail || JSON.stringify(data);
      } catch {}
      throw new Error(msg);
    }

    const blob = await res.blob();
    const ct = res.headers.get("content-type") || "";
    return { blob, contentType: ct };
  }

  async function refreshProfileName() {
    if (!profileNameEl) return;
    try {
      const me = await apiFetch("/me");
      profileNameEl.textContent = me.display_name || getUser() || "Unknown";
    } catch {
      profileNameEl.textContent = getUser() || "Unknown";
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatModifiedAt(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  let activeBlobUrl = null;
  function openViewModal(title, html) {
    if (!viewModal || !viewTitle || !viewBody) return;
    viewTitle.textContent = title || "View";
    viewBody.innerHTML = html || "";
    viewModal.classList.remove("hidden");
  }

  function closeViewModal() {
    if (activeBlobUrl) {
      try {
        URL.revokeObjectURL(activeBlobUrl);
      } catch {}
      activeBlobUrl = null;
    }
    if (!viewModal) return;
    viewModal.classList.add("hidden");
    if (viewBody) viewBody.innerHTML = "";
  }

  function openNoPreviewModal(title, downloadHtml) {
    openViewModal(
      title,
      `<p style="font-size:22px;">File not available for preview.</p>
       ${downloadHtml || ""}`
    );
  }

  // ---------------- STATE ----------------
  const state = {
    user: getUser(),
    rootId: "root",
    currentFolderId: "root",
    selectedIds: [],
    sortKey: "name",
    sortDir: "asc",
    shareToken: null,
    shareRole: null, // "viewer" | "editor"
    shareRootItem: null, // ItemOut
    items: [],
  };

  function saveUiState() {
    sessionStorage.setItem(
      "edushare_ui",
      JSON.stringify({
        currentFolderId: state.currentFolderId,
        sortKey: state.sortKey,
        sortDir: state.sortDir,
        shareToken: state.shareToken,
      })
    );
  }

  function loadUiState() {
    try {
      const raw = sessionStorage.getItem("edushare_ui");
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.currentFolderId) state.currentFolderId = s.currentFolderId;
      if (s.sortKey) state.sortKey = s.sortKey;
      if (s.sortDir) state.sortDir = s.sortDir;
      if (s.shareToken) state.shareToken = s.shareToken;
    } catch {}
  }

  function mapItemFromApi(x) {
    return {
      id: String(x.id),
      type: x.type,
      name: x.name,
      parentId: x.parent_id == null ? "root" : String(x.parent_id),
      modified: formatModifiedAt(x.modified_at),
      by: x.modified_by || "",
      mime: x.mime_type || "application/octet-stream",
      sizeBytes: x.size_bytes || 0,
    };
  }

  function findItem(id) {
    return state.items.find((x) => x.id === id) || null;
  }

  const navStack = [];
  function parentFolderId() {
    if (navStack.length === 0) return state.rootId;
    return navStack[navStack.length - 1] || state.rootId;
  }

  function applyShareFromUrl() {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("share");
    if (!token) return;
    state.shareToken = token;

    // ✅ ensure UI is consistent immediately
    saveUiState();
    updateBackButton();
  }

  async function loadShareMeta() {
    if (!state.shareToken) return;
    const meta = await apiFetch(`/s/${encodeURIComponent(state.shareToken)}/meta`);
    state.shareRole = meta.role;
    state.shareRootItem = meta.root;

    // if share link is for a folder, start there
    if (meta.root.type === "folder") {
      state.currentFolderId = String(meta.root.id);
      navStack.length = 0;
    } else {
      // file share link: keep "root", but we'll preview/download using meta.root.id
      state.currentFolderId = "root";
      navStack.length = 0;
    }
  }

  async function refreshCurrentFolder() {
    state.user = getUser();
    await refreshProfileName();
    state.selectedIds = [];

    if (state.shareToken) {
      // If share link is to a folder:
      if (state.shareRootItem?.type === "folder") {
        const kids = await apiFetch(
          `/s/${encodeURIComponent(state.shareToken)}/children?folder_id=${encodeURIComponent(state.currentFolderId)}`
        );
        state.items = kids.map(mapItemFromApi);
        render();
        updateBackButton(); // ✅
        return;
      }

      // If share link is to a file: show a single "virtual" file row
      if (state.shareRootItem?.type === "file") {
        state.items = [mapItemFromApi(state.shareRootItem)];
        render();
        updateBackButton(); // ✅
        return;
      }
    }

    // normal mode
    if (state.currentFolderId === state.rootId) {
      const rootItems = await apiFetch(`/root`);
      state.items = rootItems.map(mapItemFromApi);
    } else {
      const kids = await apiFetch(`/folders/${encodeURIComponent(state.currentFolderId)}/children`);
      state.items = kids.map(mapItemFromApi);
    }

    render();
    updateBackButton(); // ✅
  }


  // ---------------- BREADCRUMB ----------------
  function buildBreadcrumb() {
    if (!breadcrumbEl) return;

    if (state.shareToken && state.shareRootItem) {
      // share breadcrumb: Shared Item > (subfolder if navigating)
      const parts = [{ id: String(state.shareRootItem.id), name: state.shareRootItem.name }];

      // Only show current folder if different from root folder
      if (state.shareRootItem.type === "folder" && state.currentFolderId !== String(state.shareRootItem.id)) {
        const cur = findItem(state.currentFolderId);
        if (cur && cur.type === "folder") parts.push({ id: cur.id, name: cur.name });
      }

      breadcrumbEl.innerHTML = parts
        .map((p, idx) => {
          const isLast = idx === parts.length - 1;
          if (isLast) return escapeHtml(p.name);
          return `<a class="crumb" href="#" data-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</a> &gt; `;
        })
        .join("");

      Array.from(breadcrumbEl.querySelectorAll(".crumb")).forEach((a) => {
        a.addEventListener("click", async (e) => {
          e.preventDefault();
          const id = a.getAttribute("data-id");
          if (!id) return;
          navStack.length = 0;
          state.currentFolderId = id;
          state.selectedIds = [];
          saveUiState();
          await refreshCurrentFolder().catch((err) => alert(err.message));
        });
      });

      return;
    }

    // normal breadcrumb
    const parts = [{ id: state.rootId, name: "Public Folder" }];
    const cur = findItem(state.currentFolderId);
    if (cur && cur.type === "folder") parts.push({ id: cur.id, name: cur.name });

    breadcrumbEl.innerHTML = parts
      .map((p, idx) => {
        const isLast = idx === parts.length - 1;
        if (isLast) return escapeHtml(p.name);
        return `<a class="crumb" href="#" data-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</a> &gt; `;
      })
      .join("");

    Array.from(breadcrumbEl.querySelectorAll(".crumb")).forEach((a) => {
      a.addEventListener("click", async (e) => {
        e.preventDefault();
        const id = a.getAttribute("data-id");
        if (!id) return;
        if (id === state.rootId) navStack.length = 0;
        state.currentFolderId = id;
        state.selectedIds = [];
        saveUiState();
        await refreshCurrentFolder().catch((err) => alert(err.message));
      });
    });
  }

  // ---------------- LIST / SORT ----------------
  function getVisibleItems() {
    const q = (searchInput ? searchInput.value : "").trim().toLowerCase();
    const filtered = q ? state.items.filter((x) => x.name.toLowerCase().includes(q)) : state.items;

    return filtered.slice().sort((a, b) => {
      const av = (a[state.sortKey] || "").toString().toLowerCase();
      const bv = (b[state.sortKey] || "").toString().toLowerCase();
      if (av < bv) return state.sortDir === "asc" ? -1 : 1;
      if (av > bv) return state.sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  function isSelected(id) {
    return state.selectedIds.includes(id);
  }

  function toggleSelected(id) {
    if (isSelected(id)) state.selectedIds = state.selectedIds.filter((x) => x !== id);
    else state.selectedIds = state.selectedIds.concat(id);
  }

  function selectedItems() {
    return state.selectedIds.map(findItem).filter(Boolean);
  }

  function openCtx(x, y) {
    if (!ctxMenu) return;
    ctxMenu.style.left = x + "px";
    ctxMenu.style.top = y + "px";
    ctxMenu.classList.remove("hidden");
  }

  function closeCtx() {
    if (!ctxMenu) return;
    ctxMenu.classList.add("hidden");
  }


    // ---------------- UI HELPERS ----------------
  function updateBackButton() {
    if (!backBtn) return;

    const inSharedMode = !!state.shareToken;

    backBtn.disabled = inSharedMode;
    backBtn.classList.toggle("btn-disabled", inSharedMode);

    // Optional label clarity
    backBtn.textContent = inSharedMode ? "Back (disabled)" : "Back";
  }


  // ---------------- SHARE MODAL ----------------
  function getSharePerm() {
    const el = document.querySelector('input[name="sharePerm"]:checked');
    return el && el.value ? el.value : "view";
  }

  function openShareModal() {
    closeCtx();
    if (!shareModal) return;
    if (shareLink) shareLink.value = "";
    shareModal.classList.remove("hidden");
  }

  function closeShareModal() {
    if (!shareModal) return;
    shareModal.classList.add("hidden");
  }

  async function createShareLinkForSelected() {
    const sel = requireSingleSelection();
    if (!sel) return;

    const perm = getSharePerm();
    const role = perm === "edit" ? "editor" : "viewer";

    const data = await apiFetch(`/share-links/${encodeURIComponent(sel.id)}`, {
      method: "POST",
      json: { role, expires_in_hours: null },
    });

    const token = data.token;
    const url = new URL(window.location.href);
    url.searchParams.set("share", token);
    if (shareLink) shareLink.value = url.toString();
  }

  async function copyShareLink() {
    if (!shareLink || !shareLink.value.trim()) {
      alert("Create a share link first.");
      return;
    }

    try {
      await navigator.clipboard.writeText(shareLink.value.trim());
    } catch {
      shareLink.focus();
      shareLink.select();
      document.execCommand("copy");
    }
  }


  // ---------------- PERMISSIONS / BUTTONS ----------------
  function updateActionButtons() {
    const sel = selectedItems();
    const single = sel.length === 1;

    const shareReadOnly = state.shareToken && state.shareRole !== "editor";

    if (renameBtn) renameBtn.classList.toggle("btn-disabled", shareReadOnly || !single);
    if (viewBtn) viewBtn.classList.toggle("btn-disabled", !single);
    if (deleteBtn) deleteBtn.classList.toggle("btn-disabled", shareReadOnly || sel.length === 0);

    if (uploadBtn) uploadBtn.classList.toggle("btn-disabled", shareReadOnly);
    if (shareBtn) shareBtn.classList.toggle("btn-disabled", false);

    updateBackButton(); // ✅ add this
  }

  function requireSingleSelection() {
    const sel = selectedItems();
    if (sel.length !== 1) {
      alert("Select exactly one item.");
      return null;
    }
    return sel[0];
  }

  // ---------------- CRUD (normal + share editor mode) ----------------
  async function renameSelected() {
    const sel = requireSingleSelection();
    if (!sel) return;

    const next = prompt("New name:", sel.name);
    if (!next) return;

    if (state.shareToken) {
      await apiFetch(`/s/${encodeURIComponent(state.shareToken)}/items/${encodeURIComponent(sel.id)}/rename`, {
        method: "POST",
        json: { new_name: next.trim() },
      });
    } else {
      await apiFetch(`/items/${encodeURIComponent(sel.id)}/rename`, {
        method: "POST",
        json: { new_name: next.trim() },
      });
    }

    await refreshCurrentFolder();
  }

  async function deleteSelected() {
    const sel = selectedItems();
    if (sel.length === 0) return alert("Select at least one item.");

    const ok = confirm(`Delete ${sel.length} item(s)?`);
    if (!ok) return;

    for (const item of sel) {
      if (state.shareToken) {
        await apiFetch(`/s/${encodeURIComponent(state.shareToken)}/items/${encodeURIComponent(item.id)}`, {
          method: "DELETE",
        });
      } else {
        await apiFetch(`/items/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      }
    }

    await refreshCurrentFolder();
  }

  async function uploadFilesIntoCurrentFolder(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    for (const f of files) {
      const form = new FormData();
      form.append("file", f);

      if (state.shareToken) {
        // share upload endpoint
        await apiFetch(`/s/${encodeURIComponent(state.shareToken)}/upload?folder_id=${encodeURIComponent(state.currentFolderId)}`, {
          method: "POST",
          body: form,
        });
      } else {
        await apiFetch(`/upload?folder_id=${encodeURIComponent(state.currentFolderId)}`, {
          method: "POST",
          body: form,
        });
      }
    }

    await refreshCurrentFolder();
  }

  // ---------------- DOWNLOAD / PREVIEW ----------------
  function isOfficeDoc(nameLower, mimeLower) {
    const isWord =
      /\.(doc|docx)$/.test(nameLower) ||
      mimeLower.includes("msword") ||
      mimeLower.includes("officedocument.wordprocessingml");

    const isExcel =
      /\.(xls|xlsx|xlsm|xlsb|csv)$/.test(nameLower) ||
      mimeLower.includes("ms-excel") ||
      mimeLower.includes("officedocument.spreadsheetml");

    const isPpt =
      /\.(ppt|pptx|pptm)$/.test(nameLower) ||
      mimeLower.includes("ms-powerpoint") ||
      mimeLower.includes("officedocument.presentationml");

    return isWord || isExcel || isPpt;
  }

  function downloadPathForItem(item) {
    if (state.shareToken) {
      return `/s/${encodeURIComponent(state.shareToken)}/download/${encodeURIComponent(item.id)}`;
    }
    return `/download/${encodeURIComponent(item.id)}`;
  }

  async function downloadItem(item) {
    const { blob } = await apiFetchBlob(downloadPathForItem(item));
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = item.name || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function viewSelected() {
    const sel = requireSingleSelection();
    if (!sel) return;

    if (sel.type === "folder") {
      navStack.push(state.currentFolderId);
      state.currentFolderId = sel.id;
      state.selectedIds = [];
      saveUiState();
      refreshCurrentFolder().catch((e) => alert(e.message));
      return;
    }

    const safeName = escapeHtml(sel.name);
    const mime = (sel.mime || "").toLowerCase();
    const nameLower = (sel.name || "").toLowerCase();

    const isPdf = mime === "application/pdf" || nameLower.endsWith(".pdf");
    const isImage = mime.startsWith("image/") || /\.(png|jpg|jpeg|gif|webp)$/.test(nameLower);
    const isVideo = mime.startsWith("video/") || /\.(mp4|webm|ogg)$/.test(nameLower);
    const isText = mime.startsWith("text/") || nameLower.endsWith(".txt");

    const isOffice = isOfficeDoc(nameLower, mime);

    const dlHtml = `<a class="link" href="#" id="dlLink">Download</a>`;

    function wireDlLink() {
      const dl = document.getElementById("dlLink");
      if (dl) {
        dl.addEventListener("click", (e) => {
          e.preventDefault();
          downloadItem(sel).catch((err) => alert("Download failed: " + err.message));
        });
      }
    }

    if (isOffice) {
      openNoPreviewModal(safeName, dlHtml);
      wireDlLink();
      return;
    }

    try {
      const { blob, contentType } = await apiFetchBlob(downloadPathForItem(sel));
      const ctLower = (contentType || "").toLowerCase();

      const isPdfCt = ctLower.includes("pdf");
      const isTextCt = ctLower.startsWith("text/") || ctLower.includes("json") || ctLower.includes("xml");

      if (isText || isTextCt) {
        const text = await blob.text();
        openViewModal(
          safeName,
          `<pre style="
            max-height:60vh; overflow:auto; text-align:left; white-space:pre-wrap;
            background:#111; padding:16px; border-radius:6px;
          ">${escapeHtml(text)}</pre>
          <div style="margin-top:14px;">${dlHtml}</div>`
        );
        wireDlLink();
        return;
      }

      const blobUrl = URL.createObjectURL(blob);
      activeBlobUrl = blobUrl;

      if (isImage) {
        openViewModal(
          safeName,
          `<img src="${blobUrl}" alt="${safeName}" />
           <div style="margin-top:14px;">${dlHtml}</div>`
        );
      } else if (isPdf || isPdfCt) {
        openViewModal(
          safeName,
          `<iframe src="${blobUrl}"></iframe>
           <div style="margin-top:14px;">${dlHtml}</div>`
        );
      } else if (isVideo) {
        openViewModal(
          safeName,
          `<video controls style="width:100%; height:100%;" src="${blobUrl}"></video>
           <div style="margin-top:14px;">${dlHtml}</div>`
        );
      } else {
        openNoPreviewModal(safeName, dlHtml);
      }

      wireDlLink();
    } catch (e) {
      alert("Preview failed: " + e.message);
    }
  }

  // ---------------- RENDER ----------------
  function render() {
    buildBreadcrumb();

    const visible = getVisibleItems();
    const allVisibleIds = visible.map((x) => x.id);
    const allChecked = allVisibleIds.length > 0 && allVisibleIds.every((id) => isSelected(id));
    if (selectAll) selectAll.checked = allChecked;

    tableBody.innerHTML = visible
      .map((item) => {
        const rowClass = isSelected(item.id) ? "row selected" : "row";
        const iconSrc = item.type === "folder" ? "icons/folder.svg" : "icons/file.svg";
        return `
        <div class="${rowClass}" data-id="${escapeHtml(item.id)}" data-type="${escapeHtml(item.type)}">
          <div class="col col-check"><span class="select-box"></span></div>
          <div class="col col-name"><img class="icon" src="${iconSrc}" alt="" />${escapeHtml(item.name)}</div>
          <div class="col col-mod">${escapeHtml(item.modified || "")}</div>
          <div class="col col-by">${escapeHtml(item.by || "")}</div>
        </div>`;
      })
      .join("");

    Array.from(tableBody.querySelectorAll(".row")).forEach((row) => {
      row.addEventListener("click", () => {
        closeCtx();
        const id = row.getAttribute("data-id");
        if (!id) return;
        toggleSelected(id);
        saveUiState();
        render();
      });

      row.addEventListener("dblclick", () => {
        closeCtx();
        const id = row.getAttribute("data-id");
        const item = findItem(id);
        if (item && item.type === "folder") {
          navStack.push(state.currentFolderId);
          state.currentFolderId = item.id;
          state.selectedIds = [];
          saveUiState();
          refreshCurrentFolder().catch((e) => alert(e.message));
        }
      });

      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const id = row.getAttribute("data-id");
        if (!id) return;

        if (!isSelected(id)) {
          state.selectedIds = [id];
          saveUiState();
          render();
        }

        const menuWidth = 200;
        const menuHeight = 140;
        const px = Math.min(e.clientX, window.innerWidth - menuWidth);
        const py = Math.min(e.clientY, window.innerHeight - menuHeight);
        openCtx(px, py);
      });
    });

    updateActionButtons();
  }

  // ---------------- EVENTS ----------------
  function wireSorting() {
    const headCells = document.querySelectorAll(".sortable");
    headCells.forEach((cell) => {
      cell.addEventListener("click", () => {
        const key = cell.getAttribute("data-sort");
        if (!key) return;
        if (state.sortKey === key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        else {
          state.sortKey = key;
          state.sortDir = "asc";
        }
        saveUiState();
        render();
      });
    });
  }

  function wireButtons() {
    if (backToLoginBtn)
      backToLoginBtn.addEventListener("click", () => {
        sessionStorage.removeItem("edushare_user");
        window.location.href = "login.html";
      });

    if (backBtn)
      backBtn.addEventListener("click", () => {
        if (state.shareToken) return; // ✅ shared mode: do nothing
        closeCtx();
        state.currentFolderId = parentFolderId();
        state.selectedIds = [];
        saveUiState();
        refreshCurrentFolder().catch((e) => alert(e.message));
      });

    if (selectAll)
      selectAll.addEventListener("change", () => {
        closeCtx();
        const visible = getVisibleItems().map((x) => x.id);
        if (selectAll.checked) state.selectedIds = Array.from(new Set(state.selectedIds.concat(visible)));
        else state.selectedIds = state.selectedIds.filter((id) => !visible.includes(id));
        saveUiState();
        render();
      });

    const createModal = document.getElementById("createModal");
    const createFolderBtn = document.getElementById("createFolderBtn");
    const createFileBtn = document.getElementById("createFileBtn");
    const cancelCreateBtn = document.getElementById("cancelCreateBtn");

    function openCreateModal() {
      closeCtx();
      const shareReadOnly = state.shareToken && state.shareRole !== "editor";
      if (shareReadOnly) return;
      if (createModal) createModal.classList.remove("hidden");
    }

    function closeCreateModal() {
      if (createModal) createModal.classList.add("hidden");
    }

    if (uploadBtn) uploadBtn.addEventListener("click", openCreateModal);

    if (createFolderBtn)
      createFolderBtn.addEventListener("click", () => {
        closeCreateModal();
        alert("Folder creation not wired here yet (you can add it similar to upload).");
      });

    if (createFileBtn)
      createFileBtn.addEventListener("click", () => {
        closeCreateModal();
        closeCtx();
        const shareReadOnly = state.shareToken && state.shareRole !== "editor";
        if (shareReadOnly) return;
        if (filePicker) filePicker.click();
      });

    if (cancelCreateBtn) cancelCreateBtn.addEventListener("click", closeCreateModal);

    if (filePicker)
      filePicker.addEventListener("change", async () => {
        const files = filePicker.files ? Array.from(filePicker.files) : [];
        filePicker.value = "";
        if (files.length === 0) return;

        try {
          await uploadFilesIntoCurrentFolder(files);
        } catch (e) {
          alert("Upload failed: " + e.message);
        }
      });

    if (renameBtn) renameBtn.addEventListener("click", () => renameSelected().catch((e) => alert(e.message)));
    if (viewBtn) viewBtn.addEventListener("click", () => viewSelected().catch((e) => alert(e.message)));
    if (deleteBtn) deleteBtn.addEventListener("click", () => deleteSelected().catch((e) => alert(e.message)));

    if (shareBtn) shareBtn.addEventListener("click", openShareModal);
    if (createShareBtn)
      createShareBtn.addEventListener("click", () =>
        createShareLinkForSelected().catch((e) => alert("Share failed: " + e.message))
      );
    if (copyShareBtn) copyShareBtn.addEventListener("click", copyShareLink);
    if (closeShareBtn) closeShareBtn.addEventListener("click", closeShareModal);

    if (shareModal)
      shareModal.addEventListener("click", (e) => {
        if (e.target === shareModal) closeShareModal();
      });

    if (closeViewBtn) closeViewBtn.addEventListener("click", closeViewModal);
    if (viewModal)
      viewModal.addEventListener("click", (e) => {
        if (e.target === viewModal) closeViewModal();
      });

    document.addEventListener("click", closeCtx);
    document.addEventListener("scroll", closeCtx, true);
    window.addEventListener("resize", closeCtx);

    if (ctxView)
      ctxView.addEventListener("click", () => {
        closeCtx();
        viewSelected().catch((e) => alert(e.message));
      });
    if (ctxRename)
      ctxRename.addEventListener("click", () => {
        closeCtx();
        renameSelected().catch((e) => alert(e.message));
      });
    if (ctxDelete)
      ctxDelete.addEventListener("click", () => {
        closeCtx();
        deleteSelected().catch((e) => alert(e.message));
      });
  }

  if (searchInput)
    searchInput.addEventListener("input", () => {
      closeCtx();
      render();
    });

  // ---------------- INIT ----------------
  loadUiState();
  applyShareFromUrl();
  updateBackButton();

  (async () => {
    try {
      await refreshProfileName();
      if (state.shareToken) {
        await loadShareMeta();
      }
      wireButtons();
      wireSorting();
      await refreshCurrentFolder();
    } catch (e) {
      alert("Failed to load from API: " + e.message);
    }
  })();
})();
