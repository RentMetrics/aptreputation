import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Pull new reviews for every active property four times a day.
crons.interval("sync reviews", { hours: 6 }, internal.google.syncAll, {});

export default crons;
