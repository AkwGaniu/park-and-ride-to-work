import { FormEvent, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Day, getMembers, Member, submitAvailability } from './api';
import './styles.css';

const DAYS: { value: Day; label: string }[] = [
  { value: 'MON', label: 'Monday' }, { value: 'TUE', label: 'Tuesday' },
  { value: 'WED', label: 'Wednesday' }, { value: 'THU', label: 'Thursday' },
  { value: 'FRI', label: 'Friday' }, { value: 'SAT', label: 'Saturday' },
  { value: 'SUN', label: 'Sunday' },
];

function nextMonday(): string {
  const date = new Date();
  const offset = (8 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function App() {
  const [members, setMembers] = useState<Member[]>([]);
  const [memberId, setMemberId] = useState('');
  const [pin, setPin] = useState('');
  const [weekStart, setWeekStart] = useState(nextMonday);
  const [workingDays, setWorkingDays] = useState<Day[]>([]);
  const [canDrive, setCanDrive] = useState(true);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMembers()
      .then(setMembers)
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setLoading(false));
  }, []);

  function toggleDay(day: Day) {
    setWorkingDays((current) => current.includes(day)
      ? current.filter((value) => value !== day)
      : [...current, day]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice('');
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
      setNotice('Your schedule has been saved.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to save your schedule.');
    }
  }

  return (
    <main>
      <p className="eyebrow">Park and Ride to Work</p>
      <h1>Fairer shared journeys, every week.</h1>
      <p className="intro">
        Submit your work days, view the group rota, and share driving fairly.
      </p>
      <section aria-labelledby="schedule-heading">
        <h2 id="schedule-heading">Submit your work week</h2>
        <p className="helper">Choose every day you are due to work in the week beginning on Monday.</p>
        <form onSubmit={submit}>
          <label>
            Week beginning
            <input type="date" value={weekStart} min={nextMonday()} onChange={(event) => setWeekStart(event.target.value)} required />
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
          <button type="submit" disabled={loading || !memberId}>Save my schedule</button>
          {notice && <p className="notice" role="status">{notice}</p>}
        </form>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
