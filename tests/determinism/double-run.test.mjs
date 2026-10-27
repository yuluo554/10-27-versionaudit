/**
 * 确定性测试（C 栏）：同输入两次运行**逐字节相同**。
 *
 * 三种格式各跑两次，用 `Buffer.compare` 断言；同时断言输出里不含
 * 时间戳 / 主机名 / 绝对路径（`data/README.md` §7.5）。
 */

import { strict as assert } from "node:assert";
import test, { after } from "node:test";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { makeFixture, lockV3, cleanupFixtures } from "../helpers/fixtures.mjs";
import { REPO_ROOT } from "../../src/meta.mjs";

after(cleanupFixtures);

/** 一份"有全部形态"的夹具：M1 规则 + M2 不一致 + M3 重复 + M4 冲突。 */
function richFixture() {
  const manifest = {
    name: "rich",
    version: "1.0.0",
    private: true,
    dependencies: {
      send: "^0.19.2",
      loose: ">=1.0.0",
      wild: "*",
      empty: ">=1.0.0 <1.0.0",
    },
  };
  const lock = lockV3(
    { send: "^0.19.2", loose: ">=1.0.0", wild: "*", empty: ">=1.0.0 <1.0.0" },
    {
      "node_modules/send": { version: "0.18.0", dependencies: { ms: "2.1.3" } },
      "node_modules/send/node_modules/ms": { version: "2.1.3" },
      "node_modules/loose": { version: "1.5.0", dependencies: { ms: "2.0.0" } },
      "node_modules/loose/node_modules/ms": { version: "2.0.0" },
      "node_modules/wild": { version: "3.0.0" },
      "node_modules/empty": { version: "1.0.0" },
    },
  );
  return makeFixture(manifest, lock);
}

function runOnce(args) {
  const bin = join(REPO_ROOT, "bin", "versionaudit.mjs");
  try {
    return execFileSync(process.execPath, [bin, ...args], {
      encoding: "buffer",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    // 有 findings 时退出码非 0 是**正确行为**；这里只关心 stdout 字节，不关心退出码
    if (error.stdout) return error.stdout;
    throw error;
  }
}

function runTwice(args) {
  return { a: runOnce(args), b: runOnce(args) };
}

for (const format of ["text", "json", "sarif"]) {
  test(`确定性：${format} 格式双跑逐字节一致`, () => {
    const dir = richFixture();
    const { a, b } = runTwice(["audit", dir, `--format=${format}`]);
    assert.equal(Buffer.compare(a, b), 0, `${format} 两次输出不同`);
    assert.ok(a.length > 0, "输出不能为空");
  });
}

test("确定性：输出里不含时间戳 / 主机名 / 绝对路径", () => {
  const dir = richFixture();
  const out = String(runOnce(["audit", dir, "--format=json"]));

  // 时间戳形态：ISO 日期 / 常见时间串
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(out), "不得含 ISO 时间戳");
  // 主机名
  const hostname = execFileSync(process.execPath, ["-e", "process.stdout.write(require('os').hostname())"], {
    encoding: "utf8",
  }).trim();
  if (hostname.length >= 3) {
    assert.ok(!out.includes(hostname), `不得含主机名 ${hostname}`);
  }
  // 绝对路径（盘符形态与 POSIX 根形态）。
  // 注意：`[A-Za-z]:[\\/]` 会误伤 JSON 里的 `https://`（`s:/` 命中），
  // 所以要求盘符后是**路径分隔符 + 至少一个非分隔符**，且盘符前不是字母（词边界）。
  assert.ok(!/(^|[^A-Za-z0-9])[A-Za-z]:[\\/][^\s"'/\\]/.test(out), "不得含盘符绝对路径");
  // 临时目录前缀
  assert.ok(!out.includes(dir), "不得含输入目录的绝对路径");
});

test("确定性：排序稳定（findings 数组顺序固定）", () => {
  const dir = richFixture();
  const run = () => JSON.parse(String(runOnce(["audit", dir, "--format=json"])));
  const a = run();
  const b = run();
  assert.deepEqual(
    a.findings.map((f) => `${f.rule ?? f.kind}|${f.package ?? f.dependency}`),
    b.findings.map((f) => `${f.rule ?? f.kind}|${f.package ?? f.dependency}`),
  );
});

test("确定性：JSON 键序由 schema 表驱动（不是对象插入顺序）", () => {
  const dir = richFixture();
  const out = String(runOnce(["audit", dir, "--format=json"]));
  const report = JSON.parse(out);
  assert.deepEqual(Object.keys(report), [
    "schemaVersion",
    "tool",
    "implementation",
    "policy",
    "input",
    "summary",
    "findings",
    "dedupe",
    "conflicts",
    "degraded",
    "internalInconsistency",
  ]);
});
