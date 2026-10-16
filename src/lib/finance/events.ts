/** Ortak takvim: etkinlik türleri ve ay ızgarası */
export const EVENT_KINDS: Record<string, { label: string; tone: string }> = {
    KESIF: { label: "Keşif", tone: "k-kesif" },
    TOPLANTI: { label: "Toplantı", tone: "k-toplanti" },
    TESLIM: { label: "Teslim / montaj", tone: "k-teslim" },
    GOREV: { label: "Görev", tone: "k-gorev" },
    DIGER: { label: "Diğer", tone: "k-diger" },
};

export const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

/** "2026-10" ayının ızgarası: Pazartesi başlar, 6 satıra kadar; ay dışı günler inMonth=false */
export function monthGrid(key: string) {
    const [y, m] = key.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1, 12));
    const lead = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const total = Math.ceil((lead + days) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
        const d = new Date(Date.UTC(y, m - 1, 1 - lead + i, 12));
        return { ymd: d.toISOString().slice(0, 10), day: d.getUTCDate(), inMonth: d.getUTCMonth() === m - 1 };
    });
}

export const shiftMonth = (key: string, n: number) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1 + n, 1, 12)).toISOString().slice(0, 7);
};

/** "14:30" biçimi; geçersizse null */
export const cleanTime = (v: string | null) => (v && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);
