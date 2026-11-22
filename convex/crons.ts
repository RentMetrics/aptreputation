import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check every active property for new reviews once an hour.
crons.interval("sync reviews", { hours: 1 }, internal.google.syncAll, {});

// Send the next approved outreach emails (weekday office hours, daily cap).
crons.interval("outreach", { minutes: 15 }, internal.outreach.tick, {});

// Start the monthly AI search check for properties that are due (a few each day).
crons.daily("monthly AI search check", { hourUTC: 15, minuteUTC: 30 }, internal.visibility.monthlyTick, {});

// Keep each property's AptRep Score current (weekly per property), measured against its starting score.
crons.daily("refresh AptRep Scores", { hourUTC: 14, minuteUTC: 0 }, internal.audit.refreshScores, {});

export default crons;
