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
  const renameBtn = document.getElementById("renameBtn");
  const viewBtn = document.getElementById("viewBtn");
  const deleteBtn = document.getElementById("deleteBtn");
  const cloudBtn = document.getElementById("cloudBtn");

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
    items: [
      { id: uid(), type: "folder", name: "Year 4", parentId: "root", modified: nowStamp(), by: "Prof.Glass" },
      { id: uid(), type: "folder", name: "COM682", parentId: "root", modified: nowStamp(), by: "Prof.Glass" },
      { id: uid(), type: "file", name: "Sample Wireframes", parentId: "root", modified: nowStamp(), by: "Prof.Glass" }
    ]
  };

  const state = loadState() || defaultState;
  saveState();

  function findItem(id) {
    return state.items.find(x => x.id === id && !x.isDeleted) || null;
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
    stack.reverse().forEach(x => chain.push(x));

    breadcrumbEl.innerHTML = chain.map((f, idx) => {
      const isLast = idx === chain.length - 1;
      if (isLast) return escapeHtml(f.name);
      return `<a class="crumb" href="#" data-id="${escapeHtml(f.id)}">${escapeHtml(f.name)}</a> &gt; `;
    }).join("");

    Array.from(breadcrumbEl.querySelectorAll(".crumb")).forEach(a => {
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
    const inFolder = state.items.filter(x => x.parentId === state.currentFolderId && !x.isDeleted);
    const filtered = q ? inFolder.filter(x => x.name.toLowerCase().includes(q)) : inFolder;

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
    if (isSelected(id)) state.selectedIds = state.selectedIds.filter(x => x !== id);
    else state.selectedIds = state.selectedIds.concat(id);
  }

  function selectedItems() {
    return state.selectedIds.map(findItem).filter(Boolean);
  }

  function updateActionButtons(){
    const sel = selectedItems();
    const single = sel.length === 1;

    if (renameBtn) renameBtn.classList.toggle("btn-disabled", !single);
    if (viewBtn) viewBtn.classList.toggle("btn-disabled", !single);
    if (deleteBtn) deleteBtn.classList.toggle("btn-disabled", sel.length === 0);
  }

  function render() {
    buildBreadcrumb();

    const visible = getVisibleItems();
    const allVisibleIds = visible.map(x => x.id);
    const allChecked = allVisibleIds.length > 0 && allVisibleIds.every(id => isSelected(id));
    if (selectAll) selectAll.checked = allChecked;

    tableBody.innerHTML = visible.map(item => {
    const rowClass = isSelected(item.id) ? "row selected" : "row";
    const iconSrc = item.type === "folder"
        ? "icons/folder.svg"
        : "icons/file.svg";

    return `
        <div class="${rowClass}" data-id="${escapeHtml(item.id)}" data-type="${escapeHtml(item.type)}">
        <div class="col col-check">
            <span class="select-box"></span>
        </div>
        <div class="col col-name">
            <img class="icon" src="${iconSrc}" alt="" />
            ${escapeHtml(item.name)}
        </div>
        <div class="col col-mod">${escapeHtml(item.modified || "")}</div>
        <div class="col col-by">${escapeHtml(item.by || "")}</div>
        </div>
    `;
    }).join("");

    Array.from(tableBody.querySelectorAll(".row")).forEach(row => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-id");
        if (!id) return;

        toggleSelected(id);
        saveState();
        render();
      });

      row.addEventListener("dblclick", () => {
        const id = row.getAttribute("data-id");
        const item = findItem(id);
        if (item && item.type === "folder") {
          state.currentFolderId = item.id;
          state.selectedIds = [];
          saveState();
          render();
        }
      });
    });

    updateActionButtons();
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

  function createFileMock() {
    const name = prompt("File name (e.g. notes.pdf):");
    if (!name) return;

    state.items.push({
      id: uid(),
      type: "file",
      name: name.trim(),
      parentId: state.currentFolderId,
      modified: nowStamp(),
      by: state.user
    });
    saveState();
    render();
  }

  function renameSelected() {
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
    const sel = selectedItems();
    if (sel.length === 0) {
      alert("Select at least one item.");
      return;
    }
    const ok = confirm(`Delete ${sel.length} item(s)?`);
    if (!ok) return;

    sel.forEach(item => {
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
    alert(`Viewing: ${sel.name}`);
  }

  function wireSorting() {
    const headCells = document.querySelectorAll(".sortable");
    headCells.forEach(cell => {
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

  function wireButtons() {
    if (backToLoginBtn) backToLoginBtn.addEventListener("click", () => {
      window.location.href = "login.html";
    });

    if (backBtn) backBtn.addEventListener("click", () => {
      state.currentFolderId = parentFolderId();
      state.selectedIds = [];
      saveState();
      render();
    });

    if (selectAll) selectAll.addEventListener("change", () => {
      const visible = getVisibleItems().map(x => x.id);
      if (selectAll.checked) state.selectedIds = Array.from(new Set(state.selectedIds.concat(visible)));
      else state.selectedIds = state.selectedIds.filter(id => !visible.includes(id));
      saveState();
      render();
    });

    const createModal = document.getElementById("createModal");
    const createFolderBtn = document.getElementById("createFolderBtn");
    const createFileBtn = document.getElementById("createFileBtn");
    const cancelCreateBtn = document.getElementById("cancelCreateBtn");

    function openCreateModal(){
      if (createModal) createModal.classList.remove("hidden");
    }

    function closeCreateModal(){
      if (createModal) createModal.classList.add("hidden");
    }

    if (uploadBtn) uploadBtn.addEventListener("click", openCreateModal);

    if (createFolderBtn) createFolderBtn.addEventListener("click", () => {
      closeCreateModal();
      createFolder();
    });

    if (createFileBtn) createFileBtn.addEventListener("click", () => {
      closeCreateModal();
      createFileMock();
    });

    if (cancelCreateBtn) cancelCreateBtn.addEventListener("click", closeCreateModal);

    if (renameBtn) renameBtn.addEventListener("click", renameSelected);
    if (viewBtn) viewBtn.addEventListener("click", viewSelected);
    if (deleteBtn) deleteBtn.addEventListener("click", deleteSelected);
    if (cloudBtn) cloudBtn.addEventListener("click", () => alert("Cloud clicked"));
  }

  if (searchInput) searchInput.addEventListener("input", render);

  wireButtons();
  wireSorting();
  render();
})();
