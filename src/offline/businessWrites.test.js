import { businessEnvelope } from "./businessWrites";

// The two families with no caller on any screen. `handleUpdateInstrument` and
// `handleSaveInstReading` are wired to no view (open item 3s), so there is no UI to drive and no
// honest App-level test to write; this is the function their envelope actually comes out of.
const syncMeta = {
  "instrument:GLOBAL:ins_1": { version: 4 },
  "instReading:GLOBAL:rd_1": { version: 2 },
  "instSchedule:GLOBAL:sc_1": { version: 9 },
  "issue:GLOBAL:iss_1": { version: 3 },
  "dailyReport:TBM2:dr_1": { version: 6 },
};

test("an instrument update is keyed project-wide and carries the version it was loaded with", () => {
  const record = { id: "ins_1", locationId: "L1", type: "INC", name: "P604" };

  expect(businessEnvelope({ entityType: "instrument", operation: "update", record, syncMeta })).toEqual({
    entityType: "instrument", operation: "update", machine: undefined,
    recordId: "ins_1", payload: record, domainKey: "instrument:GLOBAL:ins_1", baseVersion: 4,
  });
});

test("a new instrument reading claims no version; an edit of one claims the version it has", () => {
  const fresh = { id: "rd_new", instrumentId: "ins_1", date: "2026-08-02", value: 12.4 };
  const existing = { id: "rd_1", instrumentId: "ins_1", date: "2026-08-01", value: 12.1 };

  expect(businessEnvelope({ entityType: "instReading", operation: "create", record: fresh, syncMeta })).toEqual(
    expect.objectContaining({ operation: "create", domainKey: "instReading:GLOBAL:rd_new", baseVersion: 0 })
  );
  expect(businessEnvelope({ entityType: "instReading", operation: "update", record: existing, syncMeta })).toEqual(
    expect.objectContaining({ operation: "update", domainKey: "instReading:GLOBAL:rd_1", baseVersion: 2 })
  );
});

test("a machine-keyed family takes its machine from the caller, a project-wide one ignores it", () => {
  // `makeDomainKey` owns this decision, and the point of passing `machine` through untouched is that
  // no call site has to know which families are which.
  const daily = businessEnvelope({
    entityType: "dailyReport", operation: "update", machine: "TBM2",
    record: { id: "dr_1", machine: "TBM2", area: "IS2" }, syncMeta,
  });
  const issue = businessEnvelope({
    entityType: "issue", operation: "update", machine: "TBM2",
    record: { id: "iss_1", title: "รอ Platform" }, syncMeta,
  });

  expect(daily.domainKey).toBe("dailyReport:TBM2:dr_1");
  expect(daily.baseVersion).toBe(6);
  expect(issue.domainKey).toBe("issue:GLOBAL:iss_1"); // machine passed, key still GLOBAL
  expect(issue.baseVersion).toBe(3);
});

test("a schedule row is one envelope per row, each named by its own id", () => {
  // The fan-out itself is pinned at App level; this pins that each row of it is named individually
  // rather than the batch being keyed by whichever row triggered it.
  const rows = [{ id: "sc_1", isMeasured: true }, { id: "sc_2", targetDate: "2026-09-01" }];

  expect(rows.map(row => businessEnvelope({ entityType: "instSchedule", operation: "update", record: row, syncMeta }).domainKey))
    .toEqual(["instSchedule:GLOBAL:sc_1", "instSchedule:GLOBAL:sc_2"]);
});
