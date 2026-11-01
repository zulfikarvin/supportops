'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
export function LiveRefresh({demo}:{demo:boolean}){
 const router=useRouter();
 useEffect(()=>{let active=true;let fingerprint='';let refreshing=false;let pendingRefresh=false;
 const poll=async()=>{if(document.hidden||refreshing)return;refreshing=true;try{const response=await fetch('/api/tickets',{cache:'no-store'});if(!response.ok)throw new Error();const tickets=await response.json() as {id:string;updated_at:string}[];const next=tickets.map(ticket=>ticket.id+ticket.updated_at).join('|');if(fingerprint&&fingerprint!==next)pendingRefresh=true;if(pendingRefresh&&active&&!document.querySelector('form :focus')){router.refresh();pendingRefresh=false;}fingerprint=next;}catch{/* Retry silently on the next interval. */}finally{refreshing=false;}};
 const timer=setInterval(poll,5000);poll();let cleanup=()=>{};
 if(!demo){const client=createClient();const channel=client.channel('supportops-ticket-events').on('postgres_changes',{event:'UPDATE',schema:'public',table:'tickets'},()=>{pendingRefresh=true;void poll();}).subscribe();cleanup=()=>{void client.removeChannel(channel);};}
 return()=>{active=false;clearInterval(timer);cleanup();};
 },[demo,router]);
 return null;
}
