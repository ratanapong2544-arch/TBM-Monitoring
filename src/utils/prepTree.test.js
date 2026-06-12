import {
  buildTree, visibleOrder, leafTasks, wouldCreateParentCycle,
  loadCollapsed, saveCollapsed, rollupAll,
} from "./prepTree";

beforeEach(() => localStorage.clear());

const T = (id, parentId, extra = {}) => ({ id, name: id, start: "2026-06-01", end: "2026-06-05", percent: 0, ...(parentId ? { parentId } : {}), ...extra });

// โครง: A(root) → B → C, A → E, D(root)  (ลำดับ array: A,B,C,D,E)
const FIVE = [T("A"), T("B", "A"), T("C", "B"), T("D"), T("E", "A")];

test("buildTree: DFS order ลูกใต้แม่ พี่น้องตามลำดับ array", () => {
  const tr = buildTree(FIVE);
  expect(tr.order.map((t) => t.id)).toEqual(["A", "B", "C", "E", "D"]);
});

test("buildTree: depth + เลขชั้น + isParent + parentOf", () => {
  const tr = buildTree(FIVE);
  expect(tr.depthOf.get("C")).toBe(2);
  expect(tr.numberOf.get("A")).toBe("1");
  expect(tr.numberOf.get("B")).toBe("1.1");
  expect(tr.numberOf.get("C")).toBe("1.1.1");
  expect(tr.numberOf.get("E")).toBe("1.2");
  expect(tr.numberOf.get("D")).toBe("2");
  expect([...tr.isParent].sort()).toEqual(["A", "B"]);
  expect(tr.parentOf.get("C")).toBe("B");
  expect(tr.parentOf.get("A")).toBeNull();
});

test("buildTree: parentId ผี/ชี้ตัวเอง/วงจร → treat เป็น root ไม่ crash", () => {
  const tr = buildTree([T("A", "ghost"), T("B", "B"), T("X", "Y"), T("Y", "X")]);
  expect(tr.order.map((t) => t.id)).toEqual(["A", "B", "X", "Y"]);
  expect(tr.depthOf.get("X")).toBe(0);
});

test("visibleOrder: ซ่อนลูกหลานของแม่ที่ย่อ (รวมหลาน)", () => {
  const tr = buildTree(FIVE);
  expect(visibleOrder(tr, new Set(["A"])).map((t) => t.id)).toEqual(["A", "D"]);
  expect(visibleOrder(tr, new Set(["B"])).map((t) => t.id)).toEqual(["A", "B", "E", "D"]);
});

test("leafTasks: เฉพาะงานไม่มีลูก ตาม DFS", () => {
  expect(leafTasks(FIVE).map((t) => t.id)).toEqual(["C", "E", "D"]);
});

test("wouldCreateParentCycle: ตรง/ทอด/ตัวเอง/งานใหม่", () => {
  expect(wouldCreateParentCycle(FIVE, "A", "C")).toBe(true);  // C เป็นหลานของ A
  expect(wouldCreateParentCycle(FIVE, "A", "B")).toBe(true);
  expect(wouldCreateParentCycle(FIVE, "C", "A")).toBe(false); // ทิศถูก
  expect(wouldCreateParentCycle(FIVE, "A", "A")).toBe(true);
  expect(wouldCreateParentCycle(FIVE, null, "A")).toBe(false);
});

test("collapse persist: save/load ต่อ machine, ค่าเสีย → Set ว่าง", () => {
  saveCollapsed("TBM1", new Set(["A", "B"]));
  expect([...loadCollapsed("TBM1")].sort()).toEqual(["A", "B"]);
  expect([...loadCollapsed("TBM2")]).toEqual([]);
  localStorage.setItem("tbmPrepCollapsed_TBM2", "{bad");
  expect([...loadCollapsed("TBM2")]).toEqual([]);
});

test("rollupAll: dates min/max, % ถ่วง duration, forecast/baseline รวม, slip", () => {
  // A แม่ของ B(1–4 มิ.ย. 40%, base 1–3) และ C(3–10 มิ.ย. 0%, ไม่มี baseline → ใช้แผน)
  const tasks = [
    T("A"),
    { ...T("B", "A"), start: "2026-06-01", end: "2026-06-04", percent: 40, baseStart: "2026-06-01", baseEnd: "2026-06-03" },
    { ...T("C", "A"), start: "2026-06-03", end: "2026-06-10", percent: 0 },
  ];
  const fcById = {
    B: { fcStart: "2026-06-01", fcEnd: "2026-06-06" },
    C: { fcStart: "2026-06-12", fcEnd: "2026-06-19" },
  };
  const r = rollupAll(tasks, fcById).get("A");
  // % = (40×4 + 0×8) / 12 = 13.33 → 13
  expect(r).toMatchObject({
    start: "2026-06-01", end: "2026-06-10", percent: 13,
    fcStart: "2026-06-01", fcEnd: "2026-06-19",
    baseStart: "2026-06-01", baseEnd: "2026-06-10",
    slipDays: 9, allDone: false,
  });
});

test("rollupAll: ลูกซ้อนหลายชั้น — แม่บนสุดรวมจาก leaf ทุกชั้น", () => {
  const tasks = [
    T("A"), T("B", "A"),
    { ...T("C", "B"), start: "2026-06-01", end: "2026-06-02", percent: 100 },
    { ...T("D", "B"), start: "2026-06-05", end: "2026-06-08", percent: 100 },
  ];
  const r = rollupAll(tasks, {});
  expect(r.get("A")).toMatchObject({ start: "2026-06-01", end: "2026-06-08", percent: 100, allDone: true });
  expect(r.get("B")).toMatchObject({ start: "2026-06-01", end: "2026-06-08", percent: 100 });
});

test("rollupAll: anyRed จาก predicate, ไม่มี fcById → ใช้แผนแทน forecast", () => {
  const tasks = [T("A"), { ...T("B", "A"), percent: 10 }];
  const r = rollupAll(tasks, {}, (l) => l.id === "B").get("A");
  expect(r.anyRed).toBe(true);
  expect(r.fcStart).toBe("2026-06-01");
  expect(r.fcEnd).toBe("2026-06-05");
});
