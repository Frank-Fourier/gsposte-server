import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import httpErrors from "http-errors";
import moment from "moment";
import { logger } from "@utils/winston";
import { UserService } from "@services/UserService";
import { InvoiceDocument, InvoiceModel } from "@models/InvoiceModel";
import { UserDocument } from "@models/UserModel";
import {
    ResidualBeneficiary,
    RevenueShareSettingDocument,
    RevenueShareSettingModel,
    RevenueShareSnapshot,
    RevenueShareSnapshotLine,
} from "@models/RevenueShareSettingModel";

/**
 * Tolleranza ±0.10 sulla somma delle percentuali in input dei residualBeneficiaries.
 * Esempio: 79.99 + 20.01 = 100 → ok.
 * Esempio: 80.00 + 19.00 = 99.00 → rifiutato (probabile errore di input).
 */
const PERCENT_SUM_TOLERANCE = 0.10;

export interface ResolvedSplit {
    lines: RevenueShareSnapshotLine[]
    basisValue: number
    adminFeeAmount: number
    residuoValue: number
    adminFeePercentApplied: number
}

export interface AdminPayoutRow {
    userId: string
    name: string
    fiscalCode: string
    iban: string
    invoiceCount: number
    amount: number
}

export interface ResidualPayoutRow {
    beneficiaryId: string
    name: string
    fiscalCode: string
    iban: string
    percent: number
    invoiceCount: number
    amount: number
}

export interface PayoutReportDetail {
    invoiceId: string
    invoiceNumber: string
    paymentDate: string
    senderName: string
    adminName: string
    taxable: number
    adminFeeAmount: number
    residuoValue: number
    adminFeePercentApplied: number
}

export interface PayoutReport {
    from: string
    to: string
    administrators: AdminPayoutRow[]
    residuals: ResidualPayoutRow[]
    details: PayoutReportDetail[]
    totalInvoices: number
    totalTaxable: number
    totalAdminFee: number
    totalResiduo: number
}

export interface MyEarningsDetail {
    invoiceId: string
    invoiceNumber: string
    paymentDate: string
    senderName: string
    taxable: number
    adminFeePercentApplied: number
    amount: number
}

export interface MyEarningsReport {
    userId: string
    from: string
    to: string
    invoiceCount: number
    totalTaxable: number
    totalEarnings: number
    details: MyEarningsDetail[]
}

@provide(RevenueShareService)
export class RevenueShareService {

    @inject(UserService) private userService: UserService;

    /**
     * Bootstrap idempotente del singleton globale. Chiamato al boot da server.ts.
     *
     * Se il singleton non esiste, lo crea con il modello standard:
     *   - adminFeePercent: 30
     *   - residualBeneficiaries: Solutions S.r.l. (80) + Tandoi (20)
     *
     * NON sovrascrive mai un singleton esistente.
     */
    public async bootstrapIfMissing(): Promise<void> {
        const existing = await RevenueShareSettingModel.findOne({ name: "global" });
        if (existing) {
            logger.info(`[RevenueShare] Singleton 'global' già presente (adminFee=${existing.adminFeePercent}%, residuo: ${existing.residualBeneficiaries.map(b => `${b.name} ${b.percent}%`).join(", ")}).`);
            return;
        }

        await RevenueShareSettingModel.create({
            name: "global",
            basis: "taxable",
            adminFeePercent: 30,
            residualBeneficiaries: [
                {
                    name: "Solutions S.r.l.",
                    fiscalCode: "08886590721",
                    iban: process.env.SOLUTIONS_IBAN || process.env.FIC_IBAN || "IT44Z0306941473100000015095",
                    percent: 80,
                    isCompany: true,
                },
                {
                    name: "Francesco Filippo Tandoi",
                    fiscalCode: "TNDFNC93B08A662A",
                    iban: "",
                    percent: 20,
                    isCompany: false,
                }
            ],
            tieBreakCursor: 0,
        });
        logger.info("[RevenueShare] Singleton 'global' creato. AdminFee 30% → User che emette la fattura. Residuo: Solutions 80%, Tandoi 20%.");
    }

    public async getGlobalSetting(): Promise<RevenueShareSettingDocument> {
        const s = await RevenueShareSettingModel.findOne({ name: "global" });
        if (!s) {
            throw new httpErrors.InternalServerError("Singleton RevenueShareSetting 'global' mancante. Riavviare il server per il bootstrap.");
        }
        return s;
    }

