/** Runs once when the server starts: report configuration problems by name (never values). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { validateEnvironment } = await import("@/lib/env");
  const { log } = await import("@/lib/log");
  const report = validateEnvironment();
  if (!report.ok) {
    log("error", "config.invalid", { problems: report.problems, warnings: report.warnings });
  } else if (report.warnings.length > 0) {
    log("warn", "config.warnings", { warnings: report.warnings });
  } else {
    log("info", "config.ok");
  }
}
