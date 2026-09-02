import { NextRequest, NextResponse } from 'next/server';
import { decrypt } from '@/lib/auth';

const isProtected = (pathname: string) => pathname === '/';
const isPublic = (pathname: string) => pathname.startsWith('/login');

export default async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (isPublic(path)) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get('session')?.value;
  const session = await decrypt(cookie);

  if (isProtected(path) && !session?.userId) {
    return NextResponse.redirect(new URL('/login', req.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