    /**
     * Aggiorna il singleton globale.
     *  - `adminFeePercent` (opzionale): se presente, sovrascrive. Validazione 0..100 con max 2 decimali.
     *  - `residualBeneficiaries` (opzionale): se presente, deve avere ESATTAMENTE 2 elementi
     *    e la somma delle % deve essere ≈100 (tolleranza ±0.10).
     *    Per preservare i riferimenti negli snapshot esistenti, i _id dei beneficiari
     *    vengono ricongiunti via match (nome+fiscalCode) se non specificati esplicitamente.
     */
    public async updateGlobalSetting(
        adminFeePercent: number | undefined,
        residualBeneficiaries: ResidualBeneficiary[] | undefined,
        updatedBy?: string
    ): Promise<RevenueShareSettingDocument> {
        const current = await this.getGlobalSetting();

        if (adminFeePercent !== undefined) {
            if (typeof adminFeePercent !== "number" || isNaN(adminFeePercent)
                || adminFeePercent < 0 || adminFeePercent > 100) {
                throw new httpErrors.BadRequest("adminFeePercent deve essere un numero tra 0 e 100.");
            }
            current.adminFeePercent = this.round2(adminFeePercent);
        }

        if (residualBeneficiaries !== undefined) {
            if (!Array.isArray(residualBeneficiaries) || residualBeneficiaries.length !== 2) {
                throw new httpErrors.BadRequest("residualBeneficiaries deve essere un array di esattamente 2 elementi.");
            }
            const normalized = residualBeneficiaries.map(b => ({
                ...b,
                percent: this.round2(b.percent),
            }));
            this.assertPercentSumValid(normalized.map(b => b.percent));

            // Re-associa _id stabili dove nome+CF combaciano con i beneficiari esistenti,
            // per non rompere il riferimento da snapshot già scolpiti.
            const merged = normalized.map(b => {
                if (b._id) return b;
                const match = current.residualBeneficiaries.find(
                    existing => existing.name === b.name && existing.fiscalCode === b.fiscalCode
                );
                return match ? { ...b, _id: (match as any)._id?.toString() } : b;
            });

            current.set("residualBeneficiaries", merged);
        }

        if (updatedBy) {
            current.set("updatedBy", updatedBy);
        }
        return current.save();
    }

