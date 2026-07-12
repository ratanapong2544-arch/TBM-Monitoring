import Badge from "../../ui-ux-pro-max/components/Badge";
import { STATUS_BADGE } from "../../utils/instrumentStatus";
const LABEL = { normal: "ปกติ", alert: "Alert", alarm: "Alarm", action: "Action" };
export default function InstrumentStatusBadge({ status = "normal" }) {
  return <Badge code={STATUS_BADGE[status] || "neutral"}>{LABEL[status] || status}</Badge>;
}
