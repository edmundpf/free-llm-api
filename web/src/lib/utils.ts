import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn's classic class merger: conditional classes via clsx, de-duped by
// tailwind-merge so later utilities win.
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs))
