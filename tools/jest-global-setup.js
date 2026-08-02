// Runs in the parent process BEFORE any worker starts, which is the only place a time zone can be
// set: V8 caches it on first use, so `setupTests.js` — CRA runs it as `setupFilesAfterEnv` — is far
// too late. Without this the host's own zone decides the answer, and this machine is on
// Asia/Bangkok: every assertion that the app formats in Bangkok passed whether or not the app said
// so, and removing `timeZone: "Asia/Bangkok"` from `utils/formatters.js` left the whole suite green.
module.exports = () => { process.env.TZ = "UTC"; };
