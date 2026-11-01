'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Tickets, ChartNoAxesCombined, Plus } from 'lucide-react';
export function WorkspaceNav({customer}:{customer:boolean}) {
 const path=usePathname();
 const items=[{href:'/workspace',label:'Dashboard',icon:LayoutDashboard,active:path==='/workspace'},{href:'/workspace/tickets',label:customer?'My tickets':'Ticket queue',icon:Tickets,active:path.startsWith('/workspace/tickets')&&path!=='/workspace/tickets/new'},...(customer?[{href:'/workspace/tickets/new',label:'Report an issue',icon:Plus,active:path==='/workspace/tickets/new'}]:[{href:'/workspace/learning',label:'Insights & improvement',icon:ChartNoAxesCombined,active:path==='/workspace/learning'}])];
 return <nav className="workspace-nav" aria-label="Workspace">{items.filter(item=>!(customer&&path==='/workspace'&&item.href==='/workspace/tickets/new')).map(item=><Link key={item.href} href={item.href} aria-current={item.active?'page':undefined}><item.icon size={16}/>{item.label}</Link>)}</nav>;
}
