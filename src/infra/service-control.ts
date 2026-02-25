/**
 * Service control for OpenClaw systemd service
 * Provides start/stop/status functionality for the gateway service
 */
import { spawnSync } from "node:child_process";
import { resolveGatewaySystemdServiceName } from "../daemon/constants.js";

export type ServiceControlResult = {
  ok: boolean;
  action: "start" | "stop" | "status";
  method?: "systemd" | "unknown";
  detail?: string;
  state?: string;
};

const SPAWN_TIMEOUT_MS = 5000;

function normalizeSystemdUnit(raw?: string, profile?: string): string {
  const unit = raw?.trim();
  if (!unit) {
    return `${resolveGatewaySystemdServiceName(profile)}.service`;
  }
  return unit.endsWith(".service") ? unit : `${unit}.service`;
}

function formatSpawnDetail(result: {
  error?: unknown;
  status?: number | null;
  stdout?: string | Buffer | null;
  stderr?: string | Buffer | null;
}): string {
  const clean = (value: string | Buffer | null | undefined) => {
    const text = typeof value === "string" ? value : value ? value.toString() : "";
    return text.replace(/\s+/g, " ").trim();
  };
  if (result.error) {
    if (result.error instanceof Error) {
      return result.error.message;
    }
    if (typeof result.error === "string") {
      return result.error;
    }
    return "unknown error";
  }
  const stderr = clean(result.stderr);
  if (stderr) {
    return stderr;
  }
  const stdout = clean(result.stdout);
  if (stdout) {
    return stdout;
  }
  if (typeof result.status === "number") {
    return `exit ${result.status}`;
  }
  return "unknown error";
}

/**
 * Start the OpenClaw systemd service
 */
export function startOpenClawService(): ServiceControlResult {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return { ok: true, action: "start", method: "systemd", detail: "test mode" };
  }

  if (process.platform !== "linux") {
    return {
      ok: false,
      action: "start",
      method: "unknown",
      detail: "Service control only supported on Linux with systemd",
    };
  }

  const unit = normalizeSystemdUnit(
    process.env.OPENCLAW_SYSTEMD_UNIT,
    process.env.OPENCLAW_PROFILE,
  );

  // Try user service first
  const userResult = spawnSync("systemctl", ["--user", "start", unit], {
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT_MS,
  });

  if (!userResult.error && userResult.status === 0) {
    return { ok: true, action: "start", method: "systemd", detail: `Started ${unit}` };
  }

  // Fall back to system service (requires sudo)
  const systemResult = spawnSync("systemctl", ["start", unit], {
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT_MS,
  });

  if (!systemResult.error && systemResult.status === 0) {
    return { ok: true, action: "start", method: "systemd", detail: `Started ${unit}` };
  }

  return {
    ok: false,
    action: "start",
    method: "systemd",
    detail: formatSpawnDetail(userResult) || formatSpawnDetail(systemResult),
  };
}

/**
 * Stop the OpenClaw systemd service
 */
export function stopOpenClawService(): ServiceControlResult {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return { ok: true, action: "stop", method: "systemd", detail: "test mode" };
  }

  if (process.platform !== "linux") {
    return {
      ok: false,
      action: "stop",
      method: "unknown",
      detail: "Service control only supported on Linux with systemd",
    };
  }

  const unit = normalizeSystemdUnit(
    process.env.OPENCLAW_SYSTEMD_UNIT,
    process.env.OPENCLAW_PROFILE,
  );

  // Try user service first
  const userResult = spawnSync("systemctl", ["--user", "stop", unit], {
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT_MS,
  });

  if (!userResult.error && userResult.status === 0) {
    return { ok: true, action: "stop", method: "systemd", detail: `Stopped ${unit}` };
  }

  // Fall back to system service (requires sudo)
  const systemResult = spawnSync("systemctl", ["stop", unit], {
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT_MS,
  });

  if (!systemResult.error && systemResult.status === 0) {
    return { ok: true, action: "stop", method: "systemd", detail: `Stopped ${unit}` };
  }

  return {
    ok: false,
    action: "stop",
    method: "systemd",
    detail: formatSpawnDetail(userResult) || formatSpawnDetail(systemResult),
  };
}

/**
 * Get status of the OpenClaw systemd service
 */
export function getOpenClawServiceStatus(): ServiceControlResult {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return { ok: true, action: "status", method: "systemd", state: "active", detail: "test mode" };
  }

  if (process.platform !== "linux") {
    return {
      ok: false,
      action: "status",
      method: "unknown",
      detail: "Service control only supported on Linux with systemd",
    };
  }

  const unit = normalizeSystemdUnit(
    process.env.OPENCLAW_SYSTEMD_UNIT,
    process.env.OPENCLAW_PROFILE,
  );

  // Check user service first
  const userResult = spawnSync("systemctl", ["--user", "is-active", unit], {
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT_MS,
  });

  const isActive = userResult.status === 0 || userResult.stdout?.toString().trim() === "active";

  return {
    ok: true,
    action: "status",
    method: "systemd",
    state: isActive ? "active" : "inactive",
    detail: isActive ? `${unit} is active` : `${unit} is inactive`,
  };
}
