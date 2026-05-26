import { Request, Response } from "express";
import { inject, injectable } from "inversify";
import httpErrors from "http-errors";
import moment from "moment";
import XLSX from "xlsx";
import { AuthService } from "@services/AuthService";
import { RevenueShareService } from "@services/RevenueShareService";
import { UserService } from "@services/UserService";
import { SenderService } from "@services/SenderService";
import { InvoiceService } from "@services/InvoiceService";

/**
 * Tutti gli endpoint sono admin-only. La protezione è doppia: il middleware passport
 * nella Route richiede già un JWT valido, e qui `authService.adminOnly(req)` controlla
 * che il ruolo sia ROLE_ADMIN.
 */
@injectable()
export class RevenueShareController {

    @inject(AuthService) private authService: AuthService;
    @inject(RevenueShareService) private revenueShareService: RevenueShareService;
    @inject(UserService) private userService: UserService;
    @inject(SenderService) private senderService: SenderService;
    @inject(InvoiceService) private invoiceService: InvoiceService;

    // ─── SINGLETON GLOBALE ────────────────────────────────────────────────

    public async getGlobal(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const setting = await this.revenueShareService.getGlobalSetting();
        return res.status(200).send(setting);
    }

    /**
     * Body atteso:
     * {
     *   beneficiaries: [ { _id?, name, fiscalCode, iban?, percent, isCompany? }, ... ],
     *   adminFee?: { kind: "percent"|"fixed", value, beneficiaryId, label? } | null
     * }
     *
     * - beneficiaries: SEMPRE richiesto (almeno 1 elemento)
     * - adminFee: opzionale. Tre semantiche:
     *     undefined / non presente → mantieni quella attuale
     *     null esplicito          → rimuovi adminFee (no fee globale)
     *     oggetto                  → setta/sovrascrivi adminFee
     */
    public async updateGlobal(req: Request, res: Response) {
        const user = await this.authService.adminOnly(req);
        if (!Array.isArray(req.body.beneficiaries)) {
            throw new httpErrors.BadRequest("Manca il campo 'beneficiaries' nel body.");
        }
        const updated = await this.revenueShareService.updateGlobalSetting(
            req.body.beneficiaries,
            req.body.adminFee, // può essere undefined, null, o un oggetto AdminFee
            user.id
        );
        return res.status(200).send(updated);
    }

    // ─── OVERRIDE PER SENDER ──────────────────────────────────────────────

    public async getSenderOverride(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const sender = await this.senderService.findById(req.params.id);
        return res.status(200).send(sender.revenueShare ?? null);
    }

    public async setSenderOverride(req: Request, res: Response) {
        const user = await this.authService.adminOnly(req);
        const sender = await this.senderService.findById(req.params.id);
        const normalized = await this.revenueShareService.validateAndNormalizeOverride({
            adminFee: req.body.adminFee,
            disableAdminFee: req.body.disableAdminFee,
            beneficiaries: req.body.beneficiaries,
            note: req.body.note,
            overriddenBy: user.id,
        });
        sender.set("revenueShare", normalized);
        const saved = await sender.save();
        return res.status(200).send(saved.revenueShare);
    }

    public async deleteSenderOverride(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const sender = await this.senderService.findById(req.params.id);
        sender.set("revenueShare", undefined);
        await sender.save();
        return res.status(204).send();
    }

    // ─── OVERRIDE PER USER ────────────────────────────────────────────────

    public async getUserOverride(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const user = await this.userService.findById(req.params.id);
        return res.status(200).send(user.revenueShare ?? null);
    }

    public async setUserOverride(req: Request, res: Response) {
        const admin = await this.authService.adminOnly(req);
        const targetUser = await this.userService.findById(req.params.id);
        const normalized = await this.revenueShareService.validateAndNormalizeOverride({
            adminFee: req.body.adminFee,
            disableAdminFee: req.body.disableAdminFee,
            beneficiaries: req.body.beneficiaries,
            note: req.body.note,
            overriddenBy: admin.id,
        });
        targetUser.set("revenueShare", normalized);
        const saved = await targetUser.save();
        return res.status(200).send(saved.revenueShare);
    }

    public async deleteUserOverride(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const targetUser = await this.userService.findById(req.params.id);
        targetUser.set("revenueShare", undefined);
        await targetUser.save();
        return res.status(204).send();
    }

    // ─── OVERRIDE PER INVOICE (solo se NON ancora paid) ───────────────────

    public async getInvoiceOverride(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const invoice = await this.invoiceService.findById(req.params.id);
        return res.status(200).send(invoice.revenueShare ?? null);
    }

    public async setInvoiceOverride(req: Request, res: Response) {
        const admin = await this.authService.adminOnly(req);
        const invoice = await this.invoiceService.findById(req.params.id);
        if (invoice.paid) {
            throw new httpErrors.BadRequest("Non è possibile modificare lo split di una fattura già pagata. Lo snapshot è immutabile.");
        }
        const normalized = await this.revenueShareService.validateAndNormalizeOverride({
            adminFee: req.body.adminFee,
            disableAdminFee: req.body.disableAdminFee,
            beneficiaries: req.body.beneficiaries,
            note: req.body.note,
            overriddenBy: admin.id,
        });
        invoice.set("revenueShare", normalized);
        const saved = await invoice.save();
        return res.status(200).send(saved.revenueShare);
    }

    public async deleteInvoiceOverride(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const invoice = await this.invoiceService.findById(req.params.id);
        if (invoice.paid) {
            throw new httpErrors.BadRequest("Non è possibile modificare lo split di una fattura già pagata.");
        }
        invoice.set("revenueShare", undefined);
        await invoice.save();
        return res.status(204).send();
    }

    // ─── PREVIEW / RESOLVE ────────────────────────────────────────────────

