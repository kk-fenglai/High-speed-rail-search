import type { Verification } from "@/data/types";

export function VerifyBadge({ v }: { v: Verification }) {
  return v === "official" ? (
    <span className="badge ok" title="已对照厂商官方定价页核对">
      ✓ 官方已核对
    </span>
  ) : (
    <span className="badge" title="仅依据第三方资料，尚未对照官方页面复核">
      待核实
    </span>
  );
}
