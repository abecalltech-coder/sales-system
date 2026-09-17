import { AppLayout } from '../components/AppLayout';
import { ShiftTab } from './summary/ShiftTab';

export function ShiftPage() {
  return (
    <AppLayout>
      <div className="page">
        <h1 className="page-title" style={{ marginBottom: 12 }}>シフト</h1>
        <ShiftTab />
      </div>
    </AppLayout>
  );
}
