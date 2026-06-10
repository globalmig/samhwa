type Variant = "default" | "warning" | "danger" | "success";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  change?: string;
  changeType?: "up" | "down" | "neutral";
  variant?: Variant;
  icon: React.ReactNode;
}

const variantStyles: Record<Variant, { icon: string; badge: string }> = {
  default: { icon: "bg-blue-50 text-blue-600", badge: "bg-blue-50 text-blue-600" },
  warning: { icon: "bg-amber-50 text-amber-600", badge: "bg-amber-50 text-amber-600" },
  danger: { icon: "bg-red-50 text-red-600", badge: "bg-red-50 text-red-600" },
  success: { icon: "bg-emerald-50 text-emerald-600", badge: "bg-emerald-50 text-emerald-600" },
};

export default function StatCard({
  label,
  value,
  sub,
  change,
  changeType = "neutral",
  variant = "default",
  icon,
}: StatCardProps) {
  const style = variantStyles[variant];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div className={`p-2.5 rounded-lg ${style.icon}`}>{icon}</div>
        {change && (
          <span
            className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
              changeType === "up"
                ? "bg-emerald-50 text-emerald-600"
                : changeType === "down"
                ? "bg-red-50 text-red-600"
                : "bg-slate-100 text-slate-500"
            }`}
          >
            {changeType === "up" ? "▲" : changeType === "down" ? "▼" : "–"}
            {change}
          </span>
        )}
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        <p className="text-2xl font-bold text-slate-800 tracking-tight">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}
