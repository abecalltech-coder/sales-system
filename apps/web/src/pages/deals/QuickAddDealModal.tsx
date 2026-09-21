import { useState } from 'react';
import { DealFieldItem, UserOption } from '../../hooks/useApi';

const ASSIGNEE_FIELD_KEY = 'assignee_user_id';

/**
 * 「＋案件追加」の入力フォーム。行だけ空で作ると一覧に紛れて気づかれにくいため、
 * 案件名・商談日だけでもその場で入力してから追加できるようにする(要望)。
 * 担当者名も未設定のまま追加されると誰も対応しない案件になりかねないため必須にする(要望)。
 */
export function QuickAddDealModal({
  fields,
  userOptions,
  submitting,
  onCancel,
  onSubmit,
}: {
  fields: DealFieldItem[];
  userOptions: UserOption[];
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: Record<string, unknown>) => void;
}) {
  const caseNameField = fields.find((f) => f.fieldKey === 'case_name');
  const meetingDateField = fields.find((f) => f.fieldKey === 'meeting_date');
  const assigneeField = fields.find((f) => f.fieldKey === ASSIGNEE_FIELD_KEY);

  const [caseName, setCaseName] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [touched, setTouched] = useState(false);

  const canSubmit = (!caseNameField || caseName.trim() !== '') && (!assigneeField || assigneeId !== '');

  const submit = () => {
    setTouched(true);
    if (!canSubmit || submitting) return;
    const values: Record<string, unknown> = {};
    if (caseNameField && caseName.trim()) values[caseNameField.fieldKey] = caseName.trim();
    if (meetingDateField && meetingDate) values[meetingDateField.fieldKey] = new Date(`${meetingDate}T00:00:00`).toISOString();
    if (assigneeField && assigneeId) values[assigneeField.fieldKey] = assigneeId;
    onSubmit(values);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">案件を追加</div>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {caseNameField && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                {caseNameField.label}
                <input
                  autoFocus
                  value={caseName}
                  onChange={(e) => setCaseName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  style={{ padding: 6, fontSize: 13 }}
                />
                {touched && caseName.trim() === '' && (
                  <span style={{ color: 'var(--color-danger)', fontSize: 11 }}>{caseNameField.label}は必須です</span>
                )}
              </label>
            )}
            {assigneeField && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                {assigneeField.label}
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  style={{ padding: 6, fontSize: 13 }}
                >
                  <option value="">未選択</option>
                  {userOptions.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                {touched && assigneeId === '' && (
                  <span style={{ color: 'var(--color-danger)', fontSize: 11 }}>{assigneeField.label}は必須です</span>
                )}
              </label>
            )}
            {meetingDateField && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                {meetingDateField.label}
                <input
                  type="date"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                  style={{ padding: 6, fontSize: 13 }}
                />
              </label>
            )}
            {!caseNameField && !meetingDateField && !assigneeField && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>空の案件を1件追加します。</p>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button onClick={onCancel} disabled={submitting}>
            キャンセル
          </button>
          <button className="btn-primary" onClick={submit} disabled={submitting || (touched && !canSubmit)}>
            {submitting ? '追加中...' : '追加する'}
          </button>
        </div>
      </div>
    </div>
  );
}
