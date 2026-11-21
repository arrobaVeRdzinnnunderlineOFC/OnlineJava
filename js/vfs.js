const VFS_STORAGE_KEY = "online_java_ide_vfs_v1";
const VFS_ACTIVE_KEY = "online_java_ide_active_v1";

const DEFAULT_VIRTUAL_FILES = {
  "src/Main.java": `import app.Criatura;
import java.util.ArrayList;

public class Main {
    public static void main(String[] args) {
        ArrayList<String> log = new ArrayList<>();
        Criatura c1 = new Criatura("Nexalisk", 2);
        Criatura c2 = new Criatura("Verdzinn", 4);

        c1.andar(3);
        c2.andar(5);

        log.add(c1.info());
        log.add(c2.info());

        for (int i = 0; i < log.size(); i++) {
            System.out.println(log.get(i));
        }
    }
}
`,
  "src/app/Criatura.java": `package app;

public class Criatura {
    String nome;
    int energia;

    public Criatura(String nome, int energia) {
        this.nome = nome;
        this.energia = energia;
    }

    public void andar(int passos) {
        this.energia = this.energia + passos;
    }

    public String info() {
        return nome + " -> energia=" + energia;
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
