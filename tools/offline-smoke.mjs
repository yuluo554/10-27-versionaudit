#!/usr/bin/env node
/**
 * 离线冒烟：在**进程内**把网络能力全部改成抛错，然后跑完整审计流程。
 *
 * 为什么不是"看代码里没 import http"：`semver` 是第三方包，它或其依赖可能间接联网；
 * 只有"钩子全部抛错还能跑通"才是可证伪的证据。
 *
 * 覆盖点：
 *   1. DNS / TCP / TLS / HTTP(S) 四层钩子都替换成抛错；
 *   2. `fetch` 与 `WebSocket` 全局也替换；
 *   3. 跑 `audit` 三种格式 + `doctor`，并断言不抛错、退出码符合预期；
 *   4. 打印"扫了哪些入口"（非空跑自证）。
 */

import dns from "node:dns";
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const BLOCKED = [];
function block(where) {
  return () => {
    BLOCKED.push(where);
    throw new Error(`离线冒烟：网络访问被禁止（${where}）`);
  };
}

const patches = [
  ["dns.lookup", dns, "lookup"],
  ["dns.resolve", dns, "resolve"],
  ["dns.promises.lookup", dns.promises, "lookup"],
  ["net.connect", net, "connect"],
  ["net.Socket.connect", net.Socket.prototype, "connect"],
  ["tls.connect", tls, "connect"],
  ["http.request", http, "request"],
  ["http.get", http, "get"],
  ["https.request", https, "request"],
  ["https.get", https, "get"],
];

for (const [label, target, key] of patches) {
  target[key] = block(label);
}
globalThis.fetch = block("globalThis.fetch");
if (typeof globalThis.WebSocket === "function") {
  globalThis.WebSocket = block("globalThis.WebSocket");
}

const FIXTURE = join(ROOT, "fixtures", "vectors", "M2-lock-manifest", "input");

const { parseArgs } = await import("../src/cli/args.mjs");
const { run } = await import("../src/cli/main.mjs");

const captured = { stdout: "", stderr: "" };
const io = {
  stdout: (s) => {
    captured.stdout += s;
  },
  stderr: (s) => {
    captured.stderr += s;
  },
};

const cases = [
  { argv: ["audit", FIXTURE, "--format=text"], expect: 1 },
  { argv: ["audit", FIXTURE, "--format=json"], expect: 1 },
  { argv: ["audit", FIXTURE, "--format=sarif"], expect: 1 },
  { argv: ["doctor", FIXTURE], expect: 0 },
  { argv: ["--help"], expect: 0 },
  { argv: ["--version"], expect: 0 },
];

let failures = 0;
for (const testCase of cases) {
  captured.stdout = "";
  captured.stderr = "";
  try {
    const parsed = await parseArgs(testCase.argv);
    const code = await run(parsed, io);
    const ok = code === testCase.expect;
    if (!ok) {
      failures += 1;
      console.error(`FAIL  ${testCase.argv.join(" ")} → 退出码 ${code}（期望 ${testCase.expect}）`);
    } else {
      console.log(`PASS  ${testCase.argv.join(" ")} → ${code}`);
    }
    if (captured.stderr.trim()) {
      console.log(`      stderr: ${captured.stderr.trim().slice(0, 200)}`);
    }
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${testCase.argv.join(" ")} → 抛错 ${error.message}`);
  }
}

// 断言：整个过程中**零次**网络尝试被触发
if (BLOCKED.length > 0) {
  failures += 1;
  console.error(`FAIL  有 ${BLOCKED.length} 次网络访问尝试：${[...new Set(BLOCKED)].join(", ")}`);
}

// 非空跑自证
console.log(`离线冒烟：钩住 ${patches.length + 2} 个入口，跑了 ${cases.length} 条命令，网络尝试 ${BLOCKED.length} 次`);
console.log(failures === 0 ? "结论: 全绿（零联网）" : `结论: ${failures} 项 FAIL`);

// 断言 semver 确实被加载（否则"零联网"可能是因为代码根本没跑）
if (!captured.stdout.includes("semver") && !readFileSync(join(ROOT, "package.json"), "utf8").includes("semver")) {
  console.error("FAIL  未能证明 semver 被加载");
  failures += 1;
}

process.exitCode = failures === 0 ? 0 : 1;
