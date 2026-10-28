import { redirect, notFound } from 'next/navigation';
import { TicketError } from './model';
import { ticketContext } from './service';
export async function pageContext(){try{return await ticketContext();}catch(error){if(error instanceof TicketError&&error.status===401)redirect('/login');throw error;}}
export function pageError(error:unknown):never{if(error instanceof TicketError&&error.status===404)notFound();throw error;}
