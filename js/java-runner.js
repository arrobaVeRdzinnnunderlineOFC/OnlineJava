class JavaExecutionError extends Error {}

function splitArgs(argStr) {
  const args = [];
  let current = "";
  let inStr = false;
  let depthParen = 0;
  let depthBracket = 0;

  for (let i = 0; i < argStr.length; i++) {
    const ch = argStr[i];
    if (ch === '"' && argStr[i - 1] !== "\\") {
      inStr = !inStr;
      current += ch;
    } else if (!inStr) {
      if (ch === "(") depthParen++;
      else if (ch === ")") depthParen--;
      else if (ch === "[") depthBracket++;
      else if (ch === "]") depthBracket--;
      else if (ch === "," && depthParen === 0 && depthBracket === 0) {
        if (current.trim()) args.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

class VirtualJavaRunner {
  constructor(filesMap) {
    this.filesMap = filesMap;
    this.classes = new Map();
    this.output = [];
  }

  log(msg) {
    this.output.push(String(msg));
  }

  parseAllClasses() {
    this.classes.clear();

    for (const [filePath, rawCode] of Object.entries(this.filesMap)) {
      const code = rawCode
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\r\n]*/g, "");

      const pkgMatch = code.match(/^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m);
      const pkg = pkgMatch ? pkgMatch[1] : "";

      const imports = [];
      const importRegex = /^\s*import\s+([a-zA-Z0-9_.*]+)\s*;/gm;
      let m;
      while ((m = importRegex.exec(code)) !== null) {
        imports.push(m[1]);
      }

      const classRegex = /(?:public\s+)?class\s+([A-Za-z0-9_]+)\s*\{([\s\S]*)/;
      const cMatch = code.match(classRegex);
      if (!cMatch) continue;

      const className = cMatch[1];
      const bodyWithRest = cMatch[2];
      let depth = 1;
      let endIdx = -1;
      let inStr = false;
      for (let i = 0; i < bodyWithRest.length; i++) {
        const ch = bodyWithRest[i];
        if (ch === '"' && bodyWithRest[i - 1] !== "\\") inStr = !inStr;
        else if (!inStr) {
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) {
              endIdx = i;
              break;
            }
          }
        }
      }
      const classBody = endIdx >= 0 ? bodyWithRest.slice(0, endIdx) : bodyWithRest;
      const fqcn = pkg ? pkg + "." + className : className;

      const parsed = this.parseClassMembers(className, fqcn, pkg, imports, classBody, filePath);
      this.classes.set(fqcn, parsed);
      if (!this.classes.has(className)) {
        this.classes.set(className, parsed);
      }
    }
  }

  parseClassMembers(className, fqcn, pkg, imports, body, filePath) {
    const fields = [];
    const methods = [];

    const sigRegex = /(?:public|private|protected)?\s*(static\s+)?([A-Za-z0-9_<>\[\]]+\s+)?([A-Za-z0-9_]+)\s*\(([^)]*)\)\s*\{/g;
    let match;
    const occupiedRanges = [];

    while ((match = sigRegex.exec(body)) !== null) {
      const startBrace = match.index + match[0].length - 1;
      let depth = 1;
      let i = startBrace + 1;
      let inStr = false;
      for (; i < body.length; i++) {
        const ch = body[i];
        if (ch === '"' && body[i - 1] !== "\\") inStr = !inStr;
        else if (!inStr) {
          if (ch === "{") depth++;
          else if (ch === "}") {
            depth--;
            if (depth === 0) break;
          }
        }
      }
      const blockBody = body.slice(startBrace + 1, i);
      const isStatic = Boolean(match[1]);
      const retType = (match[2] || "").trim();
      const name = match[3];
      const params = match[4]
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          const parts = p.split(/\s+/);
          return parts[parts.length - 1];
        });

      const isConstructor = !retType && name === className;
      methods.push({
        name,
        isStatic,
        isConstructor,
        params,
        body: blockBody
      });
      occupiedRanges.push([match.index, i + 1]);
    }

    let outside = "";
    let cursor = 0;
    for (const [s, e] of occupiedRanges) {
      if (s > cursor) outside += body.slice(cursor, s);
      cursor = Math.max(cursor, e);
    }
    if (cursor < body.length) outside += body.slice(cursor);

    for (const stmt of outside.split(";")) {
      const clean = stmt.trim();
      if (!clean) continue;
      const withoutMod = clean
        .replace(/^(public|private|protected|static|final)\s+/g, "")
        .replace(/^(public|private|protected|static|final)\s+/g, "");
      const eqIdx = withoutMod.indexOf("=");
      if (eqIdx !== -1) {
        const left = withoutMod.slice(0, eqIdx).trim().split(/\s+/);
        const fieldName = left[left.length - 1];
        const initExpr = withoutMod.slice(eqIdx + 1).trim();
        fields.push({ name: fieldName, initExpr });
      } else {
        const parts = withoutMod.split(/\s+/);
        if (parts.length >= 2) {
          fields.push({ name: parts[parts.length - 1], initExpr: null });
        }
      }
    }

    return { className, fqcn, pkg, imports, fields, methods, filePath };
  }

  resolveClass(name, fromClassDef) {
    if (this.classes.has(name)) return this.classes.get(name);
    if (fromClassDef) {
      if (fromClassDef.pkg && this.classes.has(fromClassDef.pkg + "." + name)) {
        return this.classes.get(fromClassDef.pkg + "." + name);
      }
      for (const imp of fromClassDef.imports) {
        if (imp === name || imp.endsWith("." + name)) {
          if (this.classes.has(imp)) return this.classes.get(imp);
        }
        if (imp.endsWith(".*")) {
          const basePkg = imp.slice(0, -2);
          if (this.classes.has(basePkg + "." + name)) {
            return this.classes.get(basePkg + "." + name);
          }
        }
      }
    }
    return null;
  }

  createInstance(classDef, args, scope) {
    const obj = {
      __classDef: classDef,
      fields: {}
    };
    for (const f of classDef.fields) {
      obj.fields[f.name] = f.initExpr ? this.evalExpr(f.initExpr, scope, obj) : null;
    }
    const ctor = classDef.methods.find((m) => m.isConstructor && m.params.length === args.length)
      || classDef.methods.find((m) => m.isConstructor);
    if (ctor) {
      const ctorScope = {};
      ctor.params.forEach((pName, idx) => {
        ctorScope[pName] = args[idx];
      });
      this.execBlock(ctor.body, ctorScope, obj);
    }
    return obj;
  }

  callMethod(classDef, methodName, args, instance = null, callerScope = {}) {
    if ((methodName === "println" || methodName === "print") && (instance === "System.out" || (instance && instance.__isOut))) {
      this.log(args.length ? args[0] : "");
      return null;
    }

    if (instance && Array.isArray(instance.__list)) {
      if (methodName === "add") {
        instance.__list.push(args[0]);
        return true;
      }
      if (methodName === "get") {
        return instance.__list[args[0]];
      }
      if (methodName === "size") {
        return instance.__list.length;
      }
      if (methodName === "remove") {
        return instance.__list.splice(args[0], 1)[0];
      }
    }

    const method = classDef.methods.find((m) => m.name === methodName);
    if (!method) {
      throw new JavaExecutionError("Metodo '" + methodName + "' nao encontrado em '" + classDef.className + "'.");
    }

    const localScope = Object.assign({}, callerScope);
    method.params.forEach((pName, idx) => {
      localScope[pName] = args[idx];
    });

    const res = this.execBlock(method.body, localScope, instance);
    return res && res.__returned ? res.value : null;
  }

  evalExpr(expr, scope, instance) {
    const e = expr.trim();
    if (!e) return undefined;

    if (e.startsWith('"') && e.endsWith('"') && e.length >= 2) {
      return e.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
    }

    if (e === "true") return true;
    if (e === "false") return false;
    if (e === "null") return null;
    if (/^-?\d+(\.\d+)?$/.test(e)) return Number(e);

    const listNewMatch = e.match(/^new\s+ArrayList(?:<[^>]*>)?\s*\(\s*\)$/);
    if (listNewMatch) {
      return { __list: [] };
    }

    const newMatch = e.match(/^new\s+([A-Za-z0-9_.]+)\s*\((.*)\)$/);
    if (newMatch) {
      const targetName = newMatch[1];
      const argVals = splitArgs(newMatch[2]).map((a) => this.evalExpr(a, scope, instance));
      const cDef = this.resolveClass(targetName, instance ? instance.__classDef : null);
      if (!cDef) {
        throw new JavaExecutionError("Classe '" + targetName + "' nao encontrada. Verifica imports ou ficheiros.");
      }
      return this.createInstance(cDef, argVals, scope);
    }

    const plusParts = this.splitTopLevelPlus(e);
    if (plusParts.length > 1) {
      const vals = plusParts.map((p) => this.evalExpr(p, scope, instance));
      if (vals.some((v) => typeof v === "string")) {
        return vals.map((v) => String(v)).join("");
      }
      return vals.reduce((acc, v) => acc + Number(v), 0);
    }

    for (const op of ["==", "!=", "<=", ">=", "<", ">", "-", "*", "/"]) {
      const idx = this.findTopLevelOperator(e, op);
      if (idx > 0) {
        const left = this.evalExpr(e.slice(0, idx), scope, instance);
        const right = this.evalExpr(e.slice(idx + op.length), scope, instance);
        if (op === "==") return left === right;
        if (op === "!=") return left !== right;
        if (op === "<=") return left <= right;
        if (op === ">=") return left >= right;
        if (op === "<") return left < right;
        if (op === ">") return left > right;
        if (op === "-") return Number(left) - Number(right);
        if (op === "*") return Number(left) * Number(right);
        if (op === "/") return Number(left) / Number(right);
      }
    }

    const callMatch = e.match(/^([A-Za-z0-9_$.]+)\.([A-Za-z0-9_]+)\((.*)\)$/);
    if (callMatch) {
      const targetExpr = callMatch[1];
      const mName = callMatch[2];
      const argVals = splitArgs(callMatch[3]).map((a) => this.evalExpr(a, scope, instance));
      if (targetExpr === "System.out") {
        return this.callMethod(null, mName, argVals, { __isOut: true }, scope);
      }
      const targetObj = this.evalExpr(targetExpr, scope, instance);
      if (targetObj && targetObj.__list) {
        return this.callMethod(null, mName, argVals, targetObj, scope);
      }
      if (targetObj && targetObj.__classDef) {
        return this.callMethod(targetObj.__classDef, mName, argVals, targetObj, scope);
      }
    }

    if (e.startsWith("this.") && instance) {
      const fname = e.slice(5).trim();
      return instance.fields[fname];
    }

    const dotFieldMatch = e.match(/^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/);
    if (dotFieldMatch) {
      const obj = this.evalExpr(dotFieldMatch[1], scope, instance);
      if (obj && obj.fields && dotFieldMatch[2] in obj.fields) {
        return obj.fields[dotFieldMatch[2]];
      }
    }

    if (e in scope) return scope[e];
    if (instance && e in instance.fields) return instance.fields[e];

    return e;
  }

  splitTopLevelPlus(expr) {
    const parts = [];
    let current = "";
    let inStr = false;
    let depth = 0;

    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === '"' && expr[i - 1] !== "\\") {
        inStr = !inStr;
        current += ch;
      } else if (!inStr) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        else if (ch === "+" && depth === 0) {
          parts.push(current.trim());
          current = "";
          continue;
        }
        current += ch;
      } else {
        current += ch;
      }
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
  }

  findTopLevelOperator(expr, op) {
    let inStr = false;
    let depth = 0;
    for (let i = 0; i < expr.length; i++) {
      const ch = expr[i];
      if (ch === '"' && expr[i - 1] !== "\\") inStr = !inStr;
      else if (!inStr) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        else if (depth === 0 && expr.slice(i, i + op.length) === op) {
          if ((op === "<" || op === ">") && expr[i + 1] === "=") continue;
          return i;
        }
      }
    }
    return -1;
  }

  execBlock(block, scope, instance) {
    const lines = this.splitStatements(block);
    for (const stmt of lines) {
      const s = stmt.trim();
      if (!s) continue;

      if (s.startsWith("return")) {
        const rest = s.slice(6).trim();
        return { __returned: true, value: rest ? this.evalExpr(rest, scope, instance) : null };
      }

      const forMatch = s.match(/^for\s*\(([^;]*);([^;]*);([^)]*)\)\s*\{([\s\S]*)\}$/);
      if (forMatch) {
        const initPart = forMatch[1];
        const condPart = forMatch[2];
        const stepPart = forMatch[3];
        const loopBody = forMatch[4];
        if (initPart.trim()) this.execSimpleStmt(initPart.trim(), scope, instance);
        let guard = 0;
        while (condPart.trim() ? Boolean(this.evalExpr(condPart.trim(), scope, instance)) : true) {
          if (++guard > 5000) throw new JavaExecutionError("Limite de iteracoes (5000) atingido no loop for.");
          const res = this.execBlock(loopBody, scope, instance);
          if (res && res.__returned) return res;
          if (stepPart.trim()) this.execSimpleStmt(stepPart.trim(), scope, instance);
        }
        continue;
      }

      const whileMatch = s.match(/^while\s*\(([^)]*)\)\s*\{([\s\S]*)\}$/);
      if (whileMatch) {
        const condPart = whileMatch[1];
        const loopBody = whileMatch[2];
        let guard = 0;
        while (Boolean(this.evalExpr(condPart.trim(), scope, instance))) {
          if (++guard > 5000) throw new JavaExecutionError("Limite de iteracoes (5000) atingido no loop while.");
          const res = this.execBlock(loopBody, scope, instance);
          if (res && res.__returned) return res;
        }
        continue;
      }

      const ifMatch = s.match(/^if\s*\(([^)]*)\)\s*\{([\s\S]*)\}(?:\s*else\s*\{([\s\S]*)\})?$/);
      if (ifMatch) {
        const condPart = ifMatch[1];
        const thenBody = ifMatch[2];
        const elseBody = ifMatch[3];
        if (Boolean(this.evalExpr(condPart.trim(), scope, instance))) {
          const res = this.execBlock(thenBody, scope, instance);
          if (res && res.__returned) return res;
        } else if (elseBody) {
          const res = this.execBlock(elseBody, scope, instance);
          if (res && res.__returned) return res;
        }
        continue;
      }

      this.execSimpleStmt(s, scope, instance);
    }
    return null;
  }

  execSimpleStmt(s, scope, instance) {
    const incMatch = s.match(/^([A-Za-z0-9_$.]+)\+\+$/);
    if (incMatch) {
      const name = incMatch[1];
      const val = Number(this.evalExpr(name, scope, instance)) + 1;
      this.assignTarget(name, val, scope, instance);
      return;
    }

    const assignMatch = s.match(/^([A-Za-z0-9_$.]+)\s*=(?!=)\s*(.+)$/);
    const declMatch = s.match(/^(?:final\s+)?([A-Za-z0-9_<>\[\]]+)\s+([A-Za-z0-9_]+)\s*=\s*(.+)$/);

    if (declMatch) {
      const varName = declMatch[2];
      const rhs = declMatch[3];
      scope[varName] = this.evalExpr(rhs, scope, instance);
      return;
    }

    if (assignMatch) {
      const target = assignMatch[1];
      const rhs = assignMatch[2];
      this.assignTarget(target, this.evalExpr(rhs, scope, instance), scope, instance);
      return;
    }

    this.evalExpr(s, scope, instance);
  }

  assignTarget(target, val, scope, instance) {
    if (target.startsWith("this.") && instance) {
      instance.fields[target.slice(5)] = val;
      return;
    }
    const dotMatch = target.match(/^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/);
    if (dotMatch) {
      const obj = this.evalExpr(dotMatch[1], scope, instance);
      if (obj && obj.fields) {
        obj.fields[dotMatch[2]] = val;
        return;
      }
    }
    scope[target] = val;
  }

  splitStatements(code) {
    const stmts = [];
    let current = "";
    let depth = 0;
    let inStr = false;

    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (ch === '"' && code[i - 1] !== "\\") {
        inStr = !inStr;
        current += ch;
      } else if (!inStr) {
        if (ch === "{") {
          depth++;
          current += ch;
        } else if (ch === "}") {
          depth--;
          current += ch;
          if (depth === 0) {
            stmts.push(current.trim());
            current = "";
          }
        } else if (ch === ";" && depth === 0) {
          stmts.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      } else {
        current += ch;
      }
    }
    if (current.trim()) stmts.push(current.trim());
    return stmts;
  }

  run(mainClassName = "Main") {
    this.output = [];
    this.parseAllClasses();
    const mainDef = this.classes.get(mainClassName);
    if (!mainDef) {
      throw new JavaExecutionError("Classe principal '" + mainClassName + "' nao encontrada no projeto virtual.");
    }
    const mainMethod = mainDef.methods.find((m) => m.name === "main");
    if (!mainMethod) {
      throw new JavaExecutionError("Metodo 'public static void main(String[] args)' nao encontrado em '" + mainClassName + "'.");
    }
    const scope = { args: [] };
    this.execBlock(mainMethod.body, scope, null);
    return this.output;
  }
}

window.VirtualJavaRunner = VirtualJavaRunner;
