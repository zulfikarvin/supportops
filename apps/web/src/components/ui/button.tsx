import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
const variants = cva('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-50', { variants: { variant: { default: 'bg-teal-700 text-white hover:bg-teal-800', outline: 'border border-slate-300 bg-white hover:bg-slate-50' } }, defaultVariants: { variant: 'default' } });
export function Button({ className, variant, ...props }: React.ComponentProps<'button'> & VariantProps<typeof variants>) { return <button className={cn(variants({ variant }), className)} {...props} />; }
