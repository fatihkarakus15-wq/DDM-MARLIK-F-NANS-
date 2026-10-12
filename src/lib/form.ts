/**
 * Admin formları için FormData okuma yardımcıları ve ortak action sonucu.
 */
import { unstable_rethrow } from "next/navigation";
import { Prisma } from "@prisma/client";

export type ActionState = { ok: boolean; message: string } | null;

export class FormError extends Error {}

export function str(fd: FormData, name: string, label = name): string {
    const v = String(fd.get(name) ?? "").trim();
    if (!v) throw new FormError(`${label} boş bırakılamaz.`);
    return v;
}

export function optStr(fd: FormData, name: string): string | null {
    const v = String(fd.get(name) ?? "").trim();
    return v === "" ? null : v;
}

export function num(fd: FormData, name: string, label = name, { min = 0 }: { min?: number } = {}): number {
    const raw = String(fd.get(name) ?? "").trim().replace(",", ".");
    const v = Number(raw);
    if (raw === "" || !Number.isFinite(v)) throw new FormError(`${label} geçerli bir sayı olmalı.`);
    if (v < min) throw new FormError(`${label} en az ${min} olmalı.`);
    return v;
}

export function optNum(fd: FormData, name: string, label = name): number | null {
    const raw = String(fd.get(name) ?? "").trim();
    return raw === "" ? null : num(fd, name, label);
}

export function int(fd: FormData, name: string, label = name, opts?: { min?: number }): number {
    const v = num(fd, name, label, opts);
    if (!Number.isInteger(v)) throw new FormError(`${label} tam sayı olmalı.`);
    return v;
}

export function bool(fd: FormData, name: string): boolean {
    return fd.get(name) === "on" || fd.get(name) === "true";
}

export function ids(fd: FormData, name: string): string[] {
    return fd.getAll(name).map(String).filter(Boolean);
}

const TR: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };

/** "Açık Gri Kapak" → "acik-gri-kapak" */
export function slugify(text: string): string {
    return text
        .replace(/[çğıİöşüÇĞÖŞÜ]/g, c => TR[c] ?? c)
        .toLowerCase()
        .normalize("NFKD").replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/** Form alanı boşsa addan slug üretir */
export function slugFrom(fd: FormData, slugField: string, nameValue: string): string {
    const s = slugify(optStr(fd, slugField) ?? nameValue);
    if (!s) throw new FormError("Geçerli bir kısa ad (slug) üretilemedi.");
    return s;
}

/** Action gövdesini sarar: bilinen hataları kullanıcı mesajına çevirir */
export async function run(fn: () => Promise<string | void>): Promise<ActionState> {
    try {
        const message = await fn();
        return { ok: true, message: message ?? "Kaydedildi." };
    } catch (err) {
        unstable_rethrow(err); // redirect()/notFound() yakalanmamalı
        if (err instanceof FormError) return { ok: false, message: err.message };
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
            if (err.code === "P2002") return { ok: false, message: "Bu değer (kod/kısa ad) başka bir kayıtta kullanılıyor." };
            if (err.code === "P2003") return { ok: false, message: "Bu kayıt başka kayıtlarda kullanıldığı için silinemez. Pasife almayı deneyin." };
            if (err.code === "P2025") return { ok: false, message: "Kayıt bulunamadı." };
        }
        if (err instanceof Error && err.message.startsWith("Bu işlem için")) return { ok: false, message: err.message };
        console.error(err);
        return { ok: false, message: "İşlem tamamlanamadı." };
    }
}
