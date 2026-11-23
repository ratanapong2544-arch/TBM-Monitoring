import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import ReportView from "../components/views/ReportView";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// 02:00 on 24 Sep in Bangkok is still 23 Sep in UTC. Every "today" default was read off the UTC
// date, so between midnight and 07:00 the app opened on yesterday.
test("the report opens on Bangkok's date, not UTC's", () => {
  jest.useFakeTimers().setSystemTime(new Date("2026-09-23T19:00:00.000Z"));
  const container = document.createElement("div");
  const root = createRoot(container);
  act(() => root.render(<ReportView segmentRecords={[]} groutRecords={[]} projectInfo={{}} shiftReports={[]} machine="TBM1" />));
  const dates = [...container.querySelectorAll('input[type="date"]')].map((i) => i.value);
  act(() => root.unmount());
  jest.useRealTimers();
  expect(dates).toContain("2026-09-24");
});
