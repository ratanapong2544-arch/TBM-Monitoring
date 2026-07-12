// Task 6.3 — shared "no data yet" state used by all 4 report types
export default function EmptyState({ message = "ยังไม่มีข้อมูล" }) {
  return <div className="text-ink-2 text-sm p-6 text-center">{message}</div>;
}
