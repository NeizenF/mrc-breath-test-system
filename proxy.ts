import { NextResponse, type NextRequest } from "next/server";

export default function proxy(req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};