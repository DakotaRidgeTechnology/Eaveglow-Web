// WLED's built-in time zones (wled00/ntp.cpp TZ_TABLE, with daylight-saving rules)
// and a mapping from browser (IANA) time zones. Port of lib/engine/wled_timezones.dart.

export const WLED_TIMEZONES: [number, string][] = [
  [0, 'UTC'],
  [1, 'UK / Ireland / Portugal'],
  [2, 'Central Europe'],
  [3, 'Eastern Europe'],
  [4, 'US Eastern'],
  [5, 'US Central'],
  [6, 'US Mountain'],
  [7, 'US Arizona (no DST)'],
  [8, 'US Pacific'],
  [9, 'China / Singapore'],
  [10, 'Japan / Korea'],
  [11, 'Australia Eastern'],
  [12, 'New Zealand'],
  [13, 'North Korea'],
  [14, 'India'],
  [15, 'Saskatchewan'],
  [16, 'Australia Northern'],
  [17, 'Australia Southern'],
  [18, 'Hawaii'],
  [19, 'Novosibirsk'],
  [20, 'Alaska'],
  [21, 'Mexico Central'],
  [22, 'Pakistan'],
  [23, 'Brasília'],
  [24, 'Australia Western'],
];

const BY_IANA: Record<string, number> = {
  'UTC': 0, 'Etc/UTC': 0, 'GMT': 0, 'Etc/GMT': 0, 'Europe/London': 1, 'Europe/Dublin': 1, 'Europe/Lisbon': 1,
  'Atlantic/Canary': 1, 'Atlantic/Madeira': 1, 'Atlantic/Faroe': 1, 'Europe/Guernsey': 1, 'Europe/Jersey': 1,
  'Europe/Isle_of_Man': 1, 'Europe/Berlin': 2, 'Europe/Paris': 2, 'Europe/Madrid': 2, 'Europe/Rome': 2,
  'Europe/Amsterdam': 2, 'Europe/Brussels': 2, 'Europe/Vienna': 2, 'Europe/Zurich': 2, 'Europe/Stockholm': 2,
  'Europe/Oslo': 2, 'Europe/Copenhagen': 2, 'Europe/Prague': 2, 'Europe/Warsaw': 2, 'Europe/Budapest': 2,
  'Europe/Luxembourg': 2, 'Europe/Monaco': 2, 'Europe/Belgrade': 2, 'Europe/Zagreb': 2,
  'Europe/Ljubljana': 2, 'Europe/Bratislava': 2, 'Europe/Malta': 2, 'Europe/Andorra': 2,
  'Europe/Sarajevo': 2, 'Europe/Skopje': 2, 'Europe/Tirane': 2, 'Europe/Podgorica': 2, 'Europe/Vaduz': 2,
  'Europe/San_Marino': 2, 'Europe/Vatican': 2, 'Europe/Gibraltar': 2, 'Europe/Athens': 3,
  'Europe/Helsinki': 3, 'Europe/Kiev': 3, 'Europe/Kyiv': 3, 'Europe/Bucharest': 3, 'Europe/Sofia': 3,
  'Europe/Riga': 3, 'Europe/Vilnius': 3, 'Europe/Tallinn': 3, 'Asia/Nicosia': 3, 'Europe/Chisinau': 3,
  'America/New_York': 4, 'America/Detroit': 4, 'America/Toronto': 4, 'America/Montreal': 4,
  'America/Nassau': 4, 'America/Indiana/Indianapolis': 4, 'America/Indianapolis': 4,
  'America/Kentucky/Louisville': 4, 'America/Louisville': 4, 'US/Eastern': 4, 'America/Chicago': 5,
  'America/Winnipeg': 5, 'America/Indiana/Knox': 5, 'America/Menominee': 5, 'America/North_Dakota/Center': 5,
  'US/Central': 5, 'America/Denver': 6, 'America/Edmonton': 6, 'America/Boise': 6, 'US/Mountain': 6,
  'America/Phoenix': 7, 'US/Arizona': 7, 'America/Los_Angeles': 8, 'America/Vancouver': 8,
  'America/Tijuana': 8, 'US/Pacific': 8, 'Asia/Shanghai': 9, 'Asia/Hong_Kong': 9, 'Asia/Taipei': 9,
  'Asia/Singapore': 9, 'Asia/Macau': 9, 'Asia/Kuala_Lumpur': 9, 'Asia/Manila': 9, 'Australia/Perth': 24,
  'Asia/Tokyo': 10, 'Asia/Seoul': 10, 'Australia/Sydney': 11, 'Australia/Melbourne': 11,
  'Australia/Hobart': 11, 'Australia/Canberra': 11, 'Australia/ACT': 11, 'Australia/NSW': 11,
  'Australia/Victoria': 11, 'Pacific/Auckland': 12, 'Asia/Pyongyang': 13, 'Asia/Kolkata': 14,
  'Asia/Calcutta': 14, 'America/Regina': 15, 'America/Swift_Current': 15, 'Australia/Darwin': 16,
  'Australia/Adelaide': 17, 'Australia/Broken_Hill': 17, 'Pacific/Honolulu': 18, 'US/Hawaii': 18,
  'Asia/Novosibirsk': 19, 'America/Anchorage': 20, 'America/Juneau': 20, 'America/Sitka': 20,
  'America/Nome': 20, 'US/Alaska': 20, 'America/Mexico_City': 21, 'America/Monterrey': 21,
  'America/Merida': 21, 'Asia/Karachi': 22, 'America/Sao_Paulo': 23,
};

/** WLED settings for a browser time zone: a built-in zone when one matches,
 * otherwise UTC plus the current offset (no automatic daylight saving). */
export function timezoneFor(iana: string, utcOffsetMinutes: number): { index: number; offsetSeconds: number; exact: boolean } {
  const index = BY_IANA[iana];
  if (index !== undefined) return { index, offsetSeconds: 0, exact: true };
  return { index: 0, offsetSeconds: utcOffsetMinutes * 60, exact: false };
}

export const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** Minutes east of UTC right now (JS reports the opposite sign). */
export const browserUtcOffsetMinutes = () => -new Date().getTimezoneOffset();
