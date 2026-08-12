import { useEffect, useState } from "react";
import Receipt80G from "../components/Receipt80G";

// Standalone popup window used by Reports "Print Selected" for 80G bookings —
// mirrors how receipt-template.html is opened for the normal pavati, but this
// is a real Next.js page so it can render the Receipt80G React component.
export default function ReceiptBulk80G() {
  const [data, setData] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem("bulkReceipts80G");
    if (!saved) { setData({ items: [] }); return; }
    try {
      setData(JSON.parse(saved));
    } catch {
      setData({ items: [] });
    }
  }, []);

  if (!data) return null;

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; background: #fff; }
      `}</style>
      <Receipt80G items={data.items} from={data.from} to={data.to} showControls />
    </>
  );
}
