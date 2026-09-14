export type Day = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export type Member = {
  memberId: string;
  displayName: string;
  vehicleSeats: number;
};

export type RotaEntry = {
  day: Day;
  attendees: Member[];
  drivers: Member[];
  totalSeats: number;
  warning?: string;
};

export type Availability = {
  memberId: string;
  workingDays: Day[];
  canDrive: boolean;
  drivingUnavailableReason?: string;
  submittedAt: string;
};

const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');

function configuredApiUrl(): string {
  if (!apiUrl) throw new Error('The app has not been configured with an API URL yet.');
  return apiUrl;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set('content-type', 'application/json');

  const response = await fetch(`${configuredApiUrl()}${path}`, {
    ...init,
    headers,
  });
  const body = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(body.message ?? 'Request failed.');
  return body;
}

export function getMembers(): Promise<Member[]> {
  return request<Member[]>('/members');
}

export function submitAvailability(input: {
  weekStart: string;
  memberId: string;
  pin: string;
  workingDays: Day[];
  canDrive: boolean;
  drivingUnavailableReason?: string;
}) {
  return request(`/availability/${input.weekStart}/${encodeURIComponent(input.memberId)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export function getRota(weekStart: string): Promise<RotaEntry[]> {
  return request<RotaEntry[]>(`/rotas/${weekStart}`);
}

export function getAvailability(weekStart: string): Promise<Availability[]> {
  return request<Availability[]>(`/availability/${weekStart}`);
}

export function generateRota(input: { weekStart: string; adminMemberId: string; pin: string }): Promise<{ entries: RotaEntry[] }> {
  return request(`/rotas/${input.weekStart}/generate`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
