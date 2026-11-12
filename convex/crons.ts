import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check every active property for new reviews once an hour.
crons.interval("sync reviews", { hours: 1 }, internal.google.syncAll, {});

// Send the next approved outreach emails (weekday office hours, daily cap).
crons.interval("outreach", { minutes: 15 }, internal.outreach.tick, {});

export default crons;
