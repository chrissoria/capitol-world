// Committee rosters and meetings, from world/committees.json.

export interface CommitteeMeeting {
  id: string;
  /** Start time in UTC. The source gives no end time. */
  date: string;
  type: string;
  title: string;
  place?: string;
  bills?: string[];
  n_bills: number;
  n_witnesses: number;
  /** Document titles that record a decision, such as a vote to report a bill. */
  outcomes?: string[];
  /** The subcommittee holding it, when it is not the full committee. */
  sub: string;
  url?: string;
  /** An older meeting, carried in short form for the wall calendar only. */
  brief?: boolean;
}

export interface CommitteeInfo {
  name: string;
  chamber: string;
  members: { id: string; side: string; rank: number; title: string }[];
  subcommittees: Record<string, string>;
  n_meetings: number;
  /** Coming meetings first (soonest first), then past ones, newest first. */
  meetings: CommitteeMeeting[];
}

export interface CommitteeFile {
  schema: number;
  generated_at: string;
  committees: Record<string, CommitteeInfo>;
}

/** With no end time published, a meeting is treated as lasting this long. */
const ASSUMED_LENGTH = 2.5 * 60 * 60 * 1000;

export function isLive(meeting: CommitteeMeeting, now = Date.now()): boolean {
  const start = Date.parse(meeting.date);
  return now >= start && now < start + ASSUMED_LENGTH;
}

export const liveMeeting = (info: CommitteeInfo, now = Date.now()) => info.meetings.find((meeting) => isLive(meeting, now));
export const comingMeetings = (info: CommitteeInfo, now = Date.now()) => info.meetings.filter((meeting) => Date.parse(meeting.date) > now);
export const pastMeetings = (info: CommitteeInfo, now = Date.now()) => info.meetings.filter((meeting) => Date.parse(meeting.date) + ASSUMED_LENGTH <= now);

let congress = 119;

/** Say which Congress the meetings on show belong to, for their links. */
export function setMeetingCongress(number: number) {
  congress = number;
}

/** The meeting's page on Congress.gov. */
export function meetingUrl(meeting: CommitteeMeeting, chamber: string): string {
  return meeting.url ?? `https://www.congress.gov/event/${congress}th-congress/${chamber === "Senate" ? "senate" : "house"}-event/${meeting.id}`;
}

export function meetingTime(meeting: CommitteeMeeting): string {
  return new Date(meeting.date).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}
