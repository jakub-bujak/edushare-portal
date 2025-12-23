(function () {
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", function (e) {
      e.preventDefault();
      window.location.href = "portal.html";
    });
    return;
  }

  const tableBody = document.getElementById("tableBody");
  const searchInput = document.getElementById("searchInput");
  const breadcrumbEl = document.getElementById("breadcrumb");
  const backBtn = document.getElementById("backBtn");
  const selectAll = document.getElementById("selectAll");

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

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function nowStamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} - ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem("edushare_state_v2");
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveState() {
    localStorage.setItem("edushare_state_v2", JSON.stringify(state));
  }

  const defaultState = {
    user: "Jakub Bujak",
    rootId: "root",
    currentFolderId: "root",
    selectedIds: [],
    sortKey: "name",
    sortDir: "asc",
    shareMode: null, 
    shares: {},     
    items: [
      { id: uid(), type: "folder", name: "Year 4", parentId: "root", modified: nowStamp(), by: "Prof.Glass" },
      { id: uid(), type: "folder", name: "COM682", parentId: "root", modified: nowStamp(), by: "Prof.Glass" },
      { id: uid(), type: "file", name: "Sample Wireframes", parentId: "root", modified: nowStamp(), by: "Prof.Glass" }
    ]
  };

  const state = loadState() || defaultState;
  state.shares = state.shares || {};
  saveState();

  function findItem(id) {
    return state.items.find((x) => x.id === id && !x.isDeleted) || null;
  }

  function currentFolderItem() {
    if (state.currentFolderId === state.rootId) return null;
    const item = findItem(state.currentFolderId);
    if (!item || item.type !== "folder") return null;
    return item;
  }

  function parentFolderId() {
    const cur = currentFolderItem();
    if (!cur) return state.rootId;
    return cur.parentId || state.rootId;
  }

  function buildBreadcrumb() {
    if (!breadcrumbEl) return;

    const chain = [];
    chain.push({ id: state.rootId, name: "Public Folder" });

    let node = currentFolderItem();
    const stack = [];
    while (node) {
      stack.push(node);
      node = node.parentId && node.parentId !== state.rootId ? findItem(node.parentId) : null;
    }
    stack.reverse().forEach((x) => chain.push(x));

    breadcrumbEl.innerHTML = chain
      .map((f, idx) => {
        const isLast = idx === chain.length - 1;
        if (isLast) return escapeHtml(f.name);
        return `<a class="crumb" href="#" data-id="${escapeHtml(f.id)}">${escapeHtml(f.name)}</a> &gt; `;
      })
      .join("");

    Array.from(breadcrumbEl.querySelectorAll(".crumb")).forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const id = a.getAttribute("data-id");
        if (!id) return;
        state.currentFolderId = id;
        state.selectedIds = [];
        saveState();
        render();
      });
    });
  }

  function getVisibleItems() {
    const q = (searchInput ? searchInput.value : "").trim().toLowerCase();
    const inFolder = state.items.filter((x) => x.parentId === state.currentFolderId && !x.isDeleted);
    const filtered = q ? inFolder.filter((x) => x.name.toLowerCase().includes(q)) : inFolder;

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

  function getSharePerm() {
    const el = document.querySelector('input[name="sharePerm"]:checked');
    return (el && el.value) ? el.value : "view";
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

  function makeToken() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }

  function createShareLinkForSelected() {
    const sel = requireSingleSelection();
    if (!sel) return;

    const token = makeToken();
    const perm = getSharePerm();

    state.shares[token] = {
      itemId: sel.id,
      perm,
      createdBy: state.user,
      createdAt: nowStamp()
    };
    saveState();

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

    const rec = state.shares && state.shares[token];
    if (!rec) {
      alert("Invalid or expired share link.");
      return;
    }

    const item = findItem(rec.itemId);
    if (!item) {
      alert("Shared item not found.");
      return;
    }

    state.shareMode = rec.perm; 

    if (item.type === "folder") {
      state.currentFolderId = item.id;
      state.selectedIds = [];
      saveState();
      return;
    }

    if (item.type === "file") {
      state.selectedIds = [item.id];
      saveState();
    }
  }

  function updateActionButtons() {
    const sel = selectedItems();
    const single = sel.length === 1;
    const readOnly = state.shareMode === "view";

    if (renameBtn) renameBtn.classList.toggle("btn-disabled", readOnly || !single);
    if (viewBtn) viewBtn.classList.toggle("btn-disabled", !single);
    if (deleteBtn) deleteBtn.classList.toggle("btn-disabled", readOnly || sel.length === 0);

    if (uploadBtn) uploadBtn.classList.toggle("btn-disabled", readOnly);
    if (shareBtn) shareBtn.classList.toggle("btn-disabled", false);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function uploadRealFile(file) {
    const dataUrl = await fileToBase64(file);
    state.items.push({
      id: uid(),
      type: "file",
      name: file.name,
      parentId: state.currentFolderId,
      modified: nowStamp(),
      by: state.user,
      mime: file.type || "application/octet-stream",
      dataUrl
    });
    saveState();
    render();
  }

  async function uploadFilesIntoCurrentFolder(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    for (const f of files) {
      await uploadRealFile(f);
    }
  }

  function moveItemsIntoFolder(ids, folderId) {
    const folder = findItem(folderId);
    if (!folder || folder.type !== "folder") return;

    const moving = ids.map(findItem).filter(Boolean);

    for (const item of moving) {
      if (item.id === folderId) return;
      if (item.type === "folder" && isDescendant(folderId, item.id)) return;
    }

    for (const item of moving) {
      item.parentId = folderId;
      item.modified = nowStamp();
      item.by = state.user;
    }

    state.selectedIds = [];
    saveState();
    render();
  }

  function isDescendant(candidateId, folderId) {
    let cur = findItem(candidateId);
    while (cur) {
      if (cur.parentId === folderId) return true;
      if (!cur.parentId || cur.parentId === state.rootId) return false;
      cur = findItem(cur.parentId);
    }
    return false;
  }

  function requireSingleSelection() {
    const sel = selectedItems();
    if (sel.length !== 1) {
      alert("Select exactly one item.");
      return null;
    }
    return sel[0];
  }

  function createFolder() {
    const name = prompt("Folder name:");
    if (!name) return;
    state.items.push({
      id: uid(),
      type: "folder",
      name: name.trim(),
      parentId: state.currentFolderId,
      modified: nowStamp(),
      by: state.user
    });
    saveState();
    render();
  }

  function renameSelected() {
    if (state.shareMode === "view") return;

    const sel = requireSingleSelection();
    if (!sel) return;
    const next = prompt("New name:", sel.name);
    if (!next) return;
    sel.name = next.trim();
    sel.modified = nowStamp();
    sel.by = state.user;
    saveState();
    render();
  }

  function deleteSelected() {
    if (state.shareMode === "view") return;

    const sel = selectedItems();
    if (sel.length === 0) {
      alert("Select at least one item.");
      return;
    }
    const ok = confirm(`Delete ${sel.length} item(s)?`);
    if (!ok) return;

    sel.forEach((item) => {
      item.isDeleted = true;
      item.modified = nowStamp();
      item.by = state.user;
    });

    state.selectedIds = [];
    saveState();
    render();
  }

  function viewSelected() {
    const sel = requireSingleSelection();
    if (!sel) return;

    if (sel.type === "folder") {
      state.currentFolderId = sel.id;
      state.selectedIds = [];
      saveState();
      render();
      return;
    }

    if (sel.dataUrl) {
      const safeName = escapeHtml(sel.name);
      const mime = sel.mime || "application/octet-stream";

      if (mime.startsWith("image/")) {
        openViewModal(safeName, `<img src="${sel.dataUrl}" alt="${safeName}" />`);
        return;
      }

      if (mime === "application/pdf") {
        openViewModal(safeName, `<iframe src="${sel.dataUrl}"></iframe>`);
        return;
      }

      openViewModal(
        safeName,
        `<p style="font-size:22px;">No preview available.</p>
         <a class="link" download="${safeName}" href="${sel.dataUrl}">Download</a>`
      );
      return;
    }

    alert(`No stored data for: ${sel.name}`);
  }

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
        saveState();
        render();
      });
    });
  }

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
        <div class="${rowClass}" draggable="true" data-id="${escapeHtml(item.id)}" data-type="${escapeHtml(item.type)}">
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
        saveState();
        render();
      });

      row.addEventListener("dblclick", () => {
        closeCtx();
        const id = row.getAttribute("data-id");
        const item = findItem(id);
        if (item && item.type === "folder") {
          state.currentFolderId = item.id;
          state.selectedIds = [];
          saveState();
          render();
        }
      });

      row.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const id = row.getAttribute("data-id");
        if (!id) return;

        if (!isSelected(id)) {
          state.selectedIds = [id];
          saveState();
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
          saveState();
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
        moveItemsIntoFolder(ids, targetId);
      });
    });

    updateActionButtons();

    const url = new URL(window.location.href);
    const token = url.searchParams.get("share");
    if (token) {
      const rec = state.shares && state.shares[token];
      if (rec) {
        const item = findItem(rec.itemId);
        if (item && item.type === "file" && state.selectedIds.length === 1 && state.selectedIds[0] === item.id) {
          if (viewModal && viewModal.classList.contains("hidden")) viewSelected();
        }
      }
    }
  }

  function wireButtons() {
    if (backToLoginBtn) backToLoginBtn.addEventListener("click", () => (window.location.href = "login.html"));

    if (backBtn)
      backBtn.addEventListener("click", () => {
        closeCtx();
        state.currentFolderId = parentFolderId();
        state.selectedIds = [];
        saveState();
        render();
      });

    if (selectAll)
      selectAll.addEventListener("change", () => {
        closeCtx();
        const visible = getVisibleItems().map((x) => x.id);
        if (selectAll.checked) state.selectedIds = Array.from(new Set(state.selectedIds.concat(visible)));
        else state.selectedIds = state.selectedIds.filter((id) => !visible.includes(id));
        saveState();
        render();
      });

    const createModal = document.getElementById("createModal");
    const createFolderBtn = document.getElementById("createFolderBtn");
    const createFileBtn = document.getElementById("createFileBtn");
    const cancelCreateBtn = document.getElementById("cancelCreateBtn");

    function openCreateModal() {
      closeCtx();
      if (state.shareMode === "view") return;
      if (createModal) createModal.classList.remove("hidden");
    }

    function closeCreateModal() {
      if (createModal) createModal.classList.add("hidden");
    }

    if (uploadBtn) uploadBtn.addEventListener("click", openCreateModal);

    if (createFolderBtn)
      createFolderBtn.addEventListener("click", () => {
        closeCreateModal();
        createFolder();
      });

    if (createFileBtn)
      createFileBtn.addEventListener("click", () => {
        closeCreateModal();
        closeCtx();
        if (state.shareMode === "view") return;
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
        } catch {
          alert("Upload failed.");
        }
      });

    tableBody.addEventListener("dragover", (e) => {
      if (state.shareMode === "view") return;
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes("Files")) return;
      e.preventDefault();
      tableBody.classList.add("drop-upload");
    });

    tableBody.addEventListener("dragleave", () => {
      tableBody.classList.remove("drop-upload");
    });

    tableBody.addEventListener("drop", async (e) => {
      if (state.shareMode === "view") return;
      if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;
      e.preventDefault();
      tableBody.classList.remove("drop-upload");

      try {
        await uploadFilesIntoCurrentFolder(e.dataTransfer.files);
      } catch {
        alert("Drop upload failed.");
      }
    });

    if (renameBtn) renameBtn.addEventListener("click", renameSelected);
    if (viewBtn) viewBtn.addEventListener("click", viewSelected);
    if (deleteBtn) deleteBtn.addEventListener("click", deleteSelected);
    if (cloudBtn) cloudBtn.addEventListener("click", () => alert("Cloud clicked"));

    if (shareBtn) shareBtn.addEventListener("click", openShareModal);
    if (createShareBtn) createShareBtn.addEventListener("click", createShareLinkForSelected);
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
    if (ctxRename) ctxRename.addEventListener("click", () => { closeCtx(); renameSelected(); });
    if (ctxDelete) ctxDelete.addEventListener("click", () => { closeCtx(); deleteSelected(); });
  }

  if (searchInput)
    searchInput.addEventListener("input", () => {
      closeCtx();
      render();
    });

  applyShareFromUrl();

  wireButtons();
  wireSorting();
  render();
})();
