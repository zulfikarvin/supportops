'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="mx-auto max-w-lg p-12"><h1 className="text-2xl font-semibold">Unable to load the workspace</h1><p className="my-5 text-slate-600">Try again, or ask your administrator to check your account provisioning and Supabase configuration.</p><Button onClick={reset}>Try again</Button></main>; }
