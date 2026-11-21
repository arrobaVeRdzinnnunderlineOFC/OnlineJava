const VFS_STORAGE_KEY = "online_java_ide_vfs_v1";
const VFS_ACTIVE_KEY = "online_java_ide_active_v1";

const DEFAULT_VIRTUAL_FILES = {
  "src/Main.java": `import app.Criatura;
import java.util.ArrayList;

public class Main {
    public static void main(String[] args) {
        Tela.limpar("#070b08");
        Tela.cor("#39ff14");
        Tela.texto("Online Java - Palco Visual", 16, 24);

        ArrayList<Criatura> grupo = new ArrayList<>();
        grupo.add(new Criatura("Nexalisk", 80, 90, "#39ff14"));
        grupo.add(new Criatura("Verdzinn", 220, 160, "#70e000"));

        for (int i = 0; i < grupo.size(); i++) {
            Criatura c = grupo.get(i);
            c.desenhar();
            System.out.println(c.info());
        }
    }
}
`,
  "src/app/Criatura.java": `package app;

public class Criatura {
    String nome;
    int x;
    int y;
    String cor;

    public Criatura(String nome, int x, int y, String cor) {
        this.nome = nome;
        this.x = x;
        this.y = y;
        this.cor = cor;
    }

    public void desenhar() {
        Tela.cor(this.cor);
        Tela.circulo(this.x, this.y, 24);
        Tela.cor("#e6f5ea");
        Tela.texto(this.nome, this.x - 24, this.y + 38);
    }

    public String info() {
        return this.nome + " em (" + this.x + ", " + this.y + ")";
    }
}
`
};

class VirtualFileSystem {
  constructor() {
    this.files = this.load();
    this.activePath = this.loadActivePath();
  }

  load() {
    try {
      const raw = localStorage.getItem(VFS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch (_) {}
    return Object.assign({}, DEFAULT_VIRTUAL_FILES);
  }

  loadActivePath() {
    const keys = Object.keys(this.files);
    try {
      const saved = localStorage.getItem(VFS_ACTIVE_KEY);
      if (saved && this.files[saved] !== undefined) {
        return saved;
      }
    } catch (_) {}
    return keys[0] || "src/Main.java";
  }

  setActivePath(path) {
    if (this.files[path] === undefined) return false;
    this.activePath = path;
    try {
      localStorage.setItem(VFS_ACTIVE_KEY, path);
    } catch (_) {}
    return true;
  }

  save() {
    try {
      localStorage.setItem(VFS_STORAGE_KEY, JSON.stringify(this.files));
      localStorage.setItem(VFS_ACTIVE_KEY, this.activePath);
    } catch (_) {}
  }

  reset() {
    this.files = Object.assign({}, DEFAULT_VIRTUAL_FILES);
    this.setActivePath("src/Main.java");
    this.save();
  }

  setContent(path, content) {
    this.files[path] = content;
    this.save();
  }

  createFile(path) {
    const clean = path.trim().replace(/^\/+/, "");
    if (!clean) return null;
    const normalized = clean.endsWith(".java") ? clean : clean + ".java";
    if (!this.files[normalized]) {
      const className = normalized.split("/").pop().replace(".java", "");
      this.files[normalized] = "public class " + className + " {\n    public static void main(String[] args) {\n        System.out.println(\"Ola de " + className + "!\");\n    }\n}\n";
    }
    this.setActivePath(normalized);
    this.save();
    return normalized;
  }

  deleteFile(path) {
    const keys = Object.keys(this.files);
    if (keys.length <= 1) return false;
    delete this.files[path];
    if (this.activePath === path) {
      this.setActivePath(Object.keys(this.files)[0]);
    }
    this.save();
    return true;
  }
}

window.VirtualFileSystem = VirtualFileSystem;
