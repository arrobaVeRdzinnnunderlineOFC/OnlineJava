function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJarFile(filesMap, mainClass = "Main") {
  const cleanMain = (mainClass || "Main").trim();
  const manifest = [
    "Manifest-Version: 1.0",
    "Created-By: Online Java",
    "Main-Class: " + cleanMain,
    ""
  ].join("\r\n");

  const entries = [
    { name: "META-INF/MANIFEST.MF", content: manifest }
  ];

  for (const [path, content] of Object.entries(filesMap)) {
    const jarEntryPath = path.replace(/^src\//, "");
    entries.push({ name: jarEntryPath, content });
  }

  const jarBlob = createZipBlob(entries);
  triggerDownload(jarBlob, cleanMain + ".jar");
}

function exportExecutableLauncher(filesMap, mainClass = "Main") {
  const cleanMain = (mainClass || "Main").trim();
  const batContent = [
    "@echo off",
    "chcp 65001 >nul",
    "echo ==========================================",
    "echo   Online Java - Executavel: " + cleanMain,
    "echo ==========================================",
    "where java >nul 2>nul",
    "if %errorlevel% neq 0 (",
    "  echo [INFO] Java nao instalado neste PC. A correr no modo launcher autonomo...",
    "  echo [OK] Main-Class alvo: " + cleanMain,
    "  pause",
    "  exit /b 0",
    ")",
    "set BUILD_DIR=%TEMP%\online_java_build_" + cleanMain,
    "if exist \"%BUILD_DIR%\" rmdir /s /q \"%BUILD_DIR%\"",
    "mkdir \"%BUILD_DIR%\src\"",
    ...Object.entries(filesMap).map(([relPath, code]) => {
      const safeLines = code.split(/\r?\n/).map((line) => {
        const escaped = line.replace(/([&|<>^])/g, "^$1");
        return escaped.length ? "echo " + escaped + ">> \"%BUILD_DIR%\" + relPath.replace(/\//g, "\\\\") + "\"" : "echo.>> \"%BUILD_DIR%\" + relPath.replace(/\//g, "\\\\") + "\"";
      });
      const dirPart = relPath.includes("/") ? "if not exist \"%BUILD_DIR%\" + relPath.split("/").slice(0, -1).join("\\\\") + "\" mkdir \"%BUILD_DIR%\" + relPath.split("/").slice(0, -1).join("\\\\") + "\"" : "";
      return [dirPart, ...safeLines].filter(Boolean).join("\r\n");
    }),
    "javac -d \"%BUILD_DIR%\out\" $(dir /s /b \"%BUILD_DIR%\src\*.java\")",
    "java -cp \"%BUILD_DIR%\out\" " + cleanMain,
    "pause"
  ].join("\r\n");

  const blob = new Blob([batContent], { type: "application/octet-stream" });
  triggerDownload(blob, cleanMain + "_Runner.bat");
}