    /**
     * Risolve lo split per una fattura:
     *   1. carica setting globale
     *   2. carica User (invoice.user) per leggere payout-data + eventuale adminFeePercent personale
     *   3. calcola adminFee (con cap a taxable se eccede)
     *   4. calcola residuo e applica largest-remainder sui 2 beneficiari fissi
     *
     * Edge cases:
     *  - User senza payoutFiscalCode/payoutIban → snapshot creato con stringhe vuote + warning
     *  - invoice.user mancante (caso anomalo) → adminFee = 0, tutto il taxable al residuo
     *  - adminFeeAmount > taxable → cap a taxable, residuo = 0
     */
    public async resolve(invoice: InvoiceDocument): Promise<ResolvedSplit> {
        const setting = await this.getGlobalSetting();
        const basisValue = this.round2(invoice.taxable);

        let user: UserDocument | undefined;
        if (invoice.user) {
            const userId = (invoice.user as any)._id ?? invoice.user;
            user = await this.userService.findById(userId.toString()).catch(() => undefined);
        }

        const effectivePercent = (user?.adminFeePercent !== undefined && user?.adminFeePercent !== null)
            ? this.round2(user.adminFeePercent)
            : this.round2(setting.adminFeePercent);

        let adminFeeAmount = 0;
        let adminFeeLine: RevenueShareSnapshotLine | undefined;

        if (user && effectivePercent > 0) {
            const raw = basisValue * effectivePercent / 100;
            adminFeeAmount = this.round2(raw);

            if (adminFeeAmount > basisValue) {
                logger.warn(`[RevenueShare] AdminFee ${adminFeeAmount}€ eccede taxable ${basisValue}€ — capping al 100% (invoice ${invoice.id}).`);
                adminFeeAmount = basisValue;
            }

            const payoutName = user.payoutName?.trim() || user.username;
            const payoutFiscalCode = user.payoutFiscalCode?.trim() || "";
            const payoutIban = user.payoutIban?.trim() || "";

            if (!payoutFiscalCode || !payoutIban) {
                logger.warn(`[RevenueShare] User ${user.id} (${payoutName}) ha dati payout incompleti (CF='${payoutFiscalCode}', IBAN='${payoutIban}') — snapshot scolpito comunque per invoice ${invoice.id}.`);
            }

            adminFeeLine = {
                type: "admin-fee",
                userId: user.id,
                name: payoutName,
                fiscalCode: payoutFiscalCode,
                iban: payoutIban,
                percent: effectivePercent,
                amount: adminFeeAmount,
                label: "Compenso amministratore",
            };
        } else if (!user) {
            logger.warn(`[RevenueShare] Invoice ${invoice.id} senza user associato — nessuna admin fee, tutto il taxable al residuo.`);
        }

        const residuoValue = this.round2(basisValue - adminFeeAmount);

        // Costruisco le righe "share" sui 2 beneficiari fissi.
        const shareLines: RevenueShareSnapshotLine[] = setting.residualBeneficiaries.map(b => ({
            type: "share",
            beneficiaryId: (b as any)._id?.toString(),
            name: b.name,
            fiscalCode: b.fiscalCode,
            iban: b.iban,
            percent: this.round2(b.percent),
            amount: residuoValue * b.percent / 100,
        }));

        const cursor = setting.tieBreakCursor ?? 0;
        const adjusted = this.largestRemainder(shareLines, residuoValue, cursor);

        if (adjusted.cursorAdvanced) {
            setting.tieBreakCursor = (cursor + 1) % Math.max(adjusted.lines.length, 1);
            await setting.save().catch(err =>
                logger.warn("[RevenueShare] Impossibile aggiornare tieBreakCursor:", err)
            );
        }

        const allLines = adminFeeLine ? [ adminFeeLine, ...adjusted.lines ] : adjusted.lines;

        return {
            lines: allLines,
            basisValue,
            adminFeeAmount,
            residuoValue,
            adminFeePercentApplied: effectivePercent,
        };
    }

    /**
     * Largest remainder method (Hare/Hamilton) applicato sui centesimi del residuo.
     * Agisce SOLO sulle righe type="share" — la admin fee è già round2 a monte.
     *
     * Il "centesimo dispari" che resta dopo gli arrotondamenti per difetto viene
     * assegnato al beneficiario con il resto maggiore. A parità, vince chi è più
     * vicino in avanti al `cursor` (round-robin globale aggiornato a ogni split).
     */
    private largestRemainder(
        lines: RevenueShareSnapshotLine[],
        targetValue: number,
        cursor: number
    ): { lines: RevenueShareSnapshotLine[], cursorAdvanced: boolean } {
        if (lines.length === 0 || targetValue <= 0) {
            return {
                lines: lines.map(l => ({ ...l, amount: 0 })),
                cursorAdvanced: false
            };
        }

        const targetCents = Math.round(targetValue * 100);
        const exact = lines.map(l => l.amount * 100);
        const floors = exact.map(x => Math.floor(x));
        const sumFloors = floors.reduce((a, b) => a + b, 0);
        const diff = targetCents - sumFloors;

        if (diff <= 0) {
            const adjusted = lines.map((l, i) => ({ ...l, amount: floors[i] / 100 }));
            return { lines: adjusted, cursorAdvanced: false };
        }

        const remainders = exact.map((x, i) => ({ idx: i, rem: x - floors[i] }));
        remainders.sort((a, b) => {
            if (b.rem !== a.rem) return b.rem - a.rem;
            const n = lines.length;
            return ((a.idx - cursor + n) % n) - ((b.idx - cursor + n) % n);
        });

        const bonus = new Array(lines.length).fill(0);
        for (let i = 0; i < diff && i < remainders.length; i++) {
            bonus[remainders[i].idx] = 1;
        }

        const adjusted = lines.map((l, i) => ({
            ...l,
            amount: (floors[i] + bonus[i]) / 100,
        }));
        return { lines: adjusted, cursorAdvanced: true };
    }

