import { OrdersWorkspace } from "@/core/orders/ui/orders-workspace";

export default function RtlPage() {
  return (
    <OrdersWorkspace title="Orders, right to left" dir="rtl" locale="he-IL" />
  );
}
