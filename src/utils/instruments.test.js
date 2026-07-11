// src/utils/instruments.test.js
import { makeInstId, loadCache, persistCache, STORE } from "./instruments";

beforeEach(() => localStorage.clear());

test("makeInstId มี prefix + unique", () => {
  const a = makeInstId("rd"), b = makeInstId("rd");
  expect(a.startsWith("rd_")).toBe(true);
  expect(a).not.toBe(b);
});

test("persist→load round-trip", () => {
  persistCache(STORE.readings, [{ id: 1 }]);
  expect(loadCache(STORE.readings)).toEqual([{ id: 1 }]);
});

test("load คืน [] เมื่อว่าง/พัง", () => {
  expect(loadCache("nope")).toEqual([]);
  localStorage.setItem("bad", "{{{");
  expect(loadCache("bad")).toEqual([]);
});
