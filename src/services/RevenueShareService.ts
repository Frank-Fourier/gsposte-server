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
    RevenueShareBeneficiary,
    RevenueShareOverride,
    RevenueShareOverrideBeneficiary,
    RevenueShareSettingDocument,
    RevenueShareSettingModel,
    RevenueShareSnapshot,
    RevenueShareSnapshotLine,
} from "@models/RevenueShareSettingModel";

/**
 * Tolleranza ±0.10 sulla somma delle percentuali in input.
 * Esempio: 33.33 + 33.33 + 33.33 = 99.99 → accettato.
 * Esempio: 33.30 + 33.30 + 33.30 = 99.90 → ancora accettato.
 * Esempio: 50.00 + 49.00 = 99.00 → rifiutato (probabile errore di input).
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
}

export interface PayoutReportRow {
    beneficiaryId: string
    name: string
    fiscalCode: string
    iban?: string
    invoiceCount: number
    totalAmount: number
}

export interface PayoutReportDetail {
    invoiceId: string
    invoiceNumber: string
    paymentDate: string
    senderName: string
    taxable: number
    source: string
    lines: Array<{ beneficiaryId: string, name: string, amount: number }>
}

export interface PayoutReport {
    from: string
    to: string
    summary: PayoutReportRow[]
    details: PayoutReportDetail[]
    totalInvoices: number
    totalTaxable: number
}

@provide(RevenueShareService)
export class RevenueShareService {

    @inject(UserService) private userService: UserService;
    @inject(SenderService) private senderService: SenderService;

    /**
     * Bootstrap idempotente del singleton globale. Chiamato al boot da server.ts.
     * Se il singleton non esiste, lo crea con i 2 beneficiari di partenza
     * (Solutions S.r.l. 50% — Francesco Filippo Tandoi 50%).
     * NON sovrascrive mai un singleton esistente.
     */
    public async bootstrapIfMissing(): Promise<void> {
        const existing = await RevenueShareSettingModel.findOne({ name: "global" });
        if (existing) {
            logger.info(`[RevenueShare] Singleton 'global' già presente (${existing.beneficiaries.length} beneficiari).`);
            return;
        }

        await RevenueShareSettingModel.create({
            name: "global",
            basis: "taxable",
            beneficiaries: [
                {
                    name: "Solutions S.r.l.",
                    fiscalCode: "08886590721",
                    iban: process.env.FIC_IBAN || "IT44Z0306941473100000015095",
                    percent: 50,
                    isCompany: true,
                },
                {
                    name: "Francesco Filippo Tandoi",
                    fiscalCode: "TNDFNC93B08A662A",
                    iban: "",
                    percent: 50,
                    isCompany: false,
                }
            ],
            tieBreakCursor: 0,
        });
        logger.info("[RevenueShare] Singleton 'global' creato con 2 beneficiari (50/50). IBAN del professionista da popolare via PUT /revenue-share/global.");
    }

    /**
     * Restituisce il singleton globale. Lancia se non esiste (non dovrebbe MAI
     * accadere dopo il bootstrap).
     */
    public async getGlobalSetting(): Promise<RevenueShareSettingDocument> {
        const s = await RevenueShareSettingModel.findOne({ name: "global" });
        if (!s) {
            throw new httpErrors.InternalServerError("Singleton RevenueShareSetting 'global' mancante. Riavviare il server per il bootstrap.");
        }
        return s;
    }

    /**
     * Aggiorna il singleton globale.
     *  - Valida la somma delle percentuali (tolleranza ±0.10)
     *  - Tronca i percent a 2 decimali
     *  - Re-attribuisce stabilmente gli _id ai beneficiari "vecchi" se il nome+CF combaciano
     *    (così gli override su Sender/User che referenziano vecchi beneficiaryId restano validi)
     */
    public async updateGlobalSetting(
        beneficiaries: RevenueShareBeneficiary[],
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
        if (updatedBy) {
            current.set("updatedBy", updatedBy);
        }
        return current.save();
    }

    /**
     * Lookup priority: invoice > sender > user > global.
     * Risolve i percent override, valida che ogni beneficiaryId esista nel singleton,
     * applica largest-remainder + tie-break round-robin, restituisce le righe in €.
     */
    public async resolve(invoice: InvoiceDocument): Promise<ResolvedSplit> {
        const setting = await this.getGlobalSetting();
        const basisValue = invoice.taxable;

        const { override, source } = await this.findEffectiveOverride(invoice);

        const lines: RevenueShareSnapshotLine[] = override
            ? this.computeFromOverride(setting, override, basisValue)
            : this.computeFromSetting(setting, basisValue);

        // Largest-remainder: applico round-robin del centesimo dispari avanzando il cursore.
        // Persisto il nuovo cursore così la prossima fattura "ruota" naturalmente.
        const cursor = setting.tieBreakCursor ?? 0;
        const adjusted = this.largestRemainder(lines, basisValue, cursor);

        if (adjusted.cursorAdvanced) {
            setting.tieBreakCursor = (cursor + 1) % Math.max(adjusted.lines.length, 1);
            await setting.save().catch(err =>
                logger.warn("[RevenueShare] Impossibile aggiornare tieBreakCursor:", err)
            );
        }

        return { source, lines: adjusted.lines, basisValue };
    }

    /**
     * Risoluzione della "fonte effettiva" dell'override seguendo la priorità:
     *   invoice.revenueShare → sender.revenueShare → user.revenueShare → global
     * Restituisce il primo override valido trovato (con tutti i beneficiaryId
     * esistenti nel singleton). Se un override è "rotto" (riferimento a un beneficiario
     * che non esiste più nel singleton), lo salta e prosegue nella catena.
     */
    private async findEffectiveOverride(
        invoice: InvoiceDocument
    ): Promise<{ override?: RevenueShareOverride, source: SplitSource }> {
        const setting = await this.getGlobalSetting();
        const validBeneficiaryIds = new Set(
            setting.beneficiaries.map(b => (b as any)._id?.toString())
        );

        const isOverrideValid = (o?: RevenueShareOverride) =>
            !!o
            && Array.isArray(o.beneficiaries)
            && o.beneficiaries.length >= 1
            && o.beneficiaries.every(b => validBeneficiaryIds.has(b.beneficiaryId?.toString()));

        if (isOverrideValid(invoice.revenueShare)) {
            return { override: invoice.revenueShare, source: "invoice" };
        }

        let sender: SenderDocument | undefined;
        if (invoice.sender) {
            const senderId = (invoice.sender as any)._id ?? invoice.sender;
            sender = await this.senderService.findById(senderId.toString()).catch(() => undefined);
        }
        if (isOverrideValid(sender?.revenueShare)) {
            return { override: sender.revenueShare, source: "sender" };
        }

        let user: UserDocument | undefined;
        if (invoice.user) {
            const userId = (invoice.user as any)._id ?? invoice.user;
            user = await this.userService.findById(userId.toString()).catch(() => undefined);
        }
        if (isOverrideValid(user?.revenueShare)) {
            return { override: user.revenueShare, source: "user" };
        }

        return { source: "global" };
    }

    /**
     * Builds righe di split partendo dal singleton (caso: nessun override).
     * Le righe contengono importi NON ancora aggiustati con largest-remainder.
     */
    private computeFromSetting(
        setting: RevenueShareSettingDocument,
        basisValue: number
    ): RevenueShareSnapshotLine[] {
        return setting.beneficiaries.map(b => ({
            beneficiaryId: (b as any)._id?.toString(),
            name: b.name,
            fiscalCode: b.fiscalCode,
            iban: b.iban,
            percent: this.round2(b.percent),
            amount: basisValue * b.percent / 100,
        }));
    }

    /**
     * Builds righe di split partendo da un override valido.
     * Recupera i dati anagrafici (name/fiscalCode/iban) dal singleton via beneficiaryId.
     */
    private computeFromOverride(
        setting: RevenueShareSettingDocument,
        override: RevenueShareOverride,
        basisValue: number
    ): RevenueShareSnapshotLine[] {
        return override.beneficiaries.map(ob => {
            const b = setting.beneficiaries.find(
                x => (x as any)._id?.toString() === ob.beneficiaryId?.toString()
            );
            if (!b) {
                // Non dovrebbe accadere perché findEffectiveOverride filtra,
                // ma teniamo il branch difensivo.
                throw new httpErrors.InternalServerError(
                    `Beneficiario ${ob.beneficiaryId} referenziato da un override ma non più presente nel singleton.`
                );
            }
            return {
                beneficiaryId: (b as any)._id?.toString(),
                name: b.name,
                fiscalCode: b.fiscalCode,
                iban: b.iban,
                percent: this.round2(ob.percent),
                amount: basisValue * ob.percent / 100,
            };
        });
    }

    /**
     * Largest remainder method (Hare/Hamilton) applicato sui centesimi.
     *
     * Problema: con basisValue = 100.00 € e 3 beneficiari al 33.33%, la somma esatta
     * sarebbe 33.33 × 3 = 99.99 → manca 1 centesimo. Idem con 50/50 su € 100.01.
     *
     * Soluzione (equità nel lungo periodo):
     *  1. Converto ogni amount in centesimi (intero).
     *  2. Calcolo la differenza tra totale-atteso e somma-arrotondata.
     *  3. Ordino i resti decimali in ordine decrescente.
     *  4. Distribuisco 1 cent a ciascuno dei primi N beneficiari (N = differenza).
     *     In caso di pareggio sul resto, uso il cursor globale per scegliere a chi va.
     *
     * Restituisce le righe con amount aggiustato (sommano esattamente a basisValue al cent)
     * e un flag cursorAdvanced che indica se il cursore va avanzato.
     */
    private largestRemainder(
        lines: RevenueShareSnapshotLine[],
        basisValue: number,
        cursor: number
    ): { lines: RevenueShareSnapshotLine[], cursorAdvanced: boolean } {
        if (lines.length === 0) {
            return { lines, cursorAdvanced: false };
        }

        const targetCents = Math.round(basisValue * 100);
        const exact = lines.map(l => l.amount * 100); // centesimi frazionari
        const floors = exact.map(x => Math.floor(x));
        const sumFloors = floors.reduce((a, b) => a + b, 0);
        const diff = targetCents - sumFloors; // centesimi da redistribuire (può essere 0..n)

        if (diff <= 0) {
            // Nessun arrotondamento necessario (o basisValue=0).
            const adjusted = lines.map((l, i) => ({ ...l, amount: floors[i] / 100 }));
            return { lines: adjusted, cursorAdvanced: false };
        }

        // Resti frazionari per ogni riga
        const remainders = exact.map((x, i) => ({ idx: i, rem: x - floors[i] }));

        // Ordino per resto frazionario DESCENDING, tie-break by cursor offset (round-robin)
        remainders.sort((a, b) => {
            if (b.rem !== a.rem) return b.rem - a.rem;
            // Tie-break: il primo che vince è quello la cui posizione è (cursor + k) mod n
            // più "vicina a cursor". Concretamente: ordino per ((idx - cursor + n) % n).
            const n = lines.length;
            return ((a.idx - cursor + n) % n) - ((b.idx - cursor + n) % n);
        });

        // Distribuisco diff centesimi ai primi `diff` beneficiari secondo l'ordine sopra
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
            return invoice; // immutabile, già scolpita
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
            computedAt: new Date(),
        };

        invoice.set("splitSnapshot", snapshot);
        const saved = await invoice.save();
        logger.info(`[RevenueShare] Snapshot scritto su invoice ${invoice.id} (source=${resolved.source}, basisValue=${resolved.basisValue}€).`);
        return saved;
    }

    /**
     * Report dei payout su un range di date (paymentDate inclusivo).
     * Considera SOLO invoice con paid=true e splitSnapshot presente.
     * Le fatture marcate paid PRIMA dell'introduzione di questo sistema non hanno
     * splitSnapshot e vengono escluse (decisione: "ignora storico pre-go-live").
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
        const details: PayoutReportDetail[] = [];
        let totalTaxable = 0;

        for (const inv of invoices) {
            const snap = inv.splitSnapshot;
            if (!snap) continue;

            totalTaxable += snap.basisValue;

            const senderObj = inv.sender as SenderDocument;
            details.push({
                invoiceId: inv.id,
                invoiceNumber: `${inv.number}/${moment(inv.createdAt).year()}`,
                paymentDate: moment(inv.paymentDate).format("YYYY-MM-DD"),
                senderName: senderObj?.businessName ?? senderObj?.name ?? inv.senderName ?? "—",
                taxable: snap.basisValue,
                source: snap.source,
                lines: snap.lines.map(l => ({
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
                        totalAmount: 0,
                    };
                }
                aggregate[key].invoiceCount += 1;
                aggregate[key].totalAmount = this.round2(aggregate[key].totalAmount + line.amount);
            }
        }

        return {
            from: moment(from).format("YYYY-MM-DD"),
            to: moment(to).format("YYYY-MM-DD"),
            summary: Object.values(aggregate).sort((a, b) => b.totalAmount - a.totalAmount),
            details,
            totalInvoices: invoices.length,
            totalTaxable: this.round2(totalTaxable),
        };
    }

    /**
     * Validazione di un override (Sender/User/Invoice).
     *  - Tronca i percent a 2 decimali
     *  - Verifica somma ≈ 100 (tolleranza ±0.10)
     *  - Verifica che tutti i beneficiaryId esistano nel singleton
     */
    public async validateAndNormalizeOverride(
        override: RevenueShareOverride
    ): Promise<RevenueShareOverride> {
        if (!override || !Array.isArray(override.beneficiaries) || override.beneficiaries.length < 1) {
            throw new httpErrors.BadRequest("L'override deve contenere almeno un beneficiario.");
        }

        const setting = await this.getGlobalSetting();
        const validIds = new Set(
            setting.beneficiaries.map(b => (b as any)._id?.toString())
        );

        const normalized: RevenueShareOverrideBeneficiary[] = override.beneficiaries.map(b => {
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

        this.assertPercentSumValid(normalized.map(b => b.percent));

        return {
            beneficiaries: normalized,
            note: override.note,
            overriddenBy: override.overriddenBy,
            overriddenAt: new Date(),
        };
    }

    private assertPercentSumValid(percents: number[]) {
        const sum = percents.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > PERCENT_SUM_TOLERANCE) {
            throw new httpErrors.BadRequest(
                `La somma delle percentuali deve essere ≈ 100 (tolleranza ±${PERCENT_SUM_TOLERANCE}). Attuale: ${this.round2(sum)}.`
            );
        }
    }

    private round2(n: number): number {
        return Math.round(n * 100) / 100;
    }

}
