import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check every active property for new reviews once an hour.
crons.interval("sync reviews", { hours: 1 }, internal.google.syncAll, {});

export default crons;
