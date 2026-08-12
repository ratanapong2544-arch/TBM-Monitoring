// Segment Data Log — edit modal round trip.
// เดิม modal นี้แก้ได้แค่ ring/type/CH/เวลา/remark ทำให้ค่าที่กรอกตอนบันทึก (ระดับหัวเจาะ,
// ชั้นดิน, length, กะขุด/กะประกอบ) "กรอกได้แต่แก้ไม่ได้" — เทสต์นี้จับ payload ที่ออกไปกับ
// envelope ของ onMutate จริง ไม่ใช่แค่ state ในจอ เพราะสิ่งที่ลงชีตคือสิ่งเดียวที่นับ.
// ไม่มี @testing-library ในโปรเจกต์นี้ → react-dom/client + act เหมือนไฟล์ *.test.jsx อื่น
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import SegmentDashboardView from "./SegmentDashboardView";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const REC = {
  id: "seg_1", ringNo: "P600", typeRing: "C1", keyPos: "16", date: "2026-07-01", shift: "Day",
  startCH: "8+013.000", finishCH: "8+011.600", length: "1.40", soilVolume: "43.64",
  status: "Completed", installType: "Permanent", soilType: "Soft Clay",
  excavShift: "Day", installShift: "Night",
  excavStartTime: "08:00", excavEndTime: "09:30", installStartTime: "10:00", installEndTime: "11:00",
  headV: 29, artV: 33, tailV: 34, vrt: 0.2, headH: -8, artH: -5, tailH: -7,
};

function setValue(el, value) {
  const proto = el.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
  });
}

function mount(records = [REC]) {
  const onMutate = jest.fn(() => Promise.resolve({}));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(<SegmentDashboardView segmentRecords={records} machine="TBM1" onMutate={onMutate} syncMeta={{}} />); });
  return {
    container,
    onMutate,
    cleanup: () => { act(() => { root.unmount(); }); document.body.removeChild(container); },
    click: (el) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }),
  };
}

function openEditor(h) {
  h.click(h.container.querySelector("tbody tr"));
  h.click(h.container.querySelector('button[title="Edit"]'));
}

async function save(h) {
  const button = [...h.container.querySelectorAll("button")].find((b) => b.textContent.includes("Save Changes"));
  await act(async () => { button.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  return h.onMutate.mock.calls[0][0];
}

test("modal (โหมดดู) แสดงค่าระดับหัวเจาะ ครบทั้งแนวดิ่ง/แนวราบ/VRT", () => {
  const h = mount();
  h.click(h.container.querySelector("tbody tr"));
  const text = h.container.textContent;
  expect(text).toContain("ระดับหัวเจาะ");
  ["29", "33", "34", "-8", "-5", "-7", "0.2"].forEach((v) => expect(text).toContain(v));
  h.cleanup();
});

test("แก้ค่าหัวเจาะ + ชั้นดิน + กะ แล้วบันทึก → payload ที่ออกไปกับ envelope มีค่าใหม่ครบ", async () => {
  const h = mount();
  openEditor(h);

  setValue(h.container.querySelector('input[name="headV"]'), "42");
  setValue(h.container.querySelector('input[name="tailH"]'), "3");
  setValue(h.container.querySelector('input[name="vrt"]'), "-0.4");
  setValue(h.container.querySelector('input[name="soilType"]'), "Stiff Clay");
  setValue(h.container.querySelector('select[name="excavShift"]'), "Night");

  const envelope = await save(h);

  expect(h.onMutate).toHaveBeenCalledTimes(1);
  expect(envelope).toMatchObject({ entityType: "segment", operation: "update", machine: "TBM1", recordId: "seg_1" });
  expect(envelope.payload).toMatchObject({
    headV: "42", tailH: "3", vrt: "-0.4",
    artV: 33, headH: -8,          // ค่าที่ไม่ได้แตะต้องติดไปด้วย ไม่ใช่หายไป
    soilType: "Stiff Clay", excavShift: "Night",
  });
  h.cleanup();
});

test("แก้ length → soilVolume ถูกคิดใหม่ ไม่ใช่ค้างค่าเดิมของริง", async () => {
  const h = mount();
  openEditor(h);
  setValue(h.container.querySelector('input[name="length"]'), "1.2");

  const envelope = await save(h);
  expect(envelope.payload.length).toBe("1.2");
  expect(envelope.payload.soilVolume).toBe("37.41");   // π·3.15²·1.2 — ของเดิมคือ 43.64 (length 1.40)
  h.cleanup();
});

test("ล้างค่าหัวเจาะเป็นค่าว่างได้ (ไม่ถูกกลืนเป็นค่าเดิม)", async () => {
  const h = mount();
  openEditor(h);
  setValue(h.container.querySelector('input[name="artV"]'), "");

  const envelope = await save(h);
  expect(envelope.payload.artV).toBe("");
  h.cleanup();
});

// หมายเหตุ: Plan Settings modal ของ view นี้ยังไม่มีปุ่มเปิด (setShowPlanModal(true) ไม่มีที่ไหน)
// จึงยังเทสต์ผ่าน UI ไม่ได้ ตัวแก้แผนงานที่ผู้ใช้เข้าถึงจริงอยู่ที่ SegmentAnalysisView
