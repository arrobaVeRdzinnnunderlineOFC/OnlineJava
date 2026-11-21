const vfs = new VirtualFileSystem();

const fileTreeEl = document.getElementById("fileTree");
const codeEditorEl = document.getElementById("codeEditor");
const lineNumbersEl = document.getElementById("lineNumbers");
const activeFileLabelEl = document.getElementById("activeFileLabel");
const consoleOutputEl = document.getElementById("consoleOutput");
const statusLabelEl = document.getElementById("statusLabel");
const mainClassInputEl = document.getElementById("mainClassInput");

const runBtn = document.getElementById("runBtn");
const clearConsoleBtn = document.getElementById("clearConsoleBtn");
const newFileBtn = document.getElementById("newFileBtn");
const exportJarBtn = document.getElementById("exportJarBtn");
const exportExeBtn = document.getElementById("exportExeBtn");
const resetVfsBtn = document.getElementById("resetVfsBtn");

function appendConsole(text) {
  consoleOutputEl.textContent += text + "\n";
  consoleOutputEl.scrollTop = consoleOutputEl.scrollHeight;
}

function updateLineNumbers() {
  const lines = codeEditorEl.value.split("\n").length;
  const nums = [];
  for (let i = 1; i <= lines; i++) nums.push(i);
  lineNumbersEl.textContent = nums.join("\n");
}

function renderFileTree() {
  fileTreeEl.innerHTML = "";
  const paths = Object.keys(vfs.files).sort();

  for (const path of paths) {
    const item = document.createElement("div");
    item.className = "file-item" + (path === vfs.activePath ? " active" : "");
    item.addEventListener("click", () => selectFile(path));

    const nameSpan = document.createElement("span");
    nameSpan.textContent = path;

    item.appendChild(nameSpan);

    if (paths.length > 1) {
      const delBtn = document.createElement("button");
      delBtn.className = "del-file-btn";
      delBtn.title = "Remover ficheiro virtual";
      delBtn.textContent = "x";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (vfs.deleteFile(path)) {
          loadActiveFileIntoEditor();
          renderFileTree();
        }
      });
      item.appendChild(delBtn);
    }

    fileTreeEl.appendChild(item);
  }
}

function loadActiveFileIntoEditor() {
  activeFileLabelEl.textContent = vfs.activePath;
  codeEditorEl.value = vfs.files[vfs.activePath] || "";
  updateLineNumbers();
}

function selectFile(path) {
  if (vfs.files[vfs.activePath] !== undefined) {
    vfs.files[vfs.activePath] = codeEditorEl.value;
  }
  if (!vfs.setActivePath(path)) return;
  vfs.save();
  loadActiveFileIntoEditor();
  renderFileTree();
}

codeEditorEl.addEventListener("input", () => {
  vfs.setContent(vfs.activePath, codeEditorEl.value);
  updateLineNumbers();
});

codeEditorEl.addEventListener("scroll", () => {
  lineNumbersEl.scrollTop = codeEditorEl.scrollTop;
});

codeEditorEl.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const start = codeEditorEl.selectionStart;
    const end = codeEditorEl.selectionEnd;
    codeEditorEl.value =
      codeEditorEl.value.substring(0, start) + "    " + codeEditorEl.value.substring(end);
    codeEditorEl.selectionStart = codeEditorEl.selectionEnd = start + 4;
    vfs.setContent(vfs.activePath, codeEditorEl.value);
    updateLineNumbers();
  }
});

newFileBtn.addEventListener("click", () => {
  const input = prompt("Nome do ficheiro virtual (ex: src/app/Inimigo.java ou src/Utils.java):");
  if (!input) return;
  vfs.setContent(vfs.activePath, codeEditorEl.value);
  const created = vfs.createFile(input);
  if (created) {
    renderFileTree();
    loadActiveFileIntoEditor();
  }
});

runBtn.addEventListener("click", () => {
  vfs.setContent(vfs.activePath, codeEditorEl.value);
  const mainClass = mainClassInputEl.value.trim() || "Main";
  statusLabelEl.className = "status-ok";
  statusLabelEl.textContent = "A executar...";

  try {
    if (typeof window.VirtualJavaRunner !== "function") {
      throw new Error("VirtualJavaRunner nao carregado. Verifica se js/java-runner.js existe e nao tem erros.");
    }
    const runner = new window.VirtualJavaRunner(vfs.files);
    const lines = runner.run(mainClass);
    appendConsole("--- Execucao (" + mainClass + ".main) ---");
    for (const l of lines) appendConsole(l);
    statusLabelEl.className = "status-ok";
    statusLabelEl.textContent = "Concluido (" + lines.length + " linhas)";
  } catch (err) {
    appendConsole("[ERRO JAVA] " + err.message);
    statusLabelEl.className = "status-err";
    statusLabelEl.textContent = "Erro de execucao";
  }
});

clearConsoleBtn.addEventListener("click", () => {
  consoleOutputEl.textContent = "";
  statusLabelEl.className = "status-ok";
  statusLabelEl.textContent = "Consola limpa";
});

exportJarBtn.addEventListener("click", () => {
  vfs.setContent(vfs.activePath, codeEditorEl.value);
  const mainClass = mainClassInputEl.value.trim() || "Main";
  exportJarFile(vfs.files, mainClass);
  appendConsole("[EXPORT] Gerado " + mainClass + ".jar com META-INF/MANIFEST.MF e ficheiros do projeto virtual.");
});

exportExeBtn.addEventListener("click", () => {
  vfs.setContent(vfs.activePath, codeEditorEl.value);
  const mainClass = mainClassInputEl.value.trim() || "Main";
  exportExecutableLauncher(vfs.files, mainClass);
  appendConsole("[EXPORT] Gerado executavel " + mainClass + "_Runner.bat para " + mainClass + ".");
});

resetVfsBtn.addEventListener("click", () => {
  vfs.reset();
  renderFileTree();
  loadActiveFileIntoEditor();
  consoleOutputEl.textContent = "";
  appendConsole("[VFS] Projeto virtual restaurado para o modelo inicial do Online Java.");
});

renderFileTree();
loadActiveFileIntoEditor();
appendConsole("Online Java iniciado. Nao e necessario instalar nada para correr ou dar import entre ficheiros virtuais.");