    /**
     * Hook chiamato al passaggio a paid=true di una fattura. Idempotente:
     * se splitSnapshot esiste già, non viene mai sovrascritto (audit immutabile).
     */
    public async snapshotOnInvoicePaid(invoice: InvoiceDocument): Promise<InvoiceDocument | null> {
        if (!invoice.paid) {
            logger.warn(`[RevenueShare] snapshotOnInvoicePaid chiamato su invoice ${invoice.id} non paid. Skip.`);
            return invoice;
        }
        if (invoice.splitSnapshot) {
            return invoice;
        }
        if (!invoice.taxable || invoice.taxable <= 0) {
            logger.warn(`[RevenueShare] Invoice ${invoice.id} con taxable<=0, nessuno snapshot.`);
            return invoice;
        }

        const resolved = await this.resolve(invoice);

        const snapshot: RevenueShareSnapshot = {
            lines: resolved.lines,
            basis: "taxable",
            basisValue: resolved.basisValue,
            adminFeeAmount: resolved.adminFeeAmount,
            residuoValue: resolved.residuoValue,
            adminFeePercentApplied: resolved.adminFeePercentApplied,
            computedAt: new Date(),
        };

        invoice.set("splitSnapshot", snapshot);
        const saved = await invoice.save();
        logger.info(`[RevenueShare] Snapshot scritto su invoice ${invoice.id} (taxable=${resolved.basisValue}€, adminFee=${resolved.adminFeeAmount}€ @ ${resolved.adminFeePercentApplied}%, residuo=${resolved.residuoValue}€).`);
        return saved;
    }

    /**
     * Report dei payout su un range di date (paymentDate inclusivo).
     * Considera SOLO invoice con paid=true e splitSnapshot presente.
     *
     * Aggregazione a 2 sezioni:
     *  - administrators[]: una riga per ogni User che ha emesso fatture (raggruppato per userId)
     *  - residuals[]: due righe fisse per i beneficiari del residuo
     */
    public async payoutReport(from: Date, to: Date): Promise<PayoutReport> {
        if (from > to) {
            throw new httpErrors.BadRequest("La data 'from' deve essere precedente o uguale a 'to'.");
        }

        const invoices = await InvoiceModel.find({
            paid: true,
            paymentDate: { $gte: from, $lte: to },
            splitSnapshot: { $exists: true },
        }).populate("sender").sort({ paymentDate: 1 });

        const adminAgg: { [userId: string]: AdminPayoutRow } = {};
        const residualAgg: { [beneficiaryId: string]: ResidualPayoutRow } = {};
        const invoicesSeenByAdmin: { [userId: string]: Set<string> } = {};
        const invoicesSeenByResidual: { [beneficiaryId: string]: Set<string> } = {};
        const details: PayoutReportDetail[] = [];

        let totalTaxable = 0;
        let totalAdminFee = 0;
        let totalResiduo = 0;

        for (const inv of invoices) {
            const snap = inv.splitSnapshot;
            if (!snap) continue;

            totalTaxable += snap.basisValue;
            totalAdminFee += snap.adminFeeAmount ?? 0;
            totalResiduo += snap.residuoValue ?? snap.basisValue;

            const senderObj = inv.sender as any;
            const adminLine = snap.lines.find(l => l.type === "admin-fee");

            details.push({
                invoiceId: inv.id,
                invoiceNumber: `${inv.number}/${moment(inv.createdAt).year()}`,
                paymentDate: moment(inv.paymentDate).format("YYYY-MM-DD"),
                senderName: senderObj?.businessName ?? senderObj?.name ?? inv.senderName ?? "—",
                adminName: adminLine?.name ?? "—",
                taxable: snap.basisValue,
                adminFeeAmount: snap.adminFeeAmount ?? 0,
                residuoValue: snap.residuoValue ?? snap.basisValue,
                adminFeePercentApplied: snap.adminFeePercentApplied ?? 0,
            });

            for (const line of snap.lines) {
                if (line.type === "admin-fee") {
                    const userIdStr = line.userId ? String(line.userId) : "";
                    const key = userIdStr || `__unknown_${line.name}`;
                    if (!adminAgg[key]) {
                        adminAgg[key] = {
                            userId: userIdStr,
                            name: line.name,
                            fiscalCode: line.fiscalCode,
                            iban: line.iban ?? "",
                            invoiceCount: 0,
                            amount: 0,
                        };
                        invoicesSeenByAdmin[key] = new Set();
                    }
                    if (!invoicesSeenByAdmin[key].has(inv.id)) {
                        invoicesSeenByAdmin[key].add(inv.id);
                        adminAgg[key].invoiceCount += 1;
                    }
                    adminAgg[key].amount = this.round2(adminAgg[key].amount + line.amount);
                } else {
                    // type === "share"
                    const beneficiaryIdStr = line.beneficiaryId ? String(line.beneficiaryId) : "";
                    const key = beneficiaryIdStr || `__unknown_${line.name}`;
                    if (!residualAgg[key]) {
                        residualAgg[key] = {
                            beneficiaryId: beneficiaryIdStr,
                            name: line.name,
                            fiscalCode: line.fiscalCode,
                            iban: line.iban ?? "",
                            percent: line.percent,
                            invoiceCount: 0,
                            amount: 0,
                        };
                        invoicesSeenByResidual[key] = new Set();
                    }
                    if (!invoicesSeenByResidual[key].has(inv.id)) {
                        invoicesSeenByResidual[key].add(inv.id);
                        residualAgg[key].invoiceCount += 1;
                    }
                    residualAgg[key].amount = this.round2(residualAgg[key].amount + line.amount);
                }
            }
        }

        return {
            from: moment(from).format("YYYY-MM-DD"),
            to: moment(to).format("YYYY-MM-DD"),
            administrators: Object.values(adminAgg).sort((a, b) => b.amount - a.amount),
            residuals: Object.values(residualAgg).sort((a, b) => b.percent - a.percent),
            details,
            totalInvoices: invoices.length,
            totalTaxable: this.round2(totalTaxable),
            totalAdminFee: this.round2(totalAdminFee),
            totalResiduo: this.round2(totalResiduo),
        };
    }

