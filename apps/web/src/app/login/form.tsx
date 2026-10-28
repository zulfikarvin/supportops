'use client';
import { useActionState } from 'react';
import { login } from './actions';
import { Button } from '@/components/ui/button';
export function LoginForm() { const [state, action, pending] = useActionState(login, { error: '' }); return <form action={action} className="mt-8 space-y-5"><div><label htmlFor="email" className="mb-2 block text-sm font-medium">Work email</label><input id="email" name="email" type="email" autoComplete="username" required /></div><div><label htmlFor="password" className="mb-2 block text-sm font-medium">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={256}/></div>{state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}<Button disabled={pending} className="w-full">{pending ? 'Signing in…' : 'Sign in'}</Button></form>; }
