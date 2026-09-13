export type Day = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export type Member = {
  memberId: string;
  displayName: string;
  vehicleSeats: number;
};

const apiUrl = import.meta.env.VITE_API_URL?.replace(/\/$/, '');

function configuredApiUrl(): string {
  if (!apiUrl) throw new Error('The app has not been configured with an API URL yet.');
  return apiUrl;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${configuredApiUrl()}${path}`, {
    headers: { 'content-type': 'application/json', ...init?.headers },
    ...init,
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
