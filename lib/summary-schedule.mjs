import { addDaysISO } from './dates.mjs';
export const SUMMARY_FREQUENCIES=['off','daily','weekly','biweekly','monthly'];
// JS UTC day: 0=Sunday, 1=Monday ... 6=Saturday.
export function shouldSendSummary(profile,iso){
  const frequency=profile?.summary_frequency||'off';
  if(!SUMMARY_FREQUENCIES.includes(frequency)||frequency==='off')return false;
  if(frequency==='daily')return true;
  const day=new Date(`${iso}T12:00:00Z`).getUTCDay();
  if(frequency==='monthly')return Number(iso.slice(8,10))===Math.min(28,Math.max(1,Number(profile.summary_month_day)||1));
  if(day!==Number(profile.summary_weekday??1))return false;
  if(frequency==='weekly')return true;
  // Week parity is anchored to a fixed Monday. No user timezone dependence.
  const anchor=Date.parse('2026-01-05T12:00:00Z');
  const weeks=Math.floor((Date.parse(`${iso}T12:00:00Z`)-anchor)/604800000);
  return weeks%2===0;
}
export function monthEndISO(iso){const [y,m]=iso.split('-').map(Number);return addDaysISO(`${y}-${String(m).padStart(2,'0')}-01`,new Date(Date.UTC(y,m,0)).getUTCDate()-1);}
export function upcomingSummaryBills(bills,today){const end=monthEndISO(today);return (bills||[]).filter(b=>!b.paid_at&&b.due_date>=today&&b.due_date<=end).sort((a,b)=>a.due_date.localeCompare(b.due_date));}
