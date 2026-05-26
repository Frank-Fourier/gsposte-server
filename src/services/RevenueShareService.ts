import { provide } from "inversify-binding-decorators";
import { inject } from "inversify";
import httpErrors from "http-errors";
import moment from "moment";
import { Types } from "mongoose";
import { logger } from "@utils/winston";
import { UserService } from "@services/UserService";
import { SenderService } from "@services/SenderService";
import { InvoiceDocument, InvoiceModel } from "@models/InvoiceModel";
import { UserDocument } from "@models/UserModel";
import { SenderDocument } from "@models/SenderModel";
import {
    AdminFee,
    RevenueShareBeneficiary,
    RevenueShareOverride,
    RevenueShareOverrideBeneficiary,
    RevenueShareSettingDocument,
    RevenueShareSettingModel,
    RevenueShareSnapshot,
    RevenueShareSnapshotLine,
} from "@models/RevenueShareSettingModel";

/**
 * Tolleranza ±0.10 sulla somma delle percentuali in input dei beneficiaries[].
 * Esempio: 33.33 + 33.33 + 33.33 = 99.99 → accettato.
 * Esempio: 33.30 + 33.30 + 33.30 = 99.90 → ancora accettato.
 * Esempio: 50.00 + 49.00 = 99.00 → rifiutato (probabile errore di input).
 *
 * NB: la fee amministratore NON entra in questa validazione — può essere
 * qualsiasi % 0..100 o un importo fisso. È un costo separato, non una "quota".
 */
const PERCENT_SUM_TOLERANCE = 0.10;

/**
 * Fonte risolta dello split, in ordine di priorità decrescente:
 *   "invoice" > "sender" > "user" > "global"
 */
export type SplitSource = "invoice" | "sender" | "user" | "global";

export interface ResolvedSplit {
    source: SplitSource
    lines: RevenueShareSnapshotLine[]
    basisValue: number
    adminFeeAmount: number
    residuoValue: number
}

export interface PayoutReportRow {
    beneficiaryId: string
    name: string
    fiscalCode: string
    iban?: string
    invoiceCount: number
    adminFeeAmount: number   // somma delle righe type="admin-fee"
    shareAmount: number      // somma delle righe type="share"
    totalAmount: number      // adminFeeAmount + shareAmount
}

export interface PayoutReportDetail {
    invoiceId: string
    invoiceNumber: string
    paymentDate: string
    senderName: string
    taxable: number
    adminFeeAmount: number
    residuoValue: number
    source: string
    lines: Array<{ type: string, beneficiaryId: string, name: string, amount: number }>
}

export interface PayoutReport {
    from: string
    to: string
    summary: PayoutReportRow[]
    details: PayoutReportDetail[]
    totalInvoices: number
    totalTaxable: number
    totalAdminFee: number
    totalResiduo: number
}

@provide(RevenueShareService)
export class RevenueShareService {

    @inject(UserService) private userService: UserService;
    @inject(SenderService) private senderService: SenderService;

