"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const COLORS = ["#6366f1", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#a78bfa"];

interface ChartViewerProps {
  chartType: "bar" | "line" | "pie";
  data: string[][];
  title?: string;
}

export default function ChartViewer({ chartType, data, title }: ChartViewerProps) {
  if (!data || data.length < 2) return null;

  const headers = data[0];
  const rows = data.slice(1);

  const chartData = rows.map((row) => {
    const obj: Record<string, string | number> = {};
    headers.forEach((h, i) => {
      const val = row[i] ?? "";
      obj[h] = isNaN(Number(val)) || val === "" ? val : Number(val);
    });
    return obj;
  });

  const labelKey = headers[0];
  const valueKeys = headers.slice(1);

  return (
    <div className="bg-gray-800 rounded-lg p-4 mt-4">
      {title && <h3 className="text-gray-200 font-semibold mb-3">{title}</h3>}
      <ResponsiveContainer width="100%" height={300}>
        {chartType === "bar" ? (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey={labelKey} tick={{ fill: "#9ca3af", fontSize: 12 }} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", color: "#f3f4f6" }} />
            <Legend />
            {valueKeys.map((key, i) => (
              <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} />
            ))}
          </BarChart>
        ) : chartType === "line" ? (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey={labelKey} tick={{ fill: "#9ca3af", fontSize: 12 }} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} />
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", color: "#f3f4f6" }} />
            <Legend />
            {valueKeys.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={COLORS[i % COLORS.length]} dot={false} />
            ))}
          </LineChart>
        ) : (
          <PieChart>
            <Pie data={chartData} dataKey={valueKeys[0]} nameKey={labelKey} cx="50%" cy="50%" outerRadius={100} label>
              {chartData.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", color: "#f3f4f6" }} />
            <Legend />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
