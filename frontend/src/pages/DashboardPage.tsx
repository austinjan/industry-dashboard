import { Card } from '@/components/ui/card';

export function DashboardPage() {
  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Site Overview</h2>
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-slate-500">Machines Online</p>
          <p className="text-2xl font-bold text-green-600">--</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">OEE</p>
          <p className="text-2xl font-bold text-blue-600">--</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Active Alerts</p>
          <p className="text-2xl font-bold text-red-600">--</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-slate-500">Today's Output</p>
          <p className="text-2xl font-bold">--</p>
        </Card>
      </div>
    </div>
  );
}
