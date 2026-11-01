import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';

export function ReportIssueButton() {
  return <Link className="primary-link customer-report-button" href="/workspace/tickets/new"><Plus size={24} aria-hidden="true"/>Report an Issue<ArrowUpRight size={21} aria-hidden="true"/></Link>;
}