    /**
     * Aggregato dei compensi (admin fee) maturati da un singolo User
     * sul range [from..to] di paymentDate, considerando solo invoice
     * paid=true con splitSnapshot scolpito.
     *
     * Default range: anno solare corrente.
     */
    public async myEarnings(userId: string, from?: Date, to?: Date): Promise<MyEarningsReport> {
        const rangeFrom = from ?? moment().startOf("year").toDate();
        const rangeTo = to ?? moment().endOf("year").toDate();
        if (rangeFrom > rangeTo) {
            throw new httpErrors.BadRequest("La data 'from' deve essere precedente o uguale a 'to'.");
        }

        const invoices = await InvoiceModel.find({
            user: userId,
            paid: true,
            paymentDate: { $gte: rangeFrom, $lte: rangeTo },
            splitSnapshot: { $exists: true },
        }).populate("sender").sort({ paymentDate: 1 });

        const details: MyEarningsDetail[] = [];
        let totalTaxable = 0;
        let totalEarnings = 0;

        for (const inv of invoices) {
            const snap = inv.splitSnapshot;
            if (!snap) continue;
            const adminLine = snap.lines.find(l =>
                l.type === "admin-fee" && String(l.userId ?? "") === userId
            );
            if (!adminLine) continue;

            totalTaxable += snap.basisValue;
            totalEarnings += adminLine.amount;

            const senderObj = inv.sender as any;
            details.push({
                invoiceId: inv.id,
                invoiceNumber: `${inv.number}/${moment(inv.createdAt).year()}`,
                paymentDate: moment(inv.paymentDate).format("YYYY-MM-DD"),
                senderName: senderObj?.businessName ?? senderObj?.name ?? inv.senderName ?? "—",
                taxable: snap.basisValue,
                adminFeePercentApplied: snap.adminFeePercentApplied ?? adminLine.percent,
                amount: adminLine.amount,
            });
        }

        return {
            userId,
            from: moment(rangeFrom).format("YYYY-MM-DD"),
            to: moment(rangeTo).format("YYYY-MM-DD"),
            invoiceCount: details.length,
            totalTaxable: this.round2(totalTaxable),
            totalEarnings: this.round2(totalEarnings),
            details,
        };
    }

    private assertPercentSumValid(percents: number[]) {
        const sum = percents.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > PERCENT_SUM_TOLERANCE) {
            throw new httpErrors.BadRequest(
                `La somma delle percentuali dei beneficiari del residuo deve essere ≈ 100 (tolleranza ±${PERCENT_SUM_TOLERANCE}). Attuale: ${this.round2(sum)}.`
            );
        }
    }

    private round2(n: number): number {
        return Math.round(n * 100) / 100;
    }

}
