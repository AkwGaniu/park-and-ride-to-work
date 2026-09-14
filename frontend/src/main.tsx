import { FormEvent, StrictMode, useEffect, useRef, useState } from 'react';
import { Availability, Day, generateRota, getAvailability, getMembers, getRota, Member, RotaEntry, submitAvailability } from './api';
import { createRoot } from 'react-dom/client';
import './styles.css';

const DAYS: { value: Day; label: string }[] = [
  { value: 'MON', label: 'Monday' }, { value: 'TUE', label: 'Tuesday' },
  { value: 'WED', label: 'Wednesday' }, { value: 'THU', label: 'Thursday' },
  { value: 'FRI', label: 'Friday' }, { value: 'SAT', label: 'Saturday' },
  { value: 'SUN', label: 'Sunday' },
];

type Notice = { kind: 'success' | 'error'; message: string };

function dateValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentMonday(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return dateValue(date);
}

function submissionsAreOpen(weekStart: string): boolean {
  const currentWeekStart = currentMonday();
  if (weekStart > currentWeekStart) return true;
  return weekStart === currentWeekStart && new Date().getDay() === 1;
}

function App() {
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState('');
  const [pin, setPin] = useState('');
  const [weekStart, setWeekStart] = useState(currentMonday);
  const [workingDays, setWorkingDays] = useState<Day[]>([]);
  const [canDrive, setCanDrive] = useState(true);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [rota, setRota] = useState<RotaEntry[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [generating, setGenerating] = useState(false);
  const noticeRef = useRef<HTMLDivElement>(null);
  const submissionOpen = submissionsAreOpen(weekStart);

  function showNotice(kind: Notice['kind'], message: string) {
    setNotice({ kind, message });
  }

  useEffect(() => {
    if (notice) noticeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [notice]);

  useEffect(() => {
    getMembers()
      .then(setMembers)
      .catch((error: Error) => showNotice('error', error.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getRota(weekStart)
      .then(setRota)
      .catch((error: Error) => showNotice('error', error.message));
    getAvailability(weekStart)
      .then(setAvailability)
      .catch((error: Error) => showNotice('error', error.message));
  }, [weekStart]);

  function toggleDay(day: Day) {
    setWorkingDays((current) => current.includes(day)
      ? current.filter((value) => value !== day)
      : [...current, day]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    try {
      await submitAvailability({
        weekStart,
        memberId,
        pin,
        workingDays,
        canDrive,
        drivingUnavailableReason: canDrive ? undefined : reason,
      });
      setPin('');
      setAvailability(await getAvailability(weekStart));
      showNotice('success', 'Your schedule has been saved.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to save your schedule.');
    }
  }

  async function createRota() {
    setNotice(null);
    setGenerating(true);
    try {
      const result = await generateRota({ weekStart, adminMemberId: memberId, pin });
      setRota(result.entries);
      setPin('');
      showNotice('success', 'Weekly rota generated. Review it before sharing it with the group.');
    } catch (error) {
      showNotice('error', error instanceof Error ? error.message : 'Unable to generate the rota.');
    } finally {
      setGenerating(false);
    }
  }

  const availabilityByMember = new Map(availability.map((entry) => [entry.memberId, entry]));

  return (
    <main>
      <p className="eyebrow">Park and Ride to Work</p>
      <h1>Fairer shared journeys, every week.</h1>
      <p className="intro">Submit your work days, view the group rota, and share driving fairly.</p>
      <section aria-labelledby="schedule-heading">
        <h2 id="schedule-heading">Submit your work week</h2>
        <p className="helper">Schedules for the current week remain open until the end of Monday. Previous weeks can still be selected to view their rota.</p>
        <div ref={noticeRef} className="notice-anchor">
          {notice && <p className={`notice ${notice.kind}`} role="alert">{notice.message}</p>}
        </div>
        <form onSubmit={submit}>
          <label>
            Week beginning
            <input type="date" value={weekStart} min="2020-01-06" step="7" onChange={(event) => setWeekStart(event.target.value)} required />
          </label>
          <label>
            Your name
            <select value={memberId} onChange={(event) => setMemberId(event.target.value)} required disabled={loading}>
              <option value="">{loading ? 'Loading members…' : 'Select your name'}</option>
              {members.map((member) => <option key={member.memberId} value={member.memberId}>{member.displayName}</option>)}
            </select>
          </label>
          <label>
            Personal PIN
            <input type="password" inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value)} required />
          </label>
          <fieldset>
            <legend>Days you are working</legend>
            <div className="days">
              {DAYS.map((day) => <label className="checkbox" key={day.value}>
                <input type="checkbox" checked={workingDays.includes(day.value)} onChange={() => toggleDay(day.value)} />
                {day.label}
              </label>)}
            </div>
          </fieldset>
          <label className="checkbox drive-option">
            <input type="checkbox" checked={canDrive} onChange={(event) => setCanDrive(event.target.checked)} />
            I am available to drive this week
          </label>
          {!canDrive && <label>
            Reason you cannot drive
            <textarea value={reason} maxLength={160} onChange={(event) => setReason(event.target.value)} required />
          </label>}
          <button type="submit" disabled={loading || !memberId || !submissionOpen}>Save my schedule</button>
          {!submissionOpen && <p className="helper">Schedule submission is closed for this week, but the rota remains available to view.</p>}
        </form>
        <div className="submission-status">
          <h3>Schedule submissions</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Member</th><th>Work days</th><th>Driving</th><th>Status</th></tr></thead>
              <tbody>{members.map((member) => {
                const entry = availabilityByMember.get(member.memberId);
                return <tr key={member.memberId}>
                  <td>{member.displayName}</td>
                  <td>{entry ? entry.workingDays.map((day) => DAYS.find((item) => item.value === day)?.label).join(', ') || 'No days selected' : '—'}</td>
                  <td>{entry ? entry.canDrive ? 'Available' : 'Unavailable' : '—'}</td>
                  <td><span className={entry ? 'status submitted' : 'status pending'}>{entry ? 'Submitted' : 'Awaiting'}</span></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </div>
      </section>
      <section aria-labelledby="rota-heading">
        <h2 id="rota-heading">Weekly rota</h2>
        <p className="helper">The rota uses the previous four weeks of driving history to prioritise the fairest available driver.</p>
        <button type="button" onClick={createRota} disabled={generating || !memberId || !pin}>{generating ? 'Generating rota…' : 'Generate rota as administrator'}</button>
        {rota.length === 0 && <p className="helper">No rota has been generated for this week yet.</p>}
        <div className="rota-list">
          {rota.map((entry) => <article className="rota-day" key={entry.day}>
            <h3>{DAYS.find((day) => day.value === entry.day)?.label}</h3>
            <p><strong>{entry.attendees.length}</strong> expected traveller{entry.attendees.length === 1 ? '' : 's'} · <strong>{entry.totalSeats}</strong> available seats</p>
            <p><span>Drivers:</span> {entry.drivers.length ? entry.drivers.map((driver) => driver.displayName).join(', ') : 'None assigned'}</p>
            <p><span>Attendees:</span> {entry.attendees.length ? entry.attendees.map((attendee) => attendee.displayName).join(', ') : 'No one scheduled'}</p>
            {entry.warning && <p className="warning">{entry.warning}</p>}
          </article>)}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
