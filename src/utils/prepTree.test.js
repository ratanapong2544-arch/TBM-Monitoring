import {
  buildTree, visibleOrder, leafTasks, wouldCreateParentCycle,
  loadCollapsed, saveCollapsed,
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
