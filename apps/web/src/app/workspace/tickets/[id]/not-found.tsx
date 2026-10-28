import Link from 'next/link';
export default function MissingTicket(){return <section className="panel"><h1 className="text-2xl font-semibold">Ticket not found</h1><p className="my-4 text-sm text-slate-500">This ticket is unavailable or outside your organization access.</p><Link className="text-teal-700" href="/workspace/tickets">Return to tickets</Link></section>;}
