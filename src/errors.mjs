/**
 * 错误类型：退出码语义的直接承载者（`data/README.md` §7.3）。
 *
 * 三种错误的边界必须清晰，否则"发布未达成"与"环境缺失"会被混成同一个码：
 *   - UsageError     → 命令行用法错误（不是审计结论，也不是输入问题）
 *   - InputError     → 输入不可解析（JSON 语法 / 缺必需字段 / lockfileVersion 不支持 / 结构混用）
 *   - InternalInconsistency → 工具结论与 semver 库差分不一致（"不编造语义"的自证出口）
 */

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
    this.exitCode = 2;
  }
}

export class InputError extends Error {
  constructor(message, { file = null, detail = null } = {}) {
    super(message);
    this.name = "InputError";
    this.exitCode = 3;
    this.file = file;
    this.detail = detail;
  }
}

export class InternalInconsistency extends Error {
  constructor(message, { findings = [] } = {}) {
    super(message);
    this.name = "InternalInconsistency";
    this.exitCode = 4;
    this.findings = findings;
  }
}

export class NotImplemented extends Error {
  constructor(what, milestone) {
    super(`${what} 尚未实现（计划里程碑 ${milestone}）`);
    this.name = "NotImplemented";
    this.what = what;
    this.milestone = milestone;
    // 骨架期用 3 表达"输入/能力不可用"，但**不伪造空结果**：
    // 对应模块落地后这条路径整项退役（plan/03 K 纪律 + references 阶段 2 的退出码退役条）。
    this.exitCode = 3;
  }
}
