(function () {
  // ---------- LOGIN PAGE ----------
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
        e.preventDefault();
        const email = document.getElementById("email")?.value?.trim() || "alice";
        sessionStorage.setItem("edushare_user", email);
        window.location.href = "portal.html";
    });
    return;
    }


  // ---------- PORTAL PAGE ----------
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
  const cloudBtn = document.getElementById("cloudBtn");

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

  // ---------- API HELPERS ----------
  const API_BASE = "http://127.0.0.1:8000";


  function getUser() {
    return sessionStorage.getItem("edushare_user") || "alice";
  }

  async function apiFetch(path, opts = {}) {
    const headers = new Headers(opts.headers || {});
    headers.set("X-User", getUser());

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

  async function refreshProfileName() {
  if (!profileNameEl) return;

  // If viewing via share link, show "Guest"
  if (state.shareToken) {
    profileNameEl.textContent = "Guest";
    return;
  }

  try {
    const me = await apiFetch("/me"); // uses X-User header already
    profileNameEl.textContent = me.display_name || state.user || "Unknown";
  } catch {
    // If /me fails (e.g., backend down), fall back
    profileNameEl.textContent = state.user || "Unknown";
  }
}


  // ---------- UI HELPERS ----------
  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ---------- STATE (SERVER BACKED) ----------
  const state = {
    user: getUser(),
    rootId: "root",
    currentFolderId: "root",
    selectedIds: [],
    sortKey: "name",
    sortDir: "asc",
    shareMode: null,   // UI-only: "view" | "edit" | null
    shareToken: null,  // token from URL when in share mode
    items: [],         // current folder listing from API
  };

  function saveUiState() {
    sessionStorage.setItem(
      "edushare_ui",
      JSON.stringify({
        currentFolderId: state.currentFolderId,
        sortKey: state.sortKey,
        sortDir: state.sortDir,
        shareMode: state.shareMode,
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
      if (s.shareMode) state.shareMode = s.shareMode;
      if (s.shareToken) state.shareToken = s.shareToken;
    } catch {}
  }

  function mapItemFromApi(x) {
    return {
      id: String(x.id),
      type: x.type,
      name: x.name,
      parentId: x.parent_id == null ? "root" : String(x.parent_id),
      modified: "", // if your ItemOut has timestamps, map them here
      by: "",       // could be owner display name later
      mime: x.mime_type || "application/octet-stream",
      sizeBytes: x.size_bytes || 0,
    };
  }

  function findItem(id) {
    return state.items.find((x) => x.id === id) || null;
  }

  function currentFolderItem() {
    if (state.currentFolderId === state.rootId) return null;
    const item = findItem(state.currentFolderId);
    if (!item || item.type !== "folder") return null;
    return item;
  }

  // For root/back button we keep a simple client-side stack.
  // (We don’t have a server endpoint to ask for a folder’s parent yet.)
  const navStack = [];

  function parentFolderId() {
    if (navStack.length === 0) return state.rootId;
    return navStack[navStack.length - 1] || state.rootId;
  }

  async function refreshCurrentFolder() {
    state.user = getUser();
    await refreshProfileName();
    state.selectedIds = [];

    // Share link mode: list folder via token
    if (state.shareToken) {
      const kids = await apiFetch(`/s/${encodeURIComponent(state.shareToken)}/children`);
      state.items = kids.map(mapItemFromApi);
      render();
      return;
    }

    // Normal mode
    if (state.currentFolderId === state.rootId) {
      const rootItems = await apiFetch(`/root`);
      state.items = rootItems.map(mapItemFromApi);
    } else {
      const kids = await apiFetch(`/folders/${encodeURIComponent(state.currentFolderId)}/children`);
      state.items = kids.map(mapItemFromApi);
    }

    render();
  }

  // ---------- BREADCRUMB ----------
  function buildBreadcrumb() {
    if (!breadcrumbEl) return;

    // Minimal breadcrumb (root + current folder name).
    // Full chain would require an API to get parents.
    const parts = [{ id: state.rootId, name: "Public Folder" }];
    const cur = currentFolderItem();
    if (cur) parts.push({ id: cur.id, name: cur.name });

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

        // reset navigation stack when clicking root
        if (id === state.rootId) navStack.length = 0;

        state.currentFolderId = id;
        state.selectedIds = [];
        saveUiState();
        await refreshCurrentFolder().catch((err) => alert(err.message));
      });
    });
  }

  // ---------- LIST / FILTER / SORT ----------
  function getVisibleItems() {
    const q = (searchInput ? searchInput.value : "").trim().toLowerCase();

    // state.items already represents current folder listing (server side)
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

  // ---------- CONTEXT MENU ----------
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

  // ---------- VIEW MODAL ----------
  function openViewModal(title, html) {
    if (!viewModal || !viewTitle || !viewBody) return;
    viewTitle.textContent = title || "View";
    viewBody.innerHTML = html || "";
    viewModal.classList.remove("hidden");
  }

  function closeViewModal() {
    if (!viewModal) return;
    viewModal.classList.add("hidden");
    if (viewBody) viewBody.innerHTML = "";
  }

  // ---------- SHARE MODAL ----------
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

    const perm = getSharePerm(); // "view" | "edit"
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
    if (!shareLink || !shareLink.value) return;
    try {
      await navigator.clipboard.writeText(shareLink.value);
    } catch {
      shareLink.focus();
      shareLink.select();
      document.execCommand("copy");
    }
  }

  function applyShareFromUrl() {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("share");
    if (!token) return;

    state.shareToken = token;
    state.shareMode = "view"; // UI-only; server enforces permissions anyway
    state.currentFolderId = state.rootId;
    navStack.length = 0;
    saveUiState();
  }

  // ---------- ACTION BUTTONS ----------
  function updateActionButtons() {
    const sel = selectedItems();
    const single = sel.length === 1;

    const readOnly = state.shareMode === "view" || !!state.shareToken;

    if (renameBtn) renameBtn.classList.toggle("btn-disabled", readOnly || !single);
    if (viewBtn) viewBtn.classList.toggle("btn-disabled", !single);
    if (deleteBtn) deleteBtn.classList.toggle("btn-disabled", readOnly || sel.length === 0);

    if (uploadBtn) uploadBtn.classList.toggle("btn-disabled", readOnly);
    if (shareBtn) shareBtn.classList.toggle("btn-disabled", false);
  }

  // ---------- UPLOAD ----------
  async function uploadOneFileToCurrentFolder(file) {
    if (state.shareMode === "view" || state.shareToken) return;

    if (state.currentFolderId === state.rootId) {
      alert("Upload into a folder (create one first), not the root.");
      return;
    }

    const form = new FormData();
    form.append("file", file);

    await apiFetch(`/upload?folder_id=${encodeURIComponent(state.currentFolderId)}`, {
      method: "POST",
      body: form,
    });
  }

  async function uploadFilesIntoCurrentFolder(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    for (const f of files) {
      await uploadOneFileToCurrentFolder(f);
    }

    await refreshCurrentFolder();
  }

  // ---------- MOVE ----------
  async function moveItemsIntoFolder(ids, folderId) {
    if (state.shareMode === "view" || state.shareToken) return;

    for (const id of ids) {
      await apiFetch(`/items/${encodeURIComponent(id)}/move`, {
        method: "POST",
        json: { new_parent_id: Number(folderId) },
      });
    }

    await refreshCurrentFolder();
  }

  // ---------- REQUIRED SELECTION ----------
  function requireSingleSelection() {
    const sel = selectedItems();
    if (sel.length !== 1) {
      alert("Select exactly one item.");
      return null;
    }
    return sel[0];
  }

  // ---------- CRUD ----------
  async function createFolder() {
    if (state.shareMode === "view" || state.shareToken) return;

    const name = prompt("Folder name:");
    if (!name) return;

    const parentId = state.currentFolderId === state.rootId ? null : Number(state.currentFolderId);

    await apiFetch(`/folders`, {
      method: "POST",
      json: { name: name.trim(), parent_id: parentId },
    });

    await refreshCurrentFolder();
  }

  async function renameSelected() {
    if (state.shareMode === "view" || state.shareToken) return;

    const sel = requireSingleSelection();
    if (!sel) return;

    const next = prompt("New name:", sel.name);
    if (!next) return;

    await apiFetch(`/items/${encodeURIComponent(sel.id)}/rename`, {
      method: "POST",
      json: { new_name: next.trim() },
    });

    await refreshCurrentFolder();
  }

  async function deleteSelected() {
    if (state.shareMode === "view" || state.shareToken) return;

    const sel = selectedItems();
    if (sel.length === 0) {
      alert("Select at least one item.");
      return;
    }
    const ok = confirm(`Delete ${sel.length} item(s)?`);
    if (!ok) return;

    for (const item of sel) {
      await apiFetch(`/items/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    }

    await refreshCurrentFolder();
  }

  function fileDownloadUrl(item) {
    if (state.shareToken) {
      return `${API_BASE}/s/${encodeURIComponent(state.shareToken)}/download`;
    }
    return `${API_BASE}/download/${encodeURIComponent(item.id)}`;
  }

  function viewSelected() {
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
    const mime = sel.mime || "application/octet-stream";
    const url = fileDownloadUrl(sel);

    if (mime.startsWith("image/")) {
      openViewModal(
        safeName,
        `<img src="${url}" alt="${safeName}" />
         <div style="margin-top:14px;">
           <a class="link" href="${url}" download="${safeName}">Download</a>
         </div>`
      );
      return;
    }

    if (mime === "application/pdf") {
      openViewModal(
        safeName,
        `<iframe src="${url}"></iframe>
         <div style="margin-top:14px;">
           <a class="link" href="${url}" download="${safeName}">Download</a>
         </div>`
      );
      return;
    }

    openViewModal(
      safeName,
      `<p style="font-size:22px;">No preview available.</p>
       <a class="link" href="${url}" download="${safeName}">Download</a>`
    );
  }

  // ---------- SORT ----------
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

  // ---------- RENDER ----------
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
        <div class="${rowClass}" draggable="true" data-id="${escapeHtml(item.id)}" data-type="${escapeHtml(
          item.type
        )}">
          <div class="col col-check"><span class="select-box"></span></div>
          <div class="col col-name"><img class="icon" src="${iconSrc}" alt="" />${escapeHtml(item.name)}</div>
          <div class="col col-mod">${escapeHtml(item.modified || "")}</div>
          <div class="col col-by">${escapeHtml(item.by || "")}</div>
        </div>
      `;
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

      row.addEventListener("dragstart", (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) return;

        const id = row.getAttribute("data-id");
        if (!id) return;

        if (!isSelected(id)) {
          state.selectedIds = [id];
          saveUiState();
          render();
        }

        e.dataTransfer.setData("text/plain", JSON.stringify({ ids: state.selectedIds }));
        e.dataTransfer.effectAllowed = "move";
      });

      row.addEventListener("dragover", (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) return;

        const type = row.getAttribute("data-type");
        if (type !== "folder") return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        row.classList.add("drop-target");
      });

      row.addEventListener("dragleave", () => {
        row.classList.remove("drop-target");
      });

      row.addEventListener("drop", (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) return;

        const type = row.getAttribute("data-type");
        if (type !== "folder") return;
        e.preventDefault();
        row.classList.remove("drop-target");

        const targetId = row.getAttribute("data-id");
        if (!targetId) return;

        let payload;
        try {
          payload = JSON.parse(e.dataTransfer.getData("text/plain"));
        } catch {
          return;
        }
        const ids = Array.isArray(payload.ids) ? payload.ids : [];
        moveItemsIntoFolder(ids, targetId).catch((e) => alert(e.message));
      });
    });

    updateActionButtons();
  }

  // ---------- BUTTONS / EVENTS ----------
  function wireButtons() {
    if (backToLoginBtn)
      backToLoginBtn.addEventListener("click", () => {
        sessionStorage.removeItem("edushare_user");
        window.location.href = "login.html";
      });

    if (backBtn)
      backBtn.addEventListener("click", () => {
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
      if (state.shareMode === "view" || state.shareToken) return;
      if (createModal) createModal.classList.remove("hidden");
    }

    function closeCreateModal() {
      if (createModal) createModal.classList.add("hidden");
    }

    if (uploadBtn) uploadBtn.addEventListener("click", openCreateModal);

    if (createFolderBtn)
      createFolderBtn.addEventListener("click", () => {
        closeCreateModal();
        createFolder().catch((e) => alert(e.message));
      });

    if (createFileBtn)
      createFileBtn.addEventListener("click", () => {
        closeCreateModal();
        closeCtx();
        if (state.shareMode === "view" || state.shareToken) return;
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

    tableBody.addEventListener("dragover", (e) => {
      if (state.shareMode === "view" || state.shareToken) return;
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault();
      tableBody.classList.add("drop-upload");
    });

    tableBody.addEventListener("dragleave", () => {
      tableBody.classList.remove("drop-upload");
    });

    tableBody.addEventListener("drop", async (e) => {
      if (state.shareMode === "view" || state.shareToken) return;
      if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      e.preventDefault();
      tableBody.classList.remove("drop-upload");

      try {
        await uploadFilesIntoCurrentFolder(e.dataTransfer.files);
      } catch (err) {
        alert("Drop upload failed: " + err.message);
      }
    });

    if (renameBtn) renameBtn.addEventListener("click", () => renameSelected().catch((e) => alert(e.message)));
    if (viewBtn) viewBtn.addEventListener("click", viewSelected);
    if (deleteBtn) deleteBtn.addEventListener("click", () => deleteSelected().catch((e) => alert(e.message)));
    if (cloudBtn) cloudBtn.addEventListener("click", () => alert("Cloud clicked"));

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

    if (ctxView) ctxView.addEventListener("click", () => { closeCtx(); viewSelected(); });
    if (ctxRename) ctxRename.addEventListener("click", () => { closeCtx(); renameSelected().catch((e) => alert(e.message)); });
    if (ctxDelete) ctxDelete.addEventListener("click", () => { closeCtx(); deleteSelected().catch((e) => alert(e.message)); });
  }

  if (searchInput)
    searchInput.addEventListener("input", () => {
      closeCtx();
      render();
    });

  // ---------- INIT ----------
  loadUiState();
  applyShareFromUrl();
  refreshProfileName();


  wireButtons();
  wireSorting();

  refreshCurrentFolder().catch((e) => {
    alert("Failed to load from API: " + e.message);
  });
})();
