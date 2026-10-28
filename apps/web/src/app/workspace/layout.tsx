import { WorkspaceShell } from '@/components/workspace-shell';
import { pageContext } from '@/lib/tickets/page-context';
export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}){const {actor}=await pageContext();return <WorkspaceShell actor={actor}>{children}</WorkspaceShell>;}
