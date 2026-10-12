"use client";
/**
 * Server Action'a bağlı form: sonuç mesajını gösterir, gönderim sırasında düğmeyi kilitler.
 * Action imzası: (önceki durum, FormData) => Promise<ActionState>
 */
import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/form";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

export function SubmitButton({ children, className = "btn btn-dark btn-sm", pendingText = "Kaydediliyor…", confirm }: { children: React.ReactNode; className?: string; pendingText?: string; confirm?: string }) {
    const { pending } = useFormStatus();
    return (
        <button
            type="submit" className={className} disabled={pending}
            onClick={confirm ? e => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
        >
            {pending ? pendingText : children}
        </button>
    );
}

/**
 * React, action bitince formu `form.reset()` ile sıfırlar. Açılır listeler o zaman ilk açılıştaki
 * `defaultValue`'ya döner (React varsayılan seçimi yalnızca ilk açılışta işaretler); kaydedilen
 * değer ekranda kaybolur ve tekrar "Kaydet" eski değeri yazar. Gönderilen seçim saklanıp
 * sıfırlamadan sonra geri yazılır; sonraki sıfırlamalar için de varsayılan yapılır.
 */
function keepSelects() {
    let sent: Map<HTMLSelectElement, string[]> | null = null;
    return {
        onSubmit(e: React.FormEvent<HTMLFormElement>) {
            sent = new Map([...e.currentTarget.querySelectorAll("select")].map(s => [s, [...s.selectedOptions].map(o => o.value)]));
        },
        onReset() {
            const values = sent;
            if (!values) return;
            // reset olayı sıfırlamadan önce gelir; değerler sıfırlamadan sonra yazılır
            setTimeout(() => {
                for (const [select, chosen] of values) {
                    for (const option of select.options) {
                        option.defaultSelected = chosen.includes(option.value);
                        option.selected = option.defaultSelected;
                    }
                }
            }, 0);
        },
    };
}

/** Metin alanları (şifre dahil): hata dönerse yazılanlar geri konur (telefonda baştan yazdırmasın); başarıda form temiz kalır */
const TEXTUAL = "input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]), textarea";

export default function AdminForm({ action, children, className, id }: { action: Action; children: React.ReactNode; className?: string; id?: string }) {
    const [state, formAction] = useActionState(action, null);
    const [selects] = useState(keepSelects);
    const formRef = useRef<HTMLFormElement>(null);
    const typed = useRef<Map<HTMLInputElement | HTMLTextAreaElement, string>>(new Map());
    useEffect(() => {
        if (!state || state.ok) return;
        for (const [el, value] of typed.current) if (el.isConnected && el.value !== value) el.value = value;
    }, [state]);
    return (
        <form
            ref={formRef} action={formAction} className={className} id={id}
            onSubmit={e => { selects.onSubmit(e); typed.current = new Map([...e.currentTarget.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(TEXTUAL)].map(el => [el, el.value])); }}
            onReset={selects.onReset}
        >
            {children}
            {state && <p className={`adm-flash ${state.ok ? "ok" : "error"}`} role="status">{state.message}</p>}
        </form>
    );
}

export function PrintButton({ children = "Yazdır" }: { children?: React.ReactNode }) {
    return <button type="button" className="btn btn-sm adm-btn-outline no-print" onClick={() => { document.querySelectorAll("details").forEach(d => { d.open = true; }); window.print(); }}>{children}</button>;
}
