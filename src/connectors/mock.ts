import type { Connector } from "./types";

/** Fake data covering green, yellow and red states. No limits here: they come from config. */
export const mock: Connector = {
  id: "mock",
  async fetchUsage() {
    const now = new Date();
    const fetchedAt = now.toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    return [
      { service: "mock", metric: "Requests", used: 4_200, limit: null, unit: "requests", resetsAt: monthEnd, source: "api", fetchedAt },
      { service: "mock", metric: "Storage", used: 812, limit: null, unit: "MB", source: "api", fetchedAt },
      { service: "mock", metric: "Build minutes", used: 287, limit: null, unit: "min", resetsAt: monthEnd, source: "api", fetchedAt },
      { service: "mock", metric: "Deploys", used: 17, limit: null, unit: "deploys", source: "api", fetchedAt, note: "No limit configured: shown without a bar." },
    ];
  },
};

export const mockBroken: Connector = {
  id: "mock-broken",
  async fetchUsage() {
    throw new Error("Demo error: this connector always fails (HTTP 401).");
  },
};
