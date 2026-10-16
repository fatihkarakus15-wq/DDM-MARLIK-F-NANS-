import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { publicKey } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET() {
    if (!(await getUser())) return NextResponse.json({ success: false, error: "Giriş gerekli." }, { status: 401 });
    return NextResponse.json({ success: true, key: await publicKey() });
}