    /**
     * Bootstrap idempotente del singleton globale. Chiamato al boot da server.ts.
     *
     * Se il singleton non esiste, lo crea con il modello standard:
     *   - 2 beneficiari: Solutions S.r.l. + Francesco Filippo Tandoi
     *   - Admin fee: 30% del taxable → Francesco Filippo Tandoi
     *   - Residuo ripartito: Solutions 80%, Tandoi 20%
     *
     * NON sovrascrive mai un singleton esistente.
     */
    public async bootstrapIfMissing(): Promise<void> {
        const existing = await RevenueShareSettingModel.findOne({ name: "global" });
        if (existing) {
            logger.info(`[RevenueShare] Singleton 'global' già presente (${existing.beneficiaries.length} beneficiari, adminFee=${!!existing.adminFee}).`);
            return;
        }

        // Creiamo prima senza adminFee (dobbiamo conoscere gli _id che Mongoose
        // genererà sui beneficiaries), poi facciamo un secondo save con
        // adminFee.beneficiaryId puntato a Tandoi.
        const seed = await RevenueShareSettingModel.create({
            name: "global",
            basis: "taxable",
            beneficiaries: [
                {
                    name: "Solutions S.r.l.",
                    fiscalCode: "08886590721",
                    iban: process.env.FIC_IBAN || "IT44Z0306941473100000015095",
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

        const tandoi = seed.beneficiaries.find(b => b.fiscalCode === "TNDFNC93B08A662A");
        if (!tandoi) {
            logger.error("[RevenueShare] Bootstrap: impossibile trovare Tandoi nel seed appena creato. Singleton senza adminFee.");
            return;
        }

        seed.set("adminFee", {
            kind: "percent",
            value: 30,
            beneficiaryId: (tandoi as any)._id,
            label: "Compenso amministratore",
        });
        await seed.save();
        logger.info("[RevenueShare] Singleton 'global' creato. AdminFee 30% → Tandoi. Residuo: Solutions 80%, Tandoi 20%. IBAN del professionista da popolare via PUT /revenue-share/global.");
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
     *  - Valida la somma delle percentuali dei beneficiaries[] (tolleranza ±0.10)
     *  - Tronca i percent a 2 decimali
     *  - Valida adminFee (se presente): kind ∈ {percent,fixed}, value ≥ 0,
     *    beneficiaryId presente in beneficiaries[]
     *  - Re-attribuisce stabilmente gli _id ai beneficiari "vecchi" se nome+CF combaciano
     *    (così gli override su Sender/User che referenziano vecchi beneficiaryId restano validi)
     */
    public async updateGlobalSetting(
        beneficiaries: RevenueShareBeneficiary[],
        adminFee: AdminFee | null | undefined,
        updatedBy?: string
    ): Promise<RevenueShareSettingDocument> {
        if (!beneficiaries || beneficiaries.length < 1) {
            throw new httpErrors.BadRequest("Devi specificare almeno un beneficiario.");
        }
        if (beneficiaries.length > 10) {
            throw new httpErrors.BadRequest("Massimo 10 beneficiari ammessi.");
        }

        const current = await this.getGlobalSetting();
        const normalized = beneficiaries.map(b => ({
            ...b,
            percent: this.round2(b.percent),
        }));

        this.assertPercentSumValid(normalized.map(b => b.percent));

        // Riassocia _id stabili dove combaciano nome+fiscalCode con i beneficiari esistenti.
        // Senza questo, ogni update genererebbe nuovi _id e gli override perderebbero il riferimento.
        const merged = normalized.map(b => {
            if (b._id) return b;
            const match = current.beneficiaries.find(
                existing => existing.name === b.name && existing.fiscalCode === b.fiscalCode
            );
            return match ? { ...b, _id: (match as any)._id?.toString() } : b;
        });

        current.set("beneficiaries", merged);

        if (adminFee === null) {
            // null esplicito → rimuovi adminFee
            current.set("adminFee", undefined);
        } else if (adminFee !== undefined) {
            const validated = this.validateAdminFee(adminFee, merged);
            current.set("adminFee", validated);
        }
        // undefined → non tocca

        if (updatedBy) {
            current.set("updatedBy", updatedBy);
        }
        return current.save();
    }

    /**
     * Lookup priority: invoice > sender > user > global.
     * Esegue la risoluzione completa a 2 livelli:
     *   1. Calcola admin fee effettiva
     *   2. Calcola residuo = taxable - adminFee
     *   3. Risolve i percent override sul residuo, applica largest-remainder + tie-break
     */
    public async resolve(invoice: InvoiceDocument): Promise<ResolvedSplit> {
        const setting = await this.getGlobalSetting();
        const basisValue = invoice.taxable;

        const { effectiveAdminFee, splitOverride, source } = await this.findEffectiveOverride(invoice, setting);

        // ─── Step 1: Admin Fee ────────────────────────────────────────────
        let adminFeeAmount = 0;
        let adminFeeLine: RevenueShareSnapshotLine | undefined;

        if (effectiveAdminFee) {
            const rawFee = effectiveAdminFee.kind === "percent"
                ? basisValue * effectiveAdminFee.value / 100
                : effectiveAdminFee.value;

            adminFeeAmount = this.round2(rawFee);

            if (adminFeeAmount > basisValue) {
                logger.warn(`[RevenueShare] AdminFee ${adminFeeAmount}€ eccede taxable ${basisValue}€ — capping al 100% del taxable (invoice ${invoice.id ?? "?"}).`);
                adminFeeAmount = this.round2(basisValue);
            }

            const feeBeneficiary = setting.beneficiaries.find(
                b => (b as any)._id?.toString() === effectiveAdminFee.beneficiaryId?.toString()
            );
            if (!feeBeneficiary) {
                throw new httpErrors.InternalServerError(
                    `Admin fee referenzia il beneficiario ${effectiveAdminFee.beneficiaryId} che non è (più) presente nel singleton.`
                );
            }
            adminFeeLine = {
                type: "admin-fee",
                kind: effectiveAdminFee.kind,
                beneficiaryId: (feeBeneficiary as any)._id?.toString(),
                name: feeBeneficiary.name,
                fiscalCode: feeBeneficiary.fiscalCode,
                iban: feeBeneficiary.iban,
                percent: effectiveAdminFee.kind === "percent" ? this.round2(effectiveAdminFee.value) : 0,
                amount: adminFeeAmount,
                label: effectiveAdminFee.label || "Compenso amministratore",
            };
        }

        const residuoValue = this.round2(basisValue - adminFeeAmount);

        // ─── Step 2: Ripartizione del residuo ─────────────────────────────
        // Edge case: residuo === 0 (admin fee = 100% del taxable). I beneficiaries[]
        // ricevono comunque righe con amount=0 per coerenza del report.
        const shareLines: RevenueShareSnapshotLine[] = splitOverride
            ? this.computeShareFromOverride(setting, splitOverride, residuoValue)
            : this.computeShareFromSetting(setting, residuoValue);

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
            source,
            lines: allLines,
            basisValue: this.round2(basisValue),
            adminFeeAmount,
            residuoValue,
        };
    }

    /**
     * Risoluzione della "fonte effettiva" seguendo la priorità:
     *   invoice.revenueShare → sender.revenueShare → user.revenueShare → global
     *
     * Per ognuno calcolo:
     *  - effectiveAdminFee:
     *      override.disableAdminFee=true → null (forza no fee)
     *      override.adminFee presente   → override.adminFee
     *      fallthrough                  → global.adminFee
     *  - splitOverride:
     *      override.beneficiaries presente e non vuoto → quello (validato)
     *      fallthrough                                  → undefined (usa global.beneficiaries)
     *
     * La "source" è SEMPRE quella del livello più alto che ha contribuito CON
     * QUALCOSA (admin fee o split). Se un override esiste ma non ha né adminFee
     * né beneficiaries, viene saltato.
     */
    private async findEffectiveOverride(
        invoice: InvoiceDocument,
        setting: RevenueShareSettingDocument
    ): Promise<{
        effectiveAdminFee?: AdminFee
        splitOverride?: RevenueShareOverrideBeneficiary[]
        source: SplitSource
    }> {
        const validBeneficiaryIds = new Set(
            setting.beneficiaries.map(b => (b as any)._id?.toString())
        );

        const isOverrideMeaningful = (o?: RevenueShareOverride) => {
            if (!o) return false;
            const hasAdminTouch = !!o.adminFee || o.disableAdminFee === true;
            const hasSplitTouch = Array.isArray(o.beneficiaries) && o.beneficiaries.length > 0;
            return hasAdminTouch || hasSplitTouch;
        };

        const isSplitOverrideValid = (bs?: RevenueShareOverrideBeneficiary[]) =>
            Array.isArray(bs)
            && bs.length >= 1
            && bs.every(b => validBeneficiaryIds.has(b.beneficiaryId?.toString()));

        const isAdminFeeOverrideValid = (af?: AdminFee) =>
            !!af
            && [ "percent", "fixed" ].includes(af.kind)
            && typeof af.value === "number"
            && af.value >= 0
            && validBeneficiaryIds.has(af.beneficiaryId?.toString());

        const collect = (o: RevenueShareOverride) => {
            let effectiveAdminFee: AdminFee | undefined = setting.adminFee
                ? (this.cloneAdminFee(setting.adminFee))
                : undefined;

            if (o.disableAdminFee === true) {
                effectiveAdminFee = undefined;
            } else if (isAdminFeeOverrideValid(o.adminFee)) {
                effectiveAdminFee = o.adminFee;
            }

            const splitOverride = isSplitOverrideValid(o.beneficiaries) ? o.beneficiaries : undefined;

            return { effectiveAdminFee, splitOverride };
        };

        // Invoice
        if (isOverrideMeaningful(invoice.revenueShare)) {
            const { effectiveAdminFee, splitOverride } = collect(invoice.revenueShare);
            return { effectiveAdminFee, splitOverride, source: "invoice" };
        }

        // Sender
        let sender: SenderDocument | undefined;
        if (invoice.sender) {
            const senderId = (invoice.sender as any)._id ?? invoice.sender;
            sender = await this.senderService.findById(senderId.toString()).catch(() => undefined);
        }
        if (isOverrideMeaningful(sender?.revenueShare)) {
            const { effectiveAdminFee, splitOverride } = collect(sender.revenueShare);
            return { effectiveAdminFee, splitOverride, source: "sender" };
        }

        // User
        let user: UserDocument | undefined;
        if (invoice.user) {
            const userId = (invoice.user as any)._id ?? invoice.user;
            user = await this.userService.findById(userId.toString()).catch(() => undefined);
        }
        if (isOverrideMeaningful(user?.revenueShare)) {
            const { effectiveAdminFee, splitOverride } = collect(user.revenueShare);
            return { effectiveAdminFee, splitOverride, source: "user" };
        }

        // Global
        return {
            effectiveAdminFee: setting.adminFee ? this.cloneAdminFee(setting.adminFee) : undefined,
            source: "global",
        };
    }

    private cloneAdminFee(af: AdminFee): AdminFee {
        return {
            kind: af.kind,
            value: af.value,
            beneficiaryId: (af.beneficiaryId as any)?.toString?.() ?? af.beneficiaryId,
            label: af.label,
        };
    }

    /**
     * Builds righe di split partendo dal singleton (caso: nessun override di split).
     * Le righe contengono importi NON ancora aggiustati con largest-remainder.
     */
    private computeShareFromSetting(
        setting: RevenueShareSettingDocument,
        residuoValue: number
    ): RevenueShareSnapshotLine[] {
        return setting.beneficiaries.map(b => ({
            type: "share",
            kind: "percent",
            beneficiaryId: (b as any)._id?.toString(),
            name: b.name,
            fiscalCode: b.fiscalCode,
            iban: b.iban,
            percent: this.round2(b.percent),
            amount: residuoValue * b.percent / 100,
        }));
    }

    private computeShareFromOverride(
        setting: RevenueShareSettingDocument,
        override: RevenueShareOverrideBeneficiary[],
        residuoValue: number
    ): RevenueShareSnapshotLine[] {
        return override.map(ob => {
            const b = setting.beneficiaries.find(
                x => (x as any)._id?.toString() === ob.beneficiaryId?.toString()
            );
            if (!b) {
                throw new httpErrors.InternalServerError(
                    `Beneficiario ${ob.beneficiaryId} referenziato da un override ma non più presente nel singleton.`
                );
            }
            return {
                type: "share",
                kind: "percent",
                beneficiaryId: (b as any)._id?.toString(),
                name: b.name,
                fiscalCode: b.fiscalCode,
                iban: b.iban,
                percent: this.round2(ob.percent),
                amount: residuoValue * ob.percent / 100,
            };
        });
    }

    /**
     * Largest remainder method (Hare/Hamilton) applicato sui centesimi del residuo.
     * Vedi commento dettagliato sulla versione singola (lo stesso ragionamento di
     * prima del refactor admin-fee — qui agisce solo sulle righe type="share").
     */
    private largestRemainder(
        lines: RevenueShareSnapshotLine[],
        targetValue: number,
        cursor: number
    ): { lines: RevenueShareSnapshotLine[], cursorAdvanced: boolean } {
        if (lines.length === 0 || targetValue <= 0) {
            // Residuo 0 → tutte le righe a 0 € (caso fee = 100% taxable)
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
     * Chiamato al passaggio a paid=true. Idempotente: se splitSnapshot già esiste
     * NON viene mai sovrascritto (audit immutabile).
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
            source: resolved.source,
            lines: resolved.lines,
            basis: "taxable",
            basisValue: resolved.basisValue,
            adminFeeAmount: resolved.adminFeeAmount,
            residuoValue: resolved.residuoValue,
            computedAt: new Date(),
        };

        invoice.set("splitSnapshot", snapshot);
        const saved = await invoice.save();
        logger.info(`[RevenueShare] Snapshot scritto su invoice ${invoice.id} (source=${resolved.source}, taxable=${resolved.basisValue}€, adminFee=${resolved.adminFeeAmount}€, residuo=${resolved.residuoValue}€).`);
        return saved;
    }

    /**
     * Report dei payout su un range di date (paymentDate inclusivo).
     * Considera SOLO invoice con paid=true e splitSnapshot presente.
     * Le fatture marcate paid PRIMA dell'introduzione di questo sistema non hanno
     * splitSnapshot e vengono escluse.
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

        const aggregate: { [beneficiaryId: string]: PayoutReportRow } = {};
        // Map separata per non sporcare PayoutReportRow con campi di servizio.
        // Conta la fattura una volta sola per beneficiario anche se la stessa
        // fattura ha 2 righe per quel beneficiario (admin-fee + share).
        const invoicesSeenByBeneficiary: { [beneficiaryId: string]: Set<string> } = {};
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

            const senderObj = inv.sender as SenderDocument;
            details.push({
                invoiceId: inv.id,
                invoiceNumber: `${inv.number}/${moment(inv.createdAt).year()}`,
                paymentDate: moment(inv.paymentDate).format("YYYY-MM-DD"),
                senderName: senderObj?.businessName ?? senderObj?.name ?? inv.senderName ?? "—",
                taxable: snap.basisValue,
                adminFeeAmount: snap.adminFeeAmount ?? 0,
                residuoValue: snap.residuoValue ?? snap.basisValue,
                source: snap.source,
                lines: snap.lines.map(l => ({
                    type: l.type,
                    beneficiaryId: l.beneficiaryId,
                    name: l.name,
                    amount: l.amount,
                })),
            });

            for (const line of snap.lines) {
                const key = line.beneficiaryId;
                if (!aggregate[key]) {
                    aggregate[key] = {
                        beneficiaryId: key,
                        name: line.name,
                        fiscalCode: line.fiscalCode,
                        iban: line.iban,
                        invoiceCount: 0,
                        adminFeeAmount: 0,
                        shareAmount: 0,
                        totalAmount: 0,
                    };
                    invoicesSeenByBeneficiary[key] = new Set();
                }
                if (!invoicesSeenByBeneficiary[key].has(inv.id)) {
                    invoicesSeenByBeneficiary[key].add(inv.id);
                    aggregate[key].invoiceCount += 1;
                }

                if (line.type === "admin-fee") {
                    aggregate[key].adminFeeAmount = this.round2(aggregate[key].adminFeeAmount + line.amount);
                } else {
                    aggregate[key].shareAmount = this.round2(aggregate[key].shareAmount + line.amount);
                }
                aggregate[key].totalAmount = this.round2(aggregate[key].adminFeeAmount + aggregate[key].shareAmount);
            }
        }

        return {
            from: moment(from).format("YYYY-MM-DD"),
            to: moment(to).format("YYYY-MM-DD"),
            summary: Object.values(aggregate).sort((a, b) => b.totalAmount - a.totalAmount),
            details,
            totalInvoices: invoices.length,
            totalTaxable: this.round2(totalTaxable),
            totalAdminFee: this.round2(totalAdminFee),
            totalResiduo: this.round2(totalResiduo),
        };
    }

    /**
     * Validazione di un override (Sender/User/Invoice).
     * Tutti i campi sono opzionali — un override può limitarsi a sovrascrivere
     * solo l'admin fee, solo lo split, o entrambi.
     */
    public async validateAndNormalizeOverride(
        override: RevenueShareOverride
    ): Promise<RevenueShareOverride> {
        if (!override) {
            throw new httpErrors.BadRequest("Override mancante.");
        }
        const hasAdminFee = !!override.adminFee;
        const hasDisable = override.disableAdminFee === true;
        const hasBeneficiaries = Array.isArray(override.beneficiaries) && override.beneficiaries.length > 0;
        if (!hasAdminFee && !hasDisable && !hasBeneficiaries) {
            throw new httpErrors.BadRequest("L'override deve specificare almeno uno tra adminFee, disableAdminFee=true, beneficiaries.");
        }

        const setting = await this.getGlobalSetting();
        const validIds = new Set(setting.beneficiaries.map(b => (b as any)._id?.toString()));

        let normalizedBeneficiaries: RevenueShareOverrideBeneficiary[] | undefined;
        if (hasBeneficiaries) {
            normalizedBeneficiaries = override.beneficiaries.map(b => {
                if (!b.beneficiaryId || !Types.ObjectId.isValid(b.beneficiaryId)) {
                    throw new httpErrors.BadRequest(`beneficiaryId '${b.beneficiaryId}' non valido.`);
                }
                if (!validIds.has(b.beneficiaryId.toString())) {
                    throw new httpErrors.BadRequest(`Beneficiario ${b.beneficiaryId} non presente nelle settings globali.`);
                }
                if (typeof b.percent !== "number" || b.percent < 0 || b.percent > 100) {
                    throw new httpErrors.BadRequest(`Percentuale non valida per beneficiario ${b.beneficiaryId}.`);
                }
                return { beneficiaryId: b.beneficiaryId.toString(), percent: this.round2(b.percent) };
            });
            this.assertPercentSumValid(normalizedBeneficiaries.map(b => b.percent));
        }

        let normalizedAdminFee: AdminFee | undefined;
        if (hasAdminFee) {
            normalizedAdminFee = this.validateAdminFee(override.adminFee, setting.beneficiaries as any[]);
        }

        return {
            adminFee: normalizedAdminFee,
            disableAdminFee: hasDisable ? true : undefined,
            beneficiaries: normalizedBeneficiaries,
            note: override.note,
            overriddenBy: override.overriddenBy,
            overriddenAt: new Date(),
        };
    }

    /**
     * Valida + normalizza un oggetto AdminFee. Lancia BadRequest in caso di anomalie.
     */
    private validateAdminFee(adminFee: AdminFee, beneficiaries: any[]): AdminFee {
        if (!adminFee.kind || ![ "percent", "fixed" ].includes(adminFee.kind)) {
            throw new httpErrors.BadRequest("adminFee.kind deve essere 'percent' o 'fixed'.");
        }
        if (typeof adminFee.value !== "number" || isNaN(adminFee.value) || adminFee.value < 0) {
            throw new httpErrors.BadRequest("adminFee.value deve essere un numero ≥ 0.");
        }
        if (adminFee.kind === "percent" && adminFee.value > 100) {
            throw new httpErrors.BadRequest("adminFee.value (percent) non può eccedere 100.");
        }
        if (!adminFee.beneficiaryId || !Types.ObjectId.isValid(adminFee.beneficiaryId)) {
            throw new httpErrors.BadRequest(`adminFee.beneficiaryId '${adminFee.beneficiaryId}' non valido.`);
        }
        const found = beneficiaries.find(
            b => (b._id?.toString() ?? b._id) === adminFee.beneficiaryId?.toString()
        );
        if (!found) {
            throw new httpErrors.BadRequest(`adminFee.beneficiaryId ${adminFee.beneficiaryId} non presente in beneficiaries.`);
        }
        return {
            kind: adminFee.kind,
            value: this.round2(adminFee.value),
            beneficiaryId: adminFee.beneficiaryId.toString(),
            label: adminFee.label || "Compenso amministratore",
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
