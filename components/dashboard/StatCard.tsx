import Link from "next/link";

type Variant = "default" | "warning" | "danger" | "success";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  change?: string;
  changeType?: "up" | "down" | "neutral";
  variant?: Variant;
  icon: React.ReactNode;
  href?: string;
}

const variantStyles: Record<Variant, { icon: string }> = {
  default: { icon: "bg-blue-50 text-blue-600" },
  warning: { icon: "bg-amber-50 text-amber-600" },
  danger: { icon: "bg-red-50 text-red-600" },
  success: { icon: "bg-emerald-50 text-emerald-600" },
};

export default function StatCard({
  label,
  value,
  sub,
  change,
  changeType = "neutral",
  variant = "default",
  icon,
  href,
}: StatCardProps) {
  const style = variantStyles[variant];

  const inner = (
    <div
      className={`bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4 ${
        href ? "transition-all hover:border-blue-300 hover:shadow-sm cursor-pointer" : ""
      }`}
    >
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

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }

  return inner;
}
