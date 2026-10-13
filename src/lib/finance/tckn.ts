/** T.C. kimlik numarası doğrulaması (11 hane, ilk hane 0 olamaz, 10. ve 11. hane sağlama) */
export function validTckn(v: string): boolean {
    if (!/^[1-9]\d{10}$/.test(v)) return false;
    const d = v.split("").map(Number);
    const odd = d[0] + d[2] + d[4] + d[6] + d[8];
    const even = d[1] + d[3] + d[5] + d[7];
    if (((odd * 7 - even) % 10 + 10) % 10 !== d[9]) return false;
    return d.slice(0, 10).reduce((a, b) => a + b, 0) % 10 === d[10];
}
