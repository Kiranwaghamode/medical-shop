// Runs once when the Next.js server starts, before it handles any request.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Importing validates the environment and stops startup with a clear error if anything is wrong.
    await import("./lib/env");
  }
}
