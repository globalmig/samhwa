type BadgeColor = "green" | "red" | "amber" | "blue" | "slate" | "purple" | "indigo";

interface Props {
  label: string;
  color: BadgeColor;
}

const colorMap: Record<BadgeColor, string> = {
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-blue-50 text-blue-700",
  slate: "bg-slate-100 text-slate-600",
  purple: "bg-purple-50 text-purple-700",
  indigo: "bg-indigo-50 text-indigo-700",
};

export default function StatusBadge({ label, color }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[color]}`}>
      {label}
    </span>
  );
}