    /**
     * Anteprima dello split che VERREBBE applicato a una specifica fattura
     * SE la pagassi adesso. Utile per la UI: l'admin vede a quale beneficiario
     * andrebbe quanto, e da quale livello dell'override.
     * NON modifica nulla nel DB (read-only, no snapshot).
     */
    public async previewInvoiceSplit(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const invoice = await this.invoiceService.findById(req.params.id);
        if (invoice.splitSnapshot) {
            return res.status(200).send({
                source: invoice.splitSnapshot.source,
                lines: invoice.splitSnapshot.lines,
                basisValue: invoice.splitSnapshot.basisValue,
                snapshotted: true,
                snapshottedAt: invoice.splitSnapshot.computedAt,
            });
        }
        const resolved = await this.revenueShareService.resolve(invoice);
        return res.status(200).send({ ...resolved, snapshotted: false });
    }

    // ─── REPORT PAYOUTS ───────────────────────────────────────────────────

    public async payoutReport(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const { from, to } = this.parseDateRange(req);
        const report = await this.revenueShareService.payoutReport(from, to);
        return res.status(200).send(report);
    }

    /**
     * Stessa aggregazione di payoutReport ma il payload è un file .xlsx con
     * due fogli: "Summary" (totali per beneficiario) e "Details" (riga per
     * ogni fattura). Lo allega l'admin alla fattura passiva di B → A.
     */
    public async payoutReportXlsx(req: Request, res: Response) {
        await this.authService.adminOnly(req);
        const { from, to } = this.parseDateRange(req);
        const report = await this.revenueShareService.payoutReport(from, to);

        const wb = XLSX.utils.book_new();

        // ─── Foglio 1: Riepilogo per beneficiario ───
        // Colonne separate per Admin Fee € / Share € / Totale € (così l'amministratore
        // vede subito la quota "compenso amministratore" distinta da quella di partecipazione).
        const summaryRows = [
            [ "Beneficiario", "Codice Fiscale / P.IVA", "IBAN", "N. Fatture", "Admin Fee € (imponibile)", "Quota Residuo € (imponibile)", "Totale € (imponibile)" ],
            ...report.summary.map(r => [
                r.name,
                r.fiscalCode,
                r.iban || "",
                r.invoiceCount,
                Number(r.adminFeeAmount.toFixed(2)),
                Number(r.shareAmount.toFixed(2)),
                Number(r.totalAmount.toFixed(2)),
            ]),
            [], // separatore
            [ "TOTALI", "", "", report.totalInvoices, Number(report.totalAdminFee.toFixed(2)), Number(report.totalResiduo.toFixed(2)), Number(report.totalTaxable.toFixed(2)) ]
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
        wsSummary["!cols"] = [
            { wch: 32 }, { wch: 22 }, { wch: 30 }, { wch: 10 },
            { wch: 22 }, { wch: 22 }, { wch: 22 },
        ];
        XLSX.utils.book_append_sheet(wb, wsSummary, "Riepilogo");

        // ─── Foglio 2: Dettaglio per fattura ───
        // Per ogni beneficiario, 2 colonne: "<name> Admin Fee €" e "<name> Quota Residuo €".
        const beneficiaryHeaderColumns: string[] = [];
        for (const b of report.summary) {
            beneficiaryHeaderColumns.push(`${b.name} Admin Fee €`);
            beneficiaryHeaderColumns.push(`${b.name} Quota Residuo €`);
        }

        const detailHeader = [
            "N. Fattura", "Data Pagamento", "Cliente", "Imponibile €", "Admin Fee €", "Residuo €", "Fonte Split",
        ];
        const detailRows: any[][] = [ [ ...detailHeader, ...beneficiaryHeaderColumns ] ];

        for (const d of report.details) {
            const baseRow: any[] = [
                d.invoiceNumber,
                d.paymentDate,
                d.senderName,
                Number(d.taxable.toFixed(2)),
                Number(d.adminFeeAmount.toFixed(2)),
                Number(d.residuoValue.toFixed(2)),
                d.source,
            ];
            for (const bSummary of report.summary) {
                const adminLine = d.lines.find(
                    l => l.beneficiaryId === bSummary.beneficiaryId && l.type === "admin-fee"
                );
                const shareLine = d.lines.find(
                    l => l.beneficiaryId === bSummary.beneficiaryId && l.type === "share"
                );
                baseRow.push(adminLine ? Number(adminLine.amount.toFixed(2)) : 0);
                baseRow.push(shareLine ? Number(shareLine.amount.toFixed(2)) : 0);
            }
            detailRows.push(baseRow);
        }

        const wsDetails = XLSX.utils.aoa_to_sheet(detailRows);
        wsDetails["!cols"] = [
            { wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
            ...beneficiaryHeaderColumns.map(() => ({ wch: 22 } as XLSX.ColInfo)),
        ];
        XLSX.utils.book_append_sheet(wb, wsDetails, "Dettaglio");

        const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        const filename = `payout_${report.from}_${report.to}.xlsx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        return res.status(200).send(buf);
    }

    private parseDateRange(req: Request): { from: Date, to: Date } {
        const fromStr = (req.query.from as string) || req.body?.from;
        const toStr = (req.query.to as string) || req.body?.to;
        if (!fromStr || !toStr) {
            throw new httpErrors.BadRequest("Parametri obbligatori: 'from' e 'to' (YYYY-MM-DD).");
        }
        const from = moment(fromStr, "YYYY-MM-DD", true).startOf("day").toDate();
        const to = moment(toStr, "YYYY-MM-DD", true).endOf("day").toDate();
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            throw new httpErrors.BadRequest("Formato date non valido. Usa YYYY-MM-DD.");
        }
        return { from, to };
    }

}
