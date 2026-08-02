// The host running these tests is itself on Asia/Bangkok, which made every assertion about the
// app's Bangkok formatting inert: removing `timeZone: "Asia/Bangkok"` from `utils/formatters.js`
// left the whole suite green while every date and time in the app would have followed the device.
// Pinning the test process to UTC is what makes those assertions able to fail.
process.env.TZ = "UTC";
