/**
 * 测试辅助：把 manifest/lock 对象写成临时目录，跑 CLI 拿报告。
 *
 * 纪律（references「测试隔离真实主目录」条）：所有临时目录都建在 `os.tmpdir()` 下，
 * 用完即删；**绝不写仓库内路径**（否则跑测试会污染工作树）。
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../../src/cli/args.mjs";
import { run } from "../../src/cli/main.mjs";

const created = [];

export function makeFixture(manifest, lock) {
  const dir = mkdtempSync(join(tmpdir(), "versionaudit-test-"));
  created.push(dir);
  writeFileSync(join(dir, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  writeFileSync(join(dir, "package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`, "utf8");
  return dir;
}

export function writeFile(dir, name, content) {
  const sub = join(dir, name);
  mkdirSync(join(sub, ".."), { recursive: true });
  writeFileSync(sub, content, "utf8");
  return sub;
}

export function cleanupFixtures() {
  for (const dir of created.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* 清理失败不影响测试结论 */
    }
  }
}

/** 跑一次 CLI，返回 { code, stdout, stderr, json? }。 */
export async function runCli(argv) {
  let stdout = "";
  let stderr = "";
  const parsed = await parseArgs(argv);
  const code = await run(parsed, {
    stdout: (s) => {
      stdout += s;
    },
    stderr: (s) => {
      stderr += s;
    },
  });
  let json = null;
  if (argv.some((a) => a === "--format=json")) {
    try {
      json = JSON.parse(stdout);
    } catch {
      json = null;
    }
  }
  return { code, stdout, stderr, json };
}

/**
 * 最小 v3 锁构造器（夹具少写一半样板）。
 *
 * `rootExtra` 用来写**额外的根声明键**：真实 npm 的根条目是四类键**各写各的**
 * （`devDependencies` / `optionalDependencies` / `peerDependencies` 不会被并进
 * `dependencies`——台账 A22）。例：`lockV3({a:"^1.0.0"}, pkgs, {optionalDependencies:{x:"^1"}})`。
 */
export function lockV3(rootDeps, packages, rootExtra = {}) {
  return {
    name: "<fixture>",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: "<fixture>", version: "1.0.0", dependencies: rootDeps, ...rootExtra },
      ...packages,
    },
  };
}

/** 最小 v2 锁：packages + dependencies 双视图（必须自洽）。 */
export function lockV2(rootDeps, packages, compatDeps, rootExtra = {}) {
  return {
    name: "<fixture>",
    version: "1.0.0",
    lockfileVersion: 2,
    requires: true,
    packages: {
      "": { name: "<fixture>", version: "1.0.0", dependencies: rootDeps, ...rootExtra },
      ...packages,
    },
    dependencies: compatDeps ?? {},
  };
}

/** 最小 v1 锁：只有嵌套 dependencies。 */
export function lockV1(deps) {
  return {
    name: "<fixture>",
    version: "1.0.0",
    lockfileVersion: 1,
    requires: true,
    dependencies: deps,
  };
}
