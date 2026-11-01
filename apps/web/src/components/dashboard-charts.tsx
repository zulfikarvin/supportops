import type { Ticket } from '@/lib/tickets/model';

const destination=(ticket:Ticket)=>['Resolved','Closed'].includes(ticket.status)?2:ticket.status==='Waiting for Customer'?1:0;
const colors=['#9e79e9','#6c9fdf','#b4f443'];
export function SupportFlow({tickets}:{tickets:Ticket[]}) {
 const groups=[tickets.filter(ticket=>ticket.record_type!=='service_request'),tickets.filter(ticket=>ticket.record_type==='service_request')];
 const totals=[0,1,2].map(index=>tickets.filter(ticket=>destination(ticket)===index).length);
 return <figure className="mt-2"><svg viewBox="0 0 460 225" role="img" aria-label={`Ticket flow: ${groups[0].length} incidents and ${groups[1].length} service requests; ${totals[0]} open, ${totals[1]} waiting for customer, ${totals[2]} resolved or closed.`} className="w-full">
   <defs><linearGradient id="flow-open"><stop stopColor="#7c4dcc" stopOpacity=".5"/><stop offset="1" stopColor="#9e79e9" stopOpacity=".28"/></linearGradient><linearGradient id="flow-wait"><stop stopColor="#5893df" stopOpacity=".4"/><stop offset="1" stopColor="#70b6ff" stopOpacity=".3"/></linearGradient><linearGradient id="flow-resolved"><stop stopColor="#a8ed40" stopOpacity=".4"/><stop offset="1" stopColor="#b4f443" stopOpacity=".25"/></linearGradient></defs>
   {groups.flatMap((group,source)=>[0,1,2].map(target=>{const count=group.filter(ticket=>destination(ticket)===target).length;if(!count)return null;const y1=source===0?72:171;const y2=42+target*70;return <path key={`${source}-${target}`} d={`M 18 ${y1+(target-1)*12} C 170 ${y1}, 245 ${y2}, 439 ${y2+(source===0?-4:4)}`} fill="none" stroke={`url(#${['flow-open','flow-wait','flow-resolved'][target]})`} strokeWidth={Math.max(6,58*count/Math.max(tickets.length,1))}/>;}))}
   {[72,171].map((y,index)=><g key={y}><rect x="10" y={y-28} width="8" height="56" rx="3" fill={index===0?'#a985f4':'#74a4df'}/><text x="30" y={y-27} fill="#e3ebd9" fontSize="11">{index===0?'Incidents':'Requests'}</text><text x="30" y={y-10} fill="#a4b498" fontSize="10">{groups[index].length} ticket{groups[index].length===1?'':'s'}</text></g>)}
   {totals.map((count,index)=><g key={index}><rect x="439" y={26+index*70} width="8" height="32" rx="3" fill={colors[index]}/><text x="429" y={21+index*70} textAnchor="end" fill="#c1cfb5" fontSize="10">{['Open','Waiting','Resolved'][index]} · {count}</text></g>)}
   {!tickets.length&&<text x="230" y="115" textAnchor="middle" fill="#99a68d" fontSize="11">Ticket flow appears when issues are reported.</text>}
 </svg><figcaption className="flow-legend">{totals.map((count,index)=><span key={index}><i style={{background:colors[index]}}/>{['Open','Waiting','Resolved'][index]} <strong>{count}</strong></span>)}</figcaption></figure>;
}
export function ActivityHeatmap({tickets,now}:{tickets:Ticket[];now:string}) {
 const localDate=(value:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(value);
 const days=Array.from({length:7},(_,index)=>{const date=new Date(new Date(now).getTime()-(6-index)*86400000);const key=localDate(date);return {key,label:new Intl.DateTimeFormat('en-GB',{weekday:'short',timeZone:'Europe/Berlin'}).format(date),count:tickets.filter(ticket=>localDate(new Date(ticket.created_at))===key).length};});
 const max=Math.max(1,...days.map(day=>day.count));const total=days.reduce((sum,day)=>sum+day.count,0);
 return <figure><p className="mini-label mt-2">Last 7 days · {total} ticket{total===1?'':'s'} reported</p><div className="activity-grid" role="img" aria-label={days.map(day=>`${day.label} ${day.key}: ${day.count} tickets`).join('; ')}>{days.map((day,index)=><div className="activity-col" key={day.key} title={`${day.key}: ${day.count} tickets`} aria-hidden="true">{[4,3,2,1,0].map(level=>{const filled=day.count>0&&level<Math.ceil(day.count/max*5);return <div className="activity-cell" data-tone={filled?['lime','purple','blue'][index%3]:undefined} key={level}>{filled&&level===Math.ceil(day.count/max*5)-1?day.count:''}</div>;})}<span className="activity-day">{day.label}</span></div>)}</div></figure>;
}
