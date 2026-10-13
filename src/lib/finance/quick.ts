/** Şantiye modu verisi: bir proje için kalem düğmeleri (projede harcanan tutarla), hesaplar ve son harcamalar */
import { prisma } from "@/lib/prisma";
import { formOptions } from "./options";
import { ensureFreshRates } from "./rates";
import { projectCosts } from "./reports";

const PREFERRED = ["Yapı malzemesi", "Boya", "Yemek", "Taşeron hakedişi", "Usta / işçilik", "Yakıt", "Nakliye ve montaj", "Seramik / kaplama", "Elektrik ve aydınlatma"];
const leafLabel = (l: string) => l.split(" › ").pop()!;

export async function loadQuick(ledgerId: string, projectId: string) {
    const [rates, used, costs, recent] = await Promise.all([
        ensureFreshRates(600),
        prisma.finTransaction.groupBy({ by: ["categoryId"], where: { ledgerId, type: "EXPENSE", categoryId: { not: null } }, _count: true, orderBy: { _count: { categoryId: "desc" } }, take: 6 }),
        projectCosts(ledgerId, projectId),
        prisma.finTransaction.findMany({
            where: { ledgerId, projectId, type: "EXPENSE" }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 6,
            select: { id: true, title: true, amount: true, currency: true, date: true, status: true, category: { select: { name: true } } },
        }),
    ]);
    const opts = await formOptions(ledgerId, rates);
    const expenseOpts = opts.categories.filter(c => c.kind === "EXPENSE");
    const favIds = used.map(u => u.categoryId!).filter(id => expenseOpts.some(c => c.id === id));
    const projectItems = costs.compare.map(c => c.categoryId).filter((x): x is string => !!x && expenseOpts.some(c => c.id === x));
    const picked = [...new Set([...projectItems, ...favIds])].map(id => expenseOpts.find(c => c.id === id)!);
    for (const name of PREFERRED) {
        if (picked.length >= 8) break;
        const c = expenseOpts.find(o => leafLabel(o.label) === name);
        if (c && !picked.some(x => x.id === c.id)) picked.push(c);
    }
    const spentBy = new Map(costs.compare.map(c => [c.categoryId, c.actual]));
    return {
        accounts: opts.accounts,
        people: opts.people,
        categories: expenseOpts.map(c => ({ id: c.id, label: c.label })),
        favorites: picked.slice(0, 8).map(c => ({ id: c.id, label: leafLabel(c.label), spent: spentBy.get(c.id) })),
        recent,
        totalExpense: costs.totalExpense,
    };
}
