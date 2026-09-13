import { FormEvent, StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Day, generateRota, getMembers, getRota, Member, RotaEntry, submitAvailability } from './api';
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
  const [rota, setRota] = useState<RotaEntry[]>([]);
  const [rotaNotice, setRotaNotice] = useState('');
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    getMembers()
      .then(setMembers)
      .catch((error: Error) => setNotice(error.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getRota(weekStart)
      .then(setRota)
      .catch((error: Error) => setRotaNotice(error.message));
  }, [weekStart]);

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

  async function createRota() {
    setRotaNotice('');
    setGenerating(true);
    try {
      const result = await generateRota({ weekStart, adminMemberId: memberId, pin });
      setRota(result.entries);
      setPin('');
      setRotaNotice('Weekly rota generated. Review it before sharing it with the group.');
    } catch (error) {
      setRotaNotice(error instanceof Error ? error.message : 'Unable to generate the rota.');
    } finally {
      setGenerating(false);
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
      <section aria-labelledby="rota-heading">
        <h2 id="rota-heading">Weekly rota</h2>
        <p className="helper">The rota uses the previous four weeks of driving history to prioritise the fairest available driver.</p>
        <button type="button" onClick={createRota} disabled={generating || !memberId || !pin}>
          {generating ? 'Generating rota…' : 'Generate rota as administrator'}
        </button>
        {rotaNotice && <p className="notice" role="status">{rotaNotice}</p>}
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
  <StrictMode>
    <App />
  </StrictMode>,
);
