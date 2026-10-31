'use client';
import { useEffect,useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
export function LiveRefresh({demo}:{demo:boolean}){
 const router=useRouter();const [state,setState]=useState(demo?'Updates checked every 5 seconds':'Connecting to live updates');
 useEffect(()=>{let active=true;let fingerprint='';let refreshing=false;let pendingRefresh=false;
 const poll=async()=>{if(document.hidden||refreshing)return;refreshing=true;try{const response=await fetch('/api/tickets',{cache:'no-store'});if(!response.ok)throw new Error();const tickets=await response.json() as {id:string;updated_at:string}[];const next=tickets.map(ticket=>ticket.id+ticket.updated_at).join('|');if(fingerprint&&fingerprint!==next)pendingRefresh=true;if(pendingRefresh&&active&&!document.querySelector('form :focus')){router.refresh();pendingRefresh=false;}fingerprint=next;if(active)setState(demo?'Updates checked every 5 seconds':'Connected · updates checked every 5 seconds');}catch{if(active)setState('Updates paused · retrying');}finally{refreshing=false;}};
 const timer=setInterval(poll,5000);poll();let cleanup=()=>{};
 if(!demo){const client=createClient();const channel=client.channel('supportops-ticket-events').on('postgres_changes',{event:'UPDATE',schema:'public',table:'tickets'},()=>{pendingRefresh=true;void poll();}).subscribe(status=>{if(active&&status==='SUBSCRIBED')setState('Live updates connected');});cleanup=()=>{void client.removeChannel(channel);};}
 return()=>{active=false;clearInterval(timer);cleanup();};
 },[demo,router]);
 return <p className="mb-5 text-xs text-slate-400" role="status">{state}</p>;
}
