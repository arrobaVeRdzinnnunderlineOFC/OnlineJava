const VFS_STORAGE_KEY = "online_java_ide_vfs_v1";

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
    this.activePath = Object.keys(this.files)[0] || "src/Main.java";
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
    return { ...DEFAULT_VIRTUAL_FILES };
  }

  save() {
    try {
      localStorage.setItem(VFS_STORAGE_KEY, JSON.stringify(this.files));
    } catch (_) {}
  }

  reset() {
    this.files = { ...DEFAULT_VIRTUAL_FILES };
    this.activePath = "src/Main.java";
    this.save();
  }

  setContent(path, content) {
    this.files[path] = content;
    this.save();
  }

  createFile(path) {
    const clean = path.trim().replace(/^\/+/, "");
    if (!clean) return null;
    const normalized = clean.endsWith(".java") ? clean : `${clean}.java`;
    if (!this.files[normalized]) {
      const className = normalized.split("/").pop().replace(".java", "");
      this.files[normalized] = `public class ${className} {
    public static void main(String[] args) {
        System.out.println("Olá de ${className}!");
    }
}
`;
      this.save();
    }
    this.activePath = normalized;
    return normalized;
  }

  deleteFile(path) {
    const keys = Object.keys(this.files);
    if (keys.length <= 1) return false;
    delete this.files[path];
    if (this.activePath === path) {
      this.activePath = Object.keys(this.files)[0];
    }
    this.save();
    return true;
  }
}
